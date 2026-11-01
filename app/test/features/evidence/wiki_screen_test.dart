import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_draft_screen.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/evidence_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(resetToastForTesting);
  tearDown(resetToastForTesting);

  testWidgets('已发布页展示知识正文、版本与参考材料', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/3/llm-wiki',
      wikiCatalogJson(
        pages: [wikiPageJson(revision: 3)],
        materials: [wikiMaterialJson()],
      ),
    );

    await pumpEvidenceScreen(
      tester,
      WikiScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        projectName: '责任树联调',
      ),
    );
    await settle(tester);

    expect(find.text('移动端体验升级'), findsWidgets);
    expect(find.textContaining('第 3 版'), findsOneWidget);
    expect(find.text('本阶段完成任务与汇报链路联调。'), findsOneWidget);
    expect(find.text('完成交互原型评审'), findsOneWidget);
    expect(find.textContaining('可整理'), findsOneWidget);
    expect(find.text('生成知识草稿'), findsOneWidget);
  });

  testWidgets('生成知识草稿成功后切到草稿页并展示新草稿', (tester) async {
    final helper = MockApiClientHelper();
    final catalog = wikiCatalogJson(
      pages: [wikiPageJson(revision: 1)],
      materials: [wikiMaterialJson()],
    );
    helper.whenGet('/projects/3/llm-wiki', catalog);
    helper.whenPost('/projects/3/llm-wiki/drafts', {'id': 5});

    await pumpEvidenceScreen(
      tester,
      WikiScreen(api: buildEvidenceApi(helper), projectId: 3),
    );
    await settle(tester);

    // 模拟服务端在生成后多出一条草稿
    catalog['drafts'] = [
      wikiPageJson(id: 5, title: '评审结论草稿', source: 'llm_wiki_draft'),
    ];

    await tester.tap(find.text('生成知识草稿'));
    await settle(tester);
    await settle(tester);

    final post = helper.history.lastWhere(
      (record) =>
          record.method == 'POST' && record.url.path.endsWith('/llm-wiki/drafts'),
    );
    expect(post.body['package_id'], 91);
    expect(find.text('评审结论草稿'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('没有可整理材料时给出明确提示', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/3/llm-wiki', wikiCatalogJson());

    await pumpEvidenceScreen(
      tester,
      WikiScreen(api: buildEvidenceApi(helper), projectId: 3),
    );
    await settle(tester);

    await tester.tap(find.text('生成知识草稿'));
    await settle(tester);

    expect(find.textContaining('暂无可用于整理知识的有效材料'), findsOneWidget);
  });

  testWidgets('检索命中后展示来源与正文', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/3/llm-wiki', wikiCatalogJson(pages: [wikiPageJson()]));
    helper.whenGet(
      '/projects/3/knowledge/search',
      {
        'items': [
          {
            'chunk_id': 1,
            'chunk_text': '员工工作台、管理者汇报与任务详情纳入本次原型验收范围。',
            'source_type': 'evidence',
            'source_id': 91,
          },
        ],
      },
      query: {'q': '原型验收', 'top_k': '5'},
    );

    await pumpEvidenceScreen(
      tester,
      WikiScreen(api: buildEvidenceApi(helper), projectId: 3),
      size: const Size(412, 1200),
    );
    await settle(tester);

    await tester.tap(find.text('资料搜索'));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '原型验收');
    await settle(tester);
    await tester.tap(find.text('检索'));
    await settle(tester);

    expect(find.text('材料 #91'), findsOneWidget);
    expect(
      find.textContaining('员工工作台、管理者汇报与任务详情纳入本次原型验收范围。'),
      findsOneWidget,
    );
  });

  testWidgets('检索无结果时显示空状态', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/3/llm-wiki', wikiCatalogJson());
    helper.whenGet(
      '/projects/3/knowledge/search',
      {'items': <Map<String, dynamic>>[]},
      query: {'q': '不存在的关键词', 'top_k': '5'},
    );

    await pumpEvidenceScreen(
      tester,
      WikiScreen(api: buildEvidenceApi(helper), projectId: 3),
      size: const Size(412, 1200),
    );
    await settle(tester);

    await tester.tap(find.text('资料搜索'));
    await settle(tester);
    await tester.enterText(find.byType(TextFormField), '不存在的关键词');
    await settle(tester);
    await tester.tap(find.text('检索'));
    await settle(tester);

    expect(find.text('没有检索到相关内容'), findsOneWidget);
  });

  testWidgets('无权限查看项目知识时展示无权限状态', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/3/llm-wiki',
      {'code': 403, 'message': '无权查看该项目知识', 'data': null},
      statusCode: 403,
    );

    await pumpEvidenceScreen(
      tester,
      WikiScreen(api: buildEvidenceApi(helper), projectId: 3),
    );
    await settle(tester);

    expect(find.text('暂无访问权限'), findsOneWidget);
  });

  testWidgets('知识草稿展示引用来源，可查看原文并在有权限时确认发布', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/3/llm-wiki',
      wikiCatalogJson(
        pages: [wikiPageJson()],
        drafts: [
          wikiPageJson(
            id: 5,
            title: '评审结论草稿',
            body: '本次评审通过，进入开发阶段。',
            source: 'llm_wiki_draft',
            facts: [wikiFactJson()],
          ),
        ],
      ),
    );
    helper.whenPost('/projects/3/llm-wiki/drafts/5/publish', {
      'published_ids': [5],
    });

    await pumpEvidenceRouter(
      tester,
      entry: WikiDraftScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        draftId: 5,
      ),
    );
    await settle(tester);

    await tester.tap(find.text('打开草稿'));
    await tester.pumpAndSettle();

    expect(find.text('评审结论草稿'), findsOneWidget);
    expect(find.text('本次评审通过，进入开发阶段。'), findsOneWidget);
    expect(find.text('引用来源（1）'), findsOneWidget);

    // 查看原文引述
    await tester.tap(find.text('移动端页面已完成评审'));
    await tester.pumpAndSettle();
    expect(find.text('证据来源追溯'), findsOneWidget);
    expect(find.textContaining('本周完成移动端页面评审并通过验收'), findsOneWidget);
    expect(find.textContaining('第 12—14 行'), findsOneWidget);
    await tester.tap(find.text('查看原始证据包'));
    await tester.pumpAndSettle();
    expect(find.text('材料详情 91'), findsOneWidget);

    // 系统返回键回到草稿继续发布
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认发布'));
    await tester.pumpAndSettle();
    // 二次确认弹窗
    await tester.tap(find.text('确认发布').last);
    await tester.pumpAndSettle();

    final published = helper.history.any(
      (record) =>
          record.method == 'POST' &&
          record.url.path.endsWith('/llm-wiki/drafts/5/publish'),
    );
    expect(published, isTrue);
    // 发布后回到上一页
    expect(find.text('打开草稿'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('没有发布权限时发布按钮不可点击并说明原因', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/3/llm-wiki',
      wikiCatalogJson(
        canPublish: false,
        drafts: [
          wikiPageJson(id: 5, title: '评审结论草稿', source: 'llm_wiki_draft'),
        ],
      ),
    );

    await pumpEvidenceScreen(
      tester,
      WikiDraftScreen(api: buildEvidenceApi(helper), projectId: 3, draftId: 5),
    );
    await settle(tester);

    expect(find.textContaining('当前账号没有项目知识管理权限'), findsOneWidget);
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, '确认发布'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('草稿不存在时给出可见的空状态与会刷新入口', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/3/llm-wiki', wikiCatalogJson());

    await pumpEvidenceScreen(
      tester,
      WikiDraftScreen(api: buildEvidenceApi(helper), projectId: 3, draftId: 99),
    );
    await settle(tester);

    expect(find.text('草稿不可用'), findsOneWidget);
    expect(find.text('刷新'), findsOneWidget);
  });
}
