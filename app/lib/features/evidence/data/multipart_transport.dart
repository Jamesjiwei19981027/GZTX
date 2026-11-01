import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../../../core/errors/app_error.dart';

/// multipart/form-data 上传载荷
class MultipartPayload {
  const MultipartPayload({
    required this.path,
    required this.fileField,
    required this.filename,
    required this.contentType,
    required this.bytes,
    this.fields = const {},
  });

  /// 相对路径，例如 `/evidence/files`
  final String path;
  final String fileField;
  final String filename;
  final String contentType;
  final List<int> bytes;
  final Map<String, String> fields;
}

/// multipart 响应（信封解析交给调用方）
class MultipartResult {
  const MultipartResult({required this.statusCode, required this.bodyBytes});

  final int statusCode;
  final List<int> bodyBytes;
}

/// 上传通道抽象：便于测试注入，不引入额外依赖
abstract class MultipartTransport {
  Future<MultipartResult> send(
    MultipartPayload payload, {
    required String baseUrl,
    required Map<String, String> headers,
    void Function(double progress)? onProgress,
    Duration timeout,
  });
}

/// 基于 `http` 的流式 multipart 上传实现。
///
/// 手写 multipart 报文而不用 `http.MultipartRequest`，原因有两点：
/// 1. `MultipartRequest` 无法汇报上传字节进度；
/// 2. 设置 part 的 MIME 类型需要额外依赖 `http_parser`，本任务不允许新增依赖。
class HttpMultipartTransport implements MultipartTransport {
  HttpMultipartTransport({http.Client? client, this.chunkSize = 64 * 1024})
      : _client = client ?? http.Client();

  final http.Client _client;
  final int chunkSize;

  @override
  Future<MultipartResult> send(
    MultipartPayload payload, {
    required String baseUrl,
    required Map<String, String> headers,
    void Function(double progress)? onProgress,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    final body = buildMultipartBody(payload);
    final total = body.bytes.length;

    final request = http.StreamedRequest('POST', buildUri(baseUrl, payload.path));
    request.headers.addAll(headers);
    request.headers['Content-Type'] =
        'multipart/form-data; boundary=${body.boundary}';
    request.contentLength = total;

    onProgress?.call(0);

    // 分块投递，逐块汇报进度；投递异常统一转为网络异常，不静默丢失
    final feedErrors = <Object>[];
    Future<void> feed() async {
      try {
        for (var offset = 0; offset < total; offset += chunkSize) {
          final end = math.min(offset + chunkSize, total);
          request.sink.add(body.bytes.sublist(offset, end));
          onProgress?.call(total == 0 ? 1 : end / total);
          await Future<void>.delayed(Duration.zero);
        }
      } catch (error) {
        feedErrors.add(error);
      } finally {
        try {
          await request.sink.close();
        } catch (_) {
          // 已中断时关闭 sink 会抛错，由 feedErrors/响应状态决定最终结果
        }
      }
    }

    final feeding = feed();

    http.StreamedResponse response;
    try {
      response = await _client.send(request).timeout(
        timeout,
        onTimeout: () => throw NetworkException('上传超时，请检查网络后重试'),
      );
    } on AppException {
      rethrow;
    } catch (error) {
      throw NetworkException('网络连接异常，上传未完成', cause: error);
    } finally {
      await feeding;
    }

    if (feedErrors.isNotEmpty) {
      throw NetworkException('上传过程中网络中断，请重试', cause: feedErrors.first);
    }

    final bytes = await response.stream.toBytes();
    return MultipartResult(statusCode: response.statusCode, bodyBytes: bytes);
  }
}

/// multipart 报文
class MultipartBody {
  const MultipartBody({required this.boundary, required this.bytes});

  final String boundary;
  final List<int> bytes;
}

/// 生成 multipart/form-data 报文体（UTF-8，文件名原样编码，与浏览器一致）
MultipartBody buildMultipartBody(MultipartPayload payload) {
  final boundary =
      '----WorkTodoBoundary${DateTime.now().microsecondsSinceEpoch}';
  final builder = BytesBuilder(copy: false);

  for (final entry in payload.fields.entries) {
    builder.add(_utf8(
      '--$boundary\r\n'
      'Content-Disposition: form-data; name="${_escape(entry.key)}"\r\n'
      '\r\n'
      '${entry.value}\r\n',
    ));
  }

  builder.add(_utf8(
    '--$boundary\r\n'
    'Content-Disposition: form-data; name="${_escape(payload.fileField)}"; '
    'filename="${_escape(payload.filename)}"\r\n'
    'Content-Type: ${payload.contentType}\r\n'
    '\r\n',
  ));
  builder.add(payload.bytes);
  builder.add(_utf8('\r\n--$boundary--\r\n'));

  return MultipartBody(boundary: boundary, bytes: builder.takeBytes());
}

Uri buildUri(String baseUrl, String path) {
  final base =
      baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
  final normalized = path.startsWith('/') ? path : '/$path';
  return Uri.parse('$base$normalized');
}

List<int> _utf8(String text) => Uint8List.fromList(utf8.encode(text));

String _escape(String value) =>
    value.replaceAll('"', '%22').replaceAll('\r', '').replaceAll('\n', '');
