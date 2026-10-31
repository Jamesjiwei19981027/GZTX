import 'package:flutter/foundation.dart';

/// 接口基地址配置
class ApiConfig {
  /// 编译期通过 `--dart-define=API_BASE_URL=...` 注入的地址
  static const String _definedBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// 根据运行平台自动选择默认地址：
  /// - 安卓真机/模拟器：`http://10.0.2.2:8010/api/v1`
  /// - iOS/Web/桌面：`http://localhost:8010/api/v1`
  static String get defaultBaseUrl {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:8010/api/v1';
    }
    return 'http://localhost:8010/api/v1';
  }

  /// 最终使用的 API 基地址
  static String get baseUrl {
    if (_definedBaseUrl.isNotEmpty) {
      return _definedBaseUrl;
    }
    return defaultBaseUrl;
  }
}
