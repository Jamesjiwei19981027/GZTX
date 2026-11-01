import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_delegations_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_edit_responsibility_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';

import '../../helpers/golden_test_helper.dart';
import 'axis_test_harness.dart';

/// T04 人轴各页面 iOS / 安卓双平台截图基准。
///
/// 本地生成：`flutter test test/features/axis/axis_golden_test.dart --update-goldens`
/// CI 默认 `--exclude-tags golden` 跳过。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    '人轴根页（我的职责）双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisRootScreen(api: harness.api, authState: harness.authState),
        goldenFileNamePrefix: 'axis_root_mine',
      );
    },
  );

  testWidgets(
    '人轴根页（项目全貌画布）双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisRootScreen(
          api: harness.api,
          authState: harness.authState,
          initialTab: AxisViewTab.overview,
        ),
        goldenFileNamePrefix: 'axis_root_overview',
      );
    },
  );

  testWidgets(
    '人员详情双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisNodeDetailScreen(
          nodeId: 102,
          projectId: AxisTestHarness.projectId,
          api: harness.api,
        ),
        goldenFileNamePrefix: 'axis_person_detail',
      );
    },
  );

  testWidgets(
    '编辑人员职责双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisEditResponsibilityScreen(
          personId: 102,
          projectId: AxisTestHarness.projectId,
          api: harness.api,
        ),
        goldenFileNamePrefix: 'axis_edit_responsibility',
      );
    },
  );

  testWidgets(
    '进度与记录双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisProgressScreen(nodeId: 102, api: harness.api),
        goldenFileNamePrefix: 'axis_progress',
      );
    },
  );

  testWidgets(
    '委托授权双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create(isPm: true);
      harness.helper.whenGet(
        '/delegations',
        AxisTestHarness.delegationsPayload(),
        query: {
          'company_id': '1',
          'project_id': '${AxisTestHarness.projectId}',
        },
      );
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisDelegationsScreen(
          api: harness.api,
          authState: harness.authState,
        ),
        goldenFileNamePrefix: 'axis_delegations',
      );
    },
  );

  testWidgets(
    'AI 责任链审计双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await AxisTestHarness.create();
      harness.helper.whenPost(
        '/projects/${AxisTestHarness.projectId}/axis-audit',
        AxisTestHarness.auditPayload(),
      );
      await testAdaptiveGolden(
        tester: tester,
        widget: AxisAuditScreen(
          api: harness.api,
          authState: harness.authState,
        ),
        goldenFileNamePrefix: 'axis_audit',
      );
    },
  );
}
