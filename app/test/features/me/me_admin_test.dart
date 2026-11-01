import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_asr_config_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_llm_config_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_model_keys_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_notify_channels_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_org_sso_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_push_certs_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_sso_config_screen.dart';

import 'me_test_harness.dart';

typedef _AdminPageBuilder = Widget Function(MeTestHarness harness);

const List<(String, _AdminPageBuilder)> _adminPages = [
  ('通知渠道配置', _notifyChannels),
  ('AI 模型配置', _llmConfig),
  ('模型密钥配置', _modelKeys),
  ('组织与登录集成', _orgSso),
  ('推送证书状态', _pushCerts),
  ('语音识别配置', _asrConfig),
  ('单点登录配置', _ssoConfig),
];

Widget _notifyChannels(MeTestHarness h) =>
    AdminNotifyChannelsScreen(api: h.api, authState: h.authState);
Widget _llmConfig(MeTestHarness h) =>
    AdminLlmConfigScreen(api: h.api, authState: h.authState);
Widget _modelKeys(MeTestHarness h) =>
    AdminModelKeysScreen(api: h.api, authState: h.authState);
Widget _orgSso(MeTestHarness h) =>
    AdminOrgSsoScreen(api: h.api, authState: h.authState);
Widget _pushCerts(MeTestHarness h) =>
    AdminPushCertsScreen(api: h.api, authState: h.authState);
Widget _asrConfig(MeTestHarness h) =>
    AdminAsrConfigScreen(api: h.api, authState: h.authState);
Widget _ssoConfig(MeTestHarness h) =>
    AdminSsoConfigScreen(api: h.api, authState: h.authState);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('普通成员直接访问 7 个管理员页面都显示无权限', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: false);

    for (final (title, builder) in _adminPages) {
      await tester.pumpWidget(harness.wrap(builder(harness)));
      await tester.pumpAndSettle();
      expect(
        find.text('暂无访问权限'),
        findsOneWidget,
        reason: '「$title」应对普通成员显示无权限',
      );
      expect(
        find.textContaining('仅企业超级管理员可见'),
        findsOneWidget,
        reason: '「$title」应说明需要超级管理员权限',
      );
    }
  });

  testWidgets('没有企业时 7 个管理员页面都提示尚未加入企业', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(withCompany: false);

    for (final (title, builder) in _adminPages) {
      await tester.pumpWidget(harness.wrap(builder(harness)));
      await tester.pumpAndSettle();
      expect(
        find.text('尚未加入企业'),
        findsOneWidget,
        reason: '「$title」应在无企业时提示',
      );
    }
  });

  testWidgets('AI 模型配置：密钥留空保存时不提交 api_key', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/llm', {
      'provider': 'openai',
      'base_url': 'https://api.deepseek.com/v1',
      'model': 'deepseek-chat',
      'enabled': true,
      'has_api_key': true,
    });

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    // 已保存的密钥不回显明文
    expect(find.textContaining('已配置 API Key'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-llm-base-url')),
      'https://api.deepseek.com/v1',
    );
    await tester.enterText(
      find.byKey(const Key('admin-llm-model')),
      'deepseek-chat',
    );
    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/llm');
    final body = put.body as Map;
    expect(body.containsKey('api_key'), isFalse);
    expect(body['model'], 'deepseek-chat');
    expect(body['base_url'], 'https://api.deepseek.com/v1');
    expect(find.text('AI 大模型接入参数已保存'), findsOneWidget);
  });

  testWidgets('AI 模型配置：API 地址留空时按厂商预设补默认地址', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/llm', {
      'provider': 'openai',
      'base_url': 'https://api.openai.com/v1',
      'model': 'gpt-4o-mini',
      'enabled': true,
      'has_api_key': true,
    });

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    // 后端允许留空，但客户端不能把空串原样提交，否则配置不可用
    await tester.enterText(find.byKey(const Key('admin-llm-base-url')), '');
    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/llm');
    expect((put.body as Map)['base_url'], 'https://api.openai.com/v1');
    expect(find.text('AI 大模型接入参数已保存'), findsOneWidget);
  });

  testWidgets('AI 模型配置：没有默认地址时必须手填地址', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet('/companies/1/llm', {
      'provider': 'custom',
      'base_url': '',
      'model': 'my-model',
      'enabled': true,
      'has_api_key': true,
      'presets': {
        'custom': {
          'label': '自定义',
          'default_base_url': '',
          'default_model': '',
          'needs_key': true,
        },
      },
    });

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('admin-llm-base-url')), '');
    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    expect(find.textContaining('请填写 API Base URL'), findsOneWidget);
    expect(harness.hasRequest('PUT', '/companies/1/llm'), isFalse);
  });

  testWidgets('AI 模型配置：切换厂商时地址与模型一起换成该厂商预设', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/llm', {
      'provider': 'openai_compatible',
      'base_url': 'https://api.deepseek.com/v1',
      'model': 'deepseek-chat',
      'enabled': true,
      'has_api_key': true,
    });

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('OpenAI 兼容'));
    await tester.pumpAndSettle();
    expect(find.text('https://api.deepseek.com/v1'), findsOneWidget);
    expect(find.text('deepseek-chat'), findsOneWidget);

    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    // 换厂商时 provider / base_url / model 必须成套提交
    final body = harness.lastRequest('PUT', '/companies/1/llm').body as Map;
    expect(body['provider'], 'openai_compatible');
    expect(body['base_url'], 'https://api.deepseek.com/v1');
    expect(body['model'], 'deepseek-chat');
  });

  testWidgets('AI 模型配置：填写新密钥时提交 api_key', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/llm', {'has_api_key': true});

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('admin-llm-api-key')),
      'sk-new-key',
    );
    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/llm');
    expect((put.body as Map)['api_key'], 'sk-new-key');
  });

  testWidgets('AI 模型配置：模型名称为空时前端拦截', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);

    await tester.pumpWidget(harness.wrap(_llmConfig(harness)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('admin-llm-model')), '');
    await tester.tap(find.text('保存模型配置'));
    await tester.pumpAndSettle();

    expect(find.text('调用模型名称为必填项'), findsOneWidget);
    expect(harness.hasRequest('PUT', '/companies/1/llm'), isFalse);
  });

  testWidgets('通知渠道：SMTP 密码留空时不提交 smtp_password', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/smtp', {
      'smtp_host': 'smtp.example.com',
      'smtp_port': 465,
      'smtp_user': 'notify@example.com',
      'has_password': true,
    });

    await tester.pumpWidget(harness.wrap(_notifyChannels(harness)));
    await tester.pumpAndSettle();

    expect(find.textContaining('已配置密码'), findsOneWidget);
    await tester.tap(find.text('保存配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/smtp');
    expect((put.body as Map).containsKey('smtp_password'), isFalse);
    expect(find.text('企业 SMTP 邮件渠道配置已保存'), findsOneWidget);
  });

  testWidgets('通知渠道：填写密码时提交 smtp_password', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/smtp', {
      'smtp_host': 'smtp.example.com',
      'smtp_port': 465,
      'smtp_user': 'notify@example.com',
      'has_password': true,
    });

    await tester.pumpWidget(harness.wrap(_notifyChannels(harness)));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('admin-smtp-password')),
      'auth-code',
    );
    await tester.tap(find.text('保存配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/smtp');
    expect((put.body as Map)['smtp_password'], 'auth-code');
  });

  testWidgets('通知渠道：端口非法时前端拦截', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);

    await tester.pumpWidget(harness.wrap(_notifyChannels(harness)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('admin-smtp-port')), '99999');
    await tester.tap(find.text('保存配置'));
    await tester.pumpAndSettle();

    expect(find.text('服务器端口需为 1-65535 之间的数字'), findsOneWidget);
    expect(harness.hasRequest('PUT', '/companies/1/smtp'), isFalse);
  });

  testWidgets('模型密钥：留空时提示且不发送请求', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);

    await tester.pumpWidget(harness.wrap(_modelKeys(harness)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('保存密钥'));
    await tester.pumpAndSettle();

    expect(find.textContaining('新密钥不能为空'), findsOneWidget);
    expect(harness.hasRequest('PUT', '/companies/1/llm'), isFalse);
  });

  testWidgets('模型密钥：只轮换当前生效配置的密钥，不提交厂商/地址/模型', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/llm', {
      'provider': 'openai',
      'base_url': 'https://api.openai.com/v1',
      'model': 'gpt-4o-mini',
      'enabled': true,
      'has_api_key': true,
      'configured': true,
    });

    await tester.pumpWidget(harness.wrap(_modelKeys(harness)));
    await tester.pumpAndSettle();

    // 当前生效配置是 OpenAI：不再暴露后端不支持的 deepseek / claude 选项
    expect(find.text('DeepSeek'), findsNothing);
    expect(find.text('Claude'), findsNothing);
    expect(find.text('OpenAI'), findsOneWidget);
    expect(find.textContaining('gpt-4o-mini'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-model-key')),
      'sk-rotated-key',
    );
    await tester.tap(find.text('保存密钥'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/llm');
    final body = put.body as Map;
    // 只有密钥，避免覆盖地址/模型、也避免 deepseek/claude 被后端改写为 custom
    expect(body.keys.toSet(), {'api_key'});
    expect(body['api_key'], 'sk-rotated-key');
    expect(find.textContaining('OpenAI 密钥已更新'), findsOneWidget);
  });

  testWidgets('模型密钥：当前为本地桩时提示无需密钥', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet('/companies/1/llm', {
      'provider': 'fake',
      'base_url': '',
      'model': 'fake',
      'enabled': true,
      'has_api_key': false,
      'configured': true,
      'presets': {
        'fake': {
          'label': 'Fake（本地桩，无需密钥）',
          'default_base_url': '',
          'default_model': 'fake',
          'needs_key': false,
        },
      },
    });

    await tester.pumpWidget(harness.wrap(_modelKeys(harness)));
    await tester.pumpAndSettle();

    expect(find.textContaining('无需 API Key'), findsOneWidget);
    expect(find.byKey(const Key('admin-model-key')), findsNothing);
  });

  testWidgets('组织与登录集成：按真实字段展示配置状态', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);

    await tester.pumpWidget(harness.wrap(_orgSso(harness)));
    await tester.pumpAndSettle();

    // wecom 有凭证且已同步；dingtalk 仅有空壳账号 → 待配置
    expect(find.text('已同步'), findsOneWidget);
    expect(find.text('待配置'), findsOneWidget);
    expect(find.textContaining('上次同步'), findsOneWidget);
  });

  testWidgets('组织与登录集成：没有可同步厂商时禁止触发同步', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet('/companies/1/integrations', {
      'items': [
        {
          'provider': 'oidc',
          'has_credentials': true,
          'config': {'issuer': 'https://idp.example.com'},
          'last_sync_at': null,
          'created_at': '2026-10-01T02:00:00Z',
        },
      ],
    });

    await tester.pumpWidget(harness.wrap(_orgSso(harness)));
    await tester.pumpAndSettle();

    expect(find.textContaining('尚未配置可同步的组织集成'), findsOneWidget);
    await tester.tap(find.text('立即同步'));
    await tester.pumpAndSettle();
    expect(harness.hasRequest('POST', '/companies/1/org-sync'), isFalse);
  });

  testWidgets('组织与登录集成：触发同步与切换登录方式', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPost('/companies/1/org-sync', {'status': 'completed'});
    harness.helper.register(
      'PATCH',
      '/companies/1/login-methods',
      {
        'password': true,
        'wechat': true,
        'wecom': false,
        'dingtalk': false,
        'feishu': false,
        'oidc': false,
      },
    );

    await tester.pumpWidget(harness.wrap(_orgSso(harness)));
    await tester.pumpAndSettle();

    expect(find.text('企业微信（WeCom）'), findsOneWidget);
    expect(find.text('钉钉（DingTalk）'), findsOneWidget);

    await tester.tap(find.text('立即同步'));
    await tester.pumpAndSettle();
    final sync = harness.lastRequest('POST', '/companies/1/org-sync');
    // 必须显式指定已配置的组织集成厂商，避免后端选中 SMTP/LLM 等非组织账号
    expect(sync.url.queryParameters['provider'], 'wecom');
    expect(find.textContaining('企业微信（WeCom） 组织架构同步任务已触发'), findsOneWidget);

    // 登录方式开关顺序：账号密码 / 微信 / 企业微信 / 钉钉 / 飞书
    await tester.tap(find.byType(AppSwitch).at(1));
    await tester.pumpAndSettle();

    final patch = harness.lastRequest('PATCH', '/companies/1/login-methods');
    expect((patch.body as Map)['wechat'], isTrue);
    expect(find.text('登录方式已更新'), findsOneWidget);
  });

  testWidgets('单点登录：开启 OIDC 会提交 login-methods', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.register('PATCH', '/companies/1/login-methods', {
      'password': true,
      'wechat': false,
      'wecom': false,
      'dingtalk': false,
      'feishu': false,
      'oidc': true,
    });

    await tester.pumpWidget(harness.wrap(_ssoConfig(harness)));
    await tester.pumpAndSettle();

    // 只读参数清单（后端无写入接口）
    expect(find.text('服务端需配置的参数（只读）'), findsOneWidget);
    expect(find.text('/api/v1/sso/{provider}/callback'), findsOneWidget);

    await tester.tap(find.byType(AppSwitch).first);
    await tester.pumpAndSettle();

    final patch = harness.lastRequest('PATCH', '/companies/1/login-methods');
    expect((patch.body as Map)['oidc'], isTrue);
    expect(find.text('已允许 OIDC 单点登录'), findsOneWidget);
  });

  testWidgets('推送证书：WebPush 未配置时显示待配置并提示原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet(
      '/notifications/vapid-public-key',
      {
        'detail': {'code': 503, 'message': 'Web Push 未配置'},
      },
      statusCode: 503,
    );

    await tester.pumpWidget(harness.wrap(_pushCerts(harness)));
    await tester.pumpAndSettle();

    expect(find.text('待配置'), findsOneWidget);
    expect(find.textContaining('公钥读取失败'), findsOneWidget);
    expect(find.textContaining('无查询接口'), findsNWidgets(2));
  });

  testWidgets('语音识别：保存时提交 provider_id 与 config_json', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenPut('/companies/1/bindings/asr', {
      'provider_id': 'cloud:whisper',
      'config_json': {
        'base_url': 'https://asr.example.com/v1',
        'model': 'whisper-1',
        'language': 'zh',
      },
      'has_api_key': true,
    });

    await tester.pumpWidget(harness.wrap(_asrConfig(harness)));
    await tester.pumpAndSettle();

    expect(find.textContaining('已配置密钥'), findsOneWidget);

    await tester.tap(find.text('保存语音识别配置'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/companies/1/bindings/asr');
    final body = put.body as Map;
    expect(body['provider_id'], 'cloud:whisper');
    expect((body['config_json'] as Map)['base_url'], 'https://asr.example.com/v1');
    expect((body['config_json'] as Map).containsKey('api_key'), isFalse);
    expect(find.text('语音识别引擎参数已更新'), findsOneWidget);
  });
}
