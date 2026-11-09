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
    // A flat fountain-pen nib in the same 24-unit view box as BrandMark.tsx.
    // True cutouts keep the vent and slit open on every surface.
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    final path = Path()
      ..moveTo(7, 3)
      ..lineTo(17, 3)
      ..lineTo(19, 11)
      ..quadraticBezierTo(15, 17, 12, 22)
      ..quadraticBezierTo(9, 17, 5, 11)
      ..close();
    final cutouts = Path()
      ..addOval(Rect.fromCircle(center: const Offset(12, 11), radius: 1.5))
      ..addRect(const Rect.fromLTWH(11.5, 11, 1, 12));
    canvas.drawPath(
        Path.combine(PathOperation.difference, path, cutouts), paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PenNibPainter oldDelegate) =>
      oldDelegate.color != color;
}

class AppBrand extends StatelessWidget {
  const AppBrand({super.key, this.markSize = 24, this.textStyle});

  final double markSize;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final style = textStyle ??
        Theme.of(context).textTheme.titleMedium?.copyWith(
              color: Theme.of(context).brightness == Brightness.dark
                  ? AppColors.darkTextPrimary
                  : AppColors.textPrimary,
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
