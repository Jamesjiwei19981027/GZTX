/// API / Web 基址配置（与 Docker 联调一致）。
class ApiConfig {
  /// 开发默认：Docker 编排映射宿主 8010 → 容器 8000。
  /// Android 模拟器访问宿主机请用 `10.0.2.2:8010`。
  /// iOS 模拟器可用 `localhost:8010` 或本机局域网 IP。
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8010/api/v1',
  );

  /// 正式 UI：与 Web 同源（Nginx :80）。模拟器默认 `http://10.0.2.2/`。
  /// 真机请改为电脑局域网 IP，如 `http://192.168.x.x/`。
  static const String webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://10.0.2.2/',
  );

  /// true（默认）= APP 正式壳加载 Web UI；false = 旧原生 Flutter 壳。
  static const bool useWebShell = bool.fromEnvironment(
    'USE_WEB_SHELL',
    defaultValue: true,
  );
}
