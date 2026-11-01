import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';
import 'package:worktodo_app/features/axis/state/axis_controller.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';

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

ApiClient _client(MockClient mock) => ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: mock,
      baseUrl: 'http://localhost:8010/api/v1',
    );

/// 只挂画布，等价于项目全貌页把控制器状态喂给 [AxisCanvas] 的方式。
Widget _canvasHost(AxisController controller) {
  return AnimatedBuilder(
    animation: controller,
    builder: (context, _) => MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 1100,
          height: 1400,
          child: AxisCanvas(
            nodes: controller.visibleNodes,
            orientation: controller.orientation,
            spacing: controller.spacing,
            sort: controller.sort,
            offsets: {
              for (final node in controller.visibleNodes)
                node.id: controller.offsetFor(node.id),
            },
            finalOwnerAlongDelta:
                controller.project?.finalOwnerAlongDelta ?? 0,
            resetLayout: controller.resetLayoutRequested,
            onLayoutChanged: (node, offset) =>
                controller.saveLayout(node.id, offset),
          ),
        ),
      ),
    ),
  );
}

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

  testWidgets('重置布局后再次拖动保存，画布仍按 (40, 60) 显示', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final mock = MockClient((request) async {
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
      if (path == '/nodes/101/layout') {
        return ok({'offset_x': 40, 'offset_y': 60});
      }
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置: $path', 'data': null}),
        404,
      );
    });
    final controller = AxisController(
      api: AxisApi(_client(mock)),
      projectId: 1,
      currentUserId: AxisTestHarness.memberUserId,
    );
    await controller.load();
    await tester.pumpWidget(_canvasHost(controller));
    await tester.pumpAndSettle();

    final card = find.byKey(const Key('axis-person-101'));
    final before = tester.getTopLeft(card);

    controller.resetLayout();
    await tester.pumpAndSettle();
    expect(controller.offsetFor(101), Offset.zero);
    expect(tester.getTopLeft(card), before);

    await tester.drag(card, const Offset(40, 60));
    await tester.pumpAndSettle();

    expect(controller.offsetFor(101).dx, closeTo(40, 1));
    expect(controller.offsetFor(101).dy, closeTo(60, 1));
    final after = tester.getTopLeft(card);
    expect(
      after.dx - before.dx,
      closeTo(40, 1),
      reason: '重置后保存成功的偏移必须照常画出来',
    );
    expect(after.dy - before.dy, closeTo(60, 1));
    controller.dispose();
  });

  group('项目切换期间的终责位置保存结果', () {
    MockClient buildMock(Completer<http.Response> delayed) {
      return MockClient((request) async {
        final path = request.url.path.replaceFirst('/api/v1', '');
        if (path == '/projects/1/final-owner-position') return delayed.future;
        if (path == '/projects/1/tree') {
          return ok({
            'project_id': 1,
            'nodes': AxisTestHarness.defaultTree(),
          });
        }
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
          return ok(AxisTestHarness.defaultPermissions(isPm: true));
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
    }

    test('成功回调不得把项目 A 的项目信息写回项目 B', () async {
      final delayed = Completer<http.Response>();
      final controller = AxisController(
        api: AxisApi(_client(buildMock(delayed))),
        projectId: 1,
        currentUserId: AxisTestHarness.pmUserId,
      );
      await controller.load();

      final saving = controller.saveFinalOwnerDelta(120);
      await Future<void>.delayed(Duration.zero);
      await controller.switchProject(2);
      expect(controller.projectId, 2);
      expect(controller.project?.id, 2);

      delayed.complete(ok({'project_id': 1, 'final_owner_along_delta': 120}));
      await saving;

      expect(controller.projectId, 2);
      expect(controller.project?.id, 2);
      expect(controller.project?.name, '第二个项目');
      expect(controller.project?.finalOwnerAlongDelta, 0);
      controller.dispose();
    });

    test('失败回滚同样不得把项目 A 的位置写回项目 B', () async {
      final delayed = Completer<http.Response>();
      final controller = AxisController(
        api: AxisApi(_client(buildMock(delayed))),
        projectId: 1,
        currentUserId: AxisTestHarness.pmUserId,
      );
      await controller.load();

      final saving = controller.saveFinalOwnerDelta(120);
      await Future<void>.delayed(Duration.zero);
      await controller.switchProject(2);

      delayed.complete(http.Response(
        jsonEncode({'code': 500, 'message': '保存失败', 'data': null}),
        500,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ));
      // 已切走项目的失败不再冒泡到新项目页面。
      await saving;

      expect(controller.projectId, 2);
      expect(controller.project?.id, 2);
      expect(controller.project?.name, '第二个项目');
      expect(controller.project?.finalOwnerAlongDelta, 0);
      controller.dispose();
    });
  });
}
