import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';
import '../models/evidence_models.dart';
import 'multipart_transport.dart';

/// T05 材料与项目知识库接口封装。
///
/// 只读后端既有接口，不新增后端能力：
/// - `POST /evidence/files` 上传附件
/// - `GET /nodes/{id}`、`GET /nodes/{id}/evidence`、`POST /nodes/{id}/evidence`
/// - `GET /evidence/{package_id}`、`GET /jobs/{job_id}`
/// - `POST /asr/transcribe` 语音转文字
/// - `GET /projects/{id}/llm-wiki`、`POST .../drafts`、`POST .../drafts/{id}/publish`
/// - `GET /projects/{id}/knowledge/search`
class EvidenceApi {
  EvidenceApi(
    this._client, {
    MultipartTransport? transport,
    this.uploadTimeout = const Duration(seconds: 60),
    this.transcribeTimeout = const Duration(seconds: 90),
  }) : _transport = transport ?? HttpMultipartTransport();

  final ApiClient _client;
  final MultipartTransport _transport;
  final Duration uploadTimeout;
  final Duration transcribeTimeout;

  ApiClient get client => _client;

  Future<MultipartResult> _sendAuthenticated(
    MultipartPayload payload, {
    required String baseUrl,
    required Map<String, String> headers,
    void Function(double)? onProgress,
    required Duration timeout,
  }) async {
    final generation = _client.tokens.sessionGeneration;
    Future<MultipartResult> send() {
      _client.requireSession(generation);
      return _transport.send(payload,
          baseUrl: baseUrl,
          headers: _authHeaders,
          onProgress: onProgress,
          timeout: timeout);
    }

    final token = _client.tokens.accessToken;
    var result = await send();
    _client.requireSession(generation);
    if (result.statusCode == 401) {
      final refreshed =
          (_client.tokens.hasAccess && _client.tokens.accessToken != token) ||
              await _client.refreshSession();
      _client.requireSession(generation);
      if (refreshed) result = await send();
      _client.requireSession(generation);
      if (!refreshed || result.statusCode == 401) {
        await _client.expireSession(generation);
      }
    }
    return result;
  }

  Map<String, String> get _authHeaders {
    final headers = <String, String>{'Accept': 'application/json'};
    if (_client.tokens.hasAccess) {
      headers['Authorization'] = 'Bearer ${_client.tokens.accessToken}';
    }
    return headers;
  }

  /// 责任事项标题；失败时返回 null（不影响主流程，界面回退为“当前责任事项”）
  Future<String?> loadNodeTitle(int nodeId) async {
    try {
      final dynamic data = await _client.get('/nodes/$nodeId');
      if (data is Map<String, dynamic>) {
        final title = data['title'] as String?;
        if (title != null && title.trim().isNotEmpty) return title.trim();
      }
      return null;
    } on AuthException {
      rethrow;
    } on AppException {
      return null;
    }
  }

  Future<List<EvidencePackage>> listNodeEvidence(int nodeId) async {
    final dynamic data = await _client.get(
      '/nodes/$nodeId/evidence',
      query: {'page': '1', 'page_size': '20'},
    );
    final raw = data is Map ? data['items'] : null;
    final items = <EvidencePackage>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          items.add(EvidencePackage.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    return items;
  }

  Future<EvidencePackage> getPackage(int packageId) async {
    final dynamic data = await _client.get('/evidence/$packageId');
    if (data is! Map) {
      throw ApiException('材料详情返回格式异常');
    }
    return EvidencePackage.fromJson(data.cast<String, dynamic>());
  }

  Future<EvidencePackage> reviewEvidence({
    required int packageId,
    required String decision,
    String? reason,
  }) async {
    final body = <String, dynamic>{
      'decision': decision,
    };
    if (reason != null && reason.trim().isNotEmpty) {
      body['reason'] = reason.trim();
    }
    final dynamic data = await _client.post(
      '/evidence/$packageId/review',
      body: body,
    );
    if (data is! Map) {
      throw ApiException('审核结果返回格式异常');
    }
    return EvidencePackage.fromJson(data.cast<String, dynamic>());
  }

  Future<SubmitOutcome> submitEvidence({
    required int nodeId,
    required String summary,
    required String evidenceKind,
    List<int> fileIds = const [],
  }) async {
    final dynamic data = await _client.post(
      '/nodes/$nodeId/evidence',
      body: {
        'summary_text': summary,
        'evidence_kind': evidenceKind,
        'file_ids': fileIds,
      },
    );
    if (data is! Map) {
      throw ApiException('提交结果返回格式异常');
    }
    return SubmitOutcome.fromJson(data.cast<String, dynamic>());
  }

  Future<BackgroundJob> getJob(String jobId) async {
    final dynamic data = await _client.get('/jobs/$jobId');
    if (data is! Map) {
      throw ApiException('后台任务返回格式异常');
    }
    return BackgroundJob.fromJson(data.cast<String, dynamic>());
  }

  /// 上传附件，返回服务端文件编号；`onProgress` 汇报 0~1 的进度
  Future<UploadedEvidenceFile> uploadFile({
    required PickedAttachment file,
    required int companyId,
    required int projectId,
    void Function(double progress)? onProgress,
  }) async {
    final payload = MultipartPayload(
      path: '/evidence/files',
      fileField: 'file',
      filename: file.name,
      contentType: file.mimeType,
      bytes: file.bytes,
      fields: {
        'company_id': '$companyId',
        'project_id': '$projectId',
      },
    );

    final result = await _sendAuthenticated(
      payload,
      baseUrl: _client.baseUrl,
      headers: _authHeaders,
      onProgress: onProgress,
      timeout: uploadTimeout,
    );
    final data =
        _decode(result.statusCode, result.bodyBytes, fallback: '文件上传失败');
    if (data is! Map) {
      throw ApiException('文件上传返回格式异常');
    }
    final map = data.cast<String, dynamic>();
    final fileId = (map['file_id'] as num?)?.toInt() ?? 0;
    if (fileId <= 0) {
      throw ApiException('文件上传未返回文件编号');
    }
    return UploadedEvidenceFile(
      fileId: fileId,
      name: (map['original_name'] as String?)?.trim().isNotEmpty == true
          ? map['original_name'] as String
          : file.name,
      sizeBytes: (map['size_bytes'] as num?)?.toInt() ?? file.bytes.length,
      mimeType: map['mime_type'] as String? ?? file.mimeType,
    );
  }

  /// 语音转文字。后端未配置 ASR 时返回 503，转成可见中文提示。
  Future<String> transcribeAudio({
    required List<int> bytes,
    required String filename,
    required String mimeType,
    required int companyId,
    required int projectId,
  }) async {
    final payload = MultipartPayload(
      path: '/asr/transcribe',
      fileField: 'file',
      filename: filename,
      contentType: mimeType,
      bytes: bytes,
      fields: {
        'company_id': '$companyId',
        'project_id': '$projectId',
      },
    );

    final result = await _sendAuthenticated(
      payload,
      baseUrl: _client.baseUrl,
      headers: _authHeaders,
      timeout: transcribeTimeout,
    );
    final dynamic data = _decode(result.statusCode, result.bodyBytes,
        fallback: '语音转写失败，请重试或直接输入文字');
    final text = data is Map ? data['text'] as String? : null;
    if (text == null || text.trim().isEmpty) {
      throw ApiException('未识别到有效文字，请重新录音或直接输入。');
    }
    if (text.trim().startsWith('[builtin-asr]')) {
      throw ApiException('未识别到有效文字，请重新录音或直接输入。');
    }
    return text.trim();
  }

  Future<WikiCatalog> getWiki(int projectId, {String query = ''}) async {
    final dynamic data = await _client.get(
      '/projects/$projectId/llm-wiki',
      query: query.trim().isEmpty ? null : {'q': query.trim()},
    );
    if (data is! Map) {
      throw ApiException('项目知识目录返回格式异常');
    }
    return WikiCatalog.fromJson(data.cast<String, dynamic>());
  }

  Future<int> generateDraft({
    required int projectId,
    required int packageId,
  }) async {
    final dynamic data = await _client.post(
      '/projects/$projectId/llm-wiki/drafts',
      body: {'package_id': packageId},
    );
    final id = data is Map ? (data['id'] as num?)?.toInt() : null;
    if (id == null || id <= 0) {
      throw ApiException('草稿生成未返回草稿编号');
    }
    return id;
  }

  Future<void> publishDraft({
    required int projectId,
    required int draftId,
  }) async {
    await _client.post('/projects/$projectId/llm-wiki/drafts/$draftId/publish');
  }

  Future<List<KnowledgeHit>> searchKnowledge(
    int projectId,
    String query, {
    int topK = 5,
  }) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return const [];
    final dynamic data = await _client.get(
      '/projects/$projectId/knowledge/search',
      query: {'q': trimmed, 'top_k': '$topK'},
    );
    final raw = data is Map ? data['items'] : null;
    final items = <KnowledgeHit>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          items.add(KnowledgeHit.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    return items;
  }

  /// 解析后端 `{code, message, data}` 信封，失败时抛结构化异常
  dynamic _decode(
    int statusCode,
    List<int> bodyBytes, {
    required String fallback,
  }) {
    dynamic payload;
    if (bodyBytes.isNotEmpty) {
      try {
        payload = jsonDecode(utf8.decode(bodyBytes));
      } catch (_) {
        payload = utf8.decode(bodyBytes, allowMalformed: true);
      }
    }

    final isHttpSuccess = statusCode >= 200 && statusCode < 300;

    if (payload is Map) {
      final map = payload.cast<String, dynamic>();
      final code = map['code'];
      final isBizSuccess = code == null || (code is num && code.toInt() == 200);
      if (isHttpSuccess && isBizSuccess) {
        return map.containsKey('data') ? map['data'] : map;
      }

      final message = _message(map, statusCode, fallback);

      if (statusCode == 401) {
        throw AuthException('登录已过期，请重新登录', code: 401);
      }
      if (statusCode == 422) {
        throw ValidationException(message, code: 422, cause: map);
      }
      throw ApiException(
        message,
        statusCode: statusCode,
        code: code is num ? code.toInt() : statusCode,
        detail: map['detail'],
      );
    }

    if (!isHttpSuccess) {
      if (statusCode == 401) {
        throw AuthException('登录已过期，请重新登录', code: 401);
      }
      throw ApiException('$fallback（HTTP $statusCode）', statusCode: statusCode);
    }

    return payload;
  }

  String _message(Map<String, dynamic> body, int status, String fallback) {
    final message = body['message'];
    if (message is String && message.trim().isNotEmpty) return message;
    final detail = body['detail'];
    if (detail is String && detail.trim().isNotEmpty) return detail;
    if (detail is List && detail.isNotEmpty) {
      final parts = <String>[];
      for (final item in detail) {
        if (item is Map && item['msg'] is String) {
          parts.add(item['msg'] as String);
        } else if (item is String) {
          parts.add(item);
        }
      }
      if (parts.isNotEmpty) return parts.join('; ');
    }
    return switch (status) {
      403 => '没有操作权限',
      404 => '请求的数据不存在',
      413 => '文件超过大小限制',
      503 => '$fallback：服务暂不可用，请联系管理员',
      _ => '$fallback（HTTP $status）',
    };
  }
}

/// 便捷构造：默认走真实 `http.Client`
http.Client defaultUploadHttpClient() => http.Client();
