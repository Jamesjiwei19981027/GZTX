import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// 个人知识空间：空空间响应
const Map<String, dynamic> emptySpace = {
  'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
  'entries': <dynamic>[],
  'links': <dynamic>[],
};

/// 个人知识空间：两条笔记
const Map<String, dynamic> spaceWithTwoEntries = {
  'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
  'entries': [
    {
      'id': 21,
      'title': '客户需求确认',
      'body_text': '客户确认先做验收清单',
      'tags': ['验收'],
      'position': null,
      'source_type': 'manual',
      'source_id': null,
      'source_ref': <String, dynamic>{},
      'updated_at': '2026-10-31T02:00:00Z',
    },
    {
      'id': 22,
      'title': '接口联调记录',
      'body_text': '接口全部通过',
      'tags': <String>[],
      'position': null,
      'source_type': 'agent_report',
      'source_id': 4,
      'source_ref': {'report_id': 4},
      'updated_at': null,
    },
  ],
  'links': <dynamic>[],
};

/// 项目知识空间：无总结权限、无成员管理权限
const Map<String, dynamic> projectCatalogNoPermission = {
  'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
  'pages': [
    {
      'id': 4,
      'title': '八项接口通过验收',
      'body_text': '八项接口通过验收，两项待复核',
      'source': 'llm_wiki',
      'meta': {
        'facts': [
          {
            'package_id': 12,
            'quote': '八项接口通过验收',
            'source_name': '验收纪要.pdf',
            'line_start': 3,
            'line_end': 5,
          },
        ],
      },
      'updated_at': null,
    },
    {
      'id': 6,
      'title': '本周风险登记',
      'body_text': '外部接口联调时间待确认',
      'source': 'manual',
      'meta': <String, dynamic>{},
      'updated_at': null,
    },
  ],
  'permissions': {'can_summarize': false, 'can_manage_grants': false},
  'members': <dynamic>[],
};

/// 项目知识空间：有总结权限与成员管理权限
const Map<String, dynamic> projectCatalogWithPermission = {
  'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
  'pages': [
    {
      'id': 4,
      'title': '八项接口通过验收',
      'body_text': '八项接口通过验收，两项待复核',
      'source': 'llm_wiki',
      'meta': {
        'facts': [
          {
            'package_id': 12,
            'quote': '八项接口通过验收',
            'source_name': '验收纪要.pdf',
            'line_start': 3,
            'line_end': 5,
          },
        ],
      },
      'updated_at': null,
    },
  ],
  'permissions': {'can_summarize': true, 'can_manage_grants': true},
  'members': [
    {
      'user_id': 11,
      'name': '张三',
      'can_summarize': true,
      'is_manager': true,
    },
    {
      'user_id': 12,
      'name': '李四',
      'can_summarize': false,
      'is_manager': false,
    },
  ],
};

/// 供知识空间组件测试复用的外层容器（MaterialApp + 中文本地化）
Future<void> pumpKnowledgeView(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      home: Scaffold(body: child),
    ),
  );
  await tester.pump();
}

/// 让轻提示（Toast）自然结束，避免测试结束时残留定时器
Future<void> drainToasts(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 3));
  await tester.pump();
}
