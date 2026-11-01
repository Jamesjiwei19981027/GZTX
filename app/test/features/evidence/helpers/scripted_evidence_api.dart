import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/evidence/data/evidence_api.dart';
import 'package:worktodo_app/features/evidence/data/multipart_transport.dart';

import 'evidence_harness.dart';

/// 用自定义 HTTP 处理器构造 [EvidenceApi]。
///
/// 与 [MockApiClientHelper] 的区别：处理器可以返回未完成的 Future，
/// 用来复现“上一轮请求迟迟不返回、用户已经重置表单”这类竞态。
EvidenceApi buildScriptedEvidenceApi(
  Future<http.Response> Function(http.Request request) handler, {
  MultipartTransport? transport,
}) {
  return EvidenceApi(
    ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
      httpClient: MockClient(handler),
      baseUrl: 'http://localhost:8010/api/v1',
    ),
    transport: transport ?? FakeMultipartTransport(),
  );
}

/// 构造后端 `{code, message, data}` 信封响应
http.Response envelopeResponse(Object? data, {int status = 200}) {
  return http.Response(
    jsonEncode({'code': status, 'message': 'success', 'data': data}),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}
