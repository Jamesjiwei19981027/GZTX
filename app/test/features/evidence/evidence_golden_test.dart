import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_detail_screen.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_submit_screen.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_draft_screen.dart';
import 'package:worktodo_app/features/evidence/screens/wiki_screen.dart';
import 'package:worktodo_app/features/evidence/services/attachment_picker.dart';
import 'package:worktodo_app/features/evidence/services/voice_recorder.dart';

import '../../helpers/golden_test_helper.dart';
import '../../helpers/mock_api_client.dart';
import 'helpers/evidence_harness.dart';

/// 双平台外观基准：每页各一张 iOS、一张安卓截图。
/// 只在 Windows 上生成与比对，CI 使用 --exclude-tags golden 跳过。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper helper() {
    final client = MockApiClientHelper();
    client.whenGet('/nodes/7', {'id': 7, 'title': '完成交互原型评审'});
    client.whenGet('/evidence/91', packageJson(files: [fileJson()]));
    client.whenGet(
      '/projects/3/llm-wiki',
      wikiCatalogJson(
        pages: [
          wikiPageJson(revision: 3, facts: [wikiFactJson()]),
        ],
        drafts: [
          wikiDraftJson(
            id: 5,
            title: '评审结论草稿',
            body: '本阶段完成任务与汇报链路联调。',
            facts: [wikiFactJson()],
          ),
        ],
        materials: [
          wikiMaterialJson(),
          wikiMaterialJson(id: 92, title: '原型验收清单', canGenerate: false),
        ],
      ),
    );
    return client;
  }

  testWidgets(
    '提交材料页双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: EvidenceSubmitScreen(
          api: buildEvidenceApi(helper()),
          userId: 11,
          userName: '林悦',
          companyId: 1,
          projectId: 3,
          nodeId: 7,
          attachmentPicker: const UnavailableAttachmentPicker(),
          voiceRecorder: const UnavailableVoiceRecorder(),
        ),
        goldenFileNamePrefix: 'evidence_submit',
      );
    },
  );

  testWidgets(
    '材料详情页双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: EvidenceDetailScreen(
          api: buildEvidenceApi(helper()),
          packageId: 91,
          currentUserId: 11,
        ),
        goldenFileNamePrefix: 'evidence_detail',
      );
    },
  );

  testWidgets(
    '项目知识已发布页双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: WikiScreen(
          api: buildEvidenceApi(helper()),
          projectId: 3,
          projectName: '责任树联调',
        ),
        goldenFileNamePrefix: 'wiki_published',
      );
    },
  );

  testWidgets(
    '项目知识草稿列表双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: WikiScreen(
          api: buildEvidenceApi(helper()),
          projectId: 3,
          projectName: '责任树联调',
          initialTab: WikiTab.drafts,
        ),
        goldenFileNamePrefix: 'wiki_drafts',
      );
    },
  );

  testWidgets(
    '项目知识检索页双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: WikiScreen(
          api: buildEvidenceApi(helper()),
          projectId: 3,
          projectName: '责任树联调',
          initialTab: WikiTab.search,
        ),
        goldenFileNamePrefix: 'wiki_search',
      );
    },
  );

  testWidgets(
    '知识草稿页双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: WikiDraftScreen(
          api: buildEvidenceApi(helper()),
          projectId: 3,
          draftId: 5,
        ),
        goldenFileNamePrefix: 'wiki_draft',
      );
    },
  );
}
