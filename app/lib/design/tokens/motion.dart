import 'package:flutter/animation.dart';

/// Shared motion tokens for the paper-and-ink interface.
class AppMotion {
  AppMotion._();

  static const Curve easeOut = Cubic(0.22, 1, 0.36, 1);
  static const Duration hover = Duration(milliseconds: 150);
  static const Duration menu = Duration(milliseconds: 200);
  static const Duration sheet = Duration(milliseconds: 300);
}
