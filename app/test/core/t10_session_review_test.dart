import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/evidence/data/evidence_api.dart';
import 'package:worktodo_app/features/evidence/data/multipart_transport.dart';
import 'package:worktodo_app/features/evidence/models/evidence_models.dart';

class DelayedTransport implements MultipartTransport {
  final response = Completer<MultipartResult>();
  final started = Completer<void>();
  int sends = 0;
  @override
  Future<MultipartResult> send(MultipartPayload payload,
      {required String baseUrl,
      required Map<String, String> headers,
      void Function(double)? onProgress,
      Duration timeout = const Duration(seconds: 60)}) {
    sends++;
    if (!started.isCompleted) started.complete();
    return response.future;
  }
}

void main() {
  for (final raw in [true, false]) {
    test('account switch cancels old ${raw ? "upload" : "JSON"} retry',
        () async {
      final started = Completer<void>();
      final response = Completer<http.Response>();
      var sends = 0;
      var expired = 0;
      final tokens = InMemoryTokenStorage(access: 'A', refresh: 'refresh-A');
      final api = ApiClient(
        tokenStorage: tokens,
        onAuthExpired: () => expired++,
        httpClient: MockClient((request) async {
          sends++;
          if (sends == 1) {
            started.complete();
            return response.future;
          }
          return http.Response('{"access_token":"unexpected"}', 200);
        }),
      );
      final pending = raw
          ? api.postMultipart('/users/me/avatar', bytes: [1], filename: 'a.png')
          : api.post('/tasks', body: {'title': 'A'});
      final assertion = expectLater(pending, throwsA(isA<AuthException>()));
      await started.future;
      await tokens.clear();
      await tokens.save(access: 'B', refresh: 'refresh-B');
      response.complete(http.Response('{}', 401));
      await assertion;
      expect(sends, 1);
      expect(tokens.accessToken, 'B');
      expect(expired, 0);
    });
  }

  test('refresh response cannot overwrite a newer login', () async {
    final refreshing = Completer<void>();
    final response = Completer<http.Response>();
    final tokens = InMemoryTokenStorage(access: 'A', refresh: 'refresh-A');
    final api = ApiClient(
      tokenStorage: tokens,
      httpClient: MockClient((_) async {
        refreshing.complete();
        return response.future;
      }),
    );
    final assertion =
        expectLater(api.refreshSession(), throwsA(isA<AuthException>()));
    await refreshing.future;
    await tokens.clear();
    await tokens.save(access: 'B', refresh: 'refresh-B');
    response.complete(http.Response('{"access_token":"rotated-A"}', 200));
    await assertion;
    expect(tokens.accessToken, 'B');
    expect(tokens.refreshToken, 'refresh-B');
  });

  for (final status in [500, 503]) {
    test('temporary refresh $status preserves credentials', () async {
      final tokens = InMemoryTokenStorage(access: 'A', refresh: 'refresh-A');
      var expired = 0;
      final api = ApiClient(
        tokenStorage: tokens,
        onAuthExpired: () => expired++,
        httpClient: MockClient((request) async => http.Response(
            '{}', request.url.path.endsWith('/auth/refresh') ? status : 401)),
      );
      await expectLater(api.postMultipart('/files', bytes: [1], filename: 'a'),
          throwsA(isA<NetworkException>()));
      expect(tokens.accessToken, 'A');
      expect(tokens.refreshToken, 'refresh-A');
      expect(expired, 0);
    });
  }

  test('refresh timeout preserves credentials', () async {
    final tokens = InMemoryTokenStorage(access: 'A', refresh: 'refresh-A');
    final api = ApiClient(
      tokenStorage: tokens,
      timeout: const Duration(milliseconds: 10),
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        return http.Response('{}', 401);
      }),
    );
    await expectLater(api.postMultipart('/files', bytes: [1], filename: 'a'),
        throwsA(isA<NetworkException>()));
    expect(tokens.refreshToken, 'refresh-A');
  });

  for (final switchAccount in [true, false]) {
    test('evidence upload protects session, switch=$switchAccount', () async {
      final tokens = InMemoryTokenStorage(access: 'A', refresh: 'refresh-A');
      final api = ApiClient(
        tokenStorage: tokens,
        httpClient: MockClient((_) async => http.Response('{}', 503)),
      );
      final transport = DelayedTransport();
      final evidence = EvidenceApi(api, transport: transport);
      final pending = evidence.uploadFile(
          file: const PickedAttachment(
              bytes: [1], name: 'a', mimeType: 'application/octet-stream'),
          companyId: 1,
          projectId: 1);
      final assertion = expectLater(
          pending,
          throwsA(
              switchAccount ? isA<AuthException>() : isA<NetworkException>()));
      await transport.started.future;
      if (switchAccount) {
        await tokens.clear();
        await tokens.save(access: 'B', refresh: 'refresh-B');
      }
      transport.response
          .complete(const MultipartResult(statusCode: 401, bodyBytes: []));
      await assertion;
      expect(transport.sends, 1);
      expect(tokens.accessToken, switchAccount ? 'B' : 'A');
    });
  }
}
