import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/axis_models.dart';
import '../data/axis_view_models.dart';
import 'axis_flow_layout.dart';

/// 画布视口控制器：让页面上的缩放按钮、定位按钮能操作画布。
class AxisViewportController {
  _AxisCanvasState? _state;
  final ValueNotifier<double> scale = ValueNotifier<double>(1);

  void _attach(_AxisCanvasState state) {
    _state = state;
  }

  void _detach(_AxisCanvasState state) {
    if (identical(_state, state)) _state = null;
  }

  void zoomIn() => _state?.zoomBy(1.25);
  void zoomOut() => _state?.zoomBy(0.8);
  void reset() => _state?.resetView();
  void focusNode(int nodeId) => _state?.focusNode(nodeId);

  void dispose() => scale.dispose();
}

/// 人轴画布。
///
/// - 人员卡片沿主干排列，事项卡片挂在人员侧边；
/// - 连线是平滑贝塞尔曲线，拖动时实时跟着卡片走；
/// - 拖到另一位人员卡片上表示调整上级（由页面二次确认后调后端）；
/// - 拖到空白处只保存卡片位置（`PUT /nodes/{id}/layout`）；
/// - 终责卡固定在轴末，只有 PM/创建者能沿主干拖动。
class AxisCanvas extends StatefulWidget {
  const AxisCanvas({
    super.key,
    required this.nodes,
    required this.orientation,
    required this.spacing,
    required this.sort,
    this.offsets = const {},
    this.finalOwnerAlongDelta = 0,
    this.canAdjustFinalOwner = false,
    this.resetLayout = false,
    this.permissions = AxisPermissions.empty,
    this.selfNodeId,
    this.selectedNodeId,
    this.showAiStatus = true,
    this.viewportController,
    this.onOpenPerson,
    this.onOpenMatter,
    this.onReparentPerson,
    this.onReparentMatter,
    this.onLayoutChanged,
    this.onFinalOwnerChanged,
    this.onNotice,
  });

  final List<AxisPersonNode> nodes;
  final AxisOrientation orientation;
  final AxisSpacing spacing;
  final AxisSort sort;
  final Map<int, Offset> offsets;
  final double finalOwnerAlongDelta;
  final bool canAdjustFinalOwner;
  final bool resetLayout;
  final AxisPermissions permissions;
  final int? selfNodeId;
  final int? selectedNodeId;
  final bool showAiStatus;
  final AxisViewportController? viewportController;
  final ValueChanged<AxisPersonNode>? onOpenPerson;
  final void Function(AxisWorkItem item, int ownerId)? onOpenMatter;
  final void Function(AxisPersonNode dragged, AxisPersonNode target)?
      onReparentPerson;
  final void Function(AxisWorkItem item, AxisPersonNode target)?
      onReparentMatter;
  final Future<void> Function(AxisPersonNode node, Offset offset)?
      onLayoutChanged;
  final ValueChanged<double>? onFinalOwnerChanged;
  final ValueChanged<String>? onNotice;

  @override
  State<AxisCanvas> createState() => _AxisCanvasState();
}

class _AxisCanvasState extends State<AxisCanvas> {
  final TransformationController _transform = TransformationController();
  Size _viewport = Size.zero;

  String? _fittedSignature;
  int? _dragPersonId;
  int? _dragMatterId;
  Offset _dragDelta = Offset.zero;
  int? _hoverTargetId;

  AxisFlowResult get _layout => AxisFlowLayout.compute(
        nodes: widget.nodes,
        orientation: widget.orientation,
        spacing: widget.spacing,
        sort: widget.sort,
        offsets: widget.offsets,
        finalOwnerAlongDelta: widget.finalOwnerAlongDelta,
        resetLayout: widget.resetLayout,
        textScale: MediaQuery.textScalerOf(context).scale(1),
      );

  @override
  void initState() {
    super.initState();
    widget.viewportController?._attach(this);
    _transform.addListener(_publishScale);
  }

  @override
  void didUpdateWidget(covariant AxisCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewportController != widget.viewportController) {
      oldWidget.viewportController?._detach(this);
      widget.viewportController?._attach(this);
    }
  }

  @override
  void dispose() {
    widget.viewportController?._detach(this);
    _transform.removeListener(_publishScale);
    _transform.dispose();
    super.dispose();
  }

  void _publishScale() {
    widget.viewportController?.scale.value =
        _transform.value.getMaxScaleOnAxis();
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

  void resetView() {
    _transform.value = Matrix4.identity();
  }

  /// 首次进入画布时把整条人轴装进视口（相当于网页的 fitView）。
  void _fitInitial() {
    if (_viewport == Size.zero) return;
    final layout = _layout;
    final scale = (math.min(
      _viewport.width / layout.size.width,
      _viewport.height / layout.size.height,
    ))
        .clamp(0.25, 1.0)
        .toDouble();
    if (scale >= 0.995) {
      _transform.value = Matrix4.identity();
      return;
    }
    final dx = (_viewport.width - layout.size.width * scale) / 2;
    final dy = math.max(8.0, (_viewport.height - layout.size.height * scale) / 2);
    _transform.value = Matrix4.identity()
      ..translateByDouble(dx, dy, 0, 1)
      ..scaleByDouble(scale, scale, scale, 1);
  }

  void focusNode(int nodeId) {
    final layout = _layout;
    final person = layout.personById(nodeId);
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
    AxisPersonNode? best;
    var bestDistance = 64.0;
    for (final placed in layout.people) {
      if (placed.node.id == _dragPersonId) continue;
      final distance = (placed.rect.center - point).distance;
      if (distance < bestDistance) {
        best = placed.node;
        bestDistance = distance;
      }
    }
    return best;
  }

  void _onPersonDragStart(AxisPersonNode node) {
    setState(() {
      _dragPersonId = node.id;
      _dragMatterId = null;
      _dragDelta = Offset.zero;
      _hoverTargetId = null;
    });
  }

  void _onPersonDragUpdate(Offset delta) {
    setState(() {
      _dragDelta += delta / _currentScale;
      final layout = _layout;
      final placed = layout.personById(_dragPersonId!);
      if (placed == null) return;
      final target = _personAt(placed.center + _dragDelta, layout);
      _hoverTargetId = target?.id;
    });
  }

  void _onPersonDragEnd(AxisPersonNode node) {
    final layout = _layout;
    final delta = _dragDelta;
    final targetId = _hoverTargetId;
    setState(() {
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _hoverTargetId = null;
    });

    if (node.isTerminalPm) {
      if (!widget.canAdjustFinalOwner) {
        widget.onNotice?.call('终责位置仅项目负责人或创建者可调');
        return;
      }
      final along = widget.orientation == AxisOrientation.horizontal
          ? delta.dx
          : delta.dy;
      if (along.abs() < 4) return;
      final next =
          (widget.finalOwnerAlongDelta + along).clamp(0.0, 1200.0).toDouble();
      widget.onFinalOwnerChanged?.call(next);
      return;
    }

    final target = targetId == null ? null : _personNode(layout, targetId);
    if (target != null) {
      widget.onReparentPerson?.call(node, target);
      return;
    }

    if (delta.distance < 4) return;
    final baseOffset =
        widget.offsets[node.id] ?? Offset.zero;
    final nextOffset = baseOffset + delta;
    widget.onLayoutChanged?.call(node, nextOffset);
  }

  void _onMatterDragStart(AxisWorkItem item) {
    setState(() {
      _dragMatterId = item.id;
      _dragPersonId = null;
      _dragDelta = Offset.zero;
      _hoverTargetId = null;
    });
  }

  void _onMatterDragUpdate(Offset delta) {
    setState(() {
      _dragDelta += delta / _currentScale;
      final layout = _layout;
      AxisPlacedMatter? matter;
      for (final placed in layout.matters) {
        if (placed.item.id == _dragMatterId) {
          matter = placed;
          break;
        }
      }
      if (matter == null) return;
      _hoverTargetId =
          _personAt(matter.rect.center + _dragDelta, layout)?.id;
    });
  }

  void _onMatterDragEnd(AxisWorkItem item) {
    final layout = _layout;
    final targetId = _hoverTargetId;
    setState(() {
      _dragMatterId = null;
      _dragDelta = Offset.zero;
      _hoverTargetId = null;
    });
    if (targetId == null) return;
    final target = _personNode(layout, targetId);
    if (target != null) widget.onReparentMatter?.call(item, target);
  }

  @override
  Widget build(BuildContext context) {
    final layout = _layout;
    final isDark = isDarkMode(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        _viewport = Size(constraints.maxWidth, constraints.maxHeight);
        final signature = '${widget.orientation}-${widget.sort}-'
            '${widget.spacing}-${widget.nodes.length}';
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
                      liveDeltas: _liveDeltas(layout),
                      orientation: widget.orientation,
                      isDark: isDark,
                      selectedId: widget.selectedNodeId ?? _dragPersonId,
                    ),
                  ),
                ),
                ...layout.matters.map((matter) => _buildMatter(matter, isDark)),
                ...layout.people.map((person) => _buildPerson(person, isDark)),
              ],
            ),
          ),
        );
      },
    );
  }

  static AxisPersonNode? _personNode(AxisFlowResult layout, int? id) {
    if (id == null) return null;
    for (final placed in layout.people) {
      if (placed.node.id == id) return placed.node;
    }
    return null;
  }

  Map<int, Offset> _liveDeltas(AxisFlowResult layout) {
    if (_dragPersonId != null) {
      return {_dragPersonId!: _dragDelta};
    }
    if (_dragMatterId != null) {
      return {_dragMatterId!: _dragDelta};
    }
    return const {};
  }

  Widget _buildPerson(AxisPlacedPerson placed, bool isDark) {
    final node = placed.node;
    final delta = _dragPersonId == node.id ? _dragDelta : Offset.zero;
    final rect = placed.rect.shift(delta);
    final isSelf = widget.selfNodeId == node.id;
    final selected = widget.selectedNodeId == node.id;
    final hovered = _hoverTargetId == node.id;

    Color borderColor;
    Color background;
    if (hovered) {
      borderColor = AppColors.success;
      background = isDark
          ? AppColors.darkSurfaceVariant
          : AppColors.successLight.withValues(alpha: 0.45);
    } else if (node.isTerminalPm) {
      borderColor = AppColors.warning;
      background = isDark ? AppColors.darkSurface : AppColors.warningLight;
    } else if (isSelf) {
      borderColor = AppColors.primary;
      background = isDark
          ? AppColors.darkSurfaceVariant
          : AppColors.primaryLight.withValues(alpha: 0.6);
    } else {
      borderColor = selected ? AppColors.primary : AppColors.border;
      background = isDark ? AppColors.darkSurface : AppColors.surface;
    }

    return Positioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      child: _AxisDragRegion(
        onTap: () => widget.onOpenPerson?.call(node),
        onStart: () => _onPersonDragStart(node),
        onUpdate: _onPersonDragUpdate,
        onEnd: () => _onPersonDragEnd(node),
        onCancel: () {
          setState(() {
            _dragPersonId = null;
            _dragDelta = Offset.zero;
            _hoverTargetId = null;
          });
        },
        child: Container(
          key: Key('axis-person-${node.id}'),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            border: Border.all(
              color: borderColor,
              width: (isSelf || node.isTerminalPm || hovered) ? 2 : 1,
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 8,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 15,
                    backgroundColor:
                        isSelf ? AppColors.primary : AppColors.surfaceVariant,
                    child: Text(
                      node.name.isEmpty ? '?' : _firstCharacter(node.name),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color:
                            isSelf ? Colors.white : AppColors.textSecondaryOf(isDark),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      node.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: isDark
                            ? AppColors.darkTextPrimary
                            : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  if (isSelf)
                    const _Tag(text: '我', color: AppColors.primary),
                  if (node.isTerminalPm)
                    const _Tag(text: '终责', color: AppColors.warning),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${node.roleTitle.isEmpty ? '岗位未指定' : node.roleTitle}'
                '${node.isPrimary ? '' : ' · 次级'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
              if (widget.showAiStatus) ...[
                const SizedBox(height: 5),
                Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 11,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(
                        isSelf ? '草稿待提交' : '已收到汇报',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMatter(AxisPlacedMatter placed, bool isDark) {
    final delta = _liveDeltaForMatter(placed);
    final rect = placed.rect.shift(delta);
    return Positioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      child: _AxisDragRegion(
        onTap: () => widget.onOpenMatter?.call(placed.item, placed.ownerId),
        onStart: () => _onMatterDragStart(placed.item),
        onUpdate: _onMatterDragUpdate,
        onEnd: () => _onMatterDragEnd(placed.item),
        onCancel: () {
          setState(() {
            _dragMatterId = null;
            _dragDelta = Offset.zero;
            _hoverTargetId = null;
          });
        },
        child: Container(
          key: Key('axis-matter-${placed.item.id}'),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                placed.item.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${placed.item.typeLabel} · ${placed.item.percent}%',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 10,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Offset _liveDeltasFromOwner(int ownerId) {
    if (_dragPersonId == ownerId) return _dragDelta;
    return Offset.zero;
  }

  Offset _liveDeltaForMatter(AxisPlacedMatter matter) {
    if (_dragMatterId == matter.item.id) return _dragDelta;
    return _liveDeltasFromOwner(matter.ownerId);
  }
}

/// 愿意在按下时立刻赢得手势竞技场的平移识别器。
///
/// 画布外层是 InteractiveViewer，它自带平移/缩放手势；普通 GestureDetector
/// 的平移会和它竞争，导致拖卡片时画布先被拖动、卡片收不到事件。
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
  final VoidCallback onTap;
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

  @override
  void initState() {
    super.initState();
    _recognizer = _EagerPanGestureRecognizer()
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
          widget.onTap();
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

String _firstCharacter(String value) {
  if (value.isEmpty) return '?';
  final runes = value.runes;
  return String.fromCharCode(runes.first);
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 4),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

/// 平滑曲线 + 主干 + 时间刻度绘制。
class AxisCurvePainter extends CustomPainter {
  AxisCurvePainter({
    required this.layout,
    required this.liveDeltas,
    required this.orientation,
    required this.isDark,
    this.selectedId,
  });

  final AxisFlowResult layout;
  final Map<int, Offset> liveDeltas;
  final AxisOrientation orientation;
  final bool isDark;
  final int? selectedId;

  Offset _deltaFor(int id) => liveDeltas[id] ?? Offset.zero;

  /// 连线终点跟随哪张卡片：
  /// - 人员→人员：终点是子卡片，跟随子卡片位移；
  /// - 人员→事项：终点是事项卡片，拖人员时事项整体跟随人员，拖事项时跟随事项本身。
  static Offset connectionEndDelta(
    AxisConnection connection,
    Map<int, Offset> liveDeltas,
  ) {
    if (connection.type == AxisConnectionType.personToMatter) {
      return liveDeltas[connection.fromId] ?? Offset.zero;
    }
    return liveDeltas[connection.toId] ?? Offset.zero;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final spineColor =
        isDark ? const Color(0xFF2F4A66) : const Color(0xFFCBD9E8);
    final spinePaint = Paint()
      ..color = spineColor
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(layout.spineStart, layout.spineEnd, spinePaint);

    final tickPaint = Paint()
      ..color = spineColor
      ..strokeWidth = 1.4;
    for (final tick in layout.ticks) {
      final textPainter = TextPainter(
        text: TextSpan(
          text: tick.label,
          style: TextStyle(
            fontSize: 10,
            color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      if (orientation == AxisOrientation.vertical) {
        canvas.drawLine(
          Offset(tick.at.dx - 6, tick.at.dy),
          Offset(tick.at.dx - 16, tick.at.dy),
          tickPaint,
        );
        textPainter.paint(
          canvas,
          Offset(tick.at.dx - 22 - textPainter.width, tick.at.dy - 7),
        );
      } else {
        canvas.drawLine(
          Offset(tick.at.dx, tick.at.dy - 6),
          Offset(tick.at.dx, tick.at.dy - 16),
          tickPaint,
        );
        textPainter.paint(
          canvas,
          Offset(tick.at.dx - textPainter.width / 2, tick.at.dy - 30),
        );
      }
    }

    final basePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..color = isDark ? const Color(0xFF4E7AA8) : const Color(0xFF6D93BE);
    final activePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.2
      ..strokeCap = StrokeCap.round
      ..color = AppColors.primary;

    for (final connection in layout.connections) {
      final start = connection.start + _deltaFor(connection.fromId);
      final end = connection.end + connectionEndDelta(connection, liveDeltas);
      final path = Path();
      if (orientation == AxisOrientation.vertical) {
        final bow = connection.type == AxisConnectionType.personToPerson
            ? math.max(connection.bow, 24)
            : 0.0;
        final midY = (start.dy + end.dy) / 2;
        final control1 = Offset(start.dx + bow, midY - (midY - start.dy) * 0.35);
        final control2 = Offset(end.dx + bow, midY + (end.dy - midY) * 0.35);
        path
          ..moveTo(start.dx, start.dy)
          ..cubicTo(control1.dx, control1.dy, control2.dx, control2.dy,
              end.dx, end.dy);
      } else {
        final bow = connection.type == AxisConnectionType.personToPerson
            ? math.max(connection.bow, 24)
            : 0.0;
        final midX = (start.dx + end.dx) / 2;
        final control1 = Offset(midX - (midX - start.dx) * 0.35, start.dy + bow);
        final control2 = Offset(midX + (end.dx - midX) * 0.35, end.dy + bow);
        path
          ..moveTo(start.dx, start.dy)
          ..cubicTo(control1.dx, control1.dy, control2.dx, control2.dy,
              end.dx, end.dy);
      }
      final isActive = selectedId != null &&
          (connection.fromId == selectedId || connection.toId == selectedId);
      canvas.drawPath(path, isActive ? activePaint : basePaint);
    }
  }

  @override
  bool shouldRepaint(covariant AxisCurvePainter oldDelegate) {
    return oldDelegate.layout != layout ||
        oldDelegate.liveDeltas != liveDeltas ||
        oldDelegate.isDark != isDark ||
        oldDelegate.selectedId != selectedId ||
        oldDelegate.orientation != orientation;
  }
}
