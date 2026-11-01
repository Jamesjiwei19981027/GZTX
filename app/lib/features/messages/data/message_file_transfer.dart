import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';

/// 待发送的文件（由系统选择器或测试替身提供）
class PickedMessageFile {
  const PickedMessageFile({
    required this.name,
    required this.mimeType,
    required this.bytes,
  });

  final String name;
  final String mimeType;
  final Uint8List bytes;

  int get sizeBytes => bytes.length;
}

/// 文件选择端口。
///
/// 真正的系统文件选择需要 `file_picker` 依赖，属于共享改动（与 T05 相同的诉求），
/// 已写入回传报告的共享改动申请；本任务只定义端口并提供“明确不可用”的实现，
/// 绝不静默失败或伪造上传结果。
abstract class MessageFilePicker {
  bool get isAvailable;

  /// 用户取消时返回 null
  Future<PickedMessageFile?> pickFile();
}

class MessageFilePickerException implements Exception {
  MessageFilePickerException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// 尚未集成系统选择器时的实现
class UnavailableMessageFilePicker implements MessageFilePicker {
  const UnavailableMessageFilePicker();

  @override
  bool get isAvailable => false;

  @override
  Future<PickedMessageFile?> pickFile() async {
    throw MessageFilePickerException(
      '当前安装包尚未集成系统文件选择组件，暂时无法发送文件（已提交共享改动申请）。'
      '可先发送文字消息。',
    );
  }
}

/// 上传端口：便于测试注入，不新增依赖
abstract class MessageFileUploader {
  Future<int> upload({
    required String scopeType,
    required int scopeId,
    required PickedMessageFile file,
  });
}

/// 基于 `http` 的 multipart 上传实现。
///
/// 直接上传到 `/channels/{id}/files` 或 `/conversations/{id}/files`，
/// 再把返回的文件编号随消息一起提交（与网页版 `uploadChannelFile` 流程一致）。
class ApiMessageFileUploader implements MessageFileUploader {
  ApiMessageFileUploader({
    required ApiClient api,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 60),
  })  : _api = api,
        _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;
  final Duration timeout;

  @override
  Future<int> upload({
    required String scopeType,
    required int scopeId,
    required PickedMessageFile file,
  }) async {
    final path = scopeType == 'channel'
        ? '/channels/$scopeId/files'
        : '/conversations/$scopeId/files';

    final boundary =
        '----WorkTodoMessages${DateTime.now().microsecondsSinceEpoch}';
    final builder = BytesBuilder(copy: false);
    void write(String value) => builder.add(utf8.encode(value));

    write('--$boundary\r\n');
    write(
      'Content-Disposition: form-data; name="file"; filename="${_escape(file.name)}"\r\n',
    );
    write('Content-Type: ${file.mimeType}\r\n\r\n');
    builder.add(file.bytes);
    write('\r\n--$boundary--\r\n');

    final base = _api.baseUrl.endsWith('/')
        ? _api.baseUrl.substring(0, _api.baseUrl.length - 1)
        : _api.baseUrl;
    final uri = Uri.parse('$base$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'multipart/form-data; boundary=$boundary',
    };
    if (_api.tokens.hasAccess) {
      headers['Authorization'] = 'Bearer ${_api.tokens.accessToken}';
    }

    http.Response response;
    try {
      response = await _http
          .post(uri, headers: headers, body: builder.takeBytes())
          .timeout(
            timeout,
            onTimeout: () => throw NetworkException('文件上传超时，请检查网络后重试'),
          );
    } on AppException {
      rethrow;
    } catch (error) {
      throw NetworkException('网络连接异常，文件未发送', cause: error);
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        payload = response.body;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = payload is Map
          ? (payload['message'] ?? payload['detail'])?.toString()
          : null;
      throw ApiException(
        message == null || message.trim().isEmpty
            ? '文件上传失败'
            : message.trim(),
        statusCode: response.statusCode,
      );
    }

    final data = payload is Map && payload.containsKey('data')
        ? payload['data']
        : payload;
    final map = data is Map ? data.cast<String, dynamic>() : null;
    final fileId = map?['id'] ?? map?['file_id'];
    if (fileId is! num || fileId <= 0) {
      throw ApiException('文件上传未返回文件编号，请稍后重试');
    }
    return fileId.toInt();
  }

  /// 与浏览器一致：文件名中的双引号与换行做转义，避免破坏 multipart 头
  String _escape(String name) => name
      .replaceAll('"', '%22')
      .replaceAll('\r', '')
      .replaceAll('\n', '');
}
