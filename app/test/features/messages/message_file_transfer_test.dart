import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/messages/data/message_file_transfer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  PickedMessageFile file() => PickedMessageFile(
        name: '需求说明.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List.fromList(utf8.encode('pdf-bytes')),
      );

  ApiClient api() => ApiClient(
        tokenStorage: InMemoryTokenStorage(access: 'test-token'),
        baseUrl: 'http://localhost:8010/api/v1',
      );

  test('频道文件上传：路径、鉴权头与 multipart 报文正确，返回文件编号', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'code': 200,
          'message': 'success',
          'data': {'id': 301, 'original_name': '需求说明.pdf', 'size_bytes': 9},
        }),
        201,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final uploader =
        ApiMessageFileUploader(api: api(), httpClient: client);
    final id = await uploader.upload(
      scopeType: 'channel',
      scopeId: 5,
      file: file(),
    );

    expect(id, 301);
    expect(captured!.url.path, '/api/v1/channels/5/files');
    expect(captured!.headers['Authorization'], 'Bearer test-token');
    expect(
      captured!.headers['Content-Type'],
      startsWith('multipart/form-data; boundary='),
    );
    expect(captured!.body, contains('name="file"'));
    expect(captured!.body, contains('filename="需求说明.pdf"'));
    expect(captured!.body, contains('pdf-bytes'));
  });

  test('私聊文件上传走会话路径', () async {
    String? path;
    final client = MockClient((request) async {
      path = request.url.path;
      return http.Response(
        jsonEncode({
          'code': 200,
          'data': {'id': 302},
        }),
        201,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final uploader =
        ApiMessageFileUploader(api: api(), httpClient: client);
    expect(
      await uploader.upload(
        scopeType: 'conversation',
        scopeId: 55,
        file: file(),
      ),
      302,
    );
    expect(path, '/api/v1/conversations/55/files');
  });

  test('上传失败把后端原因抛成可读异常', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({'detail': 'unsupported collaboration file type'}),
        415,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final uploader =
        ApiMessageFileUploader(api: api(), httpClient: client);

    await expectLater(
      uploader.upload(scopeType: 'channel', scopeId: 5, file: file()),
      throwsA(
        isA<ApiException>().having(
          (e) => e.statusCode,
          'statusCode',
          415,
        ),
      ),
    );
  });

  test('上传结果缺少文件编号时明确报错', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({'code': 200, 'data': <String, dynamic>{}}),
        201,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final uploader =
        ApiMessageFileUploader(api: api(), httpClient: client);

    await expectLater(
      uploader.upload(scopeType: 'channel', scopeId: 5, file: file()),
      throwsA(isA<ApiException>()),
    );
  });

  test('访问令牌过期但刷新令牌有效时，续期后重试一次并上传成功', () async {
    final storage = InMemoryTokenStorage(
      access: 'expired-token',
      refresh: 'refresh-1',
    );
    final authHeaders = <String?>[];
    var refreshCalls = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/api/v1/auth/refresh') {
        refreshCalls++;
        expect(jsonDecode(request.body), {'refresh_token': 'refresh-1'});
        return http.Response(
          jsonEncode({
            'code': 200,
            'data': {'access_token': 'new-token', 'refresh_token': 'refresh-2'},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      authHeaders.add(request.headers['Authorization']);
      if (request.headers['Authorization'] == 'Bearer new-token') {
        return http.Response(
          jsonEncode({
            'code': 200,
            'data': {'id': 301},
          }),
          201,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({'code': 401, 'message': '访问令牌已过期'}),
        401,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final uploader = ApiMessageFileUploader(
      api: ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://localhost:8010/api/v1',
      ),
      httpClient: client,
    );

    expect(
      await uploader.upload(scopeType: 'channel', scopeId: 5, file: file()),
      301,
    );
    expect(refreshCalls, 1, reason: '401 后只续期一次');
    expect(authHeaders, ['Bearer expired-token', 'Bearer new-token']);
    expect(storage.accessToken, 'new-token');
    expect(storage.refreshToken, 'refresh-2', reason: '刷新令牌轮换后要保存');
  });

  test('续期被拒时清空凭证并触发登录过期处理，不循环重试', () async {
    final storage = InMemoryTokenStorage(
      access: 'expired-token',
      refresh: 'refresh-1',
    );
    var expired = 0;
    var uploadCalls = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/api/v1/auth/refresh') {
        return http.Response(
          jsonEncode({'code': 401, 'message': '刷新令牌已失效'}),
          401,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      uploadCalls++;
      return http.Response(
        jsonEncode({'code': 401, 'message': '访问令牌已过期'}),
        401,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final uploader = ApiMessageFileUploader(
      api: ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://localhost:8010/api/v1',
        onAuthExpired: () => expired++,
      ),
      httpClient: client,
    );

    await expectLater(
      uploader.upload(scopeType: 'channel', scopeId: 5, file: file()),
      throwsA(isA<AuthException>()),
    );
    expect(uploadCalls, 1);
    expect(expired, 1);
    expect(storage.hasAccess, isFalse);
    expect(storage.refreshToken, isNull);
  });

  test('没有刷新令牌时直接按登录过期处理，不再重发上传', () async {
    final storage = InMemoryTokenStorage(access: 'expired-token');
    var expired = 0;
    var uploadCalls = 0;
    final client = MockClient((request) async {
      uploadCalls++;
      return http.Response(
        jsonEncode({'code': 401, 'message': '访问令牌已过期'}),
        401,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final uploader = ApiMessageFileUploader(
      api: ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://localhost:8010/api/v1',
        onAuthExpired: () => expired++,
      ),
      httpClient: client,
    );

    await expectLater(
      uploader.upload(scopeType: 'conversation', scopeId: 55, file: file()),
      throwsA(isA<AuthException>()),
    );
    expect(uploadCalls, 1);
    expect(expired, 1);
    expect(storage.hasAccess, isFalse);
  });

  test('未集成选择器时给出中文说明，不静默返回', () async {
    const picker = UnavailableMessageFilePicker();
    expect(picker.isAvailable, isFalse);
    await expectLater(
      picker.pickFile(),
      throwsA(
        isA<MessageFilePickerException>().having(
          (e) => e.message,
          'message',
          contains('当前安装包尚未集成系统文件选择组件'),
        ),
      ),
    );
  });
}
