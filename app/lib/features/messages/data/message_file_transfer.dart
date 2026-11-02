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
///
/// 底座 `ApiClient` 的 401 续期是私有的，multipart 不能直接走它的传输层，
/// 因此这里在本模块内实现与之一致的续期规则：401 时用刷新令牌换新令牌后重试一次，
/// 续期失败（无刷新令牌 / 服务端拒绝 / 网络异常）再清空凭证并触发登录过期回调。
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

  /// 单飞续期：并发上传同时收到 401 时只刷新一次，避免轮换后的刷新令牌被重复使用

  String get _baseUrl => _api.baseUrl.endsWith('/')
      ? _api.baseUrl.substring(0, _api.baseUrl.length - 1)
      : _api.baseUrl;

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

    final uri = Uri.parse('$_baseUrl$path');
    // 报文与分隔符只构造一次，401 续期后重试复用同一份字节
    final encoded = (boundary: boundary, bytes: builder.takeBytes());

    final response = await _api.sendRaw(
        () => http.Request('POST', uri)
          ..headers['Content-Type'] =
              'multipart/form-data; boundary=${encoded.boundary}'
          ..bodyBytes = encoded.bytes,
        sender: _http,
        requestTimeout: timeout);

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
        message == null || message.trim().isEmpty ? '文件上传失败' : message.trim(),
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

  String _escape(String name) =>
      name.replaceAll('"', '%22').replaceAll('\r', '').replaceAll('\n', '');
}
