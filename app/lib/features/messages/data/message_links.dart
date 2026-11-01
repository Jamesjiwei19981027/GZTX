/// 后端返回的附件 / 钉选链接地址解析。
///
/// 协作文件地址形如 `/api/v1/collab/files/301/download`，而 `ApiClient.baseUrl`
/// 本身已以 `/api/v1` 结尾；直接拼接会得到 `/api/v1/api/v1/...`，复制出来的链接
/// 一定打不开。这里统一按三种形态处理：
/// - 已是带协议的绝对地址（`http(s)://` 等）：原样返回，钉选外链就属于这种；
/// - 已带当前接口前缀（`/api/v1/...`）：只换成当前来源（scheme + host + port）；
/// - 其余相对路径：补到 `baseUrl` 之后（仍保证前缀只出现一次）。
String resolveMessageLink(String baseUrl, String rawUrl) {
  final value = rawUrl.trim();
  if (value.isEmpty) return value;

  final parsed = Uri.tryParse(value);
  if (parsed != null && parsed.hasScheme) return value;

  final base = Uri.tryParse(baseUrl.trim());
  if (base == null || base.host.isEmpty) return value;

  final origin = base.hasPort && base.port != 0
      ? '${base.scheme}://${base.host}:${base.port}'
      : '${base.scheme}://${base.host}';

  // 协议相对地址（`//host/path`）：沿用接口的协议
  if (value.startsWith('//')) return '${base.scheme}:$value';

  final basePath = base.path.endsWith('/')
      ? base.path.substring(0, base.path.length - 1)
      : base.path;
  final path = value.startsWith('/') ? value : '/$value';

  if (basePath.isNotEmpty &&
      (path == basePath || path.startsWith('$basePath/'))) {
    return '$origin$path';
  }
  return '$origin$basePath$path';
}
