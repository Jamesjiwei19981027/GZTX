import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Offset;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../reports/models/report_models.dart';
import '../data/axis_api.dart';
import '../data/axis_fold.dart';
import '../data/axis_models.dart';
import '../data/axis_report_helpers.dart';
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
    Future<SharedPreferences> Function()? prefsLoader,
  })  : _projectId = projectId,
        _prefsLoader = prefsLoader ?? SharedPreferences.getInstance;

  /// 读写线型偏好的入口，测试可注入失败的实现。
  final Future<SharedPreferences> Function() _prefsLoader;
  static const String edgeStyleKey = 'axis_edge_style';
  static const String sortKey = 'people_axis_order_mode';
  bool _sortRestored = false;
  bool _sortTouched = false;

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
  AxisEdgeStyle edgeStyle = AxisEdgeStyle.curve;
  bool showAiStatus = true;
  bool expandSubordinates = true;

  /// 折叠状态：被拉到人轴的人（按“用户 id + 项目 id”存本机）、已展开的折叠行与被隐藏的折叠组（仅内存）。
  Set<int> pulledIds = {};
  Set<int> expandedRowIds = {};
  Set<int> hiddenStackIds = {};
  bool _pulledTouched = false;

  /// 重置布局进行中、尚未落盘完成的节点；加载不得用后端旧值把它们改回去。
  final Set<int> _pendingResetIds = {};

  final Map<AxisOrientation, Map<int, Offset>> _offsetsByOrientation = {
    AxisOrientation.horizontal: {},
    AxisOrientation.vertical: {},
  };

  Map<int, AgentReport> latestReports = const {};
  bool reportsLoaded = false;
  bool reportsError = false;

  int? selectedNodeId;

  /// 当前用户自己的人员卡片（primary/collaborator 指派）。
  AxisPersonNode? get selfNode {
    if (currentUserId == null) return null;
    for (final node in nodes) {
      if (node.ownerUserIds.contains(currentUserId)) return node;
    }
    return null;
  }

  AxisFoldSpec get foldSpec => AxisFoldSpec(
        pulled: pulledIds,
        expandedRows: expandedRowIds,
        hiddenStacks: hiddenStackIds,
        selfId: selfNode?.id,
      );

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
      _offsetsByOrientation[orientation]?[nodeId] ?? Offset.zero;

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
    _sortTouched = true;
    if (sort == value) return;
    sort = value;
    notifyListeners();
    unawaited(_persistSort(value));
  }

  Future<void> _persistSort(AxisSort value) async {
    try {
      final prefs = await _prefsLoader();
      await prefs.setString(sortKey, value.name);
    } catch (_) {/* 偏好保存失败不影响当前视图 */}
  }

  Future<void> _restoreSort() async {
    if (_sortRestored) return;
    _sortRestored = true;
    try {
      final prefs = await _prefsLoader();
      if (!_disposed && !_sortTouched) {
        sort =
            prefs.getString(sortKey) == 'time' ? AxisSort.time : AxisSort.tree;
      }
    } catch (_) {/* 本地存储不可用时沿用默认树序 */}
  }

  void setSpacing(AxisSpacing value) {
    if (spacing == value) return;
    spacing = value;
    notifyListeners();
  }

  bool _edgeStyleRestored = false;
  bool _edgeStyleTouched = false;

  /// 切换连线线型（曲线 / 直线）并记住；写入失败只影响“下次启动是否记得”，不崩。
  void setEdgeStyle(AxisEdgeStyle value) {
    _edgeStyleTouched = true;
    if (edgeStyle == value) return;
    edgeStyle = value;
    notifyListeners();
    unawaited(_persistEdgeStyle(value));
  }

  Future<void> _persistEdgeStyle(AxisEdgeStyle value) async {
    try {
      final prefs = await _prefsLoader();
      await prefs.setString(edgeStyleKey, value.name);
    } catch (_) {
      // 记不住就算了，当前会话内仍然生效。
    }
  }

  /// 首次加载时读取已保存的线型；读取失败或值无效时保持默认曲线。
  Future<void> _restoreEdgeStyle() async {
    if (_edgeStyleRestored) return;
    _edgeStyleRestored = true;
    try {
      final prefs = await _prefsLoader();
      final stored = prefs.getString(edgeStyleKey);
      if (_disposed || _edgeStyleTouched) return;
      for (final value in AxisEdgeStyle.values) {
        if (value.name == stored) edgeStyle = value;
      }
    } catch (_) {
      edgeStyle = AxisEdgeStyle.curve;
    }
  }

  void setShowAiStatus(bool value) {
    showAiStatus = value;
    notifyListeners();
  }

  void setExpandSubordinates(bool value) {
    expandSubordinates = value;
    notifyListeners();
  }

  String? get _pulledKey =>
      currentUserId == null ? null : 'axis_pulled_${currentUserId}_$_projectId';

  /// 折叠行点一下就地展开 / 再点收起（只在内存里）。
  void togglePersonRow(int id) {
    expandedRowIds = expandedRowIds.contains(id)
        ? ({...expandedRowIds}..remove(id))
        : {...expandedRowIds, id};
    notifyListeners();
  }

  /// 领导卡片“下属 n”：整体显示 / 隐藏这组折叠行。
  void toggleStack(int leaderId) {
    hiddenStackIds = hiddenStackIds.contains(leaderId)
        ? ({...hiddenStackIds}..remove(leaderId))
        : {...hiddenStackIds, leaderId};
    notifyListeners();
  }

  void pullToAxis(int id) {
    pulledIds = {...pulledIds, id};
    expandedRowIds = {...expandedRowIds}..remove(id);
    _commitPulled();
  }

  /// 收回：他和他下面所有被拉出的人都移出拉出集合。
  void returnFromAxis(int id) {
    final gone = pulledSubtree(nodes, id, pulledIds);
    pulledIds = {...pulledIds}..removeAll(gone);
    expandedRowIds = {...expandedRowIds}..removeAll(gone);
    _commitPulled();
  }

  void pullAllToAxis() {
    pulledIds = {
      for (final node in nodes)
        if (node.parentId != null) node.id,
    };
    expandedRowIds = {};
    _commitPulled();
  }

  void resetFold() {
    pulledIds = {};
    expandedRowIds = {};
    _commitPulled();
  }

  /// 定位到未上轴的人：把他所有上级拉到人轴并保存，再展开他这一行。
  void revealPerson(int id) {
    final node = nodeById(id);
    if (node == null) return;
    final ancestors = revealAncestors(nodes, id);
    pulledIds = {
      ...pulledIds,
      for (final a in ancestors)
        if (nodeById(a)?.parentId != null) a,
    };
    if (!axisMemberIds(nodes, foldSpec).contains(id)) {
      expandedRowIds = {...expandedRowIds, id};
      if (node.parentId != null) {
        hiddenStackIds = {...hiddenStackIds}..remove(node.parentId);
      }
    }
    _commitPulled();
  }

  void _commitPulled() {
    _pulledTouched = true;
    notifyListeners();
    unawaited(_persistPulled());
  }

  Future<void> _persistPulled() async {
    final key = _pulledKey;
    if (key == null) return;
    try {
      final prefs = await _prefsLoader();
      final ids = pulledIds.toList()..sort();
      await prefs.setString(key, jsonEncode(ids));
    } catch (_) {
      // 记不住就算了，当前会话内仍然生效。
    }
  }

  /// 读取本项目已保存的拉出集合；读取失败或内容损坏返回 null（保持当前集合）。
  Future<Set<int>?> _loadPulled() async {
    final key = _pulledKey;
    if (key == null) return null;
    try {
      final prefs = await _prefsLoader();
      final raw = prefs.getString(key);
      if (raw == null) return <int>{};
      final decoded = jsonDecode(raw);
      if (decoded is! List) return null;
      return {
        for (final v in decoded)
          if (v is int) v
      };
    } catch (_) {
      return null;
    }
  }

  /// 重置当前方向的卡片布局：本地立即清零，并把每个非零偏移带方向写回后端。
  ///
  /// 无权编辑的节点保留原偏移、不发请求；单个失败时恢复该节点偏移，
  /// 全部处理完后把第一个失败原因抛出，由页面提示。另一方向不受影响。
  Future<void> resetLayout() async {
    final dir = orientation;
    final map = _offsetsByOrientation.putIfAbsent(dir, () => <int, Offset>{});
    final targets = <int, Offset>{};
    for (final entry in map.entries.toList()) {
      if (entry.value == Offset.zero) continue;
      final node = nodeById(entry.key);
      if (node == null || !permissions.nodeCan(node, 'can_edit_person')) {
        continue;
      }
      targets[entry.key] = entry.value;
    }
    for (final id in targets.keys) {
      map.remove(id);
    }
    _pendingResetIds.addAll(targets.keys);
    notifyListeners();

    Object? firstError;
    await Future.wait(targets.entries.map((entry) async {
      try {
        await api.saveNodeLayout(
          entry.key,
          offsetX: 0,
          offsetY: 0,
          orientation: dir,
        );
      } catch (e) {
        firstError ??= e;
        // 只在用户没有重新摆放过该卡片时恢复旧值。
        if (!_disposed) map.putIfAbsent(entry.key, () => entry.value);
      } finally {
        _pendingResetIds.remove(entry.key);
      }
    }));
    if (!_disposed) notifyListeners();
    if (firstError != null) throw firstError!;
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
        _restoreEdgeStyle(),
        _loadPulled(),
        _restoreSort(),
      ]);
      if (!_isFresh(epoch)) return;
      final storedPulled = results[5] as Set<int>?;
      if (storedPulled != null && !_pulledTouched) pulledIds = storedPulled;

      final tree = results[0] as List<Map<String, dynamic>>;
      final members = results[1] as List<AxisMember>;
      final permissions = results[2] as AxisPermissions;
      final project = results[3] as AxisProjectInfo;

      final mapped = AxisTreeMapper.mapTree(tree);
      nodes = mapped;
      this.members = members;
      this.permissions = permissions;
      this.project = project;
      // 两个方向都以后端为准；重置尚未落盘的节点保持本地已清零。
      _offsetsByOrientation[AxisOrientation.horizontal] = {
        for (final node in mapped)
          if (node.horizontalOffset != null &&
              node.horizontalOffset != Offset.zero &&
              !_pendingResetIds.contains(node.id))
            node.id: node.horizontalOffset!,
      };
      _offsetsByOrientation[AxisOrientation.vertical] = {
        for (final node in mapped)
          if (node.verticalOffset != null &&
              node.verticalOffset != Offset.zero &&
              !_pendingResetIds.contains(node.id))
            node.id: node.verticalOffset!,
      };
      try {
        final reports = await api.fetchProjectReports(_projectId);
        if (_isFresh(epoch)) {
          latestReports = latestReportByUser(reports);
          reportsLoaded = true;
          reportsError = false;
        }
      } catch (_) {
        if (_isFresh(epoch)) {
          latestReports = const {};
          reportsLoaded = false;
          reportsError = true;
        }
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
    pulledIds = {};
    expandedRowIds = {};
    hiddenStackIds = {};
    _pulledTouched = false;
    _offsetsByOrientation[AxisOrientation.horizontal]?.clear();
    _offsetsByOrientation[AxisOrientation.vertical]?.clear();
    latestReports = const {};
    reportsLoaded = false;
    reportsError = false;
    _pendingResetIds.clear();
    notifyListeners();
    await load();
  }

  /// 拖动卡片改变上级。失败时把后端中文原因抛给页面展示。
  Future<void> moveNode(int nodeId, int? newParentId) async {
    await api.moveNode(nodeId, newParentId: newParentId);
    _offsetsByOrientation[AxisOrientation.horizontal]?.remove(nodeId);
    _offsetsByOrientation[AxisOrientation.vertical]?.remove(nodeId);
    await load();
  }

  /// 保存卡片位置：先本地生效，失败回滚并抛出，由页面提示。
  Future<void> saveLayout(int nodeId, Offset offset) async {
    final currentMap = _offsetsByOrientation.putIfAbsent(
      orientation,
      () => <int, Offset>{},
    );
    final previous = currentMap[nodeId] ?? Offset.zero;
    _pendingResetIds.remove(nodeId);
    currentMap[nodeId] = offset;
    notifyListeners();
    try {
      await api.saveNodeLayout(
        nodeId,
        offsetX: offset.dx,
        offsetY: offset.dy,
        orientation: orientation,
      );
    } catch (e) {
      currentMap[nodeId] = previous;
      notifyListeners();
      rethrow;
    }
  }

  /// 人员权限与交接：次级人员的频道访问开关写 `responsibility_permissions`。
  Future<void> updateChannelAccess(AxisPersonNode node, bool allowed) async {
    final merged = <String, dynamic>{
      ...node.responsibilityPermissions,
      'channel_access': allowed,
    };
    await api.updateNode(node.id, responsibilityPermissions: merged);
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
