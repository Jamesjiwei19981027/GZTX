import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../errors/app_error.dart';

class SystemLinks {
  static Future<void> openExternal(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        !const ['http', 'https', 'mailto'].contains(uri.scheme)) {
      throw ApiException('链接格式不受支持');
    }
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw ApiException('无法打开链接，请检查是否安装了可用的浏览器');
    }
  }

  /// 协作下载带会话凭据，保存到应用临时目录再交给系统预览。
  static Future<void> openDownload(
    ApiClient api,
    String value,
    String filename,
  ) async {
    final uri = Uri.parse(value);
    if (uri.origin != Uri.parse(api.baseUrl).origin) {
      await openExternal(value);
      return;
    }
    final response = await api.sendRaw(() => http.Request('GET', uri));
    if (response.statusCode != 200) {
      throw ApiException('文件下载失败（${response.statusCode}）',
          statusCode: response.statusCode);
    }
    final directory = await getTemporaryDirectory();
    final safeName = filename.replaceAll(RegExp(r'[/\\:\x00-\x1f]'), '_');
    final folder = await Directory(
      '${directory.path}/preview-${DateTime.now().microsecondsSinceEpoch}',
    ).create();
    final file =
        File('${folder.path}/${safeName.isEmpty ? 'attachment' : safeName}');
    await file.writeAsBytes(response.bodyBytes, flush: true);
    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) {
      throw ApiException('无法预览文件：${result.message}');
    }
  }
}
