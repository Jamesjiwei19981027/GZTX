import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';

import '../../helpers/mock_api_client.dart';

/// T04 测试夹具：统一模拟后端真实返回结构。
///
/// 字段严格取自：
/// - `projects.py::_node_dtos_batched`（人树/节点）
/// - `projects.py::list_project_members`（成员）
/// - `projects.py::get_my_permissions`（权限）
/// - `person_deletion.py::deletion_preview`（删除预览）
/// - `delegations.py::_dto`（委托）
/// - `shell.py::axis_audit`（审计）
class AxisTestHarness {
  AxisTestHarness._(this.helper, this.authState, this.api);

  final MockApiClientHelper helper;
  final AuthState authState;
  final AxisApi api;

  static const int projectId = 1;
  static const int memberUserId = 11;
  static const int pmUserId = 12;

  /// 后端标准信封的错误体（供 mock 直接返回字符串，确保 message 原样透出）。
  static String errorBody(int code, String message) =>
      jsonEncode({'code': code, 'message': message, 'data': null});

  static Map<String, dynamic> personNode({
    required int id,
    required int? parentId,
    required String name,
    required String role,
    required String department,
    required int userId,
    String nodeOrigin = 'project',
    int sortOrder = 0,
    List<Map<String, dynamic>> children = const [],
  }) {
    return {
      'id': id,
      'parent_id': parentId,
      'node_type_key': 'person',
      'behavior_template': 'person',
      'title': name,
      'description':
          '@axis-person ${jsonEncode({'name': name, 'roleTitle': role, 'department': department})}',
      'node_origin': nodeOrigin,
      'responsibility_permissions': {
        'evidence_submit': 'inherit',
        'allow_add_subordinates': true,
        'allow_add_work_items': true,
        if (nodeOrigin == 'subordinate') 'channel_access': false,
      },
      'sort_order': sortOrder,
      'progress_json': {'percent': 0, 'status': 'in_progress'},
      'assignees': [
        {
          'user_id': userId,
          'role_key': 'primary',
          'display_name': name,
          'avatar_url': null,
        },
      ],
      'children': children,
    };
  }

  static Map<String, dynamic> workItem({
    required int id,
    required int parentId,
    required String title,
    int percent = 70,
    String status = 'in_progress',
    String type = 'work_item',
  }) {
    return {
      'id': id,
      'parent_id': parentId,
      'node_type_key': type,
      'behavior_template': type,
      'title': title,
      'description': null,
      'node_origin': 'project',
      'responsibility_permissions': {},
      'sort_order': 0,
      'progress_json': {'percent': percent, 'status': status},
      'assignees': <Map<String, dynamic>>[],
      'children': <Map<String, dynamic>>[],
    };
  }

  /// 默认人树：王宁（主轴）→ 林悦（次级）→ 交互原型设计；陈宇（PM，终责）。
  static List<Map<String, dynamic>> defaultTree() => [
        personNode(
          id: 101,
          parentId: null,
          name: '王宁',
          role: '项目负责人',
          department: '项目部',
          userId: 10,
          sortOrder: 0,
          children: [
            personNode(
              id: 102,
              parentId: 101,
              name: '林悦',
              role: '设计负责人',
              department: '设计部',
              userId: memberUserId,
              nodeOrigin: 'subordinate',
              children: [
                workItem(id: 201, parentId: 102, title: '交互原型设计'),
              ],
            ),
          ],
        ),
        personNode(
          id: 104,
          parentId: null,
          name: '赵晨',
          role: '产品负责人',
          department: '产品部',
          userId: 13,
          sortOrder: 1,
          children: [
            workItem(id: 202, parentId: 104, title: '需求方案确认', percent: 40),
          ],
        ),
        personNode(
          id: 103,
          parentId: null,
          name: '陈宇',
          role: '项目经理',
          department: '项目部',
          userId: pmUserId,
          sortOrder: 2,
          children: [
            workItem(id: 203, parentId: 103, title: '核心功能开发', percent: 30),
          ],
        ),
      ];

  static Map<String, dynamic> defaultPermissions({required bool isPm}) => {
        'role': isPm ? 'pm' : 'member',
        'is_pm': isPm,
        'is_superadmin': false,
        'can_edit_all': isPm,
        'owned_node_ids': [102],
        'via_delegation': false,
        'can_move': isPm,
        'can_delete': isPm,
        'can_submit_evidence': true,
        'can_read_evidence': true,
        'node_permissions': {
          '101': {
            'can_edit_person': true,
            'can_delete_person': isPm,
            'can_move_person': isPm,
            'can_manage_assignees': isPm,
            'can_manage_permissions': isPm,
            'can_manage_channel_access': isPm,
            'can_add_subordinate': true,
            'can_add_work_item': true,
          },
          '102': {
            'can_edit_person': true,
            'can_delete_person': false,
            'can_move_person': false,
            'can_manage_assignees': false,
            'can_manage_permissions': true,
            'can_manage_channel_access': true,
            'can_add_subordinate': true,
            'can_add_work_item': true,
          },
          '103': {
            'can_edit_person': isPm,
            'can_delete_person': false,
            'can_move_person': false,
            'can_manage_assignees': false,
            'can_manage_permissions': isPm,
            'can_manage_channel_access': isPm,
            'can_add_subordinate': isPm,
            'can_add_work_item': isPm,
          },
          '104': {
            'can_edit_person': isPm,
            'can_delete_person': isPm,
            'can_move_person': isPm,
            'can_manage_assignees': isPm,
            'can_manage_permissions': isPm,
            'can_manage_channel_access': isPm,
            'can_add_subordinate': isPm,
            'can_add_work_item': isPm,
          },
        },
      };

  /// `/users/me/people-axis` 返回的是扁平节点列表（后端 shell.py 口径），
  /// 与人树接口的嵌套结构不同。
  static List<Map<String, dynamic>> flatten(
    List<Map<String, dynamic>> roots,
  ) {
    final out = <Map<String, dynamic>>[];
    void walk(Map<String, dynamic> node) {
      out.add({
        ...node,
        'children': <Map<String, dynamic>>[],
      });
      final children = node['children'];
      if (children is List) {
        for (final child in children) {
          if (child is Map) walk(Map<String, dynamic>.from(child));
        }
      }
    }

    for (final root in roots) {
      walk(root);
    }
    return out;
  }

  static Map<String, dynamic> projectJson({int id = projectId, String name = '责任树联合调试'}) => {
        'id': id,
        'name': name,
        'company_id': 1,
        'description': null,
        'status': 'active',
        'color': null,
        'role': 'pm',
        'pm_user_id': pmUserId,
        'created_by': pmUserId,
        'final_owner_along_delta': 0,
        'created_at': '2026-10-01T02:00:00Z',
        'updated_at': '2026-10-01T02:00:00Z',
      };

  static Map<String, dynamic> membersPayload() => {
        'items': [
          {
            'user_id': 10,
            'nickname': '王宁',
            'username': 'axis_pm',
            'display_name': '王宁',
            'avatar_url': null,
            'role': 'pm',
          },
          {
            'user_id': memberUserId,
            'nickname': '林悦',
            'username': 'axis_member',
            'display_name': '林悦',
            'avatar_url': null,
            'role': 'member',
          },
          {
            'user_id': pmUserId,
            'nickname': '陈宇',
            'username': 'axis_dev',
            'display_name': '陈宇',
            'avatar_url': null,
            'role': 'pm',
          },
          {
            'user_id': 13,
            'nickname': '赵晨',
            'username': 'axis_product',
            'display_name': '赵晨',
            'avatar_url': null,
            'role': 'member',
          },
        ],
      };

  static Map<String, dynamic> nodeDetail({
    int id = 102,
    int? parentId = 101,
    String type = 'person',
    String title = '林悦',
    Map<String, dynamic>? progress = const {'percent': 70, 'status': 'in_progress'},
  }) {
    return {
      'id': id,
      'parent_id': parentId,
      'node_type_key': type,
      'behavior_template': type,
      'title': title,
      'description': type == 'person'
          ? '@axis-person {"name":"林悦","roleTitle":"设计负责人","department":"设计部"}'
          : null,
      'node_origin': type == 'person' ? 'subordinate' : 'project',
      'responsibility_permissions': {'evidence_submit': 'inherit'},
      'sort_order': 0,
      'start_at': null,
      'due_at': null,
      'milestone_at': null,
      'allow_clear_text_progress': false,
      'progress_json': progress,
      'assignees': type == 'person'
          ? [
              {
                'user_id': memberUserId,
                'role_key': 'primary',
                'display_name': '林悦',
                'avatar_url': null,
              }
            ]
          : <Map<String, dynamic>>[],
      'ui_offset': null,
    };
  }

  static Map<String, dynamic> deletionPreview() => {
        'node_id': 102,
        'descendants': [
          {
            'id': 201,
            'title': '交互原型设计',
            'node_type_key': 'work_item',
            'node_origin': 'project',
          }
        ],
        'descendant_count': 1,
        'affected_user_ids': [memberUserId],
        'affected_task_count': 1,
        'affected_evidence_count': 2,
        'handover_candidates': [
          {'id': 104, 'title': '赵晨'},
        ],
        'requires_confirmation': true,
        'warning': '将影响 1 个下辖节点、1 位责任人员、1 个关联任务。'
            '级联删除会将关联任务移入回收站，并撤销无其他人员职责的成员在本项目的权限和群聊成员身份；历史消息与材料保留。',
        'preview_token': 'preview-token-102',
      };

  static Map<String, dynamic> delegationsPayload() => {
        'items': [
          {
            'id': 501,
            'company_id': 1,
            'project_id': projectId,
            'grantor_user_id': pmUserId,
            'grantee_user_id': memberUserId,
            'actions': ['progress.read', 'evidence.submit'],
            'status': 'active',
            'valid_from': null,
            'valid_to': '2026-12-31T15:59:59Z',
            'reason': '休假期间代办',
            'created_at': '2026-11-01T02:00:00Z',
          },
          {
            'id': 502,
            'company_id': 1,
            'project_id': projectId,
            'grantor_user_id': pmUserId,
            'grantee_user_id': 13,
            'actions': ['project.read'],
            'status': 'revoked',
            'valid_from': null,
            'valid_to': null,
            'reason': null,
            'created_at': '2026-10-20T02:00:00Z',
          },
        ],
      };

  static Map<String, dynamic> auditPayload() => {
        'project_id': projectId,
        'overall_risk': 'medium',
        'generated_at': '2026-11-01T07:20:00Z',
        'nodes': [
          {
            'node_id': 102,
            'title': '设计负责人',
            'risk_level': 'high',
            'summary': '事项 1，完成 0，阻塞 0，停滞 1',
            'suggested_actions': ['推动无进展事项提交首份证据'],
          },
          {
            'node_id': 104,
            'title': '产品负责人',
            'risk_level': 'medium',
            'summary': '事项 1，完成 0，阻塞 1，停滞 0',
            'suggested_actions': ['跟进被阻塞事项并补充证据'],
          },
        ],
      };

  static Map<String, dynamic> progressPayload() => {
        'node_id': 102,
        'progress_json': {'percent': 70, 'status': 'in_progress'},
        'recent_records': [
          {
            'id': 9001,
            'event_type': 'set_status',
            'source': 'manual',
            'actor_user_id': memberUserId,
            'evidence_package_id': null,
            'before_json': {'percent': 40},
            'after_json': {'percent': 70, 'status': 'in_progress'},
            'reason': '补齐员工端原型，管理者汇报入口待验收。',
            'created_at': '2026-11-01T07:20:00Z',
          },
          {
            'id': 9000,
            'event_type': 'progress.update',
            'source': 'evidence',
            'actor_user_id': memberUserId,
            'evidence_package_id': 88,
            'before_json': null,
            'after_json': {'percent': 40},
            'reason': '基础任务流程已完成，附评审纪要。',
            'created_at': '2026-10-31T09:40:00Z',
          },
        ],
      };

  /// 构建夹具。默认当前用户是林悦（次级人员，非 PM）；
  /// [isPm] 为 true 时当前用户切换成陈宇（项目经理）。
  static Future<AxisTestHarness> create({
    bool withProjects = true,
    bool isPm = false,
    bool withTree = true,
    List<Map<String, dynamic>>? tree,
    Map<String, dynamic>? permissions,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final helper = MockApiClientHelper();
    final userId = isPm ? pmUserId : memberUserId;

    helper.whenGet('/users/me', {
      'id': userId,
      'username': isPm ? 'axis_dev' : 'axis_member',
      'nickname': isPm ? '陈宇' : '林悦',
      'avatar_url': null,
      'email': null,
      'phone': null,
      'email_verified': true,
      'phone_verified': true,
      'notify_pref': <String, dynamic>{},
      'created_at': '2026-09-01T02:00:00Z',
    });
    helper.whenGet('/companies/mine', {
      'items': withProjects
          ? [
              {'id': 1, 'name': '责任树联调测试公司', 'slug': 'axis', 'status': 'active'},
            ]
          : <Map<String, dynamic>>[],
      'total': withProjects ? 1 : 0,
    });
    helper.whenGet(
      '/projects',
      {
        'items': withProjects
            ? [
                {
                  'id': projectId,
                  'name': '责任树联合调试',
                  'company_id': 1,
                  'status': 'active',
                  'role': isPm ? 'pm' : 'member',
                },
              ]
            : <Map<String, dynamic>>[],
        'total': withProjects ? 1 : 0,
      },
      query: {'company_id': '1', 'as_admin': 'true'},
    );

    if (withProjects) {
      helper.whenGet(
        '/projects/$projectId/tree',
        {'project_id': projectId, 'nodes': tree ?? defaultTree()},
        query: {'format': 'nested'},
      );
      helper.whenGet('/projects/$projectId/members', membersPayload());
      helper.whenGet(
        '/projects/$projectId/my-permissions',
        permissions ?? defaultPermissions(isPm: isPm),
      );
      helper.whenGet('/projects/$projectId', projectJson());
      helper.whenGet('/users/me/people-axis', {
        'projects': [
          {
            'project_id': projectId,
            'project_name': '责任树联合调试',
            'company_id': 1,
            'pm_user_id': pmUserId,
            'nodes': flatten(tree ?? defaultTree()),
          }
        ],
      });
    }
    if (withTree) {
      helper.whenGet('/nodes/102', nodeDetail());
      helper.whenGet('/nodes/201', nodeDetail(id: 201, parentId: 102, type: 'work_item', title: '交互原型设计'));
      helper.whenGet('/nodes/102/progress', progressPayload());
      helper.whenGet('/nodes/102/deletion-preview', deletionPreview());
    }

    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();
    final api = AxisApi(authState.api);
    return AxisTestHarness._(helper, authState, api);
  }

  /// 包一层 MaterialApp 与登录态，供页面组件测试使用。
  Widget wrap(Widget child) {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp(
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: child,
      ),
    );
  }
}
