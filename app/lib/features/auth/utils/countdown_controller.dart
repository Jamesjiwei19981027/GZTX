import 'dart:async';

import 'package:flutter/foundation.dart';

/// 验证码发送倒计时控制器。
///
/// 行为对齐网页版 `useCountdown`（`frontend/src/mobile/features/auth/MobileAuthScreens.tsx`）：
/// 每秒递减 1，归零后停止并自动释放定时器。
class CountdownController extends ChangeNotifier {
  CountdownController({this.tick = const Duration(seconds: 1)});

  /// 每跳一次的间隔，测试可注入更短间隔
  final Duration tick;

  Timer? _timer;
  int _seconds = 0;
  bool _disposed = false;

  int get seconds => _seconds;

  bool get isRunning => _seconds > 0;

  /// 以 [seconds] 为起点开始倒计时
  void start(int seconds) {
    if (_disposed) return;
    _timer?.cancel();
    _seconds = seconds > 0 ? seconds : 1;
    notifyListeners();
    _timer = Timer.periodic(tick, (_) {
      if (_disposed) return;
      _seconds -= 1;
      if (_seconds <= 0) {
        _seconds = 0;
        _timer?.cancel();
        _timer = null;
      }
      notifyListeners();
    });
  }

  void cancel() {
    _timer?.cancel();
    _timer = null;
    if (_seconds != 0) {
      _seconds = 0;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }
}
