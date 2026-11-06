import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';
import 'package:worktodo_app/features/axis/data/axis_fold.dart';
import 'package:worktodo_app/features/axis/state/axis_controller.dart';

import 'axis_test_harness.dart';

http.Response _ok(dynamic data) => http.Response(
      jsonEncode({'code': 200, 'message': 'success', 'data': data}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// 默认树：根 101（王宁）→ 102（林悦，用户 11 自己）；根 104、103。
MockClient _mock() => MockClient((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      final match = RegExp(r'^/projects/(\d+)').firstMatch(path);
      final pid = int.tryParse(match?.group(1) ?? '') ?? 1;
      if (path.endsWith('/tree')) {
        return _ok({'project_id': pid, 'nodes': AxisTestHarness.defaultTree()});
      }
      if (path.endsWith('/members')) return _ok(AxisTestHarness.membersPayload());
      if (path.endsWith('/my-permissions')) {
        return _ok(AxisTestHarness.defaultPermissions(isPm: false));
      }
      if (path == '/projects/$pid') {
        return _ok(AxisTestHarness.projectJson(id: pid));
      }
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置: $path', 'data': null}),
        404,
      );
    });

AxisController _build({
  int userId = AxisTestHarness.memberUserId,
  int projectId = 1,
  Future<SharedPreferences> Function()? loader,
}) =>
    AxisController(
      api: AxisApi(
        ApiClient(
          tokenStorage: InMemoryTokenStorage(access: 'token'),
          httpClient: _mock(),
          baseUrl: 'http://localhost:8010/api/v1',
        ),
      ),
      projectId: projectId,
      currentUserId: userId,
      prefsLoader: loader,
    );

/// 等异步的写入落地。
Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('拉出集合按“用户 id + 项目 id”存本机，换用户、换项目互不影响', () async {
    final a = _build();
    await a.load();
    a.pullToAxis(102);
    await _settle();
    expect(a.pulledIds, {102});
    final prefs = await SharedPreferences.getInstance();
    expect(jsonDecode(prefs.getString('axis_pulled_11_1')!), [102]);

    // 同用户同项目：新控制器读回。
    final again = _build();
    await again.load();
    expect(again.pulledIds, {102});

    // 另一个用户、另一个项目：都是空。
    final other = _build(userId: 99);
    await other.load();
    expect(other.pulledIds, isEmpty);
    final otherProject = _build(projectId: 2);
    await otherProject.load();
    expect(otherProject.pulledIds, isEmpty);

    // 切项目：清空展开行与拉出集合，回来时再恢复。
    a.togglePersonRow(104);
    await a.switchProject(2);
    expect(a.pulledIds, isEmpty);
    expect(a.expandedRowIds, isEmpty);
    await a.switchProject(1);
    expect(a.pulledIds, {102});
    for (final c in [a, again, other, otherProject]) {
      c.dispose();
    }
  });

  test('读写失败不崩，当前会话内拉出仍然生效；内容损坏按没有处理', () async {
    final failing = _build(loader: () async => throw StateError('存储不可用'));
    await failing.load();
    expect(failing.error, isNull);
    failing.pullToAxis(102);
    await _settle();
    expect(failing.pulledIds, {102});
    failing.dispose();

    SharedPreferences.setMockInitialValues({'axis_pulled_11_1': '不是 json'});
    final broken = _build();
    await broken.load();
    expect(broken.error, isNull);
    expect(broken.pulledIds, isEmpty);
    broken.dispose();
  });

  test('失效 id 不报错、不主动写回', () async {
    SharedPreferences.setMockInitialValues({'axis_pulled_11_1': '[102, 999]'});
    final c = _build();
    await c.load();
    expect(c.pulledIds, {102, 999});
    // 999 已不存在，102 的父级 101 是根：上轴人员只含有效项。
    expect(
      axisMemberIds(c.nodes, c.foldSpec),
      {101, 102, 103, 104},
    );
    await _settle();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('axis_pulled_11_1'), '[102, 999]');
    c.dispose();
  });

  test('revealPerson：把所有上级拉出并保存，再展开他这一行', () async {
    // 用户 11 的节点是 102（父 101 为根）；单独造一个更深的场景用 104/103 无下属，
    // 所以这里验证 102：本人是 101 的下属，需展开行；上级是根，不进拉出集合。
    final c = _build();
    await c.load();
    c.revealPerson(102);
    await _settle();
    expect(c.pulledIds, isEmpty);
    expect(c.expandedRowIds, {102});

    // 隐藏该组后定位，会重新显示。
    c.toggleStack(101);
    expect(c.hiddenStackIds, {101});
    c.togglePersonRow(102);
    c.revealPerson(102);
    expect(c.hiddenStackIds, isEmpty);
    expect(c.expandedRowIds, {102});

    // 已上轴的人不再展开。
    c.pullToAxis(102);
    c.revealPerson(102);
    expect(c.expandedRowIds, isEmpty);
    // 不存在的人忽略。
    c.revealPerson(12345);
    expect(c.pulledIds, {102});
    c.dispose();
  });

  test('resetFold 清空拉出集合与展开行并写回；pullAll / return 行为正确', () async {
    final c = _build();
    await c.load();
    c.pullAllToAxis();
    await _settle();
    expect(c.pulledIds, {102});
    c.togglePersonRow(104);
    expect(c.expandedRowIds, {104});

    c.returnFromAxis(102);
    expect(c.pulledIds, isEmpty);
    c.pullToAxis(102);

    c.resetFold();
    await _settle();
    expect(c.pulledIds, isEmpty);
    expect(c.expandedRowIds, isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(jsonDecode(prefs.getString('axis_pulled_11_1')!), isEmpty);
    c.dispose();
  });
}
