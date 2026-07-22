import 'package:flutter/material.dart';

import '../models/models.dart';
import 'work_tree_layout.dart';
import 'work_tree_prefs.dart';
import 'work_tree_theme.dart';

typedef WorkTreeNodeCallback = void Function(TreeNodeItem node);
typedef WorkTreeCreateCallback = Future<void> Function({
  required String nodeTypeKey,
  required String title,
  int? parentId,
  String? dueAt,
});
typedef WorkTreeMoveCallback = Future<void> Function({
  required int nodeId,
  int? newParentId,
});
typedef WorkTreeDeleteCallback = Future<void> Function(TreeNodeItem node);
typedef WorkTreeUpdateCallback = Future<void> Function({
  required int nodeId,
  String? title,
  String? nodeTypeKey,
  String? dueAt,
});
typedef WorkTreeAssigneesCallback = Future<void> Function({
  required int nodeId,
  required List<int> userIds,
});

class WorkTreeCanvas extends StatefulWidget {
  const WorkTreeCanvas({
    super.key,
    required this.roots,
    required this.projectId,
    required this.userId,
    required this.needsVerification,
    required this.members,
    required this.onCreateNode,
    required this.onMoveNode,
    required this.onUpdateNode,
    required this.onSetAssignees,
    required this.onDeleteNode,
    required this.onSubmitEvidence,
    required this.onOpenAgent,
    this.onSelectionChanged,
    this.finalOwnerUserId,
    this.finalOwnerName,
    this.onEnsureLeader,
  });

  final List<TreeNodeItem> roots;
  final int projectId;
  final int? userId;
  final bool needsVerification;
  final List<ProjectMemberItem> members;
  final WorkTreeCreateCallback onCreateNode;
  final WorkTreeMoveCallback onMoveNode;
  final WorkTreeUpdateCallback onUpdateNode;
  final WorkTreeAssigneesCallback onSetAssignees;
  final WorkTreeDeleteCallback onDeleteNode;
  final WorkTreeNodeCallback onSubmitEvidence;
  final WorkTreeNodeCallback onOpenAgent;
  final WorkTreeNodeCallback? onSelectionChanged;
  final int? finalOwnerUserId;
  final String? finalOwnerName;
  final Future<void> Function()? onEnsureLeader;

  @override
  State<WorkTreeCanvas> createState() => WorkTreeCanvasState();
}

class WorkTreeCanvasState extends State<WorkTreeCanvas> {
  late final WorkTreePrefs _prefs;
  late final TransformationController _transform;
  WorkTreeAxis _axis = WorkTreeAxis.vertical;
  WorkTreeSort _sort = WorkTreeSort.tree;
  int? _lastNodeId;
  int? _selectedId;
  int? _expandedId;
  int? _dropHoverId; // node under drag, or -1 for blank canvas
  bool _ready = false;
  bool _overview = false;
  bool _dragging = false;
  bool _propertiesOpen = false;
  int _visibleLevels = 3;
  Size _viewport = Size.zero;

  @override
  void initState() {
    super.initState();
    _prefs = WorkTreePrefs(widget.projectId);
    _transform = TransformationController();
    _bootstrap();
  }

  @override
  void didUpdateWidget(covariant WorkTreeCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.roots != widget.roots) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final layout = _computeLayout();
        final selectedGone =
            _selectedId != null && !layout.containsNode(_selectedId!);
        final expandedGone =
            _expandedId != null && !layout.containsNode(_expandedId!);
        if (selectedGone || expandedGone || _selectedId == null) {
          if (selectedGone || _selectedId == null) {
            _selectedId = null;
            _propertiesOpen = false;
          }
          if (expandedGone) _expandedId = null;
          _focusSelectedOrAuto(force: true);
        }
      });
    }
  }

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final axis = await _prefs.loadAxis();
    final sort = await _prefs.loadSort();
    final last = await _prefs.loadLastNodeId();
    final levels = await _prefs.loadVisibleLevels();
    if (!mounted) return;
    setState(() {
      _axis = axis;
      _sort = sort;
      _lastNodeId = last;
      _visibleLevels = levels.clamp(1, 8);
      _ready = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusSelectedOrAuto(force: true);
    });
  }

  WorkTreeLayoutResult _computeLayout() => WorkTreeLayout.layout(
        roots: widget.roots,
        axis: _axis,
        sort: _sort,
        userId: widget.userId,
        lastNodeId: _lastNodeId,
        expandedNodeId: _expandedId,
        visibleLevels: _visibleLevels,
        finalOwnerUserId: widget.finalOwnerUserId,
      );

  void _clearSelection() {
    if (_selectedId == null && !_propertiesOpen) return;
    setState(() {
      _selectedId = null;
      _propertiesOpen = false;
    });
  }

  void _closeProperties() {
    if (!_propertiesOpen) return;
    setState(() => _propertiesOpen = false);
  }

  void _select(
    TreeNodeItem node, {
    bool toggleExpand = true,
    bool exitOverview = true,
  }) {
    // 再次点同一节点：取消选中并收起属性，不逼用户必须填
    if (_selectedId == node.id) {
      _clearSelection();
      return;
    }
    setState(() {
      _selectedId = node.id;
      _propertiesOpen = true;
      if (exitOverview) _overview = false;
      if (toggleExpand) {
        _expandedId = _expandedId == node.id ? null : node.id;
      }
    });
    _lastNodeId = node.id;
    _prefs.saveLastNodeId(node.id);
    widget.onSelectionChanged?.call(node);
    _focusNode(node.id);
  }

  void _focusSelectedOrAuto({bool force = false}) {
    final layout = _computeLayout();
    var id = _selectedId;
    if (id != null && !layout.containsNode(id)) id = null;
    id ??= layout.focusNodeId;
    if (id == null) return;
    final placed = layout.byId(id);
    if (placed == null) return;
    final needNotify = _selectedId != id;
    setState(() => _selectedId = id);
    if (needNotify) widget.onSelectionChanged?.call(placed.node);
    if (force || !_overview) _focusNode(id);
  }

  void focusMe() {
    final layout = _computeLayout();
    final id = WorkTreeLayout.resolveFocusId(
      flat: WorkTreeLayout.flattenPersons(
        widget.roots,
        _sort,
        finalOwnerUserId: widget.finalOwnerUserId,
      ),
      userId: widget.userId,
      lastNodeId: _lastNodeId,
    );
    if (id == null) return;
    final placed = layout.byId(id);
    if (placed == null) return;
    setState(() {
      _selectedId = id;
      _overview = false;
    });
    widget.onSelectionChanged?.call(placed.node);
    _focusNode(id);
  }

  void _focusNode(int id) {
    final layout = _computeLayout();
    final placed = layout.byId(id);
    if (placed == null || _viewport == Size.zero) return;
    final scale = _overview ? _fitScale(layout) : 1.0;
    final target = placed.center;
    _transform.value = Matrix4.identity()
      ..translateByDouble(
        _viewport.width / 2 - target.dx * scale,
        _viewport.height / 2 - target.dy * scale,
        0,
        1,
      )
      ..scaleByDouble(scale, scale, scale, 1);
  }

  void _toggleOverview() {
    final layout = _computeLayout();
    final next = !_overview;
    setState(() => _overview = next);
    if (next) {
      _fitAll(layout);
    } else if (_selectedId != null) {
      _focusNode(_selectedId!);
    }
  }

  void _onNodeDoubleTap(TreeNodeItem node) {
    setState(() {
      _selectedId = node.id;
      _lastNodeId = node.id;
    });
    _prefs.saveLastNodeId(node.id);
    widget.onSelectionChanged?.call(node);
    _toggleOverview();
  }

  double _fitScale(WorkTreeLayoutResult layout) {
    if (_viewport == Size.zero) return 1;
    final bounds = layout.contentBounds;
    if (bounds.width <= 0 || bounds.height <= 0) return 1;
    final sx = _viewport.width / bounds.width;
    final sy = _viewport.height / bounds.height;
    return (sx < sy ? sx : sy).clamp(0.25, 1.2);
  }

  void _fitAll(WorkTreeLayoutResult layout) {
    if (_viewport == Size.zero) return;
    final bounds = layout.contentBounds;
    final scale = _fitScale(layout);
    _transform.value = Matrix4.identity()
      ..translateByDouble(
        _viewport.width / 2 - bounds.center.dx * scale,
        _viewport.height / 2 - bounds.center.dy * scale,
        0,
        1,
      )
      ..scaleByDouble(scale, scale, scale, 1);
  }

  Future<void> _setAxis(WorkTreeAxis axis) async {
    setState(() => _axis = axis);
    await _prefs.saveAxis(axis);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusSelectedOrAuto(force: true);
    });
  }

  Future<void> _setSort(WorkTreeSort sort) async {
    setState(() => _sort = sort);
    await _prefs.saveSort(sort);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusSelectedOrAuto(force: true);
    });
  }

  Future<void> _setVisibleLevels(int levels) async {
    final v = levels.clamp(1, 8);
    setState(() => _visibleLevels = v);
    await _prefs.saveVisibleLevels(v);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusSelectedOrAuto(force: true);
    });
  }

  TreeNodeItem? get _selectedNode {
    if (_selectedId == null) return null;
    final layout = _computeLayout();
    final placed = layout.byId(_selectedId!);
    if (placed != null) return placed.node;
    for (final prev in layout.previews) {
      if (prev.node.id == _selectedId) return prev.node;
    }
    return _findInRoots(_selectedId!);
  }

  void _guardVerified(VoidCallback action) {
    if (widget.needsVerification) {
      Navigator.of(context).pushNamed('/verify');
      return;
    }
    action();
  }

  void _rememberViewport(Size size) {
    if (size != Size.zero) _viewport = size;
  }

  TreeNodeItem? _findInRoots(int id) {
    TreeNodeItem? walk(List<TreeNodeItem> nodes) {
      for (final n in nodes) {
        if (n.id == id) return n;
        final hit = walk(n.children);
        if (hit != null) return hit;
      }
      return null;
    }

    return walk(widget.roots);
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _spawnNode({
    required String nodeTypeKey,
    required String title,
    int? parentId,
  }) async {
    String? dueAt;
    if (nodeTypeKey == 'milestone') {
      dueAt = DateTime.now().add(const Duration(days: 7)).toIso8601String();
    }
    await widget.onCreateNode(
      nodeTypeKey: nodeTypeKey,
      title: title,
      parentId: parentId,
      dueAt: dueAt,
    );
  }

  Future<void> _quickConnect(TreeNodeItem parent, PaletteItem item) async {
    if (!parent.isPerson) return;
    await _spawnNode(
      nodeTypeKey: item.nodeTypeKey,
      title: item.defaultTitle,
      parentId: parent.id,
    );
  }

  Future<void> _confirmDelete(TreeNodeItem node) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除节点？'),
        content: Text('将删除「${node.title}」及其下级（软删除）。此操作需有编辑权限。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      if (_selectedId == node.id) _selectedId = null;
    });
    await widget.onDeleteNode(node);
  }

  /// 空白处只收人；事项必须落到人身上；人落到人 = 下级人员。
  Future<void> _handlePaletteDrop(PaletteDragData data, {int? ontoNodeId}) async {
    final key = data.item.nodeTypeKey;
    final isPerson = WorkTreeTheme.isPersonType(key);

    if (ontoNodeId == null) {
      if (!isPerson) {
        _toast('工作项/里程碑/范围请拖到「人」节点上');
        return;
      }
      await _spawnNode(
        nodeTypeKey: key,
        title: data.item.defaultTitle,
        parentId: null,
      );
      return;
    }

    final onto = _findInRoots(ontoNodeId);
    if (onto == null) return;

    if (isPerson) {
      if (!onto.isPerson) {
        _toast('人员只能挂在另一人下面，或放到空白画布');
        return;
      }
      await _spawnNode(
        nodeTypeKey: key,
        title: data.item.defaultTitle,
        parentId: onto.id,
      );
      return;
    }

    if (!onto.isPerson) {
      _toast('事项只能挂在「人」节点上');
      return;
    }
    await _spawnNode(
      nodeTypeKey: key,
      title: data.item.defaultTitle,
      parentId: onto.id,
    );
  }

  Future<void> _handleNodeMoveDrop(
    NodeMoveDragData data, {
    required int ontoNodeId,
  }) async {
    if (data.nodeId == ontoNodeId) return;
    final moving = _findInRoots(data.nodeId);
    final onto = _findInRoots(ontoNodeId);
    if (moving == null || onto == null) return;

    if (moving.isPerson) {
      if (!onto.isPerson) {
        _toast('人员只能调整到另一人下面');
        return;
      }
    } else {
      if (!onto.isPerson) {
        _toast('事项只能挂在「人」节点上');
        return;
      }
    }
    await widget.onMoveNode(nodeId: data.nodeId, newParentId: ontoNodeId);
  }

  bool _canAcceptPaletteOn(PaletteDragData data, {required int? ontoNodeId}) {
    final isPerson = WorkTreeTheme.isPersonType(data.item.nodeTypeKey);
    if (ontoNodeId == null) return isPerson;
    final onto = _findInRoots(ontoNodeId);
    if (onto == null) return false;
    return onto.isPerson;
  }

  bool _canAcceptMoveOn(NodeMoveDragData data, {required int ontoNodeId}) {
    if (data.nodeId == ontoNodeId) return false;
    final moving = _findInRoots(data.nodeId);
    final onto = _findInRoots(ontoNodeId);
    if (moving == null || onto == null) return false;
    if (moving.isPerson) return onto.isPerson;
    return onto.isPerson;
  }

  void _runOnSelected(WorkTreeNodeCallback action, {bool verified = false}) {
    final selected = _selectedNode;
    if (selected == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先选中一个节点')),
      );
      return;
    }
    if (verified) {
      _guardVerified(() => action(selected));
    } else {
      action(selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Center(child: CircularProgressIndicator());
    }

    final layout = _computeLayout();
    final selected = _selectedNode;
    final canvasSize = Size(
      layout.contentBounds.width,
      layout.contentBounds.height,
    );
    final hasLeader = WorkTreeLayout.hasLeaderOnSpine(
      widget.roots,
      widget.finalOwnerUserId,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        _rememberViewport(
          Size(constraints.maxWidth - kPaletteWidth, constraints.maxHeight),
        );
        return ColoredBox(
          color: WorkTreeTheme.bg,
          child: Row(
            children: [
              _StencilPalette(
                selectedTitle: selected?.title,
                needsVerification: widget.needsVerification,
                onDragStarted: () => setState(() => _dragging = true),
                onDragEnded: () => setState(() {
                  _dragging = false;
                  _dropHoverId = null;
                }),
                onDelete: () {
                  final n = _selectedNode;
                  if (n == null) {
                    _toast('请先点选要删除的节点');
                    return;
                  }
                  _confirmDelete(n);
                },
                onEvidence: () => _runOnSelected(
                  widget.onSubmitEvidence,
                  verified: true,
                ),
                onAgent: () =>
                    _runOnSelected(widget.onOpenAgent, verified: true),
                onFocusMe: focusMe,
                onCreateRoot: () => _spawnNode(
                  nodeTypeKey: 'person',
                  title: '未命名',
                  parentId: null,
                ),
              ),
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: CustomPaint(painter: _GridPainter()),
                    ),
                    Positioned.fill(
                      child: widget.roots.isEmpty && !_dragging
                          ? _EmptyHint(
                              onCreateRoot: () => _spawnNode(
                                nodeTypeKey: 'person',
                                title: '未命名',
                                parentId: null,
                              ),
                            )
                          : _CanvasBoard(
                              transform: _transform,
                              canvasSize: canvasSize,
                              layout: layout,
                              axis: _axis,
                              selectedId: _selectedId,
                              dropHoverId: _dropHoverId,
                              userId: widget.userId,
                              panEnabled: !_dragging,
                              onHoverChange: (id) =>
                                  setState(() => _dropHoverId = id),
                              onDragStarted: () =>
                                  setState(() => _dragging = true),
                              onDragEnded: () => setState(() {
                                _dragging = false;
                                _dropHoverId = null;
                              }),
                              onSelect: _select,
                              onClearSelection: _clearSelection,
                              onDoubleTap: _onNodeDoubleTap,
                              canAcceptPalette: _canAcceptPaletteOn,
                              canAcceptMove: _canAcceptMoveOn,
                              onPaletteDrop: _handlePaletteDrop,
                              onNodeMoveDrop: _handleNodeMoveDrop,
                              onQuickConnect: _quickConnect,
                            ),
                    ),
                    if (selected != null && !_dragging && _propertiesOpen)
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 44,
                        child: _NodePropertyPanel(
                          node: selected,
                          members: widget.members,
                          onClose: _closeProperties,
                          onSaveTitle: (title) => widget.onUpdateNode(
                            nodeId: selected.id,
                            title: title,
                          ),
                          onChangeType: (key) => widget.onUpdateNode(
                            nodeId: selected.id,
                            nodeTypeKey: key,
                          ),
                          onSetAssignee: (userId) => widget.onSetAssignees(
                            nodeId: selected.id,
                            userIds: userId == null ? const [] : [userId],
                          ),
                          onDelete: () => _confirmDelete(selected),
                        ),
                      ),
                    if (selected != null &&
                        !_dragging &&
                        !_propertiesOpen)
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 44,
                        child: _SelectedChip(
                          title: selected.title,
                          onEdit: () => setState(() => _propertiesOpen = true),
                          onClear: _clearSelection,
                        ),
                      ),
                    Positioned(
                      right: 12,
                      top: 12,
                      child: _Toolbar(
                        axis: _axis,
                        sort: _sort,
                        visibleLevels: _visibleLevels,
                        onAxis: _setAxis,
                        onSort: _setSort,
                        onVisibleLevels: _setVisibleLevels,
                        onFocusMe: focusMe,
                        onToggleOverview: _toggleOverview,
                      ),
                    ),
                    if (!hasLeader &&
                        widget.finalOwnerUserId != null &&
                        widget.onEnsureLeader != null &&
                        !_dragging)
                      Positioned(
                        left: 12,
                        right: 100,
                        top: 12,
                        child: Material(
                          color: const Color(0xFFE8F1FF),
                          elevation: 2,
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '主干还没有项目负责人节点'
                                    '${widget.finalOwnerName == null ? '' : '（${widget.finalOwnerName}）'}。'
                                    '点右侧按钮放到主干终点。',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: WorkTreeTheme.ink,
                                      height: 1.3,
                                    ),
                                  ),
                                ),
                                FilledButton(
                                  onPressed: () => widget.onEnsureLeader?.call(),
                                  child: const Text('放到终点'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    Positioned(
                      left: 12,
                      bottom: 12,
                      child: _SortChip(sort: _sort),
                    ),
                    if (_dragging)
                      Positioned(
                        left: 12,
                        right: 12,
                        top: 12,
                        child: IgnorePointer(
                          child: Material(
                            color: WorkTreeTheme.dropHighlight
                                .withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Text(
                                _dropHoverId != null && _dropHoverId != -1
                                    ? '松手：挂到高亮节点下面'
                                    : (_selectedId != null
                                        ? '松手到空白：挂到当前选中节点下面'
                                        : '松手到空白：创建为最顶层'),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: WorkTreeTheme.ink,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CanvasBoard extends StatelessWidget {
  const _CanvasBoard({
    required this.transform,
    required this.canvasSize,
    required this.layout,
    required this.axis,
    required this.selectedId,
    required this.dropHoverId,
    required this.userId,
    required this.panEnabled,
    required this.onHoverChange,
    required this.onDragStarted,
    required this.onDragEnded,
    required this.onSelect,
    required this.onClearSelection,
    required this.onDoubleTap,
    required this.canAcceptPalette,
    required this.canAcceptMove,
    required this.onPaletteDrop,
    required this.onNodeMoveDrop,
    required this.onQuickConnect,
  });

  final TransformationController transform;
  final Size canvasSize;
  final WorkTreeLayoutResult layout;
  final WorkTreeAxis axis;
  final int? selectedId;
  final int? dropHoverId;
  final int? userId;
  final bool panEnabled;
  final ValueChanged<int?> onHoverChange;
  final VoidCallback onDragStarted;
  final VoidCallback onDragEnded;
  final void Function(TreeNodeItem node, {bool toggleExpand}) onSelect;
  final VoidCallback onClearSelection;
  final ValueChanged<TreeNodeItem> onDoubleTap;
  final bool Function(PaletteDragData data, {required int? ontoNodeId})
      canAcceptPalette;
  final bool Function(NodeMoveDragData data, {required int ontoNodeId})
      canAcceptMove;
  final Future<void> Function(PaletteDragData data, {int? ontoNodeId})
      onPaletteDrop;
  final Future<void> Function(NodeMoveDragData data, {required int ontoNodeId})
      onNodeMoveDrop;
  final Future<void> Function(TreeNodeItem parent, PaletteItem item)
      onQuickConnect;

  @override
  Widget build(BuildContext context) {
    return DragTarget<Object>(
      onWillAcceptWithDetails: (details) {
        if (details.data is PaletteDragData) {
          final ok = canAcceptPalette(
            details.data as PaletteDragData,
            ontoNodeId: null,
          );
          if (ok) onHoverChange(-1);
          return ok;
        }
        return false;
      },
      onLeave: (_) => onHoverChange(null),
      onAcceptWithDetails: (details) async {
        onHoverChange(null);
        final data = details.data;
        if (data is PaletteDragData) {
          await onPaletteDrop(data);
        }
      },
      builder: (context, candidate, rejected) {
        final blankHot = dropHoverId == -1 && candidate.isNotEmpty;
        return DecoratedBox(
          decoration: BoxDecoration(
            border: blankHot
                ? Border.all(color: WorkTreeTheme.dropHighlight, width: 2)
                : null,
          ),
          child: InteractiveViewer(
            transformationController: transform,
            constrained: false,
            boundaryMargin: const EdgeInsets.all(2000),
            minScale: 0.25,
            maxScale: 2.5,
            panEnabled: panEnabled,
            scaleEnabled: panEnabled,
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: onClearSelection,
              child: SizedBox(
              width: canvasSize.width,
              height: canvasSize.height,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  CustomPaint(
                    size: canvasSize,
                    painter: _AxisPainter(
                      layout: layout,
                      axis: axis,
                      color: WorkTreeTheme.spine,
                      accent: WorkTreeTheme.person,
                    ),
                  ),
                  CustomPaint(
                    size: canvasSize,
                    painter: _TimeRulerPainter(layout: layout, axis: axis),
                  ),
                  CustomPaint(
                    size: canvasSize,
                    painter: _PreviewLinkPainter(layout: layout, axis: axis),
                  ),
                  for (final p in layout.placed)
                    Positioned(
                      left: p.center.dx - WorkTreeLayout.cardSize.width / 2,
                      top: p.center.dy - WorkTreeLayout.cardSize.height / 2,
                      width: WorkTreeLayout.cardSize.width,
                      height: WorkTreeLayout.cardSize.height,
                      child: _DraggableNodeCard(
                        node: p.node,
                        selected: p.node.id == selectedId,
                        dropHot: dropHoverId == p.node.id,
                        mine: p.node.isAssignedTo(userId),
                        isOrigin: p.isOrigin,
                        onDragStarted: onDragStarted,
                        onDragEnded: onDragEnded,
                        onHover: (hot) =>
                            onHoverChange(hot ? p.node.id : null),
                        onTap: () => onSelect(p.node),
                        onDoubleTap: () => onDoubleTap(p.node),
                        canAcceptPalette: (d) =>
                            canAcceptPalette(d, ontoNodeId: p.node.id),
                        canAcceptMove: (d) =>
                            canAcceptMove(d, ontoNodeId: p.node.id),
                        onPaletteDrop: (d) =>
                            onPaletteDrop(d, ontoNodeId: p.node.id),
                        onNodeMoveDrop: (d) =>
                            onNodeMoveDrop(d, ontoNodeId: p.node.id),
                      ),
                    ),
                  for (final p in layout.placed)
                    if (p.node.id == selectedId && p.node.isPerson)
                      ..._quickHandles(
                        center: p.center,
                        onPick: (item) => onQuickConnect(p.node, item),
                      ),
                  for (final prev in layout.previews)
                    Positioned(
                      left: prev.center.dx -
                          WorkTreeLayout.previewSize.width / 2,
                      top: prev.center.dy -
                          WorkTreeLayout.previewSize.height / 2,
                      width: WorkTreeLayout.previewSize.width,
                      height: WorkTreeLayout.previewSize.height,
                      child: _PreviewCard(
                        node: prev.node,
                        overflowCount: prev.overflowCount,
                        onTap: () {
                          if (prev.overflowCount > 0 &&
                              prev.firstHiddenChild != null) {
                            onSelect(
                              prev.firstHiddenChild!,
                              toggleExpand: false,
                            );
                          } else {
                            onSelect(prev.node, toggleExpand: false);
                          }
                        },
                      ),
                    ),
                ],
              ),
            ),
            ),
          ),
        );
      },
    );
  }

  List<Widget> _quickHandles({
    required Offset center,
    required ValueChanged<PaletteItem> onPick,
  }) {
    final w = WorkTreeLayout.cardSize.width;
    final h = WorkTreeLayout.cardSize.height;
    const handle = 28.0;
    final spots = <Offset>[
      Offset(center.dx, center.dy - h / 2 - 4), // top
      Offset(center.dx + w / 2 + 4, center.dy), // right
      Offset(center.dx, center.dy + h / 2 + 4), // bottom
      Offset(center.dx - w / 2 - 4, center.dy), // left
    ];
    return [
      for (final spot in spots)
        Positioned(
          left: spot.dx - handle / 2,
          top: spot.dy - handle / 2,
          width: handle,
          height: handle,
          child: _QuickConnectHandle(onPick: onPick),
        ),
    ];
  }
}

class _QuickConnectHandle extends StatelessWidget {
  const _QuickConnectHandle({required this.onPick});

  final ValueChanged<PaletteItem> onPick;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: WorkTreeTheme.person,
      shape: const CircleBorder(),
      elevation: 2,
      child: PopupMenuButton<PaletteItem>(
        tooltip: '快捷连接',
        padding: EdgeInsets.zero,
        offset: const Offset(0, 28),
        onSelected: onPick,
        itemBuilder: (ctx) => [
          for (final item in kQuickConnectItems)
            PopupMenuItem(
              value: item,
              child: Row(
                children: [
                  Icon(item.icon, size: 18, color: WorkTreeTheme.accentFor(item.nodeTypeKey)),
                  const SizedBox(width: 8),
                  Text(item.label),
                ],
              ),
            ),
        ],
        child: const SizedBox(
          width: 28,
          height: 28,
          child: Icon(Icons.add, size: 16, color: Colors.white),
        ),
      ),
    );
  }
}

class _DraggableNodeCard extends StatelessWidget {
  const _DraggableNodeCard({
    required this.node,
    required this.selected,
    required this.dropHot,
    required this.mine,
    this.isOrigin = false,
    required this.onDragStarted,
    required this.onDragEnded,
    required this.onHover,
    required this.onTap,
    required this.onDoubleTap,
    required this.canAcceptPalette,
    required this.canAcceptMove,
    required this.onPaletteDrop,
    required this.onNodeMoveDrop,
  });

  final TreeNodeItem node;
  final bool selected;
  final bool dropHot;
  final bool mine;
  final bool isOrigin;
  final VoidCallback onDragStarted;
  final VoidCallback onDragEnded;
  final ValueChanged<bool> onHover;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;
  final bool Function(PaletteDragData data) canAcceptPalette;
  final bool Function(NodeMoveDragData data) canAcceptMove;
  final Future<void> Function(PaletteDragData data) onPaletteDrop;
  final Future<void> Function(NodeMoveDragData data) onNodeMoveDrop;

  @override
  Widget build(BuildContext context) {
    return DragTarget<Object>(
      onWillAcceptWithDetails: (details) {
        final data = details.data;
        if (data is PaletteDragData) {
          final ok = canAcceptPalette(data);
          if (ok) onHover(true);
          return ok;
        }
        if (data is NodeMoveDragData) {
          final ok = canAcceptMove(data);
          if (ok) onHover(true);
          return ok;
        }
        return false;
      },
      onLeave: (_) => onHover(false),
      onAcceptWithDetails: (details) async {
        onHover(false);
        final data = details.data;
        if (data is PaletteDragData) {
          await onPaletteDrop(data);
        } else if (data is NodeMoveDragData) {
          await onNodeMoveDrop(data);
        }
      },
      builder: (context, candidate, rejected) {
        return LongPressDraggable<NodeMoveDragData>(
          data: NodeMoveDragData(node.id),
          delay: const Duration(milliseconds: 180),
          onDragStarted: onDragStarted,
          onDragEnd: (_) => onDragEnded(),
          feedback: Material(
            color: Colors.transparent,
            child: Transform.scale(
              scale: 1.05,
              child: Opacity(
                opacity: 0.9,
                child: SizedBox(
                  width: WorkTreeLayout.cardSize.width,
                  height: WorkTreeLayout.cardSize.height,
                  child: _NodeCardFace(
                    node: node,
                    selected: true,
                    dropHot: false,
                    mine: mine,
                    isOrigin: isOrigin,
                  ),
                ),
              ),
            ),
          ),
          childWhenDragging: Opacity(
            opacity: 0.35,
            child: _NodeCardFace(
              node: node,
              selected: selected,
              dropHot: false,
              mine: mine,
              isOrigin: isOrigin,
            ),
          ),
          child: GestureDetector(
            onTap: onTap,
            onDoubleTap: onDoubleTap,
            child: _NodeCardFace(
              node: node,
              selected: selected,
              dropHot: dropHot || candidate.isNotEmpty,
              mine: mine,
              isOrigin: isOrigin,
            ),
          ),
        );
      },
    );
  }
}

class _NodeCardFace extends StatelessWidget {
  const _NodeCardFace({
    required this.node,
    required this.selected,
    required this.dropHot,
    required this.mine,
    this.isOrigin = false,
  });

  final TreeNodeItem node;
  final bool selected;
  final bool dropHot;
  final bool mine;
  final bool isOrigin;

  @override
  Widget build(BuildContext context) {
    final accent = WorkTreeTheme.accentFor(node.nodeTypeKey);
    final person = node.primaryAssignee;
    final isPerson = node.isPerson;
    final borderColor = dropHot
        ? WorkTreeTheme.dropHighlight
        : selected
            ? accent
            : isOrigin
                ? WorkTreeTheme.spine
                : mine
                    ? accent.withValues(alpha: 0.7)
                    : const Color(0xFFE7E1D7);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      decoration: BoxDecoration(
        color: WorkTreeTheme.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: borderColor,
          width: dropHot || selected || isOrigin || mine ? 2.4 : 1,
        ),
        boxShadow: [
          ...WorkTreeTheme.softShadow,
          if (isOrigin)
            BoxShadow(
              color: WorkTreeTheme.spine.withValues(alpha: 0.22),
              blurRadius: 14,
              spreadRadius: 1,
            ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: isOrigin ? 10 : 8,
            decoration: BoxDecoration(
              color: isOrigin ? WorkTreeTheme.spine : accent,
              borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(14),
              ),
            ),
          ),
          if (isPerson)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: _AssigneeAvatar(assignee: person, size: isOrigin ? 40 : 36),
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (isOrigin)
                        Container(
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: WorkTreeTheme.spine.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            '终责',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: WorkTreeTheme.spine,
                            ),
                          ),
                        ),
                      Expanded(
                        child: Text(
                          node.title,
                          maxLines: isPerson ? 1 : 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: WorkTreeTheme.ink,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            height: 1.2,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Text(
                    isPerson
                        ? (person?.displayName ?? '未指定负责人')
                        : [
                            _typeLabel(node.nodeTypeKey),
                            if (node.progressStatus != null) node.progressStatus!,
                          ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: WorkTreeTheme.muted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _typeLabel(String? key) {
    switch (key) {
      case 'person':
        return '人';
      case 'milestone':
        return '里程碑';
      case 'scope':
        return '范围';
      case 'work_item':
        return '工作项';
      default:
        return key ?? '节点';
    }
  }
}

class _AssigneeAvatar extends StatelessWidget {
  const _AssigneeAvatar({required this.assignee, this.size = 36});

  final NodeAssignee? assignee;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = assignee?.avatarUrl;
    final hasUrl = url != null && url.isNotEmpty;
    final letter = (assignee?.displayName.isNotEmpty ?? false)
        ? assignee!.displayName.substring(0, 1)
        : '?';
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFFE8EEF8),
        border: Border.all(
          color: assignee == null
              ? const Color(0xFFB0B0B0)
              : WorkTreeTheme.person.withValues(alpha: 0.45),
          width: assignee == null ? 1.2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: hasUrl
          ? Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) {
              return Center(
                child: Text(
                  letter,
                  style: TextStyle(
                    fontSize: size * 0.38,
                    fontWeight: FontWeight.w700,
                    color: WorkTreeTheme.person,
                  ),
                ),
              );
            })
          : Center(
              child: assignee == null
                  ? Icon(Icons.person_outline, size: size * 0.5, color: WorkTreeTheme.muted)
                  : Text(
                      letter,
                      style: TextStyle(
                        fontSize: size * 0.38,
                        fontWeight: FontWeight.w700,
                        color: WorkTreeTheme.person,
                      ),
                    ),
            ),
    );
  }
}

class _NodePropertyPanel extends StatefulWidget {
  const _NodePropertyPanel({
    required this.node,
    required this.members,
    required this.onClose,
    required this.onSaveTitle,
    required this.onChangeType,
    required this.onSetAssignee,
    required this.onDelete,
  });

  final TreeNodeItem node;
  final List<ProjectMemberItem> members;
  final VoidCallback onClose;
  final Future<void> Function(String title) onSaveTitle;
  final Future<void> Function(String nodeTypeKey) onChangeType;
  final Future<void> Function(int? userId) onSetAssignee;
  final VoidCallback onDelete;

  @override
  State<_NodePropertyPanel> createState() => _NodePropertyPanelState();
}

class _NodePropertyPanelState extends State<_NodePropertyPanel> {
  late final TextEditingController _titleCtrl;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.node.title);
  }

  @override
  void didUpdateWidget(covariant _NodePropertyPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.node.id != widget.node.id ||
        oldWidget.node.title != widget.node.title) {
      _titleCtrl.text = widget.node.title;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final primaryId = widget.node.primaryAssignee?.userId;
    final memberIds = widget.members.map((m) => m.userId).toSet();
    final dropdownValue =
        primaryId != null && memberIds.contains(primaryId) ? primaryId : null;
    final typeKey = widget.node.nodeTypeKey ?? 'work_item';
    final knownTypes = {'person', 'work_item', 'milestone', 'scope'};
    final typeValue = knownTypes.contains(typeKey) ? typeKey : 'work_item';

    return Material(
      elevation: 4,
      color: WorkTreeTheme.card,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  widget.node.isPerson ? '人员属性' : '事项属性',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: WorkTreeTheme.ink,
                  ),
                ),
                const Spacer(),
                IconButton(
                  tooltip: '收起',
                  onPressed: widget.onClose,
                  icon: const Icon(Icons.keyboard_arrow_down),
                ),
                IconButton(
                  tooltip: '删除',
                  onPressed: widget.onDelete,
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFB3261E)),
                ),
              ],
            ),
            if (!widget.node.isPerson)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: const Color(0xFFFFF3CD),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Text(
                            '这是事项节点，不是「人」。主干上应使用人员节点。',
                            style: TextStyle(fontSize: 12, color: WorkTreeTheme.ink),
                          ),
                        ),
                        TextButton(
                          onPressed: () => widget.onChangeType('person'),
                          child: const Text('转为人员'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                labelText: '节点名称',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onSubmitted: (v) {
                final t = v.trim();
                if (t.isNotEmpty && t != widget.node.title) {
                  widget.onSaveTitle(t);
                }
              },
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: ValueKey('type-${widget.node.id}-$typeValue'),
              initialValue: typeValue,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '节点类型',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'person', child: Text('人')),
                DropdownMenuItem(value: 'work_item', child: Text('工作项')),
                DropdownMenuItem(value: 'milestone', child: Text('里程碑')),
                DropdownMenuItem(value: 'scope', child: Text('范围')),
              ],
              onChanged: (v) {
                if (v != null && v != widget.node.nodeTypeKey) {
                  widget.onChangeType(v);
                }
              },
            ),
            if (widget.node.isPerson) ...[
              const SizedBox(height: 8),
              DropdownButtonFormField<int?>(
                key: ValueKey('assignee-${widget.node.id}-$dropdownValue'),
                initialValue: dropdownValue,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: '负责人',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem<int?>(
                    value: null,
                    child: Text('未指定'),
                  ),
                  for (final m in widget.members)
                    DropdownMenuItem<int?>(
                      value: m.userId,
                      child: Text(m.displayName),
                    ),
                ],
                onChanged: (v) => widget.onSetAssignee(v),
              ),
            ],
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () {
                  final t = _titleCtrl.text.trim();
                  if (t.isNotEmpty && t != widget.node.title) {
                    widget.onSaveTitle(t);
                  }
                },
                child: const Text('保存名称'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SelectedChip extends StatelessWidget {
  const _SelectedChip({
    required this.title,
    required this.onEdit,
    required this.onClear,
  });

  final String title;
  final VoidCallback onEdit;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      color: WorkTreeTheme.card,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '已选：$title',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: WorkTreeTheme.ink,
                ),
              ),
            ),
            TextButton(onPressed: onEdit, child: const Text('属性')),
            IconButton(
              tooltip: '取消选中',
              onPressed: onClear,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}

class _StencilPalette extends StatelessWidget {
  const _StencilPalette({
    required this.selectedTitle,
    required this.needsVerification,
    required this.onDragStarted,
    required this.onDragEnded,
    required this.onDelete,
    required this.onEvidence,
    required this.onAgent,
    required this.onFocusMe,
    required this.onCreateRoot,
  });

  final String? selectedTitle;
  final bool needsVerification;
  final VoidCallback onDragStarted;
  final VoidCallback onDragEnded;
  final VoidCallback onDelete;
  final VoidCallback onEvidence;
  final VoidCallback onAgent;
  final VoidCallback onFocusMe;
  final VoidCallback onCreateRoot;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      color: const Color(0xFFFFFCF7),
      child: SafeArea(
        right: false,
        child: SizedBox(
          width: kPaletteWidth,
          child: Column(
            children: [
              const SizedBox(height: 10),
              const Text(
                '零件',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: WorkTreeTheme.ink,
                ),
              ),
              const SizedBox(height: 4),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 6),
                child: Text(
                  '拖到画布',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, color: WorkTreeTheme.muted),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  children: [
                    for (final item in kPaletteItems)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: _PaletteChip(
                          item: item,
                          onDragStarted: onDragStarted,
                          onDragEnded: onDragEnded,
                        ),
                      ),
                    const Divider(height: 20),
                    if (selectedTitle != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          selectedTitle!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 10,
                            color: WorkTreeTheme.muted,
                          ),
                        ),
                      ),
                    _MiniAction(
                      icon: Icons.delete_outline,
                      label: '删除',
                      onTap: onDelete,
                    ),
                    _MiniAction(
                      icon: Icons.upload_file_outlined,
                      label: needsVerification ? '材料*' : '材料',
                      onTap: onEvidence,
                    ),
                    _MiniAction(
                      icon: Icons.smart_toy_outlined,
                      label: needsVerification ? '智能体*' : '智能体',
                      onTap: onAgent,
                    ),
                    _MiniAction(
                      icon: Icons.my_location,
                      label: '回到我',
                      onTap: onFocusMe,
                    ),
                    _MiniAction(
                      icon: Icons.person_outline,
                      label: '加人',
                      onTap: onCreateRoot,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaletteChip extends StatelessWidget {
  const _PaletteChip({
    required this.item,
    required this.onDragStarted,
    required this.onDragEnded,
  });

  final PaletteItem item;
  final VoidCallback onDragStarted;
  final VoidCallback onDragEnded;

  @override
  Widget build(BuildContext context) {
    final accent = WorkTreeTheme.accentFor(item.nodeTypeKey);
    final face = Container(
      width: 72,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: WorkTreeTheme.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.55)),
        boxShadow: WorkTreeTheme.softShadow,
      ),
      child: Column(
        children: [
          Icon(item.icon, color: accent, size: 22),
          const SizedBox(height: 4),
          Text(
            item.label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: WorkTreeTheme.ink,
            ),
          ),
        ],
      ),
    );

    return Draggable<PaletteDragData>(
      data: PaletteDragData(item),
      onDragStarted: onDragStarted,
      onDragEnd: (_) => onDragEnded(),
      feedback: Material(
        color: Colors.transparent,
        child: Opacity(opacity: 0.92, child: face),
      ),
      childWhenDragging: Opacity(opacity: 0.35, child: face),
      child: face,
    );
  }
}

class _MiniAction extends StatelessWidget {
  const _MiniAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            Icon(icon, size: 20, color: WorkTreeTheme.ink),
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: WorkTreeTheme.muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.axis,
    required this.sort,
    required this.visibleLevels,
    required this.onAxis,
    required this.onSort,
    required this.onVisibleLevels,
    required this.onFocusMe,
    required this.onToggleOverview,
  });

  final WorkTreeAxis axis;
  final WorkTreeSort sort;
  final int visibleLevels;
  final ValueChanged<WorkTreeAxis> onAxis;
  final ValueChanged<WorkTreeSort> onSort;
  final ValueChanged<int> onVisibleLevels;
  final VoidCallback onFocusMe;
  final VoidCallback onToggleOverview;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      color: WorkTreeTheme.card,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SegmentedButton<WorkTreeAxis>(
              segments: const [
                ButtonSegment(
                  value: WorkTreeAxis.vertical,
                  icon: Icon(Icons.swap_vert, size: 16),
                  tooltip: '纵向',
                ),
                ButtonSegment(
                  value: WorkTreeAxis.horizontal,
                  icon: Icon(Icons.swap_horiz, size: 16),
                  tooltip: '横向',
                ),
              ],
              selected: {axis},
              onSelectionChanged: (s) => onAxis(s.first),
              style: const ButtonStyle(
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(height: 6),
            SegmentedButton<WorkTreeSort>(
              segments: const [
                ButtonSegment(value: WorkTreeSort.tree, label: Text('树序')),
                ButtonSegment(value: WorkTreeSort.time, label: Text('时间')),
              ],
              selected: {sort},
              onSelectionChanged: (s) => onSort(s.first),
              style: const ButtonStyle(
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '可见层级 $visibleLevels',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: WorkTreeTheme.ink,
              ),
            ),
            SizedBox(
              width: 140,
              child: Slider(
                min: 1,
                max: 8,
                divisions: 7,
                value: visibleLevels.toDouble(),
                label: '$visibleLevels 层',
                onChanged: (v) => onVisibleLevels(v.round()),
              ),
            ),
            IconButton(
              tooltip: '定位到我',
              onPressed: onFocusMe,
              icon: const Icon(Icons.my_location),
            ),
            IconButton(
              tooltip: '全貌 / 聚焦',
              onPressed: onToggleOverview,
              icon: const Icon(Icons.zoom_out_map),
            ),
          ],
        ),
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({required this.sort});
  final WorkTreeSort sort;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: WorkTreeTheme.card.withValues(alpha: 0.94),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          sort == WorkTreeSort.time
              ? '排序：时间序（progress.updated_at，缺省按 id）'
              : '排序：树序（深度优先）',
          style: const TextStyle(fontSize: 11, color: WorkTreeTheme.muted),
        ),
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({
    required this.node,
    required this.overflowCount,
    required this.onTap,
  });

  final TreeNodeItem node;
  final int overflowCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = WorkTreeTheme.accentFor(node.nodeTypeKey);
    final when = node.eventTime;
    final dateText = when == null
        ? null
        : '${when.month.toString().padLeft(2, '0')}-${when.day.toString().padLeft(2, '0')}';
    final isMilestone = node.nodeTypeKey == 'milestone';

    return Material(
      color: isMilestone ? const Color(0xFFFFF6E8) : const Color(0xFFEAF1FF),
      borderRadius: BorderRadius.circular(12),
      elevation: 1,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border(
              left: BorderSide(color: accent, width: 4),
            ),
          ),
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                node.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: WorkTreeTheme.ink,
                  fontSize: 12,
                ),
              ),
              const Spacer(),
              Text(
                [
                  if (dateText != null) dateText,
                  _NodeCardFace._typeLabel(node.nodeTypeKey),
                  if (overflowCount > 0) '+$overflowCount',
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: dateText != null ? FontWeight.w600 : FontWeight.w400,
                  color: dateText != null
                      ? WorkTreeTheme.timeRuler
                      : WorkTreeTheme.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.onCreateRoot});
  final VoidCallback onCreateRoot;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.gesture, size: 48, color: WorkTreeTheme.muted),
          const SizedBox(height: 12),
          const Text(
            '从左侧拖入零件开始搭建',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: WorkTreeTheme.ink,
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.tonal(
            onPressed: onCreateRoot,
            child: const Text('或点此添加一个人'),
          ),
        ],
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = WorkTreeTheme.grid
      ..strokeWidth = 1;
    const step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _BranchCurves {
  /// 平滑分支：先沿主轴向再弯向目标（类正交贝塞尔）。
  static Path smooth(Offset from, Offset to, {WorkTreeAxis? prefer}) {
    final path = Path()..moveTo(from.dx, from.dy);
    final dx = (to.dx - from.dx).abs();
    final dy = (to.dy - from.dy).abs();
    final horizontalFirst = prefer == WorkTreeAxis.vertical
        ? true
        : prefer == WorkTreeAxis.horizontal
            ? false
            : dx >= dy;
    if (horizontalFirst) {
      final mx = (from.dx + to.dx) / 2;
      path.cubicTo(mx, from.dy, mx, to.dy, to.dx, to.dy);
    } else {
      final my = (from.dy + to.dy) / 2;
      path.cubicTo(from.dx, my, to.dx, my, to.dx, to.dy);
    }
    return path;
  }
}

class _AxisPainter extends CustomPainter {
  _AxisPainter({
    required this.layout,
    required this.axis,
    required this.color,
    required this.accent,
  });

  final WorkTreeLayoutResult layout;
  final WorkTreeAxis axis;
  final Color color;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final glow = Paint()
      ..color = WorkTreeTheme.spineGlow
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawLine(layout.axisStart, layout.axisEnd, glow);

    final axisPaint = Paint()
      ..color = color
      ..strokeWidth = 5.5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(layout.axisStart, layout.axisEnd, axisPaint);

    final core = Paint()
      ..color = Colors.white.withValues(alpha: 0.35)
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(layout.axisStart, layout.axisEnd, core);

    final branch = Paint()
      ..color = color.withValues(alpha: 0.55)
      ..strokeWidth = 2.2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final p in layout.placed) {
      if (p.isOrigin) continue; // 负责人坐在轴终点，不画侧向站点支线
      final joint = axis == WorkTreeAxis.vertical
          ? Offset(layout.axisStart.dx, p.center.dy)
          : Offset(p.center.dx, layout.axisStart.dy);
      canvas.drawPath(
        _BranchCurves.smooth(joint, p.center, prefer: axis),
        branch,
      );
      canvas.drawCircle(joint, 4.5, Paint()..color = color);
      canvas.drawCircle(joint, 2, Paint()..color = Colors.white);
    }

    // 有负责人时：卡片本身就是终点；轴心处加一圈柔光，强调「线止于人」
    // 无负责人时：画一个简单收束端，提示轴尚未落责
    final tip = layout.axisEnd;
    final hasLeader = layout.placed.any((p) => p.isOrigin);
    if (hasLeader) {
      canvas.drawCircle(
        tip,
        22,
        Paint()..color = accent.withValues(alpha: 0.16),
      );
      canvas.drawCircle(
        tip,
        12,
        Paint()..color = accent.withValues(alpha: 0.28),
      );
    } else {
      canvas.drawCircle(tip, 5.5, Paint()..color = color.withValues(alpha: 0.7));
      canvas.drawCircle(tip, 2.2, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _AxisPainter oldDelegate) =>
      oldDelegate.layout != layout || oldDelegate.axis != axis;
}

class _TimeRulerPainter extends CustomPainter {
  _TimeRulerPainter({required this.layout, required this.axis});

  final WorkTreeLayoutResult layout;
  final WorkTreeAxis axis;

  @override
  void paint(Canvas canvas, Size size) {
    if (layout.globalMarks.isEmpty) return;

    // 刻度画在主干上：菱形站牌 + 日期标签（偏离主轴一点避免挡住线）
    final tp = TextPainter(textDirection: TextDirection.ltr);
    for (final m in layout.globalMarks) {
      final p = m.onAxis;
      if (p == null) continue;

      final diamond = Path()
        ..moveTo(p.dx, p.dy - 6)
        ..lineTo(p.dx + 5, p.dy)
        ..lineTo(p.dx, p.dy + 6)
        ..lineTo(p.dx - 5, p.dy)
        ..close();
      canvas.drawPath(diamond, Paint()..color = WorkTreeTheme.milestone);
      canvas.drawPath(
        diamond,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );

      final label =
          '${m.at.month.toString().padLeft(2, '0')}-${m.at.day.toString().padLeft(2, '0')}';
      tp.text = TextSpan(
        text: label,
        style: const TextStyle(
          color: WorkTreeTheme.spine,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      );
      tp.layout();
      final offset = axis == WorkTreeAxis.vertical
          ? Offset(p.dx + 10, p.dy - tp.height / 2)
          : Offset(p.dx - tp.width / 2, p.dy + 10);
      // 半透明底，保证可读
      final bg = RRect.fromRectAndRadius(
        Rect.fromLTWH(
          offset.dx - 3,
          offset.dy - 1,
          tp.width + 6,
          tp.height + 2,
        ),
        const Radius.circular(4),
      );
      canvas.drawRRect(
        bg,
        Paint()..color = WorkTreeTheme.card.withValues(alpha: 0.92),
      );
      tp.paint(canvas, offset);
    }

    if (layout.rangeStart != null && layout.rangeEnd != null) {
      final a = layout.rangeStart!;
      final b = layout.rangeEnd!;
      String fmt(DateTime d) =>
          '${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      tp.text = TextSpan(
        text: '时间 ${fmt(a)} → ${fmt(b)}',
        style: TextStyle(
          color: WorkTreeTheme.spine.withValues(alpha: 0.85),
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      );
      tp.layout();
      final start = layout.axisStart;
      final ban = axis == WorkTreeAxis.vertical
          ? Offset(start.dx + 12, start.dy - 4)
          : Offset(start.dx, start.dy - tp.height - 12);
      final bg = RRect.fromRectAndRadius(
        Rect.fromLTWH(ban.dx - 4, ban.dy - 2, tp.width + 8, tp.height + 4),
        const Radius.circular(6),
      );
      canvas.drawRRect(
        bg,
        Paint()..color = WorkTreeTheme.card.withValues(alpha: 0.9),
      );
      tp.paint(canvas, ban);
    }
  }

  @override
  bool shouldRepaint(covariant _TimeRulerPainter oldDelegate) =>
      oldDelegate.layout != layout || oldDelegate.axis != axis;
}

class _PreviewLinkPainter extends CustomPainter {
  _PreviewLinkPainter({required this.layout, required this.axis});
  final WorkTreeLayoutResult layout;
  final WorkTreeAxis axis;

  @override
  void paint(Canvas canvas, Size size) {
    if (layout.previews.isEmpty) return;
    final byId = {for (final p in layout.placed) p.node.id: p};
    final link = Paint()
      ..color = WorkTreeTheme.dropHighlight.withValues(alpha: 0.5)
      ..strokeWidth = 1.8
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final prev in layout.previews) {
      final parentId = prev.parentPersonId;
      final parent = parentId == null ? null : byId[parentId];
      if (parent == null) continue;
      canvas.drawPath(
        _BranchCurves.smooth(parent.center, prev.center, prefer: axis),
        link,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _PreviewLinkPainter oldDelegate) =>
      oldDelegate.layout != layout || oldDelegate.axis != axis;
}
