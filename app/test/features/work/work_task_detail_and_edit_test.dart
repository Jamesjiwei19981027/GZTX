import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/screens/work_task_detail_screen.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('WorkTaskDetailScreen', () {
    testWidgets('正常展示普通任务详情、属性、清单与排期历史展开', (tester) async {
      final harness = await WorkTestHarness.create();
      // 任务 101：重点财务复核任务，带 2 个子任务
      await tester.pumpWidget(harness.wrap(
        WorkTaskDetailScreen(taskId: 101, api: harness.api),
      ));
      await tester.pumpAndSettle();

      expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
      expect(find.text('待办'), findsOneWidget);
      expect(find.text('高优先级'), findsOneWidget);
      expect(find.text('核对收支明细账'), findsOneWidget);
      expect(find.text('核查大额发票真伪'), findsOneWidget);
      expect(find.text('编辑'), findsOneWidget);
      expect(find.text('完成'), findsOneWidget);
      expect(find.text('删除任务'), findsOneWidget);

      // 展开日程修改记录
      expect(find.text('查看日程修改记录'), findsOneWidget);
      await tester.tap(find.text('查看日程修改记录'));
      await tester.pumpAndSettle();

      expect(find.text('收起日程修改记录'), findsOneWidget);
      expect(find.textContaining('日程调整不会改写已提交的汇报'), findsOneWidget);
    });

    testWidgets('人轴责任链关联任务展示只读提示，隐藏编辑与勾选操作', (tester) async {
      final harness = await WorkTestHarness.create();
      // 任务 104：人轴只读锁定任务
      await tester.pumpWidget(harness.wrap(
        WorkTaskDetailScreen(taskId: 104, api: harness.api),
      ));
      await tester.pumpAndSettle();

      expect(find.text('人轴一期代码审查与架构验收'), findsOneWidget);
      expect(find.text('人轴责任链关联事项（只读）'), findsOneWidget);
      expect(find.textContaining('此任务由人轴事项节点同步生成'), findsOneWidget);
      expect(find.text('编辑'), findsNothing);
      expect(find.text('完成'), findsNothing);
      expect(find.text('删除任务'), findsNothing);
    });

    testWidgets('删除任务弹出二次确认弹窗并调用 deleteTask', (tester) async {
      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkTaskDetailScreen(taskId: 101, api: harness.api),
      ));
      await tester.pumpAndSettle();

      // 点击删除任务
      await tester.tap(find.text('删除任务'));
      await tester.pumpAndSettle();

      expect(find.text('放入回收站？'), findsOneWidget);
      expect(find.textContaining('任务将被移至回收站'), findsOneWidget);

      // 确认放入回收站
      final confirmBtn = find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('移至回收站'),
      );
      await tester.tap(confirmBtn);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 3));

      expect(harness.api.trash.any((t) => t.id == 101), isTrue);
    });
  });

  group('WorkTaskEditScreen', () {
    testWidgets('新建任务校验：标题为空报错拦截，输入后成功创建', (tester) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('新建任务'), findsOneWidget);

      // 标题为空直接保存
      final saveBtn = find.widgetWithText(AppButton, '创建任务');
      await tester.ensureVisible(saveBtn);
      await tester.tap(saveBtn);
      await tester.pumpAndSettle();

      expect(find.text('请输入任务标题'), findsAtLeastNWidgets(1));

      // 输入标题
      final titleField = find.byType(TextField).first;
      await tester.enterText(titleField, '原生端新增关键待办');
      await tester.pump();

      // 添加子任务
      final subtaskField = find.byType(TextField).last;
      await tester.enterText(subtaskField, '第一步：收集日志');
      await tester.tap(find.widgetWithText(AppButton, '添加'));
      await tester.pumpAndSettle();

      expect(find.text('第一步：收集日志'), findsOneWidget);

      // 再次点击保存
      await tester.ensureVisible(saveBtn);
      await tester.tap(saveBtn);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 3));

      expect(harness.api.tasks.any((t) => t.title == '原生端新增关键待办'), isTrue);
    });

    testWidgets('编辑任务正确预填数据并保存更新', (tester) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(
          taskId: 101,
          api: harness.api,
          authState: harness.authState,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('编辑任务'), findsOneWidget);
      expect(find.text('编制第三季度财务复核报告'), findsOneWidget);

      // 修改标题
      await tester.enterText(
        find.byType(TextField).first,
        '编制第三季度财务复核报告（终版）',
      );
      await tester.pump();

      // 保存
      final updateBtn = find.widgetWithText(AppButton, '确认更新任务');
      await tester.ensureVisible(updateBtn);
      await tester.tap(updateBtn);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 3));

      final updated = harness.api.tasks.firstWhere((t) => t.id == 101);
      expect(updated.title, '编制第三季度财务复核报告（终版）');
    });

    testWidgets('编辑页换了任务 ID 时重新加载新任务，旧任务的表单不会覆盖新任务', (tester) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await WorkTestHarness.create();
      harness.api.tasks.add(WorkTask.fromJson(buildTaskJson(
        id: 999,
        title: '全新任务999',
        category: {'id': 1, 'name': 'Work'},
      )));

      // 首次加载任务 101
      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(
          taskId: 101,
          api: harness.api,
          authState: harness.authState,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('编制第三季度财务复核报告'), findsOneWidget);

      // 切换组件的 taskId 为 999（模拟 GoRouter 复用 State）
      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(
          taskId: 999,
          api: harness.api,
          authState: harness.authState,
        ),
      ));
      await tester.pumpAndSettle();

      // 验证表单更新为新任务 999 的数据，不再保留旧任务 101 的数据
      expect(find.text('全新任务999'), findsOneWidget);
      expect(find.text('编制第三季度财务复核报告'), findsNothing);
    });

    testWidgets('重新打开编辑器并新增清单项时生成不重复的 ID，删除其中一项不会误删同名项', (tester) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await WorkTestHarness.create();
      // 任务已有清单项，且其 ID 为 new-1
      harness.api.tasks.add(WorkTask.fromJson(buildTaskJson(
        id: 777,
        title: '清单重复测试任务',
        checklist: [
          {'id': 'new-1', 'title': '已有第一项', 'completed': false},
        ],
      )));

      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(
          taskId: 777,
          api: harness.api,
          authState: harness.authState,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('已有第一项'), findsOneWidget);

      // 新增一个清单项
      final input = find.widgetWithText(AppTextField, '添加清单条目…');
      await tester.ensureVisible(input);
      await tester.enterText(input, '新增第二项');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();

      expect(find.text('已有第一项'), findsOneWidget);
      expect(find.text('新增第二项'), findsOneWidget);

      // 验证新添加项的 ID 不等于 new-1（应该是 new-2）
      final dynamic state = tester.state(find.byType(WorkTaskEditScreen));
      final items = state.checklist as List<ChecklistItem>;
      expect(items.length, 2);
      expect(items[0].id, 'new-1');
      expect(items[1].id, 'new-2');

      // 点击删除第一项的关闭按钮
      final closeBtns = find.byTooltip('删除清单项');
      expect(closeBtns, findsNWidgets(2));
      await tester.tap(closeBtns.first);
      await tester.pump();

      // 验证第一项被删除，第二项依然保留
      expect(find.text('已有第一项'), findsNothing);
      expect(find.text('新增第二项'), findsOneWidget);
    });

    testWidgets('编辑任务时从任务自身所属项目解析成员列表，不使用全局选中项目', (tester) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await WorkTestHarness.create();
      harness.authState.selectProject(const Project(id: 1, name: '项目一', companyId: 1));

      // 任务 555 属于项目 2
      harness.api.tasks.add(WorkTask.fromJson(buildTaskJson(
        id: 555,
        title: '属于项目二的任务',
        projectId: 2,
        origin: 'project_link',
      )));

      await tester.pumpWidget(harness.wrap(
        WorkTaskEditScreen(
          taskId: 555,
          api: harness.api,
          authState: harness.authState,
        ),
      ));
      await tester.pumpAndSettle();

      // 验证范围提示展示为【项目 #2】
      expect(find.textContaining('项目 #2'), findsOneWidget);
    });
  });
}
