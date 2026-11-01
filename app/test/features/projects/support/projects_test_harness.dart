/// T03 项目与团队测试脚手架
///
/// 统一用底座 `MockApiClientHelper` 构造真实 `ApiClient` + 真实 `AuthState`，
/// 页面走与线上完全相同的请求路径，避免为测试再造一套假实现。
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/router/app_router.dart';

import '../../../helpers/mock_api_client.dart';

/// 公司出参
Map<String, dynamic> companyJson({int id = 1, String name = '联调科技'}) => {
      'id': id,
      'name': name,
      'slug': 'joint-tech',
      'status': 'active',
    };

/// 项目出参（对齐 `_project_dto`）
Map<String, dynamic> projectJson({
  int id = 11,
  String name = '智能客服 2.0',
  String status = 'active',
  int memberCount = 2,
  String ownerNickname = '王宁',
}) =>
    {
      'id': id,
      'company_id': 1,
      'name': name,
      'status': status,
      'pm_user_id': 5,
      'final_owner_user_id': 5,
      'created_by': 5,
      'member_count': memberCount,
      'final_owner': {
        'user_id': 5,
        'username': 'wangning',
        'nickname': ownerNickname,
        'avatar_url': null,
        'is_me': false,
      },
    };

/// 成员出参（对齐 `list_project_members`）
Map<String, dynamic> memberJson({
  required int userId,
  required String nickname,
  String? username,
  String role = 'member',
}) =>
    {
      'user_id': userId,
      'nickname': nickname,
      'username': username ?? 'user$userId',
      'display_name': nickname,
      'avatar_url': null,
      'role': role,
      'joined_at': '2026-10-01T02:00:00Z',
      'left_at': null,
    };

/// 任务出参（对齐 `TaskResponse` 关键字段）
Map<String, dynamic> taskJson({
  required int id,
  required String title,
  int status = 0,
  String? dueDate,
  List<Map<String, dynamic>> assignees = const [],
}) =>
    {
      'id': id,
      'title': title,
      'status': status,
      'due_date': dueDate,
      'assignees': assignees,
    };

Map<String, dynamic> assigneeJson({required int userId, required String name}) =>
    {
      'user_id': userId,
      'role_key': 'primary',
      'display_name': name,
      'nickname': name,
      'username': 'user$userId',
      'avatar_url': null,
    };

/// 权限快照出参
Map<String, dynamic> permissionsJson({
  String role = 'pm',
  bool isPm = true,
  bool isSuperadmin = false,
  bool canEditAll = true,
}) =>
    {
      'role': role,
      'is_pm': isPm,
      'is_superadmin': isSuperadmin,
      'can_edit_all': canEditAll,
      'owned_node_ids': const <int>[],
      'via_delegation': false,
      'can_move': canEditAll,
      'can_delete': canEditAll,
      'can_submit_evidence': true,
      'can_read_evidence': true,
      'node_permissions': const <String, dynamic>{},
    };

/// 统一的测试环境：假接口 + 已登录的全局状态
class ProjectsTestHarness {
  ProjectsTestHarness({this.company = true, this.projects = true});

  final bool company;
  final bool projects;
  final MockApiClientHelper helper = MockApiClientHelper();
  late final AuthState authState;

  /// 注册公共路由（用户信息、公司、项目列表）并完成 bootstrap
  Future<AuthState> bootstrap({List<Map<String, dynamic>>? projectList}) async {
    SharedPreferences.setMockInitialValues({});
    helper.whenGet('/users/me', {
      'id': 11,
      'username': 'zhangsan',
      'nickname': '张三',
      'email_verified': true,
      'phone_verified': true,
    });
    helper.whenGet(
      '/companies/mine',
      {
        'items': company ? [companyJson()] : <Map<String, dynamic>>[],
        'total': company ? 1 : 0,
      },
    );
    if (company) {
      helper.whenGet(
        '/projects',
        {
          'items': projects
              ? (projectList ??
                  [
                    projectJson(),
                    projectJson(id: 12, name: '数据中台', memberCount: 1),
                  ])
              : <Map<String, dynamic>>[],
          'total': projects ? 2 : 0,
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );
    }
    authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();
    return authState;
  }

  /// 渲染单个页面（不接路由；用于纯展示与交互断言）
  Future<void> pumpScreen(
    WidgetTester tester,
    Widget child, {
    bool settle = true,
    AuthState? authStateOverride,
  }) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: authStateOverride ?? authState,
        child: MaterialApp(
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh', 'CN')],
          home: child,
        ),
      ),
    );
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
    }
  }

  /// 渲染整台应用路由并跳转到指定位置（用于验证路由与返回行为）
  Future<GoRouterHandle> pumpApp(
    WidgetTester tester, {
    String location = '/work',
  }) async {
    final router = AppRouter(authState: authState);
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: authState,
        child: MaterialApp.router(
          routerConfig: router.router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh', 'CN')],
        ),
      ),
    );
    await tester.pumpAndSettle();
    router.router.go(location);
    await tester.pumpAndSettle();
    return GoRouterHandle(router);
  }
}

/// 仅暴露路由跳转能力，避免测试直接依赖 go_router 内部类型
class GoRouterHandle {
  GoRouterHandle(this._router);

  final AppRouter _router;

  void go(String location) => _router.router.go(location);

  String get currentLocation => _router
          .router
          .routerDelegate
          .currentConfiguration
          .lastOrNull
          ?.matchedLocation ??
      '';
}

/// 构造一个「响应有延迟」的接口客户端，用于断言加载中状态
///
/// `MockApiClientHelper` 的响应在微任务里立即完成，无法停留在加载态；
/// 这里用真实 `MockClient` + `Future.delayed`（假时钟可推进）来制造延迟。
ApiClient buildSlowClient({
  required Map<String, Map<String, dynamic>> routes,
  Duration delay = const Duration(milliseconds: 500),
}) {
  final mockHttp = MockClient((request) async {
    await Future<void>.delayed(delay);
    final path = request.url.path.replaceFirst('/api/v1', '');
    final data = routes[path] ?? <String, dynamic>{};
    return http.Response(
      jsonEncode({'code': 200, 'message': 'success', 'data': data}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return ApiClient(
    tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
    httpClient: mockHttp,
    baseUrl: 'http://localhost:8010/api/v1',
  );
}
