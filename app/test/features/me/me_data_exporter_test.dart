import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/me/data/me_api.dart';
import 'package:worktodo_app/features/me/services/me_data_exporter.dart';

void main() {
  const personalData = {
    'user': {'id': 11, 'nickname': '测试用户'},
    'tasks': [
      {'id': 42, 'title': '保存我的任务'}
    ]
  };

  test('WR-28 导出带凭据且401后续期下载当前用户数据', () async {
    final requests = <http.Request>[];
    final client = ApiClient(
      baseUrl: 'https://example.test/api/v1',
      tokenStorage: InMemoryTokenStorage(access: 'old', refresh: 'refresh'),
      httpClient: MockClient((request) async {
        requests.add(request);
        if (request.url.path == '/api/v1/auth/refresh') {
          return http.Response(
              jsonEncode({
                'data': {'access_token': 'new'}
              }),
              200);
        }
        expect(request.url.toString(),
            'https://example.test/api/v1/users/me/export');
        if (request.headers['Authorization'] == 'Bearer old') {
          return http.Response('', 401);
        }
        expect(request.headers['Authorization'], 'Bearer new');
        return http.Response(
            jsonEncode({'code': 200, 'data': personalData}), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );
    expect(await MeApi(client).exportMyData(), personalData);
    expect(requests.length, 3);
  });

  test('WR-28 导出不把错误信封当作个人数据保存', () async {
    final client = ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: MockClient((_) async =>
          http.Response('{"data":{"message":"not an export"}}', 200)),
    );
    await expectLater(
        MeApi(client).exportMyData(), throwsA(isA<ApiException>()));
  });

  for (final status in [
    ShareResultStatus.success,
    ShareResultStatus.dismissed
  ]) {
    test('WR-28 文件写入真实JSON并提供系统分享，结果$status显示保存位置', () async {
      final directory =
          await Directory.systemTemp.createTemp('worktodo-export-test-');
      addTearDown(() => directory.delete(recursive: true));
      String? exportedPath;
      final exporter = MeDataExporter(
          directory: () async => directory,
          share: (params) async {
            expect(params.files, hasLength(1));
            exportedPath = params.files!.single.path;
            expect(jsonDecode(await File(exportedPath!).readAsString()),
                personalData);
            expect(params.files!.single.mimeType, 'application/json');
            return ShareResult('', status);
          });
      final result = await exporter.saveAndShare(personalData);
      expect(result, contains(exportedPath));
      expect(result,
          contains(status == ShareResultStatus.dismissed ? '已取消分享' : '下载目录'));
    });
  }

  test('WR-28 系统分享失败仍告知已经写入的文件位置', () async {
    final directory =
        await Directory.systemTemp.createTemp('worktodo-export-test-');
    addTearDown(() => directory.delete(recursive: true));
    final exporter = MeDataExporter(
        directory: () async => directory,
        share: (_) async => throw StateError('unavailable'));
    await expectLater(
        exporter.saveAndShare(personalData),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', contains('文件已保存到应用目录'))));
    final files = await Directory('${directory.path}/exports').list().toList();
    expect(
        jsonDecode(await File(files.single.path).readAsString()), personalData);
  });
}
