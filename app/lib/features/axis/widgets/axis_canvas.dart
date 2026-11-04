import 'dart:async';
import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/axis_card_tasks.dart';
import '../data/axis_edge_rules.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../data/axis_view_models.dart';
import 'axis_flow_layout.dart';

class AxisViewportController {
  _AxisCanvasState? _state;
  final ValueNotifier<double> scale = ValueNotifier<double>(1);
  void _attach(_AxisCanvasState state) => _state = state;
  void _detach(_AxisCanvasState state) {
    if (identical(_state, state)) _state = null;
  }

  void zoomIn() => _state?.zoomBy(1.25);
  void zoomOut() => _state?.zoomBy(0.8);
  void reset() => _state?.resetView();
  void setScale(double s) => _state?.setScale(s);
  void fitToScreen() => _state?.fitToScreen();
  void focusNode(int nodeId) => _state?.focusNode(nodeId);
  void dispose() => scale.dispose();
}

class AxisCanvas extends StatefulWidget {
  const AxisCanvas({
    super.key,
    required this.nodes,
    required this.orientation,
    required this.spacing,
    required this.sort,
    this.edgeStyle = AxisEdgeStyle.curve,
    this.offsets = const {},
    this.resetLayout = false,
    this.permissions = AxisPermissions.empty,
    this.selfNodeId,
    this.selectedNodeId,
    this.showAiStatus = true,
    this.viewportController,
    this.onOpenPerson,
    this.onOpenMatter,
    this.onSelectPerson,
    this.onReparentPerson,
    this.onLayoutChanged,
    this.onNotice,
    this.onAddChild,
    this.onEditPerson,
    this.onRelinkPerson,
  });

  final List<AxisPersonNode> nodes;
  final AxisOrientation orientation;
  final AxisSpacing spacing;
  final AxisSort sort;
  final AxisEdgeStyle edgeStyle;
  final Map<int, Offset> offsets;
  final bool resetLayout;
  final AxisPermissions permissions;
  final int? selfNodeId;
  final int? selectedNodeId;
  final bool showAiStatus;
  final AxisViewportController? viewportController;
  final ValueChanged<AxisPersonNode>? onOpenPerson;
  final void Function(AxisWorkItem item, int ownerId)? onOpenMatter;
  final ValueChanged<int?>? onSelectPerson;
  final void Function(AxisPersonNode dragged, AxisPersonNode target)?
      onReparentPerson;
  final Future<void> Function(AxisPersonNode node, Offset offset)?
      onLayoutChanged;
  final ValueChanged<String>? onNotice;
  final ValueChanged<AxisPersonNode>? onAddChild;
  final ValueChanged<AxisPersonNode>? onEditPerson;
  final ValueChanged<AxisPersonNode>? onRelinkPerson;

  @override
  State<AxisCanvas> createState() => _AxisCanvasState();
}

class _AxisCanvasState extends State<AxisCanvas>
    with SingleTickerProviderStateMixin {
  final TransformationController _transform = TransformationController();
  Size _viewport = Size.zero;
  AnimationController? _edgeAnimation;
  String? _fittedSignature;
  int? _dragPersonId;
  Offset _dragDelta = Offset.zero;
  // 手指累计位移（未吸附）；吸附只影响显示和保存值，不吞掉手指位移。
  Offset _rawDelta = Offset.zero;
  Offset? _referenceLineStart;
  Offset? _referenceLineEnd;
  int? _hoverTargetId;
  int? _verdictTargetId;
  AxisDropResult? _dropVerdict;
  Timer? _dwellTimer;
  int? _selectedId;
  bool _isCompact = false;

  AxisFlowResult get _layout => AxisFlowLayout.compute(
        nodes: widget.nodes,
        orientation: widget.orientation,
        spacing: widget.spacing,
        sort: widget.sort,
        offsets: widget.offsets,
        resetLayout: widget.resetLayout,
      );

  @override
  void initState() {
    super.initState();
    _selectedId = widget.selectedNodeId;
    widget.viewportController?._attach(this);
    _isCompact = _currentScale < 0.6;
    _transform.addListener(_publishScale);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 系统开启“减少动态效果”时不创建动画，连线显示静态虚线。
    if (MediaQuery.of(context).disableAnimations) {
      _edgeAnimation?.dispose();
      _edgeAnimation = null;
    } else {
      _edgeAnimation ??= AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1200),
      )..repeat();
    }
  }

  @override
  void didUpdateWidget(covariant AxisCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewportController != widget.viewportController) {
      oldWidget.viewportController?._detach(this);
      widget.viewportController?._attach(this);
    }
    if (widget.selectedNodeId != oldWidget.selectedNodeId) {
      _selectedId = widget.selectedNodeId;
    }
    if (widget.orientation != oldWidget.orientation) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _fitInitial();
      });
    }
  }

  @override
  void dispose() {
    _dwellTimer?.cancel();
    _edgeAnimation?.dispose();
    widget.viewportController?._detach(this);
    _transform.removeListener(_publishScale);
    _transform.dispose();
    super.dispose();
  }

  void _publishScale() {
    final scale = _transform.value.getMaxScaleOnAxis();
    widget.viewportController?.scale.value = scale;
    final nextCompact = scale < 0.6;
    if (nextCompact != _isCompact) {
      setState(() => _isCompact = nextCompact);
    }
  }

  double get _currentScale =>
      _transform.value.getMaxScaleOnAxis().clamp(0.25, 2.0);

  void zoomBy(double factor) {
    final next = (_currentScale * factor).clamp(0.25, 2.0);
    final ratio = next / _currentScale;
    final focal = Offset(_viewport.width / 2, _viewport.height / 2);
    _transform.value = Matrix4.identity()
      ..translateByDouble(focal.dx, focal.dy, 0, 1)
      ..scaleByDouble(ratio, ratio, ratio, 1)
      ..translateByDouble(-focal.dx, -focal.dy, 0, 1)
      ..multiply(_transform.value);
  }

  void resetView() => _transform.value = Matrix4.identity();

  void setScale(double targetScale) {
    final clamped = targetScale.clamp(0.25, 2.0);
    _transform.value = Matrix4.identity()
      ..scaleByDouble(clamped, clamped, clamped, 1);
  }

  void fitToScreen() {
    if (_viewport == Size.zero) return;
    final layout = _layout;
    final scale = math
        .min(
          _viewport.width / layout.size.width,
          _viewport.height / layout.size.height,
        )
        .clamp(0.25, 1.0)
        .toDouble();
    final dx = (_viewport.width - layout.size.width * scale) / 2;
    final dy = math.max(
      8.0,
      (_viewport.height - layout.size.height * scale) / 2,
    );
    _transform.value = Matrix4.identity()
      ..translateByDouble(dx, dy, 0, 1)
      ..scaleByDouble(scale, scale, scale, 1);
  }

  void _fitInitial() {
    if (_viewport == Size.zero) return;
    const initialScale = 0.75;
    AxisPlacedPerson? targetPerson;
    if (widget.selfNodeId != null) {
      targetPerson = _layout.personById(widget.selfNodeId!);
    }
    targetPerson ??= _layout.people.cast<AxisPlacedPerson?>().firstWhere(
      (p) => p?.node.parentId == null,
      orElse: () => _layout.people.isNotEmpty ? _layout.people.first : null,
    );

    if (targetPerson != null) {
      final center = targetPerson.center;
      _transform.value = Matrix4.identity()
        ..translateByDouble(
          _viewport.width / 2 - center.dx * initialScale,
          _viewport.height / 2 - center.dy * initialScale,
          0,
          1,
        )
        ..scaleByDouble(initialScale, initialScale, initialScale, 1);
    } else {
      _transform.value = Matrix4.identity()
        ..scaleByDouble(initialScale, initialScale, initialScale, 1);
    }
  }

  void focusNode(int nodeId) {
    final person = _layout.personById(nodeId);
    if (person == null || _viewport == Size.zero) return;
    final scale = _currentScale.clamp(0.6, 1.2);
    _transform.value = Matrix4.identity()
      ..translateByDouble(
        _viewport.width / 2 - person.center.dx * scale,
        _viewport.height / 2 - person.center.dy * scale,
        0,
        1,
      )
      ..scaleByDouble(scale, scale, scale, 1);
  }

  AxisPersonNode? _personAt(Offset point, AxisFlowResult layout) {
    for (final placed in layout.people.reversed) {
      if (placed.node.id != _dragPersonId && placed.rect.contains(point)) {
        return placed.node;
      }
    }
    return null;
  }

  void _select(AxisPersonNode node) {
    final next = _selectedId == node.id ? null : node.id;
    setState(() => _selectedId = next);
    widget.onSelectPerson?.call(next);
  }

  // 卡片内可点区域（任务行、底部提示、操作按钮）。拖动区域会抢先接管手势，
  // 所以点按时按坐标判断落在哪个区域。
  final Map<String, GlobalKey> _hitKeys = {};
  GlobalKey _hitKey(String id) => _hitKeys.putIfAbsent(id, GlobalKey.new);

  bool _hits(String id, Offset global) {
    final box = _hitKeys[id]?.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached) return false;
    final rect = box.localToGlobal(Offset.zero) & box.size;
    return rect.contains(global);
  }

  void _handleAddChild(AxisPersonNode node) {
    widget.onAddChild?.call(node);
  }

  void _handleMoreMenu(AxisPersonNode node) {
    final canEdit = widget.permissions.nodeCan(node, 'can_edit');
    final canRelink = widget.permissions.nodeCan(node, 'can_change_supervisor') ||
        widget.permissions.canManageStructure ||
        widget.permissions.canEditAll;
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (canEdit)
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('编辑人员'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  widget.onEditPerson?.call(node);
                },
              ),
            if (canRelink)
              ListTile(
                leading: const Icon(Icons.sync_alt_outlined),
                title: const Text('调整上级'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  widget.onRelinkPerson?.call(node);
                },
              ),
            ListTile(
              leading: const Icon(Icons.list_alt_outlined),
              title: const Text('查看全部任务'),
              onTap: () {
                Navigator.of(ctx).pop();
                widget.onOpenPerson?.call(node);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _onCardTap(
    AxisPersonNode node,
    AxisCardTaskSummary summary,
    Offset global,
  ) {
    if (_hits('${node.id}:add', global)) {
      _handleAddChild(node);
      return;
    }
    if (_hits('${node.id}:more', global)) {
      _handleMoreMenu(node);
      return;
    }
    for (final item in summary.visible) {
      if (_hits('${node.id}:${item.id}', global)) {
        widget.onOpenMatter?.call(item, node.id);
        return;
      }
    }
    if (_hits('${node.id}:view_all', global)) {
      widget.onOpenPerson?.call(node);
      return;
    }
    _select(node);
  }

  void _cancelDrag() {
    _dwellTimer?.cancel();
    setState(() {
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
      _verdictTargetId = null;
      _dropVerdict = null;
    });
  }

  void _onPersonDragStart(AxisPersonNode node) {
    _dwellTimer?.cancel();
    setState(() {
      _dragPersonId = node.id;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
      _verdictTargetId = null;
      _dropVerdict = null;
    });
  }

  void _onPersonDragUpdate(Offset delta) {
    if (_dragPersonId == null) return;
    final layout = _layout;
    final placed = layout.personById(_dragPersonId!);
    if (placed == null) return;
    _rawDelta += delta;
    var nextDelta = _rawDelta;
    Offset? lineStart;
    Offset? lineEnd;

    final targetNode = _personAt(placed.center + nextDelta, layout);
    final targetId = targetNode?.id;

    if (widget.edgeStyle == AxisEdgeStyle.straight &&
        placed.node.parentId != null &&
        targetId == null) {
      final parent = layout.personById(placed.node.parentId!);
      if (parent != null) {
        final result = snapToParentAxis(
          childTopLeft: placed.rect.topLeft + nextDelta,
          cardSize: AxisFlowLayout.personCardSize,
          parentTopLeft: parent.rect.topLeft,
          orientation: widget.orientation,
        );
        if (result.snapped) {
          nextDelta = result.position - placed.rect.topLeft;
          lineStart = result.referenceLineStart;
          lineEnd = result.referenceLineEnd;
        }
      }
    }

    if (targetId != _hoverTargetId) {
      _dwellTimer?.cancel();
      _hoverTargetId = targetId;
      _verdictTargetId = null;
      _dropVerdict = null;
      if (targetId != null) {
        final targetSnapshotId = targetId;
        _dwellTimer = Timer(const Duration(milliseconds: 300), () {
          if (!mounted || _dragPersonId == null || _hoverTargetId != targetSnapshotId) return;
          final draggedNode = placed.node;
          final currentTargetNode = layout.personById(targetSnapshotId)?.node;
          if (currentTargetNode == null) return;
          final hasPermission = widget.permissions.nodeCan(draggedNode, 'can_change_supervisor') ||
              widget.permissions.canManageStructure ||
              widget.permissions.canEditAll;
          final canAddUnderTarget = widget.permissions.nodeCan(currentTargetNode, 'can_add_subordinate');
          final verdict = AxisRules.validateDrop(
            dragged: AxisDragSubject(
              id: draggedNode.id,
              isPerson: true,
              parentId: draggedNode.parentId,
              nodeOrigin: draggedNode.nodeOrigin,
            ),
            target: AxisDragSubject(
              id: currentTargetNode.id,
              isPerson: true,
              parentId: currentTargetNode.parentId,
              nodeOrigin: currentTargetNode.nodeOrigin,
            ),
            nodes: widget.nodes,
            canAddUnderTarget: canAddUnderTarget,
            hasPermission: hasPermission,
          );
          setState(() {
            _verdictTargetId = targetSnapshotId;
            _dropVerdict = verdict;
          });
        });
      }
    }

    setState(() {
      _dragDelta = nextDelta;
      _referenceLineStart = lineStart;
      _referenceLineEnd = lineEnd;
    });
  }

  void _onPersonDragEnd(AxisPersonNode node) {
    _dwellTimer?.cancel();
    final layout = _layout;
    final placed = layout.personById(node.id);
    final delta = _dragDelta;
    final targetId = _verdictTargetId;
    final verdict = _dropVerdict;
    final targetNode = targetId == null ? null : layout.personById(targetId)?.node;

    setState(() {
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
      _verdictTargetId = null;
      _dropVerdict = null;
    });

    if (targetNode != null && verdict != null) {
      if (verdict.allowed) {
        widget.onReparentPerson?.call(node, targetNode);
      } else {
        final reason = verdict.reason ?? '不能调整到该人员下面';
        widget.onNotice?.call(reason);
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(content: Text(reason)),
        );
      }
      return;
    }

    if (placed == null || delta.distance < 4) return;
    widget.onLayoutChanged?.call(
      node,
      (widget.offsets[node.id] ?? Offset.zero) + delta,
    );
  }

  @override
  Widget build(BuildContext context) {
    final layout = _layout;
    final isDark = isDarkMode(context);
    final highlighted = highlightConnectionIds(widget.nodes, _selectedId);
    return LayoutBuilder(
      builder: (context, constraints) {
        _viewport = Size(constraints.maxWidth, constraints.maxHeight);
        final signature =
            '${widget.orientation}-${widget.sort}-${widget.spacing}-${widget.nodes.length}';
        if (_fittedSignature != signature && _viewport != Size.zero) {
          _fittedSignature = signature;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _fitInitial();
          });
        }
        final dropBubble = _buildDropBubble();
        return SizedBox(
          width: constraints.maxWidth,
          height: constraints.maxHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  transformationController: _transform,
                  constrained: false,
                  minScale: 0.25,
                  maxScale: 2,
                  boundaryMargin: const EdgeInsets.all(240),
                  child: SizedBox(
                    width: layout.size.width,
                    height: layout.size.height,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned.fill(
                          child: CustomPaint(
                            painter: AxisCurvePainter(
                              layout: layout,
                              liveDeltas: _dragPersonId == null
                                  ? const {}
                                  : {_dragPersonId!: _dragDelta},
                              orientation: widget.orientation,
                              edgeStyle: widget.edgeStyle,
                              isDark: isDark,
                              highlighted: highlighted,
                              focusActive: highlighted.isNotEmpty,
                              animation: _edgeAnimation,
                              referenceLineStart: _referenceLineStart,
                              referenceLineEnd: _referenceLineEnd,
                            ),
                          ),
                        ),
                        ...layout.people.map((person) => _buildPerson(person, isDark)),
                      ],
                    ),
                  ),
                ),
              ),
              if (dropBubble != null) dropBubble,
            ],
          ),
        );
      },
    );
  }

  Widget? _buildDropBubble() {
    if (_verdictTargetId == null ||
        _dropVerdict == null ||
        _viewport == Size.zero) {
      return null;
    }
    final targetPlaced = _layout.personById(_verdictTargetId!);
    if (targetPlaced == null) return null;

    final isDropVerdictOk = _dropVerdict!.allowed;
    final bubbleText = isDropVerdictOk
        ? '松手设为「${targetPlaced.node.name}」的下属'
        : (_dropVerdict!.reason ?? '不能挂到该人员下面');

    final textPainter = TextPainter(
      text: TextSpan(
        text: bubbleText,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
      textDirection: TextDirection.ltr,
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    )..layout();

    final bubbleSize = Size(
      textPainter.width + 16.0,
      textPainter.height + 6.0,
    );

    final targetDelta =
        _dragPersonId == targetPlaced.node.id ? _dragDelta : Offset.zero;
    final targetCanvasRect = targetPlaced.rect.shift(targetDelta);
    final targetViewportRect = MatrixUtils.transformRect(
      _transform.value,
      targetCanvasRect,
    );

    final bubbleRect = clampDropBubble(
      targetRect: targetViewportRect,
      bubbleSize: bubbleSize,
      viewportSize: _viewport,
    );

    return Positioned(
      left: bubbleRect.left,
      top: bubbleRect.top,
      child: IgnorePointer(
        child: Container(
          key: const Key('axis-drop-bubble'),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: isDropVerdictOk ? AppColors.success : AppColors.danger,
            borderRadius: BorderRadius.circular(8),
            boxShadow: const [
              BoxShadow(
                color: Color(0x24000000),
                blurRadius: 4,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            bubbleText,
            style: const TextStyle(
              fontSize: 12,
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPerson(AxisPlacedPerson placed, bool isDark) {
    final node = placed.node;
    final delta = _dragPersonId == node.id ? _dragDelta : Offset.zero;
    final rect = placed.rect.shift(delta);
    final selected = _selectedId == node.id;
    final isCompact = _currentScale < 0.6;
    final isDropTarget = _verdictTargetId == node.id;
    final isDropVerdictOk = isDropTarget && (_dropVerdict?.allowed == true);
    final isDropVerdictBad = isDropTarget && (_dropVerdict?.allowed == false);

    final summary = summarizeCardTasks(node.workItems, clock.now());
    final isRoot = node.isTerminalPm;
    final isMe = widget.selfNodeId == node.id;
    final isSelfAdded = node.nodeOrigin == 'subordinate';

    final canAddSubordinate =
        widget.permissions.nodeCan(node, 'can_add_subordinate');
    final canEdit = widget.permissions.nodeCan(node, 'can_edit');
    final canRelink = widget.permissions.nodeCan(node, 'can_change_supervisor') ||
        widget.permissions.canManageStructure ||
        widget.permissions.canEditAll;
    final showMore = canEdit || canRelink;

    Color borderColor;
    double borderWidth = 1.0;
    List<BoxShadow> shadows = const [
      BoxShadow(
        color: Color(0x14000000),
        blurRadius: 8,
        offset: Offset(0, 2),
      ),
    ];

    if (isDropVerdictOk) {
      borderColor = AppColors.success;
      borderWidth = 2.0;
      shadows = [
        BoxShadow(
          color: AppColors.success.withValues(alpha: 0.35),
          blurRadius: 10,
          spreadRadius: 2,
        ),
      ];
    } else if (isDropVerdictBad) {
      borderColor = AppColors.danger;
      borderWidth = 2.0;
      shadows = [
        BoxShadow(
          color: AppColors.danger.withValues(alpha: 0.35),
          blurRadius: 10,
          spreadRadius: 2,
        ),
      ];
    } else if (selected) {
      borderColor = AppColors.primary;
      borderWidth = 2.0;
    } else if (isRoot) {
      borderColor = AppColors.warning;
      borderWidth = 1.5;
    } else {
      borderColor = isDark ? AppColors.darkBorder : AppColors.border;
      borderWidth = 1.0;
    }

    final background = isDark ? AppColors.darkSurface : AppColors.surface;
    final subordinatesCount =
        widget.nodes.where((n) => n.parentId == node.id).length;

    return Positioned(
      left: rect.left,
      top: rect.top,
      width: AxisFlowLayout.personCardSize.width,
      height: AxisFlowLayout.personCardSize.height,
      child: _AxisDragRegion(
        onTap: (global) => _onCardTap(node, summary, global),
        onStart: () => _onPersonDragStart(node),
        onUpdate: _onPersonDragUpdate,
        onEnd: () => _onPersonDragEnd(node),
        onCancel: _cancelDrag,
        child: Container(
          key: Key('axis-person-${node.id}'),
          padding: isCompact
              ? const EdgeInsets.symmetric(horizontal: 20, vertical: 22)
              : const EdgeInsets.fromLTRB(12, 10, 12, 8),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor, width: borderWidth),
            boxShadow: shadows,
          ),
          child: MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.15,
            child: isCompact
                ? _buildCompactCard(node, isRoot, isDark)
                : _buildFullCard(
                    node: node,
                    summary: summary,
                    isRoot: isRoot,
                    isMe: isMe,
                    isSelfAdded: isSelfAdded,
                    selected: selected,
                    canAddSubordinate: canAddSubordinate,
                    showMore: showMore,
                    subordinatesCount: subordinatesCount,
                    isDark: isDark,
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildCompactCard(AxisPersonNode node, bool isRoot, bool isDark) {
    final overCount = cardOverdueCount(node.workItems, clock.now());
    final avatarLetter =
        node.name.characters.isNotEmpty ? node.name.characters.first : '?';

    Widget statusWidget;
    if (overCount > 0) {
      statusWidget = FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.danger,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '逾期 $overCount',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '共 ${node.workItems.length} 项',
              style: TextStyle(
                fontSize: 18,
                color: AppColors.textTertiaryOf(isDark),
              ),
            ),
          ],
        ),
      );
    } else if (node.workItems.isNotEmpty) {
      statusWidget = FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '无逾期',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppColors.success,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '共 ${node.workItems.length} 项',
              style: TextStyle(
                fontSize: 18,
                color: AppColors.textTertiaryOf(isDark),
              ),
            ),
          ],
        ),
      );
    } else {
      statusWidget = Text(
        '暂无任务',
        style: TextStyle(
          fontSize: 20,
          color: AppColors.textTertiaryOf(isDark),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.primary.withValues(alpha: 0.2)
                    : AppColors.primaryLight,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(
                avatarLetter,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    node.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w700,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                  if (isRoot)
                    Container(
                      margin: const EdgeInsets.only(top: 2),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.warningLight,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        '终责',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.warning,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const Spacer(),
        statusWidget,
        const Spacer(),
      ],
    );
  }

  Widget _buildFullCard({
    required AxisPersonNode node,
    required AxisCardTaskSummary summary,
    required bool isRoot,
    required bool isMe,
    required bool isSelfAdded,
    required bool selected,
    required bool canAddSubordinate,
    required bool showMore,
    required int subordinatesCount,
    required bool isDark,
  }) {
    final avatarLetter =
        node.name.characters.isNotEmpty ? node.name.characters.first : '?';
    final taskBg = isDark ? const Color(0xFF1E2836) : const Color(0xFFF3F7FD);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 头部
        Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: isDark
                      ? AppColors.primary.withValues(alpha: 0.2)
                      : AppColors.primaryLight,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  avatarLetter,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            node.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: isDark
                            ? AppColors.darkTextPrimary
                            : AppColors.textPrimary,
                            ),
                          ),
                        ),
                        if (isRoot) ...[
                          const SizedBox(width: 4),
                          const _CardTag(
                            text: '终责',
                            backgroundColor: AppColors.warningLight,
                            textColor: AppColors.warning,
                          ),
                        ],
                        if (isMe) ...[
                          const SizedBox(width: 4),
                          const _CardTag(
                            text: '我',
                            backgroundColor: AppColors.primaryLight,
                            textColor: AppColors.primary,
                          ),
                        ],
                        if (isSelfAdded) ...[
                          const SizedBox(width: 4),
                          _CardTag(
                            text: '下级自建',
                            backgroundColor: isDark
                                ? AppColors.darkSurfaceVariant
                                : const Color(0xFFF1F3F6),
                            textColor: AppColors.textTertiaryOf(isDark),
                            fontWeight: FontWeight.w500,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 1),
                    Text(
                      node.roleTitle.isEmpty ? '岗位未指定' : node.roleTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textTertiaryOf(isDark),
                      ),
                    ),
                  ],
                ),
              ),
              // 右上角按钮：只在选中时显示，无权限不渲染
              if (selected && (canAddSubordinate || showMore))
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (canAddSubordinate)
                      KeyedSubtree(
                        key: _hitKey('${node.id}:add'),
                        child: Tooltip(
                          message: '新增下级',
                          child: InkWell(
                            key: Key('axis-person-add-${node.id}'),
                            onTap: () => _handleAddChild(node),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: isDark
                                    ? AppColors.primary.withValues(alpha: 0.2)
                                    : AppColors.primaryLight,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: const Color(0xFFB9D3F5),
                                ),
                              ),
                              alignment: Alignment.center,
                              child: const Text(
                                '＋',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.primary,
                                  height: 1.1,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (canAddSubordinate && showMore)
                      const SizedBox(width: 4),
                    if (showMore)
                      KeyedSubtree(
                        key: _hitKey('${node.id}:more'),
                        child: Tooltip(
                          message: '更多',
                          child: InkWell(
                            key: Key('axis-person-more-${node.id}'),
                            onTap: () => _handleMoreMenu(node),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: isDark
                                    ? AppColors.darkSurfaceVariant
                                    : Colors.white,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: isDark
                                      ? AppColors.darkBorder
                                      : AppColors.border,
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '⋯',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textSecondaryOf(isDark),
                                  height: 1.0,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
            ],
          ),
        const SizedBox(height: 6),
        // 任务区（剩余高度，独立成块）
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: taskBg,
              borderRadius: BorderRadius.circular(10),
              border: const Border(
                left: BorderSide(color: AppColors.primary, width: 3),
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            child: summary.total == 0
                ? Center(
                    child: Text(
                      '暂无任务',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textTertiaryOf(isDark),
                      ),
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '任务 ${summary.total}',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 3),
                      ...summary.visible.map((item) {
                        final chip = cardTaskChip(item, clock.now());
                        return KeyedSubtree(
                          key: _hitKey('${node.id}:${item.id}'),
                          child: Container(
                            height: 20,
                            margin: const EdgeInsets.only(bottom: 2),
                            child: Row(
                              children: [
                                _taskDot(chip.tone),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    item.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: chip.tone == AxisCardTaskTone.over
                                          ? AppColors.danger
                                          : (isDark
                                              ? AppColors.darkTextPrimary
                                              : AppColors.textPrimary),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                _taskChipWidget(chip, isDark),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 4),
        // 底部一行（高约 20）
        SizedBox(
          height: 20,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (summary.total > 0)
                KeyedSubtree(
                  key: _hitKey('${node.id}:view_all'),
                  child: InkWell(
                    onTap: () => widget.onOpenPerson?.call(node),
                    child: const Text(
                      '查看全部 →',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                )
              else
                const SizedBox(),
              if (subordinatesCount > 0)
                Text(
                  '下属 $subordinatesCount ⌄',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textTertiaryOf(isDark),
                  ),
                )
              else
                const SizedBox(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _taskDot(AxisCardTaskTone tone) {
    Color color;
    switch (tone) {
      case AxisCardTaskTone.over:
        color = AppColors.danger;
        break;
      case AxisCardTaskTone.today:
        color = AppColors.warning;
        break;
      case AxisCardTaskTone.done:
        color = AppColors.success;
        break;
      case AxisCardTaskTone.normal:
      case AxisCardTaskTone.none:
        color = const Color(0xFF9AA6B6);
        break;
    }
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }

  Widget _taskChipWidget(AxisCardChip chip, bool isDark) {
    Color bg;
    Color text;
    Color border;
    FontWeight weight = FontWeight.w400;

    switch (chip.tone) {
      case AxisCardTaskTone.over:
        bg = AppColors.dangerLight;
        text = AppColors.danger;
        border = const Color(0xFFF6C4BF);
        weight = FontWeight.w600;
        break;
      case AxisCardTaskTone.today:
        bg = AppColors.warningLight;
        text = AppColors.warning;
        border = const Color(0xFFF3D79D);
        weight = FontWeight.w600;
        break;
      case AxisCardTaskTone.done:
        bg = isDark ? AppColors.darkSurfaceVariant : Colors.white;
        text = AppColors.textTertiaryOf(isDark);
        border = isDark ? AppColors.darkBorder : AppColors.border;
        break;
      case AxisCardTaskTone.normal:
      case AxisCardTaskTone.none:
        bg = isDark ? AppColors.darkSurfaceVariant : Colors.white;
        text = AppColors.textTertiaryOf(isDark);
        border = isDark ? AppColors.darkBorder : AppColors.border;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      height: 18,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border),
      ),
      alignment: Alignment.center,
      child: Text(
        chip.text,
        style: TextStyle(
          fontSize: 10.5,
          color: text,
          fontWeight: weight,
          height: 1.1,
        ),
      ),
    );
  }
}

class _CardTag extends StatelessWidget {
  const _CardTag({
    required this.text,
    required this.backgroundColor,
    required this.textColor,
    this.fontWeight = FontWeight.w600,
  });

  final String text;
  final Color backgroundColor;
  final Color textColor;
  final FontWeight fontWeight;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          child: Text(
            text,
            style: TextStyle(
              fontSize: 10,
              color: textColor,
              fontWeight: fontWeight,
              height: 1.4,
            ),
          ),
        ),
      );
}

class AxisCurvePainter extends CustomPainter {
  AxisCurvePainter({
    required this.layout,
    required this.liveDeltas,
    required this.orientation,
    required this.edgeStyle,
    required this.isDark,
    required this.highlighted,
    required this.focusActive,
    this.animation,
    this.referenceLineStart,
    this.referenceLineEnd,
  }) : super(repaint: animation);

  final AxisFlowResult layout;
  final Map<int, Offset> liveDeltas;
  final AxisOrientation orientation;
  final AxisEdgeStyle edgeStyle;
  final bool isDark;
  final Set<String> highlighted;
  final bool focusActive;

  /// 流动动画；为 null（减少动态效果）时画静态虚线。
  final Animation<double>? animation;
  double get animationValue => animation?.value ?? 0;
  final Offset? referenceLineStart;
  final Offset? referenceLineEnd;

  Offset _deltaFor(int id) => liveDeltas[id] ?? Offset.zero;

  Path _pathFor(AxisConnection connection) {
    final fromPerson = layout.personById(connection.fromId);
    final toPerson = layout.personById(connection.toId);
    final fromRect = (fromPerson?.rect ??
            Rect.fromCenter(
              center: connection.fromCenter,
              width: AxisFlowLayout.personCardSize.width,
              height: AxisFlowLayout.personCardSize.height,
            ))
        .shift(_deltaFor(connection.fromId));
    final toRect = (toPerson?.rect ??
            Rect.fromCenter(
              center: connection.toCenter,
              width: AxisFlowLayout.personCardSize.width,
              height: AxisFlowLayout.personCardSize.height,
            ))
        .shift(_deltaFor(connection.toId));

    if (edgeStyle == AxisEdgeStyle.straight) {
      return straightEdgeToPath(fromRect, toRect);
    }
    return floatingEdgeToPath(fromRect, toRect);
  }

  void _drawDashed(Canvas canvas, Path path, Paint paint) {
    for (final metric in path.computeMetrics()) {
      // 段长 6、间隔 6；偏移随动画值增大，虚线沿路径起点 -> 终点（上级 -> 下级）流动。
      var distance = animationValue * 12 - 12;
      while (distance < metric.length) {
        final from = math.max(distance, 0.0);
        final to = math.min(distance + 6, metric.length);
        if (to > from) {
          canvas.drawPath(metric.extractPath(from, to), paint);
        }
        distance += 12;
      }
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    for (final connection in layout.connections) {
      final active = highlighted.contains(connection.id);
      final color = active
          ? AppColors.primary
          : (isDark ? const Color(0xFF4E7AA8) : const Color(0xFF6D93BE));
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = active ? 2.4 : 1.8
        ..color = color.withValues(alpha: focusActive && !active ? .25 : 1);
      _drawDashed(canvas, _pathFor(connection), paint);
    }
    if (referenceLineStart != null && referenceLineEnd != null) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = AppColors.primary.withValues(alpha: .6);
      _drawDashed(
        canvas,
        Path()
          ..moveTo(referenceLineStart!.dx, referenceLineStart!.dy)
          ..lineTo(referenceLineEnd!.dx, referenceLineEnd!.dy),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant AxisCurvePainter oldDelegate) =>
      oldDelegate.layout != layout ||
      oldDelegate.liveDeltas != liveDeltas ||
      oldDelegate.isDark != isDark ||
      oldDelegate.highlighted != highlighted ||
      oldDelegate.focusActive != focusActive ||
      oldDelegate.animation != animation ||
      oldDelegate.animationValue != animationValue ||
      oldDelegate.edgeStyle != edgeStyle ||
      oldDelegate.referenceLineStart != referenceLineStart ||
      oldDelegate.referenceLineEnd != referenceLineEnd;
}

class _EagerPanGestureRecognizer extends PanGestureRecognizer {
  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    resolve(GestureDisposition.accepted);
  }
}

class _AxisDragRegion extends StatefulWidget {
  const _AxisDragRegion({
    required this.child,
    required this.onTap,
    required this.onStart,
    required this.onUpdate,
    required this.onEnd,
    required this.onCancel,
  });

  final Widget child;

  /// 抬手时没有明显移动即视为点按，参数为按下点的全局坐标。
  final ValueChanged<Offset> onTap;
  final VoidCallback onStart;
  final ValueChanged<Offset> onUpdate;
  final VoidCallback onEnd;
  final VoidCallback onCancel;

  @override
  State<_AxisDragRegion> createState() => _AxisDragRegionState();
}

class _AxisDragRegionState extends State<_AxisDragRegion> {
  late final _EagerPanGestureRecognizer _recognizer;
  bool _moved = false;
  Offset _down = Offset.zero;

  @override
  void initState() {
    super.initState();
    _recognizer = _EagerPanGestureRecognizer()
      ..onDown = (details) {
        _down = details.globalPosition;
      }
      ..onStart = (_) {
        _moved = false;
        widget.onStart();
      }
      ..onUpdate = (details) {
        if (details.delta.distance > 0.5) _moved = true;
        widget.onUpdate(details.delta);
      }
      ..onEnd = (_) {
        if (_moved) {
          widget.onEnd();
        } else {
          widget.onCancel();
          widget.onTap(_down);
        }
      }
      ..onCancel = () {
        widget.onCancel();
      };
  }

  @override
  void dispose() {
    _recognizer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RawGestureDetector(
      behavior: HitTestBehavior.opaque,
      gestures: {
        _EagerPanGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<_EagerPanGestureRecognizer>(
          () => _recognizer,
          (_) {},
        ),
      },
      child: widget.child,
    );
  }
}
