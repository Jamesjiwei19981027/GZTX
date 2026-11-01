import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/models/knowledge_models.dart';
import 'package:worktodo_app/features/knowledge/widgets/knowledge_graph.dart';
import 'package:worktodo_app/core/errors/app_error.dart';

void main() {
  group('知识条目解析与文案', () {
    test('标签按中英文逗号和换行切分并去重', () {
      expect(
        parseKnowledgeTags('验收，接口\n验收, 交付 '),
        ['验收', '接口', '交付'],
      );
      expect(parseKnowledgeTags('   '), isEmpty);
    });

    test('标题可不填：从正文首行生成，最长 60 字', () {
      expect(deriveKnowledgeTitle('', '第一行\n第二行'), '第一行');
      expect(deriveKnowledgeTitle(' 自填标题 ', '正文'), '自填标题');
      expect(deriveKnowledgeTitle('', '一' * 80).length, 60);
    });

    test('来源类型翻译成用户看得懂的中文，不出现 wiki 等词', () {
      const entry = PersonalKnowledgeEntry(
        id: 1,
        title: 't',
        sourceType: 'project_summary',
      );
      expect(entry.sourceLabel, '项目知识总结');
      expect(const PersonalKnowledgeEntry(id: 2, title: 't').sourceLabel, '我的笔记');
      const page = ProjectKnowledgePage(id: 1, title: 'p', source: 'llm_wiki');
      expect(page.sourceLabel, 'AI 整理 · 已发布');
      expect(
        const ProjectKnowledgePage(id: 2, title: 'p', source: 'manual').sourceLabel,
        '项目共享笔记',
      );
    });

    test('缺失字段时解析不抛异常', () {
      final space = PersonalKnowledgeSpace.fromJson(const {});
      expect(space.entries, isEmpty);
      expect(space.scope.projectId, 0);
      final catalog = ProjectKnowledgeCatalog.fromJson(const {});
      expect(catalog.pages, isEmpty);
      expect(catalog.permissions.canSummarize, isFalse);
    });

    test('异常统一翻译成中文提示', () {
      expect(
        knowledgeErrorMessage(NetworkException('x')),
        '网络连接异常，请检查网络后重试',
      );
      expect(
        knowledgeErrorMessage(ApiException('笔记已更新，请重新整理')),
        '笔记已更新，请重新整理',
      );
      expect(
        knowledgeErrorMessage(AuthException('登录已过期，请重新登录')),
        '登录已过期，请重新登录',
      );
      expect(knowledgeErrorMessage(StateError('boom')), '操作失败，请重试');
    });
  });

  group('关联图坐标排布', () {
    test('没有保存位置时按网格铺开且互不重叠', () {
      final entries = [
        for (var index = 0; index < 5; index++)
          PersonalKnowledgeEntry(id: index + 1, title: '条目 $index'),
      ];
      final positions = resolvePersonalPositions(entries);

      expect(positions.length, 5);
      final used = <String>{};
      for (final position in positions.values) {
        expect(used.add('${position.x}:${position.y}'), isTrue);
      }
    });

    test('已有保存位置优先沿用', () {
      final entries = [
        const PersonalKnowledgeEntry(
          id: 1,
          title: '已定位',
          position: KnowledgePoint(400, 600),
        ),
        const PersonalKnowledgeEntry(id: 2, title: '待定位'),
      ];
      final positions = resolvePersonalPositions(entries);
      expect(positions[1]!.x, 400);
      expect(positions[1]!.y, 600);
      expect(positions.containsKey(2), isTrue);
    });
  });
}
