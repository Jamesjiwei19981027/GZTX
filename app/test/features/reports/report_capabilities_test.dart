import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/reports/models/report_capabilities.dart';
import 'package:worktodo_app/features/reports/models/report_models.dart';
import 'package:worktodo_app/features/reports/services/report_draft_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('直属领导判定（resolveDirectSupervisor）', () {
    final members = [
      const ReportMember(userId: 11, displayName: '张三', role: 'member'),
      const ReportMember(userId: 20, displayName: '李四', role: 'pm'),
      const ReportMember(userId: 30, displayName: '王五', role: 'admin'),
    ];

    test('未指定直属领导（null 或 <= 0）时返回未指定状态', () {
      final res1 = resolveDirectSupervisor(
        members: members,
        currentUserId: 11,
        parentUserId: null,
      );
      expect(res1.isValid, isFalse);
      expect(res1.status, equals('unassigned'));
      expect(res1.isSelf, isFalse);
      expect(res1.name, equals('未指定直属领导'));
      expect(res1.role, equals('人轴关系待确定'));

      final res2 = resolveDirectSupervisor(
        members: members,
        currentUserId: 11,
        parentUserId: 0,
      );
      expect(res2.isValid, isFalse);
      expect(res2.status, equals('unassigned'));
    });

    test('直属领导是自己时判定为 invalid_self 并拒绝流转', () {
      final res = resolveDirectSupervisor(
        members: members,
        currentUserId: 11,
        parentUserId: 11,
      );
      expect(res.isValid, isFalse);
      expect(res.status, equals('invalid_self'));
      expect(res.isSelf, isTrue);
      expect(res.name, equals('直属领导不能是自己'));
      expect(res.role, equals('违反责任链原则'));
    });

    test('直属领导在项目成员列表中时成功解析对应成员姓名与角色', () {
      final res = resolveDirectSupervisor(
        members: members,
        currentUserId: 11,
        parentUserId: 20,
      );
      expect(res.isValid, isTrue);
      expect(res.status, equals('confirmed'));
      expect(res.isSelf, isFalse);
      expect(res.name, equals('李四'));
      expect(res.role, equals('项目负责人'));
    });

    test('直属领导不在项目成员列表中时安全回退展示编号', () {
      final res = resolveDirectSupervisor(
        members: members,
        currentUserId: 11,
        parentUserId: 99,
      );
      expect(res.isValid, isTrue);
      expect(res.status, equals('confirmed'));
      expect(res.isSelf, isFalse);
      expect(res.name, contains('99'));
      expect(res.role, equals('人轴直属领导'));
    });
  });

  group('AI 送达回执与处理状态解释器（getReportDeliveryStatus）', () {
    test('G01 规则：禁止虚构 AI 全绿节点，严格显示“状态暂不可确认”', () {
      const report = AgentReport(
        id: 1,
        status: 'submitted',
        summaryText: '工作汇报',
      );
      final status = getReportDeliveryStatus(report);
      expect(ReportDeliveryStatus.aiReceiptStatusText, equals('状态暂不可确认'));
      expect(
        ReportDeliveryStatus.aiReceiptDescription,
        equals('暂无独立 AI 处理回执，以直属领导与人轴状态为准'),
      );
      expect(status.submitted, isTrue);
      expect(status.leaderStatus, equals('已送达'));
      expect(status.leaderRead, isFalse);
      expect(status.rollupStatus, equals('等待汇总'));
    });

    test('未提交状态时领导送达为“未提交”', () {
      const report = AgentReport(
        id: 2,
        status: 'draft',
        summaryText: '草稿',
      );
      final status = getReportDeliveryStatus(report);
      expect(status.submitted, isFalse);
      expect(status.leaderStatus, equals('未提交'));
      expect(status.leaderRead, isFalse);
    });

    test('已读汇报展示“已读”', () {
      const report = AgentReport(
        id: 3,
        status: 'submitted',
        summaryText: '汇报内容',
        read: true,
        readAt: '2026-11-01T12:00:00Z',
      );
      final status = getReportDeliveryStatus(report);
      expect(status.leaderStatus, equals('已读'));
      expect(status.leaderRead, isTrue);
    });

    test('已聚合状态展示“已纳入项目汇总”', () {
      const report = AgentReport(
        id: 4,
        status: 'aggregated',
        summaryText: '已汇总汇报',
      );
      final status = getReportDeliveryStatus(report);
      expect(status.rollupStatus, equals('已纳入项目汇总'));
    });
  });

  group('本地草稿隔离存储（ReportDraftStore）', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('存储键严格遵循 wt_ai_report_draft_{userId}_{projectId}', () {
      final key = ReportDraftStore.buildKey(userId: 11, projectId: 10);
      expect(key, equals('wt_ai_report_draft_11_10'));
    });

    test('草稿按用户与项目严格隔离，不会跨项目串草稿', () async {
      final prefs = await SharedPreferences.getInstance();
      final store = ReportDraftStore(prefs: prefs);

      await store.save(
        userId: 11,
        projectId: 10,
        summary: '项目 10 的工作汇报草稿',
        draftReportId: 1001,
      );

      final draft10 = await store.load(userId: 11, projectId: 10);
      expect(draft10, isNotNull);
      expect(draft10!.summary, equals('项目 10 的工作汇报草稿'));
      expect(draft10.draftReportId, equals(1001));

      // 切换到项目 20：读取应为空
      final draft20 = await store.load(userId: 11, projectId: 20);
      expect(draft20, isNull);

      // 其他用户读取项目 10：读取应为空
      final draftOtherUser = await store.load(userId: 12, projectId: 10);
      expect(draftOtherUser, isNull);
    });

    test('写入空内容自动删除草稿', () async {
      final prefs = await SharedPreferences.getInstance();
      final store = ReportDraftStore(prefs: prefs);

      await store.save(userId: 11, projectId: 10, summary: '存在内容');
      expect(await store.load(userId: 11, projectId: 10), isNotNull);

      await store.save(userId: 11, projectId: 10, summary: '   ');
      expect(await store.load(userId: 11, projectId: 10), isNull);
    });

    test('clearForUser 清除该用户的全部项目草稿', () async {
      final prefs = await SharedPreferences.getInstance();
      final store = ReportDraftStore(prefs: prefs);

      await store.save(userId: 11, projectId: 10, summary: '草稿1');
      await store.save(userId: 11, projectId: 20, summary: '草稿2');
      await store.save(userId: 99, projectId: 10, summary: '用户99的草稿');

      await store.clearForUser(11);

      expect(await store.load(userId: 11, projectId: 10), isNull);
      expect(await store.load(userId: 11, projectId: 20), isNull);
      expect(await store.load(userId: 99, projectId: 10), isNotNull);
    });
  });

  group('冲突提取与检测（ReportConflict）', () {
    test('extractReportConflicts 从载荷中提取冲突列表', () {
      final payload = {
        'conflicts': [
          {
            'type': 'task_status_mismatch',
            'task_id': 15,
            'report_ids': [101, 102],
            'statuses': ['in_progress', 'done'],
            'severity': 'warning',
            'description': '任务 #15 状态分歧',
          },
        ],
      };
      final conflicts = extractReportConflicts(payload);
      expect(conflicts.length, equals(1));
      expect(conflicts.first.type, equals('task_status_mismatch'));
      expect(conflicts.first.typeLabel, equals('任务状态不一致'));
      expect(conflicts.first.taskId, equals(15));
      expect(conflicts.first.reportIds, equals([101, 102]));
      expect(conflicts.first.detail, contains('任务 #15 状态分歧'));
    });

    test('detectReportConflicts 推算同项目已提交汇报间的任务状态差异', () {
      const r1 = AgentReport(
        id: 1,
        status: 'submitted',
        summaryText: '汇报1',
        payloadJson: {
          'task_snapshot': [
            {'id': 10, 'title': '接口联调', 'status': 'done'},
          ],
        },
      );
      const r2 = AgentReport(
        id: 2,
        status: 'submitted',
        summaryText: '汇报2',
        payloadJson: {
          'task_snapshot': [
            {'id': 10, 'title': '接口联调', 'status': 'in_progress'},
          ],
        },
      );

      final conflicts = detectReportConflicts([r1, r2]);
      expect(conflicts.length, equals(1));
      expect(conflicts.first.taskId, equals(10));
      expect(conflicts.first.reportIds, equals([1, 2]));
      expect(conflicts.first.statuses, equals(['done', 'in_progress']));
    });
  });

  group('错误信息中文转换（reportErrorMessage）', () {
    test('网络异常与凭证异常返回中文提示', () {
      expect(
        reportErrorMessage(NetworkException('timeout')),
        contains('网络连接异常或请求超时'),
      );
      expect(
        reportErrorMessage(AuthException('登录已失效')),
        equals('登录已失效'),
      );
      expect(
        reportErrorMessage(ValidationException('参数错误', errors: {})),
        equals('参数错误'),
      );
    });

    test('后端业务枚举英文错误码翻译为中文', () {
      expect(
        reportErrorMessage(ApiException('member_agent_binding_not_found', statusCode: 422)),
        contains('尚未绑定项目汇报智能体'),
      );
      expect(
        reportErrorMessage(ApiException('summary_required', statusCode: 422)),
        contains('请填写工作事实'),
      );
      expect(
        reportErrorMessage(ApiException('report_sources_empty', statusCode: 422)),
        contains('暂无任务、进度、资料或对话输入'),
      );
      expect(
        reportErrorMessage(ApiException('llm_not_configured', statusCode: 422)),
        contains('未配置可用的 AI 模型'),
      );
    });

    test('HTTP 状态码 403/502 映射', () {
      expect(
        reportErrorMessage(ApiException('forbidden', statusCode: 403)),
        equals('没有操作权限或已不具备该项目权限'),
      );
      expect(
        reportErrorMessage(ApiException('bad gateway', statusCode: 502)),
        equals('AI 生成服务暂不可用，请稍后重试'),
      );
    });
  });

  group('接口缺口定义字典（REPORT_API_GAPS）', () {
    test('G01 至 G05 缺口定义完整且与网页版一致', () {
      expect(reportGapAiReceipt.code, equals('G01'));
      expect(reportGapDraftVersions.code, equals('G02'));
      expect(reportGapPublish.code, equals('G03'));
      expect(reportGapFollowup.code, equals('G04'));
      expect(reportGapVerification.code, equals('G05'));
    });
  });
}
