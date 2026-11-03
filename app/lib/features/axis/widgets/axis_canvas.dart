import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/axis_card_tasks.dart';
import '../data/axis_edge_rules.dart';
import '../data/axis_models.dart';
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
  int? _selectedId;

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
  }

  @override
  void dispose() {
    _edgeAnimation?.dispose();
    widget.viewportController?._detach(this);
    _transform.removeListener(_publishScale);
    _transform.dispose();
    super.dispose();
  }

  void _publishScale() => widget.viewportController?.scale.value =
      _transform.value.getMaxScaleOnAxis();
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

  void _fitInitial() {
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

  // 卡片内可点区域（任务行、底部提示）。拖动区域会抢先接管手势，
  // 所以点按时按坐标判断落在哪个区域。
  final Map<String, GlobalKey> _hitKeys = {};
  GlobalKey _hitKey(String id) => _hitKeys.putIfAbsent(id, GlobalKey.new);

  bool _hits(String id, Offset global) {
    final box = _hitKeys[id]?.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached) return false;
    final rect = box.localToGlobal(Offset.zero) & box.size;
    return rect.contains(global);
  }

  void _onCardTap(
    AxisPersonNode node,
    AxisCardTaskSummary summary,
    Offset global,
  ) {
    for (final item in summary.visible) {
      if (_hits('${node.id}:${item.id}', global)) {
        widget.onOpenMatter?.call(item, node.id);
        return;
      }
    }
    if (_hits('${node.id}:footer', global)) {
      widget.onOpenPerson?.call(node);
      return;
    }
    _select(node);
  }

  void _cancelDrag() {
    setState(() {
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
    });
  }

  void _onPersonDragStart(AxisPersonNode node) {
    setState(() {
      _dragPersonId = node.id;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
    });
  }

  void _onPersonDragUpdate(Offset delta) {
    if (_dragPersonId == null) return;
    final layout = _layout;
    final placed = layout.personById(_dragPersonId!);
    if (placed == null) return;
    _rawDelta += delta / _currentScale;
    var nextDelta = _rawDelta;
    Offset? lineStart;
    Offset? lineEnd;
    if (widget.edgeStyle == AxisEdgeStyle.straight &&
        placed.node.parentId != null) {
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
    setState(() {
      _dragDelta = nextDelta;
      _referenceLineStart = lineStart;
      _referenceLineEnd = lineEnd;
      _hoverTargetId = _personAt(placed.center + nextDelta, layout)?.id;
    });
  }

  void _onPersonDragEnd(AxisPersonNode node) {
    final layout = _layout;
    final placed = layout.personById(node.id);
    final delta = _dragDelta;
    final target =
        _hoverTargetId == null ? null : layout.personById(_hoverTargetId!);
    setState(() {
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _rawDelta = Offset.zero;
      _referenceLineStart = null;
      _referenceLineEnd = null;
      _hoverTargetId = null;
    });
    if (target != null) {
      widget.onReparentPerson?.call(node, target.node);
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
        return InteractiveViewer(
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
        );
      },
    );
  }

  Widget _buildPerson(AxisPlacedPerson placed, bool isDark) {
    final node = placed.node;
    final delta = _dragPersonId == node.id ? _dragDelta : Offset.zero;
    final rect = placed.rect.shift(delta);
    final selected = _selectedId == node.id;
    final hovered = _hoverTargetId == node.id;
    final summary = summarizeCardTasks(node.workItems, clock.now());
    final borderColor = hovered
        ? AppColors.success
        : (node.isTerminalPm
            ? AppColors.warning
            : (selected ? AppColors.primary : AppColors.border));
    final background = node.isTerminalPm
        ? (isDark ? AppColors.darkSurface : AppColors.warningLight)
        : (isDark ? AppColors.darkSurface : AppColors.surface);
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
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            border: Border.all(
              color: borderColor,
              width: node.isTerminalPm || selected || hovered ? 2 : 1,
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 8,
                offset: Offset(0, 2),
              ),
            ],
          ),
          // 卡片尺寸固定（与网页一致），文字放大时限制在 1.15 倍以内，避免撑破卡片。
          child: MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.15,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        node.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (node.isTerminalPm)
                      const _Tag(text: '终责', color: AppColors.warning),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  node.roleTitle.isEmpty ? '岗位未指定' : node.roleTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: SingleChildScrollView(
                    physics: const NeverScrollableScrollPhysics(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ...summary.visible.map(
                          (item) => KeyedSubtree(
                            key: _hitKey('${node.id}:${item.id}'),
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 5),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: summary.isOverdue(item)
                                            ? AppColors.danger
                                            : (isDark
                                                ? AppColors.darkTextPrimary
                                                : AppColors.textPrimary),
                                      ),
                                    ),
                                  ),
                                  if (item.dueAt != null)
                                    Text(
                                      '${item.dueAt!.month.toString().padLeft(2, '0')}/${item.dueAt!.day.toString().padLeft(2, '0')}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: summary.isOverdue(item)
                                            ? AppColors.danger
                                            : AppColors.textTertiary,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                KeyedSubtree(
                  key: _hitKey('${node.id}:footer'),
                  child: Text(
                    summary.total == 0
                        ? '暂无任务'
                        : (summary.hiddenCount > 0
                            ? '还有 ${summary.hiddenCount} 项，点开查看'
                            : '共 ${summary.total} 项'),
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: .14),
          borderRadius: BorderRadius.circular(5),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
          child: Text(
            text,
            style: TextStyle(
              fontSize: 10,
              color: color,
              fontWeight: FontWeight.w700,
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
    final start = connection.start + _deltaFor(connection.fromId);
    final end = connection.end + _deltaFor(connection.toId);
    final path = Path()..moveTo(start.dx, start.dy);
    if (edgeStyle == AxisEdgeStyle.straight) {
      path.lineTo(end.dx, end.dy);
      return path;
    }
    if (orientation == AxisOrientation.horizontal) {
      final midX = (start.dx + end.dx) / 2;
      path.cubicTo(midX, start.dy, midX, end.dy, end.dx, end.dy);
    } else {
      final midY = (start.dy + end.dy) / 2;
      path.cubicTo(start.dx, midY, end.dx, midY, end.dx, end.dy);
    }
    return path;
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
