/// API 基址配置（与 Web / 小程序共用 FastAPI 后端）。
class ApiConfig {
  /// 开发默认：Docker 编排映射宿主 8010 → 容器 8000。
  /// Android 模拟器访问宿主机请用 `10.0.2.2:8010`。
  /// iOS 模拟器可用 `localhost:8010` 或本机局域网 IP。
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8010/api/v1',
  );
}
