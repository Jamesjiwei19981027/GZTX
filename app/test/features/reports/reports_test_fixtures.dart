import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/reports/data/reports_api.dart';
import 'package:worktodo_app/features/reports/services/report_draft_store.dart';

import '../../helpers/mock_api_client.dart';

/// T07 测试真实数据夹具与测试上下文包装。
///
/// 字段严格对齐后端 `backend/app/api/v1/reports.py` 真实返回结构。
class ReportsTestFixtures {
  static const int currentUserId = 11;
  static const int supervisorUserId = 20;
  static const int companyId = 1;
  static const int projectId = 10;
  static const int otherProjectId = 20;

  static const Map<String, dynamic> userJson = {
    'id': currentUserId,
    'username': 'e2e_user',
    'nickname': '测试下属',
    'email': 'e2e@example.com',
    'created_at': '2026-08-01T00:00:00Z',
  };

  static const Map<String, dynamic> supervisorJson = {
    'id': supervisorUserId,
    'username': 'manager_user',
    'nickname': '直属领导李四',
    'email': 'manager@example.com',
    'created_at': '2026-08-01T00:00:00Z',
  };

  static const Map<String, dynamic> companyJson = {
    'id': companyId,
    'name': '示例科技',
    'slug': 'demo',
    'status': 'active',
  };

  static const List<Map<String, dynamic>> projectsJson = [
    {
      'id': projectId,
      'company_id': companyId,
      'name': 'AI 协同平台',
      'key': 'AIC',
      'status': 'active',
    },
    {
      'id': otherProjectId,
      'company_id': companyId,
      'name': '移动重构项目',
      'key': 'MOB',
      'status': 'active',
    },
  ];

  static const List<Map<String, dynamic>> bindingsJson = [
    {
      'id': 101,
      'company_id': companyId,
      'project_id': projectId,
      'user_id': currentUserId,
      'agent_definition_id': 1,
      'role': 'member',
      'is_active': true,
      'context_scope': {'company_id': companyId, 'project_id': projectId},
    },
    {
      'id': 102,
      'company_id': companyId,
      'project_id': projectId,
      'user_id': supervisorUserId,
      'agent_definition_id': 2,
      'role': 'project',
      'is_active': true,
      'context_scope': {'company_id': companyId, 'project_id': projectId},
    },
  ];

  static const List<Map<String, dynamic>> project20BindingsJson = [
    {
      'id': 201,
      'company_id': companyId,
      'project_id': otherProjectId,
      'user_id': currentUserId,
      'agent_definition_id': 1,
      'role': 'member',
      'is_active': true,
      'context_scope': {'company_id': companyId, 'project_id': otherProjectId},
    },
    {
      'id': 202,
      'company_id': companyId,
      'project_id': otherProjectId,
      'user_id': supervisorUserId,
      'agent_definition_id': 2,
      'role': 'project',
      'is_active': true,
      'context_scope': {'company_id': companyId, 'project_id': otherProjectId},
    },
  ];

  static const List<Map<String, dynamic>> membersJson = [
    {
      'user_id': currentUserId,
      'display_name': '测试下属',
      'role': 'member',
      'left_at': null,
    },
    {
      'user_id': supervisorUserId,
      'display_name': '直属领导李四',
      'role': 'pm',
      'left_at': null,
    },
  ];

  static const Map<String, dynamic> submittedReportJson = {
    'id': 501,
    'report_id': 501,
    'project_id': projectId,
    'binding_id': 101,
    'author_user_id': currentUserId,
    'parent_user_id': supervisorUserId,
    'status': 'submitted',
    'summary_text': '【已完成】1. 完成 AI 汇报原生页面重写与双端测试\n\n【进行中】2. 配合人轴模块联调权限与直属领导流转',
    'summary': '【已完成】1. 完成 AI 汇报原生页面重写与双端测试\n\n【进行中】2. 配合人轴模块联调权限与直属领导流转',
    'content': '【已完成】1. 完成 AI 汇报原生页面重写与双端测试\n\n【进行中】2. 配合人轴模块联调权限与直属领导流转',
    'source_count': 2,
    'sources': [
      {
        'id': 1,
        'source_type': 'task',
        'source_id': 12,
        'excerpt': '完成汇报收件箱与审阅模块',
        'metadata': {'task_id': 12},
      },
      {
        'id': 2,
        'source_type': 'evidence',
        'source_id': 88,
        'excerpt': '提交自动化测试报告及截图',
        'metadata': {'evidence_id': 88},
      },
    ],
    'payload_json': {
      'task_snapshot': [
        {
          'id': 12,
          'title': '完成汇报收件箱与审阅模块',
          'status': 'done',
          'needs_follow_up': false,
        },
        {
          'id': 15,
          'title': '领导层汇报多企业聚合支持',
          'status': 'in_progress',
          'needs_follow_up': true,
          'comment': '需要总领导权限确认',
        },
      ],
      'evidence_snapshot': [
        {
          'id': 88,
          'summary': '提交自动化测试报告及截图',
          'status': 'verified',
          'files': [
            {'id': 1, 'name': 'report.pdf'},
          ],
        },
      ],
    },
    'read': true,
    'read_at': '2026-11-01T15:30:00Z',
    'created_at': '2026-11-01T14:00:00Z',
    'submitted_at': '2026-11-01T14:10:00Z',
  };

  static const Map<String, dynamic> unreadInboxReportJson = {
    'id': 502,
    'report_id': 502,
    'project_id': projectId,
    'binding_id': 101,
    'author_user_id': currentUserId,
    'parent_user_id': supervisorUserId,
    'status': 'submitted',
    'summary_text': '【已完成】下属张三提交的今日工作汇报：完成模块验收。',
    'summary': '【已完成】下属张三提交的今日工作汇报：完成模块验收。',
    'content': '【已完成】下属张三提交的今日工作汇报：完成模块验收。',
    'source_count': 1,
    'sources': [
      {
        'id': 3,
        'source_type': 'task',
        'source_id': 19,
        'excerpt': '完成代码审查',
        'metadata': {},
      },
    ],
    'payload_json': {},
    'read': false,
    'read_at': null,
    'created_at': '2026-11-01T16:00:00Z',
    'submitted_at': '2026-11-01T16:05:00Z',
  };

  static const Map<String, dynamic> draftReportJson = {
    'id': 503,
    'report_id': 503,
    'project_id': projectId,
    'binding_id': 101,
    'author_user_id': currentUserId,
    'parent_user_id': supervisorUserId,
    'status': 'draft',
    'summary_text': '【草稿】已基于当前项目任务生成：推进测试与文档补全。',
    'summary': '【草稿】已基于当前项目任务生成：推进测试与文档补全。',
    'content': '【草稿】已基于当前项目任务生成：推进测试与文档补全。',
    'source_count': 1,
    'sources': [
      {
        'id': 4,
        'source_type': 'tree_node',
        'source_id': 7,
        'excerpt': '人轴骨架节点',
        'metadata': {},
      },
    ],
    'payload_json': {},
    'read': false,
    'read_at': null,
    'created_at': '2026-11-01T17:00:00Z',
    'submitted_at': null,
  };

  static const Map<String, dynamic> projectAggregateJson = {
    'id': 601,
    'project_id': projectId,
    'status': 'aggregated',
    'summary_text': 'AI 协同平台本周期整体完成度 85%，核心汇报已逐级上报至项目管理者。',
    'report_ids': [501, 502],
    'source_count': 3,
    'payload_json': {
      'report_ids': [501, 502],
      'source_count': 3,
      'conflicts': [
        {
          'type': 'task_status_mismatch',
          'task_id': 15,
          'report_ids': [501, 502],
          'statuses': ['in_progress', 'done'],
          'severity': 'warning',
          'description': '任务 #15 在不同汇报中的完成状态存在分歧，请核实',
        },
      ],
    },
  };

  static const Map<String, dynamic> leadershipReportJson = {
    'id': 701,
    'company_id': companyId,
    'leader_user_id': currentUserId,
    'status': 'aggregated',
    'summary_text': '企业各项目汇总概览：AI 协同平台稳步交付，移动端重构测试全面通过。',
    'payload_json': {
      'project_summaries': [
        {
          'project_id': projectId,
          'project_name': 'AI 协同平台',
          'summary': 'AI 协同平台本周期整体完成度 85%',
        },
      ],
    },
    'created_at': '2026-11-01T18:00:00Z',
  };

  static const Map<String, dynamic> chatReplyJson = {
    'session_id': 888,
    'reply': '已为您记录今天的工作进展：“完成 AI 汇报页面重构与测试”。已归纳至汇报草稿中。',
    'channel': 'web',
    'tool_submit_evidence_allowed': false,
  };
}

/// T07 统一测试运行环境（包含登录态、MockApiClient、ReportsApi、本地草稿存储）。
class ReportsTestHarness {
  ReportsTestHarness._({
    required this.helper,
    required this.authState,
    required this.api,
    required this.draftStore,
    required this.sharedPreferences,
  });

  final MockApiClientHelper helper;
  final AuthState authState;
  final ReportsApi api;
  final ReportDraftStore draftStore;
  final SharedPreferences sharedPreferences;

  static Future<ReportsTestHarness> create({
    Map<String, dynamic>? user,
    int? currentProjectId = ReportsTestFixtures.projectId,
    Map<String, Object>? initialPrefs,
  }) async {
    SharedPreferences.setMockInitialValues(initialPrefs ?? {});
    final prefs = await SharedPreferences.getInstance();

    final helper = MockApiClientHelper();
    // 登录态 bootstrap 基础 mock
    final currentUserJson = user ?? ReportsTestFixtures.userJson;
    helper.whenGet('/users/me', currentUserJson);
    helper.whenGet('/companies/mine', {
      'items': [ReportsTestFixtures.companyJson],
      'total': 1,
    });
    helper.whenGet('/projects', {
      'items': ReportsTestFixtures.projectsJson,
      'total': ReportsTestFixtures.projectsJson.length,
    });

    // 默认注册 reports 相关标准接口响应
    helper.whenGet(
      '/projects/${ReportsTestFixtures.projectId}/report-agents/bindings',
      {'items': ReportsTestFixtures.bindingsJson},
    );
    helper.whenPost(
      '/projects/${ReportsTestFixtures.projectId}/report-agents/bindings',
      {'items': ReportsTestFixtures.bindingsJson},
    );
    helper.whenGet(
      '/projects/${ReportsTestFixtures.projectId}/members',
      {'items': ReportsTestFixtures.membersJson},
    );
    helper.whenGet(
      '/projects/${ReportsTestFixtures.projectId}/agent-reports',
      {
        'items': [
          ReportsTestFixtures.submittedReportJson,
          ReportsTestFixtures.draftReportJson,
        ],
      },
    );
    helper.whenGet(
      '/reports/my',
      {
        'items': [
          ReportsTestFixtures.submittedReportJson,
          ReportsTestFixtures.draftReportJson,
        ],
      },
    );
    helper.whenGet(
      '/reports/my',
      {
        'items': [
          ReportsTestFixtures.submittedReportJson,
          ReportsTestFixtures.draftReportJson,
        ],
      },
      query: {'project_id': '${ReportsTestFixtures.projectId}'},
    );
    helper.whenGet(
      '/reports/inbox',
      {
        'items': [
          ReportsTestFixtures.unreadInboxReportJson,
          ReportsTestFixtures.submittedReportJson,
        ],
      },
    );
    helper.whenGet(
      '/reports/501',
      ReportsTestFixtures.submittedReportJson,
    );
    helper.whenGet(
      '/reports/502',
      ReportsTestFixtures.unreadInboxReportJson,
    );
    helper.whenGet(
      '/reports/503',
      ReportsTestFixtures.draftReportJson,
    );
    helper.whenPut(
      '/reports/inbox/502/read',
      {'id': 502, 'read': true},
    );
    helper.whenPost(
      '/reports/generate',
      ReportsTestFixtures.draftReportJson,
    );
    helper.whenPost(
      '/reports/503/submit',
      ReportsTestFixtures.submittedReportJson,
    );
    helper.whenPost(
      '/projects/${ReportsTestFixtures.projectId}/agent-reports/aggregate',
      ReportsTestFixtures.projectAggregateJson,
    );
    helper.whenGet(
      '/companies/${ReportsTestFixtures.companyId}/leadership-reports/latest',
      ReportsTestFixtures.leadershipReportJson,
    );
    helper.whenPost(
      '/companies/${ReportsTestFixtures.companyId}/leadership-reports/aggregate',
      ReportsTestFixtures.leadershipReportJson,
    );
    helper.whenPost(
      '/agents/chat',
      ReportsTestFixtures.chatReplyJson,
    );

    // 项目 20 的特定响应（置于末尾以在倒序查找中优先匹配）
    helper.whenGet(
      '/projects/${ReportsTestFixtures.otherProjectId}/report-agents/bindings',
      {'items': ReportsTestFixtures.project20BindingsJson},
    );
    helper.whenPost(
      '/projects/${ReportsTestFixtures.otherProjectId}/report-agents/bindings',
      {'items': ReportsTestFixtures.project20BindingsJson},
    );
    helper.whenGet(
      '/projects/${ReportsTestFixtures.otherProjectId}/members',
      {'items': ReportsTestFixtures.membersJson},
    );
    helper.whenGet(
      '/projects/${ReportsTestFixtures.otherProjectId}/agent-reports',
      {
        'items': [
          ReportsTestFixtures.submittedReportJson,
        ],
      },
    );
    helper.whenGet(
      '/reports/my',
      {
        'items': [
          ReportsTestFixtures.submittedReportJson,
        ],
      },
      query: {'project_id': '${ReportsTestFixtures.otherProjectId}'},
    );
    helper.whenPost(
      '/projects/${ReportsTestFixtures.otherProjectId}/agent-reports',
      ReportsTestFixtures.submittedReportJson,
    );

    final client = helper.buildClient();
    final authState = AuthState(apiClient: client);
    await authState.bootstrap();

    if (currentProjectId != null) {
      final p = authState.projects.firstWhere(
        (item) => item.id == currentProjectId,
        orElse: () => authState.projects.first,
      );
      authState.selectProject(p);
    }

    final api = ReportsApi(client);
    final draftStore = ReportDraftStore(prefs: prefs);

    return ReportsTestHarness._(
      helper: helper,
      authState: authState,
      api: api,
      draftStore: draftStore,
      sharedPreferences: prefs,
    );
  }

  /// 专供 golden 使用：不包含外层 MaterialApp，由 testAdaptiveGolden 统一提供
  Widget withProvider(Widget child) {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: child,
    );
  }

  /// 供组件交互与路由流转测试使用：提供完整的路由环境
  Widget wrapRouted(
    Widget child, {
    ThemeMode themeMode = ThemeMode.light,
    Locale locale = const Locale('zh', 'CN'),
    String initialLocation = '/',
    List<RouteBase>? routes,
  }) {
    final effectiveRoutes = routes ??
        [
          GoRoute(
            path: '/',
            builder: (context, state) => child,
          ),
          GoRoute(
            path: '/work',
            builder: (context, state) => const Scaffold(body: Text('工作主页')),
          ),
          GoRoute(
            path: '/reports/chat',
            builder: (context, state) => const Scaffold(body: Text('智能体对话页')),
          ),
          GoRoute(
            path: '/reports/create',
            builder: (context, state) => const Scaffold(body: Text('写汇报页')),
          ),
          GoRoute(
            path: '/reports/submitted/:id',
            builder: (context, state) => const Scaffold(body: Text('提交成功页')),
          ),
          GoRoute(
            path: '/reports/detail',
            builder: (context, state) => const Scaffold(body: Text('汇报详情页')),
          ),
          GoRoute(
            path: '/reports/inbox',
            builder: (context, state) => const Scaffold(body: Text('收件箱页')),
          ),
          GoRoute(
            path: '/reports/review/followup',
            builder: (context, state) => const Scaffold(body: Text('审阅跟进页')),
          ),
          GoRoute(
            path: '/reports/review/conflict',
            builder: (context, state) => const Scaffold(body: Text('冲突核验页')),
          ),
          GoRoute(
            path: '/reports/project/contrast',
            builder: (context, state) => const Scaffold(body: Text('项目资料对照页')),
          ),
          GoRoute(
            path: '/reports/project/aggregate',
            builder: (context, state) => const Scaffold(body: Text('项目汇报汇总页')),
          ),
          GoRoute(
            path: '/reports/leadership',
            builder: (context, state) => const Scaffold(body: Text('领导层汇报页')),
          ),
          GoRoute(
            path: '/reports/bindings',
            builder: (context, state) => const Scaffold(body: Text('绑定管理页')),
          ),
        ];

    final router = GoRouter(
      initialLocation: initialLocation,
      routes: effectiveRoutes,
    );

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthState>.value(value: authState),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        themeMode: themeMode,
        theme: ThemeData(
          useMaterial3: true,
          fontFamily: 'NotoSansSC',
          brightness: Brightness.light,
        ),
        darkTheme: ThemeData(
          useMaterial3: true,
          fontFamily: 'NotoSansSC',
          brightness: Brightness.dark,
        ),
        locale: locale,
        supportedLocales: const [
          Locale('zh', 'CN'),
          Locale('en', 'US'),
        ],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        routerConfig: router,
      ),
    );
  }
}
