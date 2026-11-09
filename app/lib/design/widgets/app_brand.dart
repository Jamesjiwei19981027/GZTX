import 'package:flutter/material.dart';

import '../../config/brand.dart';
import '../tokens/colors.dart';

/// Flat single-colour pen nib used wherever the product mark appears.
class AppBrandMark extends StatelessWidget {
  const AppBrandMark({super.key, this.size = 40, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(size),
      painter: _PenNibPainter(color ?? Theme.of(context).colorScheme.primary),
    );
  }
}

class _PenNibPainter extends CustomPainter {
  const _PenNibPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path()
      ..moveTo(size.width * .18, size.height * .16)
      ..lineTo(size.width * .82, size.height * .16)
      ..lineTo(size.width * .62, size.height * .72)
      ..lineTo(size.width * .50, size.height * .90)
      ..lineTo(size.width * .38, size.height * .72)
      ..close();
    canvas.drawPath(path, paint);
    canvas.drawCircle(Offset(size.width * .50, size.height * .56), size.width * .065, Paint()..color = color.withValues(alpha: .78));
  }

  @override
  bool shouldRepaint(covariant _PenNibPainter oldDelegate) => oldDelegate.color != color;
}

class AppBrand extends StatelessWidget {
  const AppBrand({super.key, this.markSize = 24, this.textStyle});

  final double markSize;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final style = textStyle ??
        Theme.of(context).textTheme.titleMedium?.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w500,
            );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppBrandMark(size: markSize),
        const SizedBox(width: 8),
        Text(Brand.name, style: style),
      ],
    );
  }
}
