import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';
import 'package:worktodo_app/features/axis/state/axis_controller.dart';

import 'axis_test_harness.dart';

Map<String, dynamic> envelope(dynamic data) => {
      'code': 200,
      'message': 'success',
      'data': data,
    };

http.Response ok(dynamic data) => http.Response(
      jsonEncode(envelope(data)),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('切换项目后，旧项目迟到的加载结果不得写回新项目', () async {
    final delayedTree = Completer<http.Response>();
    final client = MockClient((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      if (path == '/projects/1/tree') return delayedTree.future;
      if (path == '/projects/2/tree') {
        return ok({
          'project_id': 2,
          'nodes': [
            AxisTestHarness.personNode(
              id: 301,
              parentId: null,
              name: '周然',
              role: '第二个项目负责人',
              department: '项目部',
              userId: 20,
            )
          ],
        });
      }
      if (path == '/projects/1/members' || path == '/projects/2/members') {
        return ok(AxisTestHarness.membersPayload());
      }
      if (path == '/projects/1/my-permissions' ||
          path == '/projects/2/my-permissions') {
        return ok(AxisTestHarness.defaultPermissions(isPm: false));
      }
      if (path == '/projects/1') return ok(AxisTestHarness.projectJson());
      if (path == '/projects/2') {
        return ok(AxisTestHarness.projectJson(id: 2, name: '第二个项目'));
      }
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置: $path', 'data': null}),
        404,
      );
    });

    final api = ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: client,
      baseUrl: 'http://localhost:8010/api/v1',
    );
    final controller = AxisController(
      api: AxisApi(api),
      projectId: 1,
      currentUserId: AxisTestHarness.memberUserId,
    );

    final firstLoad = controller.load();
    await Future<void>.delayed(Duration.zero);
    await controller.switchProject(2);
    expect(controller.projectId, 2);
    expect(controller.nodes.single.id, 301);

    // 旧项目的请求现在才返回。
    delayedTree.complete(ok({
      'project_id': 1,
      'nodes': AxisTestHarness.defaultTree(),
    }));
    await firstLoad;

    expect(controller.projectId, 2);
    expect(controller.nodes.single.id, 301);
    expect(controller.error, isNull);
    controller.dispose();
  });

  test('保存卡片位置失败时回滚本地偏移并抛出错误', () async {
    final client = MockClient((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      if (path == '/projects/1/tree') {
        return ok({
          'project_id': 1,
          'nodes': AxisTestHarness.defaultTree(),
        });
      }
      if (path == '/projects/1/members') {
        return ok(AxisTestHarness.membersPayload());
      }
      if (path == '/projects/1/my-permissions') {
        return ok(AxisTestHarness.defaultPermissions(isPm: false));
      }
      if (path == '/projects/1') return ok(AxisTestHarness.projectJson());
      if (path == '/nodes/102/layout') {
        return http.Response(
          jsonEncode({'code': 500, 'message': '布局保存失败', 'data': null}),
          500,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置: $path', 'data': null}),
        404,
      );
    });

    final api = ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: client,
      baseUrl: 'http://localhost:8010/api/v1',
    );
    final controller = AxisController(
      api: AxisApi(api),
      projectId: 1,
      currentUserId: AxisTestHarness.memberUserId,
    );
    await controller.load();
    expect(controller.offsetFor(102), Offset.zero);

    await expectLater(
      controller.saveLayout(102, const Offset(40, 60)),
      throwsA(isA<Exception>()),
    );
    expect(controller.offsetFor(102), Offset.zero);
    controller.dispose();
  });
}
