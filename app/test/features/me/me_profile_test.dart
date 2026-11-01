import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/features/me/data/me_api.dart';
import 'package:worktodo_app/features/me/screens/me_profile_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('昵称为空时不提交保存并给出校验提示', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me', MeTestHarness.userJson);

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('me-profile-nickname')), '   ');
    await tester.tap(find.text('保存修改'));
    await tester.pumpAndSettle();

    expect(find.text('姓名/昵称不能为空'), findsOneWidget);
    expect(harness.hasRequest('PUT', '/users/me'), isFalse);
  });

  testWidgets('保存昵称提交 PUT /users/me 并提示成功', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me', {
      ...MeTestHarness.userJson,
      'nickname': '李四',
    });

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('me-profile-nickname')), '李四');
    await tester.tap(find.text('保存修改'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/users/me');
    expect((put.body as Map)['nickname'], '李四');
    expect(find.text('个人资料已保存'), findsOneWidget);
  });

  testWidgets('保存失败时显示可读的中文错误', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me', Exception('网络断开'));

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('me-profile-nickname')), '李四');
    await tester.tap(find.text('保存修改'));
    await tester.pumpAndSettle();

    expect(find.textContaining('网络连接异常'), findsOneWidget);
    expect(find.text('个人资料已保存'), findsNothing);
  });

  testWidgets('未接入选图能力时明确提示，不假装上传成功', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('更换头像'));
    await tester.pumpAndSettle();

    expect(find.textContaining('尚未接入选图能力'), findsOneWidget);
    expect(harness.hasRequest('POST', '/users/me/avatar'), isFalse);
  });

  testWidgets('注入选图后走真实 multipart 上传并回写 avatar_url', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me', {
      ...MeTestHarness.userJson,
      'avatar_url': '/api/v1/users/11/avatar',
    });

    http.Request? uploadRequest;
    final uploadClient = MockClient((request) async {
      uploadRequest = request;
      return http.Response(
        jsonEncode({
          'code': 200,
          'message': 'success',
          'data': {'avatar_url': '/api/v1/users/11/avatar'},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final api = MeApi(harness.authState.api, uploadClient: uploadClient);
    final bytes = Uint8List.fromList(List<int>.generate(64, (i) => i));

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(
        api: api,
        authState: harness.authState,
        pickImage: () async =>
            MePickedImage(bytes: bytes, filename: 'avatar.png'),
      )),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('更换头像'));
    await tester.pumpAndSettle();

    expect(uploadRequest, isNotNull);
    expect(uploadRequest!.url.path, endsWith('/users/me/avatar'));
    expect(
      uploadRequest!.headers['content-type'],
      startsWith('multipart/form-data'),
    );
    expect(uploadRequest!.body, contains('name="file"'));
    expect(uploadRequest!.body, contains('avatar.png'));

    final put = harness.lastRequest('PUT', '/users/me');
    expect((put.body as Map)['avatar_url'], '/api/v1/users/11/avatar');
    expect(find.text('头像已成功更新'), findsOneWidget);
  });

  testWidgets('选图格式不被后端接受时前端先拦截', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    http.Request? uploadRequest;
    final api = MeApi(
      harness.authState.api,
      uploadClient: MockClient((request) async {
        uploadRequest = request;
        return http.Response('{}', 200);
      }),
    );

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(
        api: api,
        authState: harness.authState,
        pickImage: () async => MePickedImage(
          bytes: Uint8List.fromList([1, 2, 3]),
          filename: 'resume.pdf',
        ),
      )),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('更换头像'));
    await tester.pumpAndSettle();

    expect(find.text('仅支持 JPG、PNG、GIF、WebP 格式头像'), findsOneWidget);
    expect(uploadRequest, isNull);
  });

  testWidgets('验证状态读取失败时页面仍可编辑，并提示失败原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenGet('/users/me/verification', '服务异常', statusCode: 500);

    await tester.pumpWidget(
      harness.wrap(MeProfileScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('验证状态读取失败'), findsOneWidget);
    expect(find.text('保存修改'), findsOneWidget);
  });
}
