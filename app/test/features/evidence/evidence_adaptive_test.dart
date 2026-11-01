import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_detail_screen.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_submit_screen.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_draft_screen.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_screen.dart';
import 'package:worktodo_app/features/evidence/services/attachment_picker.dart';
import 'package:worktodo_app/features/evidence/services/voice_recorder.dart';

import '../../helpers/mock_api_client.dart';
import '../../helpers/responsive_checker.dart';
import 'helpers/evidence_harness.dart';

/// 320 窄屏、430 宽屏、系统字号 200%、深色模式在 iOS 与安卓双端的布局校验
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper contentHelper() {
    final helper = MockApiClientHelper();
    helper.whenGet('/nodes/7', {'id': 7, 'title': '完成交互原型评审'});
    helper.whenGet('/evidence/91', packageJson(files: [fileJson()]));
    helper.whenGet(
      '/projects/3/llm-wiki',
      wikiCatalogJson(
        pages: [
          wikiPageJson(revision: 2, facts: [wikiFactJson()]),
        ],
        drafts: [
          wikiPageJson(
            id: 5,
            title: '评审结论草稿',
            source: 'llm_wiki_draft',
            facts: [wikiFactJson()],
          ),
        ],
        materials: [wikiMaterialJson()],
      ),
    );
    return helper;
  }

  testWidgets('提交材料页在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: EvidenceSubmitScreen(
        api: buildEvidenceApi(helper),
        userId: 11,
        userName: '林悦',
        companyId: 1,
        projectId: 3,
        nodeId: 7,
        attachmentPicker: const UnavailableAttachmentPicker(),
        voiceRecorder: const UnavailableVoiceRecorder(),
      ),
    );
  });

  testWidgets('材料详情页在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: EvidenceDetailScreen(
        api: buildEvidenceApi(helper),
        packageId: 91,
        currentUserId: 11,
      ),
    );
  });

  testWidgets('项目知识已发布页在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: WikiScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        projectName: '责任树联调',
      ),
    );
  });

  testWidgets('项目知识草稿列表在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: WikiScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        projectName: '责任树联调',
        initialTab: WikiTab.drafts,
      ),
    );
  });

  testWidgets('项目知识检索页在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: WikiScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        projectName: '责任树联调',
        initialTab: WikiTab.search,
      ),
    );
  });

  testWidgets('知识草稿页在多尺寸与极端无障碍设置下不溢出', (tester) async {
    final helper = contentHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: WikiDraftScreen(
        api: buildEvidenceApi(helper),
        projectId: 3,
        draftId: 5,
      ),
    );
  });
}
