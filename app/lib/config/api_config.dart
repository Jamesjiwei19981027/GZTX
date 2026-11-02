/// API / Web 基址配置（与 Docker 联调一致）。
class ApiConfig {
  /// 开发默认：Docker 编排映射宿主 8010 → 容器 8000。
  /// Android 模拟器访问宿主机请用 `10.0.2.2:8010`。
  /// iOS 模拟器可用 `localhost:8010` 或本机局域网 IP。
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8010/api/v1',
  );

  /// 回退网页 UI：与 Web 同源（Nginx :80）。模拟器默认 `http://10.0.2.2/`。
  /// 真机请改为电脑局域网 IP，如 `http://192.168.x.x/`。
  static const String webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://10.0.2.2/',
  );

  /// 默认 false 使用原生；true 显式切回保留一个版本的网页外壳。
  static const bool useWebShell = bool.fromEnvironment(
    'USE_WEB_SHELL',
    defaultValue: false,
  );
}
