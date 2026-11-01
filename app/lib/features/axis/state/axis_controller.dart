import 'dart:ui' show Offset;

import 'package:flutter/foundation.dart';

import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../data/axis_tree_mapper.dart';
import '../data/axis_view_models.dart';

/// 人轴页面状态与数据编排。
///
/// 关键约束：页面切换项目、重试或销毁后，旧的异步请求结果不得写回新状态。
/// 因此每次加载都持有代次 [epoch]，回调写入前逐一比对。
class AxisController extends ChangeNotifier {
  AxisController({
    required this.api,
    required int projectId,
    required this.currentUserId,
    this.companyId,
  }) : _projectId = projectId;

  final AxisApi api;
  final int? currentUserId;
  final int? companyId;

  int _projectId;
  int get projectId => _projectId;

  int _epoch = 0;
  bool _disposed = false;

  bool loading = false;
  Object? error;
  List<AxisPersonNode> nodes = const [];
  List<AxisMember> members = const [];
  AxisPermissions permissions = AxisPermissions.empty;
  AxisProjectInfo? project;

  AxisViewTab tab = AxisViewTab.mine;
  AxisOrientation orientation = AxisOrientation.vertical;
  AxisSort sort = AxisSort.tree;
  AxisSpacing spacing = AxisSpacing.standard;
  bool showAiStatus = true;
  bool expandSubordinates = true;

  /// 重置布局标记：画布忽略手动偏移，且本次加载不从后端回填位置。
  ///
  /// 只在重置后生效一次。用户重新拖动卡片（[saveLayout]）或下一次加载应用完
  /// 重置后必须清掉，否则之后保存成功的偏移会被画布一直忽略（返工 #5）。
  bool resetLayoutRequested = false;

  final Map<int, Offset> _layoutOffsets = {};

  int? selectedNodeId;

  /// 当前用户自己的人员卡片（primary/collaborator 指派）。
  AxisPersonNode? get selfNode {
    if (currentUserId == null) return null;
    for (final node in nodes) {
      if (node.ownerUserIds.contains(currentUserId)) return node;
    }
    return null;
  }

  AxisPersonNode? get supervisorNode {
    final self = selfNode;
    if (self?.parentId == null) return null;
    for (final node in nodes) {
      if (node.id == self!.parentId) return node;
    }
    return null;
  }

  List<AxisPersonNode> get subordinateNodes {
    final self = selfNode;
    if (self == null) return const [];
    return nodes.where((node) => node.parentId == self.id).toList();
  }

  AxisPersonNode? nodeById(int? id) {
    if (id == null) return null;
    for (final node in nodes) {
      if (node.id == id) return node;
    }
    return null;
  }

  /// 画布展示的人员：关闭“展开直属下属”时只显示根人员（与网页一致）。
  List<AxisPersonNode> get visibleNodes {
    if (expandSubordinates) return nodes;
    return nodes.where((node) => node.parentId == null).toList();
  }

  Offset offsetFor(int nodeId) =>
      _layoutOffsets[nodeId] ?? Offset.zero;

  bool get canAdjustFinalOwner =>
      AxisRules.canAdjustFinalOwner(project: project, userId: currentUserId);

  void select(int? nodeId) {
    if (selectedNodeId == nodeId) return;
    selectedNodeId = nodeId;
    notifyListeners();
  }

  void setTab(AxisViewTab value) {
    if (tab == value) return;
    tab = value;
    notifyListeners();
  }

  void setOrientation(AxisOrientation value) {
    if (orientation == value) return;
    orientation = value;
    notifyListeners();
  }

  void setSort(AxisSort value) {
    if (sort == value) return;
    sort = value;
    notifyListeners();
  }

  void setSpacing(AxisSpacing value) {
    if (spacing == value) return;
    spacing = value;
    notifyListeners();
  }

  void setShowAiStatus(bool value) {
    showAiStatus = value;
    notifyListeners();
  }

  void setExpandSubordinates(bool value) {
    expandSubordinates = value;
    notifyListeners();
  }

  void resetLayout() {
    resetLayoutRequested = true;
    _layoutOffsets.clear();
    notifyListeners();
  }

  bool _isFresh(int epoch) => !_disposed && epoch == _epoch;

  Future<void> load() async {
    final epoch = ++_epoch;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait<dynamic>([
        api.fetchProjectTree(_projectId),
        api.fetchMembers(_projectId),
        api.fetchPermissions(_projectId),
        api.fetchProject(_projectId),
      ]);
      if (!_isFresh(epoch)) return;

      final tree = results[0] as List<Map<String, dynamic>>;
      final members = results[1] as List<AxisMember>;
      final permissions = results[2] as AxisPermissions;
      final project = results[3] as AxisProjectInfo;

      final mapped = AxisTreeMapper.mapTree(
        tree,
        finalOwnerUserId: project.pmUserId,
      );
      nodes = mapped;
      this.members = members;
      this.permissions = permissions;
      this.project = project;
      if (resetLayoutRequested) {
        // 本次加载已按重置后的自动对齐展示，标记立即失效，
        // 之后拖动的偏移照常生效。
        resetLayoutRequested = false;
      } else {
        _layoutOffsets
          ..clear()
          ..addEntries(mapped
              .where((node) => node.layoutOffset != null)
              .map((node) => MapEntry(node.id, node.layoutOffset!)));
      }
      if (selectedNodeId != null && nodeById(selectedNodeId) == null) {
        selectedNodeId = null;
      }
      loading = false;
      notifyListeners();
    } catch (e) {
      if (!_isFresh(epoch)) return;
      // 网络/登录/服务端错误都向上暴露为可见状态，不静默吞掉。
      error = e;
      loading = false;
      notifyListeners();
    }
  }

  /// 切换项目：先清空旧项目的节点与布局，再用新代次加载，旧请求结果不会写回。
  Future<void> switchProject(int projectId) async {
    if (projectId == _projectId) return;
    _projectId = projectId;
    _epoch++;
    nodes = const [];
    members = const [];
    permissions = AxisPermissions.empty;
    project = null;
    selectedNodeId = null;
    _layoutOffsets.clear();
    resetLayoutRequested = false;
    notifyListeners();
    await load();
  }

  /// 拖动卡片改变上级。失败时把后端中文原因抛给页面展示。
  Future<void> moveNode(int nodeId, int? newParentId) async {
    await api.moveNode(nodeId, newParentId: newParentId);
    await load();
  }

  /// 保存卡片位置：先本地生效，失败回滚并抛出，由页面提示。
  Future<void> saveLayout(int nodeId, Offset offset) async {
    final previous = offsetFor(nodeId);
    // 用户重新摆放卡片，重置态到此为止；否则这次偏移会被画布忽略。
    resetLayoutRequested = false;
    _layoutOffsets[nodeId] = offset;
    notifyListeners();
    try {
      await api.saveNodeLayout(
        nodeId,
        offsetX: offset.dx,
        offsetY: offset.dy,
      );
    } catch (e) {
      _layoutOffsets[nodeId] = previous;
      notifyListeners();
      rethrow;
    }
  }

  /// 保存终责卡沿主干偏移。仅 PM/创建者可调，后端二次强制。
  ///
  /// 请求期间用户可能已经切到别的项目：成功/失败回调都必须先确认当前项目仍是
  /// 发起请求的那个，否则会把旧项目的名称、位置和权限写回新项目（返工 #6）。
  Future<void> saveFinalOwnerDelta(double delta) async {
    final currentProject = project;
    if (currentProject == null) return;
    final projectId = currentProject.id;
    final previous = currentProject.finalOwnerAlongDelta;
    // 后端 `along_delta` 是整数字段，本地先按同一取整规则显示，避免回填时跳变。
    final target = delta.roundToDouble();
    project = _withFinalOwnerOffset(currentProject, target);
    notifyListeners();
    try {
      final saved = await api.saveFinalOwnerDelta(projectId, target);
      if (!_belongsToCurrentProject(projectId)) return;
      project = _withFinalOwnerOffset(project!, saved);
      notifyListeners();
    } catch (e) {
      if (!_belongsToCurrentProject(projectId)) return;
      project = _withFinalOwnerOffset(project!, previous);
      notifyListeners();
      rethrow;
    }
  }

  /// 当前展示的项目是否仍是 [projectId]；切换项目或销毁后为 false。
  bool _belongsToCurrentProject(int projectId) =>
      !_disposed && project?.id == projectId;

  AxisProjectInfo _withFinalOwnerOffset(AxisProjectInfo base, double delta) =>
      AxisProjectInfo(
        id: base.id,
        name: base.name,
        pmUserId: base.pmUserId,
        createdBy: base.createdBy,
        finalOwnerAlongDelta: delta,
        status: base.status,
      );

  /// 人员权限与交接：次级人员的频道访问开关写 `responsibility_permissions`。
  Future<void> updateChannelAccess(AxisPersonNode node, bool allowed) async {
    final merged = <String, dynamic>{
      ...node.responsibilityPermissions,
      'channel_access': allowed,
    };
    await api.updateNode(
      node.id,
      responsibilityPermissions: merged,
    );
    await load();
  }

  Future<AxisDeletionPreview> previewDeletion(int nodeId) =>
      api.previewDeletion(nodeId);

  Future<void> deletePerson(
    int nodeId, {
    required String previewToken,
    bool cascade = false,
    int? handoverToNodeId,
  }) async {
    await api.deletePerson(
      nodeId,
      previewToken: previewToken,
      cascade: cascade,
      handoverToNodeId: handoverToNodeId,
    );
    await load();
  }

  @override
  void dispose() {
    _disposed = true;
    _epoch++;
    super.dispose();
  }
}
