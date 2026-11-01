import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/evidence/data/multipart_transport.dart';
import 'package:worktodo_app/features/evidence/models/evidence_models.dart';
import 'package:worktodo_app/features/evidence/services/evidence_draft_store.dart';
import 'package:worktodo_app/features/evidence/services/job_poller.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('材料模型', () {
    test('推断材料类型：无文件为文档，同类取该类型，混合为交付物', () {
      expect(inferEvidenceKind(const []), 'document');

      expect(
        inferEvidenceKind(const [
          EvidenceFileRef(fileId: 1, name: 'a.pdf'),
          EvidenceFileRef(fileId: 2, name: 'b.docx'),
        ]),
        'document',
      );

      expect(
        inferEvidenceKind(const [EvidenceFileRef(fileId: 1, name: '设计稿.fig')]),
        'figma',
      );

      expect(
        inferEvidenceKind(const [EvidenceFileRef(fileId: 1, name: 'run.log')]),
        'log',
      );

      expect(
        inferEvidenceKind(const [EvidenceFileRef(fileId: 1, name: 'main.py')]),
        'commit',
      );

      expect(
        inferEvidenceKind(const [
          EvidenceFileRef(fileId: 1, name: 'a.pdf'),
          EvidenceFileRef(fileId: 2, name: 'a.png'),
        ]),
        'delivery',
      );
    });

    test('文件大小与状态文案为中文，未知状态也有兜底', () {
      expect(formatFileSize(512 * 1024), '512 KB');
      expect(formatFileSize(3 * 1024 * 1024), '3.0 MB');
      expect(formatFileSize(100), '1 KB');
      expect(formatFileSize(null), '大小未知');
      expect(evidenceStatusLabel('adopted'), '已采纳');
      expect(evidenceStatusLabel('unknown_value'), '未知状态');
      expect(jobStatusLabel('running'), '正在处理');
    });

    test('材料包解析兼容缺字段与嵌套 structured 的类型', () {
      final package = EvidencePackage.fromJson({
        'id': 91,
        'node_id': 7,
        'project_id': 3,
        'status': 'pending',
        'summary_text': '完成评审',
        'structured': {'evidence_kind': 'figma'},
        'files': [
          {'file_id': 1, 'original_name': '原型.fig', 'size_bytes': 1024},
        ],
      });
      expect(package.evidenceKind, 'figma');
      expect(package.kindLabel, '设计稿');
      expect(package.statusLabel, '待验收');
      expect(package.files.single.sizeLabel, '1 KB');
    });

    test('知识库目录优先选择可整理的材料', () {
      final catalog = WikiCatalog.fromJson({
        'engine': 'llmwiki',
        'can_publish': false,
        'materials': [
          {'id': 1, 'title': '不可整理', 'can_generate': false},
          {'id': 2, 'title': '可整理', 'can_generate': true},
        ],
      });
      expect(catalog.preferredMaterial?.id, 2);
      expect(catalog.canPublish, isFalse);
    });
  });

  group('multipart 报文', () {
    test('包含表单字段、中文文件名与文件字节，边界符闭合', () {
      final body = buildMultipartBody(
        const MultipartPayload(
          path: '/evidence/files',
          fileField: 'file',
          filename: '交互评审纪要.pdf',
          contentType: 'application/pdf',
          bytes: [1, 2, 3],
          fields: {'company_id': '1', 'project_id': '3'},
        ),
      );
      final text = utf8.decode(body.bytes, allowMalformed: true);
      expect(text, contains('name="company_id"'));
      expect(text, contains('name="project_id"'));
      expect(text, contains('filename="交互评审纪要.pdf"'));
      expect(text, contains('Content-Type: application/pdf'));
      expect(text.trimRight(), endsWith('--${body.boundary}--'));
    });

    test('路径拼接不会重复斜杠', () {
      expect(
        buildUri('http://localhost:8010/api/v1/', '/evidence/files').toString(),
        'http://localhost:8010/api/v1/evidence/files',
      );
      expect(
        buildUri('http://localhost:8010/api/v1', 'evidence/files').toString(),
        'http://localhost:8010/api/v1/evidence/files',
      );
    });
  });

  group('后台任务轮询', () {
    test('轮询到终态即停止，不继续请求', () async {
      final statuses = ['pending', 'running', 'succeeded'];
      var calls = 0;
      final poller = JobPoller(
        fetch: (jobId) async {
          final status = statuses[calls.clamp(0, statuses.length - 1)];
          calls++;
          return BackgroundJob(jobId: jobId, status: status);
        },
        interval: const Duration(milliseconds: 1),
        maxAttempts: 10,
      );

      final job = await poller.poll('55');
      expect(job?.status, 'succeeded');
      expect(calls, 3);
    });

    test('达到上限仍未终态时返回最后一次结果', () async {
      var calls = 0;
      final poller = JobPoller(
        fetch: (jobId) async {
          calls++;
          return BackgroundJob(jobId: jobId, status: 'running');
        },
        interval: const Duration(milliseconds: 1),
        maxAttempts: 3,
      );

      final job = await poller.poll('55');
      expect(job?.status, 'running');
      expect(job?.isTerminal, isFalse);
      expect(calls, 3);
    });

    test('取消后不再发起请求', () async {
      var calls = 0;
      final poller = JobPoller(
        fetch: (jobId) async {
          calls++;
          return BackgroundJob(jobId: jobId, status: 'pending');
        },
        interval: const Duration(milliseconds: 1),
        maxAttempts: 10,
      );

      final future = poller.poll('55', onUpdate: (_) {
        if (calls >= 2) poller.cancel();
      });
      await future;
      expect(calls, lessThan(10));
    });

    test('查询异常向上抛出，不被静默吞掉', () async {
      final poller = JobPoller(
        fetch: (jobId) async => throw StateError('接口异常'),
        interval: const Duration(milliseconds: 1),
      );
      expect(() => poller.poll('55'), throwsStateError);
    });
  });

  group('离线草稿', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('按用户/项目/节点隔离保存与读取，可清理', () async {
      final store = EvidenceDraftStore();
      await store.save(
        userId: 11,
        projectId: 3,
        nodeId: 7,
        draft: EvidenceDraft(
          summary: '断网时的说明',
          files: const [
            UploadedEvidenceFile(fileId: 501, name: '纪要.pdf', sizeBytes: 2048),
          ],
          savedAt: DateTime(2026, 11, 1, 10, 30),
        ),
      );

      final loaded = await store.load(userId: 11, projectId: 3, nodeId: 7);
      expect(loaded?.summary, '断网时的说明');
      expect(loaded?.files.single.name, '纪要.pdf');

      // 其它节点读不到该草稿
      expect(await store.load(userId: 11, projectId: 3, nodeId: 8), isNull);
      // 其它项目读不到该草稿
      expect(await store.load(userId: 11, projectId: 4, nodeId: 7), isNull);

      await store.clear(userId: 11, projectId: 3, nodeId: 7);
      expect(await store.load(userId: 11, projectId: 3, nodeId: 7), isNull);
    });

    test('退出登录时清理该用户全部草稿，不影响其他用户', () async {
      final store = EvidenceDraftStore();
      final draft = EvidenceDraft(
        summary: '草稿',
        files: const [],
        savedAt: DateTime(2026, 11, 1),
      );
      await store.save(userId: 11, projectId: 3, nodeId: 7, draft: draft);
      await store.save(userId: 12, projectId: 3, nodeId: 7, draft: draft);

      await store.clearForUser(11);
      expect(await store.load(userId: 11, projectId: 3, nodeId: 7), isNull);
      expect(await store.load(userId: 12, projectId: 3, nodeId: 7), isNotNull);
    });

    test('草稿内容损坏时返回 null 而不是崩溃', () async {
      SharedPreferences.setMockInitialValues({
        EvidenceDraftStore.buildKey(userId: 11, projectId: 3, nodeId: 7):
            '{不是合法 JSON',
      });
      final store = EvidenceDraftStore();
      expect(await store.load(userId: 11, projectId: 3, nodeId: 7), isNull);
    });

    test('空草稿不写入内容时读取为 null', () async {
      final store = EvidenceDraftStore();
      await store.save(
        userId: 11,
        projectId: 3,
        nodeId: 7,
        draft: EvidenceDraft(
          summary: '   ',
          files: const [],
          savedAt: DateTime(2026, 11, 1),
        ),
      );
      expect(await store.load(userId: 11, projectId: 3, nodeId: 7), isNull);
    });
  });
}
