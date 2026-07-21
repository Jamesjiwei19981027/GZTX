import 'package:flutter/material.dart';

import '../models/models.dart';
import 'work_tree_layout.dart';
import 'work_tree_prefs.dart';

typedef WorkTreeNodeCallback = void Function(TreeNodeItem node);

class WorkTreeCanvas extends StatefulWidget {
  const WorkTreeCanvas({
    super.key,
    required this.roots,
    required this.projectId,
    required this.userId,
    required this.needsVerification,
    required this.onAddChild,
    required this.onSubmitEvidence,
    required this.onOpenAgent,
    required this.onCreateRoot,
    this.onSelectionChanged,
  });

  final List<TreeNodeItem> roots;
  final int projectId;
  final int? userId;
  final bool needsVerification;
  final WorkTreeNodeCallback onAddChild;
  final WorkTreeNodeCallback onSubmitEvidence;
  final WorkTreeNodeCallback onOpenAgent;
  final VoidCallback onCreateRoot;
  final WorkTreeNodeCallback? onSelectionChanged;

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
  bool _ready = false;
  bool _overview = false;
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
          }
          if (expandedGone) {
            _expandedId = null;
          }
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
    if (!mounted) return;
    setState(() {
      _axis = axis;
      _sort = sort;
      _lastNodeId = last;
      _ready = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _focusSelectedOrAuto(force: true);
    });
  }

  WorkTreeLayoutResult _computeLayout() {
    return WorkTreeLayout.layout(
      roots: widget.roots,
      axis: _axis,
      sort: _sort,
      userId: widget.userId,
      lastNodeId: _lastNodeId,
      expandedNodeId: _expandedId,
    );
  }

  void _select(
    TreeNodeItem node, {
    bool toggleExpand = true,
    bool exitOverview = true,
  }) {
    setState(() {
      _selectedId = node.id;
      if (exitOverview) {
        _overview = false;
      }
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
    if (id != null && !layout.containsNode(id)) {
      id = null;
    }
    id ??= layout.focusNodeId;
    if (id == null) return;

    final placed = layout.byId(id);
    if (placed == null) return;

    final needNotify = _selectedId != id;
    setState(() {
      _selectedId = id;
    });
    if (needNotify) {
      widget.onSelectionChanged?.call(placed.node);
    }
    if (force || !_overview) {
      _focusNode(id);
    }
  }

  void focusMe() {
    final layout = _computeLayout();
    final id = WorkTreeLayout.resolveFocusId(
      flat: WorkTreeLayout.flatten(widget.roots, _sort),
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
    final dx = _viewport.width / 2 - target.dx * scale;
    final dy = _viewport.height / 2 - target.dy * scale;
    _transform.value = Matrix4.identity()
      ..translateByDouble(dx, dy, 0, 1)
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
      // Double-tap only toggles overview; do not toggle expand.
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
    final dx = _viewport.width / 2 - bounds.center.dx * scale;
    final dy = _viewport.height / 2 - bounds.center.dy * scale;
    _transform.value = Matrix4.identity()
      ..translateByDouble(dx, dy, 0, 1)
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

  TreeNodeItem? get _selectedNode {
    if (_selectedId == null) return null;
    return _computeLayout().byId(_selectedId!)?.node;
  }

  void _guardVerified(VoidCallback action) {
    if (widget.needsVerification) {
      Navigator.of(context).pushNamed('/verify');
      return;
    }
    action();
  }

  void _rememberViewport(Size size) {
    if (size == _viewport || size == Size.zero) return;
    _viewport = size;
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Center(child: CircularProgressIndicator());
    }

    final layout = _computeLayout();
    final selected = _selectedNode;
    final scheme = Theme.of(context).colorScheme;
    final canvasSize = Size(
      layout.contentBounds.width,
      layout.contentBounds.height,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        _rememberViewport(Size(constraints.maxWidth, constraints.maxHeight));
        return Stack(
          children: [
            Positioned.fill(
              child: widget.roots.isEmpty
                  ? _EmptyTree(onCreateRoot: widget.onCreateRoot)
                  : InteractiveViewer(
                      transformationController: _transform,
                      constrained: false,
                      boundaryMargin: const EdgeInsets.all(2000),
                      minScale: 0.25,
                      maxScale: 2.5,
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
                                axis: _axis,
                                color: scheme.outlineVariant,
                                accent: scheme.primary,
                                expandedId: _expandedId,
                              ),
                            ),
                            for (final p in layout.placed)
                              Positioned(
                                left: p.center.dx -
                                    WorkTreeLayout.cardSize.width / 2,
                                top: p.center.dy -
                                    WorkTreeLayout.cardSize.height / 2,
                                width: WorkTreeLayout.cardSize.width,
                                height: WorkTreeLayout.cardSize.height,
                                child: _NodeCard(
                                  node: p.node,
                                  selected: p.node.id == _selectedId,
                                  mine: p.node.isAssignedTo(widget.userId),
                                  onTap: () => _select(p.node),
                                  onDoubleTap: () => _onNodeDoubleTap(p.node),
                                ),
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
                                    setState(() => _expandedId = null);
                                    if (prev.overflowCount > 0 &&
                                        prev.firstHiddenChild != null) {
                                      _select(
                                        prev.firstHiddenChild!,
                                        toggleExpand: false,
                                      );
                                    } else {
                                      _select(prev.node, toggleExpand: false);
                                    }
                                  },
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
            ),
            if (_axis == WorkTreeAxis.horizontal)
              Positioned(
                left: 0,
                right: 0,
                top: 0,
                child: _ActionRail(
                  axis: _axis,
                  selected: selected,
                  needsVerification: widget.needsVerification,
                  onAddChild: () => _runOnSelected(widget.onAddChild),
                  onEvidence: () => _runOnSelected(
                    widget.onSubmitEvidence,
                    verified: true,
                  ),
                  onAgent: () =>
                      _runOnSelected(widget.onOpenAgent, verified: true),
                  onFocusMe: focusMe,
                ),
              )
            else
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: _ActionRail(
                  axis: _axis,
                  selected: selected,
                  needsVerification: widget.needsVerification,
                  onAddChild: () => _runOnSelected(widget.onAddChild),
                  onEvidence: () => _runOnSelected(
                    widget.onSubmitEvidence,
                    verified: true,
                  ),
                  onAgent: () =>
                      _runOnSelected(widget.onOpenAgent, verified: true),
                  onFocusMe: focusMe,
                ),
              ),
            Positioned(
              right: 12,
              top: _axis == WorkTreeAxis.horizontal ? 72 : 12,
              child: _Toolbar(
                axis: _axis,
                sort: _sort,
                onAxis: _setAxis,
                onSort: _setSort,
                onFocusMe: focusMe,
                onToggleOverview: _toggleOverview,
              ),
            ),
            Positioned(
              left: _axis == WorkTreeAxis.vertical ? 72 : 12,
              bottom: 12,
              child: Material(
                color: scheme.surface.withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Text(
                    _sort == WorkTreeSort.time
                        ? '排序：时间序（progress.updated_at，缺省按 id）'
                        : '排序：树序（深度优先）',
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  void _runOnSelected(
    WorkTreeNodeCallback action, {
    bool verified = false,
  }) {
    final selected = _selectedNode;
    if (selected == null) {
      _toast('请先选中一个节点');
      return;
    }
    if (verified) {
      _guardVerified(() => action(selected));
    } else {
      action(selected);
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.axis,
    required this.sort,
    required this.onAxis,
    required this.onSort,
    required this.onFocusMe,
    required this.onToggleOverview,
  });

  final WorkTreeAxis axis;
  final WorkTreeSort sort;
  final ValueChanged<WorkTreeAxis> onAxis;
  final ValueChanged<WorkTreeSort> onSort;
  final VoidCallback onFocusMe;
  final VoidCallback onToggleOverview;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(6),
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
                ButtonSegment(
                  value: WorkTreeSort.tree,
                  label: Text('树序'),
                ),
                ButtonSegment(
                  value: WorkTreeSort.time,
                  label: Text('时间'),
                ),
              ],
              selected: {sort},
              onSelectionChanged: (s) => onSort(s.first),
              style: const ButtonStyle(
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(height: 4),
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

class _ActionRail extends StatelessWidget {
  const _ActionRail({
    required this.axis,
    required this.selected,
    required this.needsVerification,
    required this.onAddChild,
    required this.onEvidence,
    required this.onAgent,
    required this.onFocusMe,
  });

  final WorkTreeAxis axis;
  final TreeNodeItem? selected;
  final bool needsVerification;
  final VoidCallback onAddChild;
  final VoidCallback onEvidence;
  final VoidCallback onAgent;
  final VoidCallback onFocusMe;

  @override
  Widget build(BuildContext context) {
    final enabled = selected != null;
    final children = <Widget>[
      if (selected != null)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: axis == WorkTreeAxis.horizontal ? 120 : 56,
            ),
            child: Text(
              selected!.title,
              maxLines: axis == WorkTreeAxis.horizontal ? 1 : 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ),
        ),
      _RailBtn(
        icon: Icons.add_box_outlined,
        label: '加子节点',
        onPressed: enabled ? onAddChild : null,
      ),
      _RailBtn(
        icon: Icons.upload_file_outlined,
        label: '提交材料',
        badge: needsVerification ? '需验证' : null,
        onPressed: enabled ? onEvidence : null,
      ),
      _RailBtn(
        icon: Icons.smart_toy_outlined,
        label: '智能体',
        badge: needsVerification ? '需验证' : null,
        onPressed: enabled ? onAgent : null,
      ),
      _RailBtn(
        icon: Icons.my_location,
        label: '回到我',
        onPressed: onFocusMe,
      ),
    ];

    final content = axis == WorkTreeAxis.horizontal
        ? Row(
            children: [
              const SizedBox(width: 8),
              ...children.expand((w) => [w, const SizedBox(width: 4)]),
            ],
          )
        : Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              ...children.expand((w) => [w, const SizedBox(height: 4)]),
            ],
          );

    return Material(
      elevation: 3,
      color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.96),
      child: SafeArea(
        right: false,
        bottom: axis == WorkTreeAxis.vertical,
        child: axis == WorkTreeAxis.horizontal
            ? SizedBox(
                height: 64,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: content,
                ),
              )
            : SizedBox(
                width: 64,
                child: SingleChildScrollView(child: content),
              ),
      ),
    );
  }
}

class _RailBtn extends StatelessWidget {
  const _RailBtn({
    required this.icon,
    required this.label,
    this.onPressed,
    this.badge,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: badge == null ? label : '$label（$badge）',
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Opacity(
          opacity: onPressed == null ? 0.4 : 1,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 22),
                Text(label, style: Theme.of(context).textTheme.labelSmall),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NodeCard extends StatelessWidget {
  const _NodeCard({
    required this.node,
    required this.selected,
    required this.mine,
    required this.onTap,
    required this.onDoubleTap,
  });

  final TreeNodeItem node;
  final bool selected;
  final bool mine;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      onDoubleTap: onDoubleTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? scheme.primaryContainer : scheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? scheme.primary
                : mine
                    ? scheme.tertiary
                    : scheme.outlineVariant,
            width: selected || mine ? 2 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              node.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const Spacer(),
            Text(
              [
                if (node.nodeTypeKey != null) node.nodeTypeKey!,
                if (node.progressStatus != null) node.progressStatus!,
                if (mine) '我负责',
              ].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
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
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.secondaryContainer,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                node.title,
                maxLines: overflowCount > 0 ? 1 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              if (overflowCount > 0)
                Text(
                  '还有 $overflowCount 个，点此跳主轴',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyTree extends StatelessWidget {
  const _EmptyTree({required this.onCreateRoot});
  final VoidCallback onCreateRoot;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.account_tree_outlined,
            size: 56,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 12),
          const Text('还没有工作树节点'),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onCreateRoot,
            icon: const Icon(Icons.add),
            label: const Text('创建根节点'),
          ),
        ],
      ),
    );
  }
}

class _AxisPainter extends CustomPainter {
  _AxisPainter({
    required this.layout,
    required this.axis,
    required this.color,
    required this.accent,
    required this.expandedId,
  });

  final WorkTreeLayoutResult layout;
  final WorkTreeAxis axis;
  final Color color;
  final Color accent;
  final int? expandedId;

  @override
  void paint(Canvas canvas, Size size) {
    final axisPaint = Paint()
      ..color = color
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(layout.axisStart, layout.axisEnd, axisPaint);

    final branch = Paint()
      ..color = color
      ..strokeWidth = 1.5;
    for (final p in layout.placed) {
      final Offset joint = axis == WorkTreeAxis.vertical
          ? Offset(layout.axisStart.dx, p.center.dy)
          : Offset(p.center.dx, layout.axisStart.dy);
      canvas.drawLine(joint, p.center, branch);
    }

    if (expandedId != null) {
      final parent = layout.byId(expandedId!);
      if (parent != null) {
        final link = Paint()
          ..color = accent.withValues(alpha: 0.55)
          ..strokeWidth = 1.5;
        for (final prev in layout.previews) {
          canvas.drawLine(parent.center, prev.center, link);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _AxisPainter oldDelegate) =>
      oldDelegate.layout != layout ||
      oldDelegate.axis != axis ||
      oldDelegate.expandedId != expandedId;
}
