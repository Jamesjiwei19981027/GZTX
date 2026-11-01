import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/data/voice_input.dart';
import 'package:worktodo_app/features/knowledge/models/knowledge_models.dart';

import '../../helpers/mock_api_client.dart';

void main() {
  group('个人知识空间接口封装', () {
    test('读取知识空间：路径、查询与条目解析', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/7/personal-knowledge', {
        'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
        'entries': [
          {
            'id': 21,
            'title': '客户需求确认',
            'body_text': '客户确认先做验收清单',
            'tags': ['验收', '需求'],
            'position': {'x': 12.5, 'y': 30},
            'source_type': 'manual',
            'source_id': null,
            'source_ref': <String, dynamic>{},
            'updated_at': '2026-10-31T02:00:00Z',
          },
        ],
        'links': [
          {
            'id': 5,
            'source_entry_id': 21,
            'target_entry_id': 22,
            'label': '提供依据',
          },
        ],
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final space = await repository.loadPersonalSpace(7);

      expect(space.scope.projectId, 7);
      expect(space.scope.ownerUserId, 11);
      expect(space.entries.single.title, '客户需求确认');
      expect(space.entries.single.tags, ['验收', '需求']);
      expect(space.entries.single.position!.x, 12.5);
      expect(space.entries.single.sourceLabel, '我的笔记');
      expect(space.links.single.label, '提供依据');
      expect(
        helper.history.last.url.path,
        '/api/v1/projects/7/personal-knowledge',
      );
    });

    test('新建条目：提交标题、正文与标签', () async {
      final helper = MockApiClientHelper();
      helper.whenPost('/projects/7/personal-knowledge/entries', {
        'id': 31,
        'title': '验收标准',
        'body_text': '接口全部走通',
        'tags': ['验收'],
        'position': null,
        'source_type': 'manual',
        'source_id': null,
        'source_ref': <String, dynamic>{},
        'updated_at': null,
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final created = await repository.createEntry(
        7,
        title: '验收标准',
        bodyText: '接口全部走通',
        tags: ['验收'],
      );

      expect(created.id, 31);
      final request = helper.history.last;
      expect(request.method, 'POST');
      expect(request.body['title'], '验收标准');
      expect(request.body['body_text'], '接口全部走通');
      expect(request.body['tags'], ['验收']);
    });

    test('修改条目：只提交被修改的字段（位置）', () async {
      final helper = MockApiClientHelper();
      helper.register('PATCH', '/projects/7/personal-knowledge/entries/21', {
        'id': 21,
        'title': '客户需求确认',
        'body_text': '',
        'tags': <String>[],
        'position': {'x': 40, 'y': 80},
        'source_type': 'manual',
        'source_id': null,
        'source_ref': <String, dynamic>{},
        'updated_at': null,
      });
      final repository = KnowledgeRepository(helper.buildClient());

      await repository.updateEntry(
        7,
        21,
        position: const KnowledgePoint(40, 80),
      );

      final body = helper.history.last.body as Map<String, dynamic>;
      expect(body.keys, ['position']);
      expect(body['position'], {'x': 40.0, 'y': 80.0});
    });

    test('AI 建议与采纳：分别请求 assist 与 assist/apply', () async {
      final helper = MockApiClientHelper();
      helper.whenPost('/projects/7/personal-knowledge/assist', {
        'analyzed': 2,
        'suggestions': [
          {
            'source_entry_id': 21,
            'target_entry_id': 22,
            'label': '提供验收依据',
            'reason': '两条笔记都在讲验收范围',
            'source_quote': '验收清单',
            'target_quote': '验收范围',
            'source_fingerprint': 'aaa',
            'target_fingerprint': 'bbb',
          },
        ],
      });
      helper.whenPost('/projects/7/personal-knowledge/assist/apply', {
        'created': 1,
        'links': [
          {
            'id': 9,
            'source_entry_id': 21,
            'target_entry_id': 22,
            'label': '提供验收依据',
          },
        ],
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final result = await repository.suggestRelationships(7);
      expect(result.analyzed, 2);
      expect(result.suggestions.single.label, '提供验收依据');

      final applied = await repository.applySuggestions(7, result.suggestions);
      expect(applied.created, 1);
      expect(applied.links.single.id, 9);

      final request = helper.history.last;
      expect(request.url.path, '/api/v1/projects/7/personal-knowledge/assist/apply');
      final suggestions = (request.body as Map<String, dynamic>)['suggestions'] as List;
      expect((suggestions.single as Map)['source_fingerprint'], 'aaa');
    });

    test('服务端错误保留后端中文提示', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/7/personal-knowledge',
        jsonEncode({'code': 403, 'message': '需要在职公司成员与当前项目成员资格'}),
        statusCode: 403,
      );
      final repository = KnowledgeRepository(helper.buildClient());

      await expectLater(
        repository.loadPersonalSpace(7),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            '需要在职公司成员与当前项目成员资格',
          ),
        ),
      );
    });

    test('断网抛出网络异常并翻译成中文提示', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/7/personal-knowledge',
        Exception('网络断开'),
      );
      final repository = KnowledgeRepository(helper.buildClient());

      Object? captured;
      try {
        await repository.loadPersonalSpace(7);
      } catch (error) {
        captured = error;
      }
      expect(captured, isA<NetworkException>());
      expect(knowledgeErrorMessage(captured!), '网络连接异常，请检查网络后重试');
      expect(isNetworkFailure(captured), isTrue);
    });
  });

  group('项目知识空间接口封装', () {
    test('读取目录并解析权限与成员', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/7/knowledge-space', {
        'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
        'pages': [
          {
            'id': 4,
            'title': '八项接口通过验收',
            'body_text': '两项待复核',
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
        'permissions': {'can_summarize': false, 'can_manage_grants': true},
        'members': [
          {
            'user_id': 11,
            'name': '张三',
            'can_summarize': false,
            'is_manager': false,
          },
        ],
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final catalog = await repository.loadProjectCatalog(7);

      expect(catalog.pages.single.sourceLabel, 'AI 整理 · 已发布');
      expect(catalog.pages.single.facts.single.packageId, 12);
      expect(catalog.pages.single.facts.single.lineLabel, '第 3–5 行');
      expect(catalog.permissions.canSummarize, isFalse);
      expect(catalog.permissions.canManageGrants, isTrue);
      expect(catalog.members.single.name, '张三');
    });

    test('生成总结与确认保存的请求体', () async {
      final helper = MockApiClientHelper();
      helper.whenPost('/projects/7/knowledge-space/summaries', {
        'id': 88,
        'title': '设计联调验收注意事项',
        'body_text': '总结正文',
        'sources': [
          {'page_id': 4, 'title': '八项接口通过验收', 'quote': '八项接口通过验收'},
        ],
        'page_ids': [4],
        'status': 'draft',
        'provider': 'openai',
        'model_source': 'company',
        'personal_entry_id': null,
      });
      helper.whenPost('/projects/7/knowledge-space/summaries/88/save', {
        'entry': {
          'id': 55,
          'title': '设计联调验收注意事项',
          'body_text': '总结正文',
          'tags': <String>[],
          'source_type': 'project_summary',
          'source_id': 88,
          'source_ref': <String, dynamic>{},
          'updated_at': null,
        },
        'already_saved': false,
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final draft = await repository.generateSummary(
        7,
        pageIds: const [4],
        instruction: '提炼验收要点',
      );
      expect(draft.id, 88);
      expect(draft.sources.single.quote, '八项接口通过验收');
      expect(
        (helper.history.last.body as Map<String, dynamic>)['instruction'],
        '提炼验收要点',
      );

      final saved = await repository.saveSummary(
        7,
        88,
        title: '设计联调验收注意事项',
        bodyText: '总结正文',
        tags: const ['验收'],
      );
      expect(saved.entry.id, 55);
      expect(saved.alreadySaved, isFalse);
      expect(
        helper.history.last.url.path,
        '/api/v1/projects/7/knowledge-space/summaries/88/save',
      );
    });

    test('成员授权：PUT 携带 can_summarize', () async {
      final helper = MockApiClientHelper();
      helper.whenPut('/projects/7/knowledge-space/grants/12', {
        'user_id': 12,
        'name': '李四',
        'can_summarize': true,
        'is_manager': false,
      });
      final repository = KnowledgeRepository(helper.buildClient());

      final member = await repository.setGrant(7, 12, canSummarize: true);

      expect(member.canSummarize, isTrue);
      expect(helper.history.last.body, {'can_summarize': true});
    });
  });

  group('语音转文字', () {
    test('multipart 上传到 /asr/transcribe 并返回识别文字', () async {
      final helper = MockApiClientHelper();
      final api = helper.buildClient();
      late http.Request captured;
      final transcriber = ApiVoiceTranscriber(
        api: api,
        client: MockClient((request) async {
          captured = request;
          return http.Response(
            jsonEncode({
              'code': 200,
              'message': 'success',
              'data': {'text': '客户确认先做验收清单', 'provider_id': 'openai'},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final text = await transcriber.transcribe(
        recording: VoiceRecording(
          bytes: Uint8List.fromList([1, 2, 3]),
          filename: 'knowledge-voice.webm',
          mimeType: 'audio/webm',
        ),
        companyId: 3,
        projectId: 7,
      );

      expect(text, '客户确认先做验收清单');
      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/v1/asr/transcribe');
      expect(captured.headers['Authorization'], 'Bearer mock-access-token');
      expect(captured.body, contains('company_id'));
      expect(captured.body, contains('knowledge-voice.webm'));
      transcriber.dispose();
    });

    test('服务端未配置语音服务时给出后端中文提示', () async {
      final helper = MockApiClientHelper();
      final transcriber = ApiVoiceTranscriber(
        api: helper.buildClient(),
        client: MockClient((request) async => http.Response(
              jsonEncode({
                'code': 50300,
                'message': '语音转写服务尚未配置，请联系管理员配置 ASR，或直接输入文字',
              }),
              503,
              headers: {'content-type': 'application/json; charset=utf-8'},
            )),
      );

      await expectLater(
        transcriber.transcribe(
          recording: VoiceRecording(
            bytes: Uint8List.fromList([1]),
            filename: 'a.webm',
            mimeType: 'audio/webm',
          ),
          companyId: 3,
          projectId: 7,
        ),
        throwsA(isA<VoiceInputException>().having(
          (error) => error.message,
          'message',
          contains('语音转写服务尚未配置'),
        )),
      );
      transcriber.dispose();
    });

    test('未接入录音组件时明确提示，不假装成功', () async {
      const recorder = UnavailableVoiceRecorder();
      await expectLater(
        recorder.start(),
        throwsA(isA<VoiceInputException>()),
      );
    });
  });
}
