import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
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
            edgeStyle: controller.edgeStyle,
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

  setUp(() {
    // 加载时会读取连线线型偏好；没有这个模拟，testWidgets 里的平台通道永远等不到响应。
    SharedPreferences.setMockInitialValues({});
    // 画布连线有持续的流动动画；这些用例按“减少动态效果”渲染，
    // 否则 pumpAndSettle 永远等不到静止，截图也会随动画帧漂移。
    final dispatcher = TestWidgetsFlutterBinding.instance.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
      disableAnimations: true,
    );
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
  });

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

  group('连线线型偏好', () {
    MockClient treeMock() => MockClient((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      if (path == '/projects/1/tree') {
        return ok({'project_id': 1, 'nodes': AxisTestHarness.defaultTree()});
      }
      if (path == '/projects/1/members') {
        return ok(AxisTestHarness.membersPayload());
      }
      if (path == '/projects/1/my-permissions') {
        return ok(AxisTestHarness.defaultPermissions(isPm: false));
      }
      if (path == '/projects/1') return ok(AxisTestHarness.projectJson());
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置: $path', 'data': null}),
        404,
      );
    });

    AxisController build({Future<SharedPreferences> Function()? loader}) =>
        AxisController(
          api: AxisApi(_client(treeMock())),
          projectId: 1,
          currentUserId: AxisTestHarness.memberUserId,
          prefsLoader: loader,
        );

    test('默认曲线；切到直线后写入偏好，新控制器加载时读回', () async {
      SharedPreferences.setMockInitialValues({});
      final first = build();
      await first.load();
      expect(first.edgeStyle, AxisEdgeStyle.curve);

      first.setEdgeStyle(AxisEdgeStyle.straight);
      expect(first.edgeStyle, AxisEdgeStyle.straight);
      await Future<void>.delayed(Duration.zero);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(AxisController.edgeStyleKey), 'straight');
      first.dispose();

      final second = build();
      expect(second.edgeStyle, AxisEdgeStyle.curve, reason: '加载前还是默认值');
      await second.load();
      expect(second.edgeStyle, AxisEdgeStyle.straight);
      second.dispose();
    });

    test('偏好里是无效值时回退为曲线', () async {
      SharedPreferences.setMockInitialValues({
        AxisController.edgeStyleKey: 'zigzag',
      });
      final controller = build();
      await controller.load();
      expect(controller.edgeStyle, AxisEdgeStyle.curve);
      controller.dispose();
    });

    test('读取偏好失败：默认曲线、不崩，人轴照常加载', () async {
      final controller = build(
        loader: () async => throw Exception('存储不可用'),
      );
      await controller.load();
      expect(controller.error, isNull);
      expect(controller.nodes, isNotEmpty);
      expect(controller.edgeStyle, AxisEdgeStyle.curve);
      controller.dispose();
    });

    test('写入偏好失败：当前会话仍切换成功、不抛错', () async {
      final controller = build(
        loader: () async => throw Exception('存储不可用'),
      );
      await controller.load();
      controller.setEdgeStyle(AxisEdgeStyle.straight);
      await Future<void>.delayed(Duration.zero);
      expect(controller.edgeStyle, AxisEdgeStyle.straight);
      controller.dispose();
    });
  });
}
