import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/me/appearance/me_appearance.dart';
import 'package:worktodo_app/features/me/data/me_api.dart';

import '../../helpers/mock_api_client.dart';

/// T09 测试夹具：统一的模拟数据与渲染包裹，避免各用例重复拼装接口。
class MeTestHarness {
  MeTestHarness._(this.helper, this.authState, this.api);

  final MockApiClientHelper helper;
  final AuthState authState;
  final MeApi api;

  static const Map<String, dynamic> userJson = {
    'id': 11,
    'username': 'demo_user',
    'nickname': '张三',
    'avatar_url': null,
    'email': 'demo@example.com',
    'phone': '13900000001',
    'email_verified': true,
    'phone_verified': false,
    'notify_pref': {
      'channels': {
        'email': {'enabled': true},
        'push': {'enabled': true},
        'desktop': {'enabled': false},
        'wechat': {'enabled': false},
      },
      'quiet_hours': {'start': '22:00', 'end': '08:00'},
      'weekend_mute': false,
    },
    'created_at': '2026-08-03T07:13:49Z',
  };

  static const Map<String, dynamic> verificationJson = {
    'email': 'demo@example.com',
    'phone': '13900000001',
    'email_verified': true,
    'phone_verified': false,
    'is_verified': false,
  };

  /// 构建带企业上下文的登录态；[isAdmin] 决定 `/companies/1` 的 my_membership
  static Future<MeTestHarness> create({
    bool isAdmin = false,
    bool withCompany = true,
    Map<String, dynamic>? user,
  }) async {
    SharedPreferences.setMockInitialValues({});
    // 每个用例都换一个新的全局外观单例：避免上一个用例在 FakeAsync 区域里
    // 创建的加载 Future 被下一个用例复用而永远等不到完成
    MeAppearanceController.resetInstanceForTest();
    final helper = MockApiClientHelper();
    final userData = Map<String, dynamic>.from(user ?? userJson);
    helper.whenGet('/users/me', userData);
    helper.whenGet(
      '/companies/mine',
      {
        'items': withCompany
            ? [
                {
                  'id': 1,
                  'name': '示例科技',
                  'slug': 'demo',
                  'status': 'active',
                },
              ]
            : <Map<String, dynamic>>[],
        'total': withCompany ? 1 : 0,
      },
    );
    helper.whenGet('/projects', {'items': <Map<String, dynamic>>[], 'total': 0});
    helper.whenGet('/users/me/verification', verificationJson);
    helper.whenGet('/users/me/ui-prefs', {
      'ui': {
        'language': 'zh',
        'theme_mode': 'light',
        'task_default_priority': 1,
      },
    });
    helper.whenGet('/users/me/billing', {
      'company_id': 1,
      'company_name': '示例科技',
      'plan_code': '企业专业版',
      'status': 'active',
      'managed_by': '平台运维',
    });
    helper.whenGet('/users/me/privacy', {
      'stored_data': {'tasks': 3, 'profile': true, 'notification_preferences': true},
      'retention': '180 天',
      'export_endpoint': '/api/v1/users/me/export',
      'delete_endpoint': '/api/v1/users/me/delete',
    });
    helper.whenGet('/categories', [
      {'id': 5, 'name': '工作'},
      {'id': 6, 'name': '个人'},
    ]);
    helper.whenGet('/notify/records', {
      'items': [
        {
          'id': 1,
          'channel': 'email',
          'status': 'success',
          'error': null,
          'task_title': '季度目标评审',
          'created_at': '2026-10-31T02:00:00Z',
        },
        {
          'id': 2,
          'channel': 'webpush',
          'status': 'failed',
          'error': '订阅已失效',
          'task_title': null,
          'created_at': '2026-10-31T03:10:00Z',
        },
      ],
    });
    helper.whenGet('/wx/subscribe-status', {
      'wx_bound': true,
      'subscription_enabled': false,
    });
    helper.whenGet('/health', {
      'status': 'healthy',
      'database': 'ok',
      'version': 'dev',
    });
    if (withCompany) {
      helper.whenGet('/companies/1', {
        'id': 1,
        'name': '示例科技',
        'login_methods': {
          'password': true,
          'wechat': false,
          'wecom': false,
          'dingtalk': false,
          'feishu': false,
          'oidc': false,
        },
        'my_membership': {
          'status': 'active',
          'is_super_admin': isAdmin,
          'is_org_leader': false,
          'title': isAdmin ? '技术负责人' : null,
        },
      });
      helper.whenGet('/companies/1/smtp', {
        'smtp_host': 'smtp.example.com',
        'smtp_port': 465,
        'smtp_user': 'notify@example.com',
        'smtp_from': 'notify@example.com',
        'has_password': true,
        'configured': true,
      });
      helper.whenGet('/companies/1/llm', {
        'provider': 'openai',
        'base_url': 'https://api.openai.com/v1',
        'model': 'gpt-4o-mini',
        'enabled': true,
        'use_for_judge': false,
        'use_for_agent': true,
        'has_api_key': true,
        'configured': true,
        'presets': {
          'openai': {
            'label': 'OpenAI',
            'default_base_url': 'https://api.openai.com/v1',
            'default_model': 'gpt-4o-mini',
            'needs_key': true,
          },
          'openai_compatible': {
            'label': 'OpenAI 兼容',
            'default_base_url': 'https://api.deepseek.com/v1',
            'default_model': 'deepseek-chat',
            'needs_key': true,
          },
        },
      });
      helper.whenGet('/companies/1/bindings', {
        'storage': {'provider_id': 'local'},
        'asr': {
          'provider_id': 'cloud:whisper',
          'config_json': {
            'base_url': 'https://asr.example.com/v1',
            'model': 'whisper-1',
            'language': 'zh',
          },
          'has_api_key': true,
        },
        'model': {'provider_id': 'fake'},
      });
      helper.whenGet('/companies/1/integrations', {
        'items': [
          // 与后端 org.py::_integration_dto 一致：没有 enabled / status 字段
          {
            'provider': 'wecom',
            'has_credentials': true,
            'config': {
              'redirect_uri': 'https://app.example.com/api/v1/sso/wecom/callback',
              'auto_create_users': true,
            },
            'last_sync_at': '2026-10-30T01:00:00Z',
            'created_at': '2026-10-01T02:00:00Z',
          },
          {
            'provider': 'dingtalk',
            'has_credentials': false,
            'config': <String, dynamic>{},
            'last_sync_at': null,
            'created_at': '2026-10-02T02:00:00Z',
          },
        ],
      });
    }
    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();
    return MeTestHarness._(helper, authState, MeApi(authState.api));
  }

  /// 统一的组件测试外壳（含 Provider 与中文本地化）
  Widget wrap(
    Widget child, {
    ThemeData? theme,
    TextScaler? textScaler,
    Size size = const Size(390, 844),
  }) {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp(
        theme: theme ?? ThemeData(useMaterial3: true),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: MediaQuery(
          data: MediaQueryData(
            size: size,
            textScaler: textScaler ?? TextScaler.noScaling,
          ),
          child: MeScreenAppearance(child: child),
        ),
      ),
    );
  }

  /// 只供 golden 使用：把 Provider 放进待截图 widget 内部
  Widget withProvider(Widget child) {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: child,
    );
  }

  /// 断言最近一次请求
  MockRequestRecord lastRequest(String method, String path) {    final matches = helper.history
        .where((r) => r.method == method && r.url.path.endsWith(path))
        .toList();
    expect(
      matches,
      isNotEmpty,
      reason: '未找到 $method $path 请求，实际请求：'
          '${helper.history.map((r) => '${r.method} ${r.url.path}').join(', ')}',
    );
    return matches.last;
  }

  bool hasRequest(String method, String path) {
    return helper.history
        .any((r) => r.method == method && r.url.path.endsWith(path));
  }

  /// 把测试窗口调高，让长页面一次渲染完整（ListView 懒加载会漏掉未进入视口的项）
  static void useTallSurface(
    WidgetTester tester, {
    Size size = const Size(430, 1800),
  }) {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
  }
}
