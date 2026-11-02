import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:worktodo_app/core/api/api_client.dart';

/// 语音输入相关异常：message 一律是可以直接展示给用户的中文
class VoiceInputException implements Exception {
  const VoiceInputException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// 一段录好的音频
class VoiceRecording {
  const VoiceRecording({
    required this.bytes,
    required this.filename,
    required this.mimeType,
  });

  final Uint8List bytes;
  final String filename;
  final String mimeType;
}

/// 录音能力抽象。
///
/// 真实录音需要原生录音插件与麦克风权限（由底座统一接入，见回传报告中的共享改动申请）。
/// 本任务先定义契约，并为未接入的构建提供“不可用”实现，避免用户点了没反应。
abstract class VoiceRecorder {
  bool get isRecording;

  Future<void> start();

  /// 结束录音并返回音频；没有录到内容时返回 null
  Future<VoiceRecording?> stop();

  Future<void> cancel();
}

/// 当前构建未接入录音组件时的降级实现：明确提示，不假装录音成功
class UnavailableVoiceRecorder implements VoiceRecorder {
  const UnavailableVoiceRecorder();

  static const String unavailableMessage = '当前版本暂不支持直接录音，请用键盘上的语音输入或直接输入文字';

  @override
  bool get isRecording => false;

  @override
  Future<void> start() async =>
      throw const VoiceInputException(unavailableMessage);

  @override
  Future<VoiceRecording?> stop() async => null;

  @override
  Future<void> cancel() async {}
}

/// 语音转文字抽象（便于测试注入）
abstract class VoiceTranscriber {
  Future<String> transcribe({
    required VoiceRecording recording,
    required int companyId,
    required int projectId,
  });
}

/// 走 `/asr/transcribe` 的真实转写实现
///
/// 该接口是 multipart 表单上传，底座 `ApiClient` 只封装了 JSON 请求，
/// 因此这里直接用已声明的 `http` 依赖发送表单，令牌与基地址复用底座配置。
class ApiVoiceTranscriber implements VoiceTranscriber {
  ApiVoiceTranscriber({
    required this.api,
    http.Client? client,
    this.timeout = const Duration(seconds: 60),
  }) : _client = client ?? http.Client();

  final ApiClient api;
  final http.Client _client;
  final Duration timeout;

  @override
  Future<String> transcribe({
    required VoiceRecording recording,
    required int companyId,
    required int projectId,
  }) async {
    final base = api.baseUrl.endsWith('/')
        ? api.baseUrl.substring(0, api.baseUrl.length - 1)
        : api.baseUrl;
    http.MultipartRequest request() => http.MultipartRequest(
          'POST',
          Uri.parse('$base/asr/transcribe'),
        )
          ..fields
              .addAll({'company_id': '$companyId', 'project_id': '$projectId'})
          ..files.add(http.MultipartFile.fromBytes('file', recording.bytes,
              filename: recording.filename));
    final response =
        await api.sendRaw(request, sender: _client, requestTimeout: timeout);

    Map<String, dynamic>? payload;
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map) payload = decoded.cast<String, dynamic>();
      } catch (_) {
        payload = null;
      }
    }

    final code = payload?['code'];
    final message = (payload?['message'] as String?) ??
        (payload?['detail'] is String ? payload!['detail'] as String : null);
    final isSuccess = response.statusCode >= 200 &&
        response.statusCode < 300 &&
        (code == null || code == 200);
    if (!isSuccess) {
      throw VoiceInputException(
        (message != null && message.isNotEmpty) ? message : '语音识别失败，请重试或直接输入文字',
      );
    }

    final data = payload?['data'];
    final text = data is Map ? (data['text'] as String?)?.trim() : null;
    if (text == null || text.isEmpty) {
      throw const VoiceInputException('未识别到有效文字，请重新录音或直接输入文字');
    }
    return text;
  }

  void dispose() => _client.close();
}

/// 按音频字节推断文件名与 MIME，供上传表单使用
VoiceRecording buildWebmRecording(Uint8List bytes) => VoiceRecording(
      bytes: bytes,
      filename: 'knowledge-voice.webm',
      mimeType: 'audio/webm',
    );
