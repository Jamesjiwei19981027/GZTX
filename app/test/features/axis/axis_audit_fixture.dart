import 'axis_test_harness.dart';

Map<String, dynamic> storedAuditFixture(
        {bool restricted = false, String mode = 'rule'}) =>
    {
      'id': 8,
      'project_id': AxisTestHarness.projectId,
      'scope': 'self',
      'mode': mode,
      'mode_message': mode == 'ai' ? 'AI 审计' : '未配置 AI，以下为规则检查',
      'overall_risk': 'medium',
      'generated_at': '2026-11-16T08:00:00Z',
      'restricted': restricted,
      'nodes': [
        {
          'node_id': 101,
          'title': '设计负责人',
          'risk_level': 'medium',
          'summary': '材料待核验',
          'findings': [
            {
              'type': '言行不符',
              'description': '完成状态缺少材料支撑',
              'matter_ids': [102]
            }
          ],
          'suggested_actions': ['核验交付材料']
        },
      ],
    };

void registerAuditFixture(AxisTestHarness harness,
    {bool withHistory = true, bool manager = true}) {
  final base = '/projects/${AxisTestHarness.projectId}';
  harness.helper.whenGet('$base/audit-options', {
    'can_manage': manager,
    'scopes': [
      {'scope': 'self', 'label': '本人信息'},
      {'scope': 'node', 'node_id': 101, 'label': '设计及下属'},
      if (manager) {'scope': 'project', 'label': '整个项目'},
    ],
    'people': manager
        ? [
            {
              'node_id': 101,
              'title': '设计负责人',
              'person_depth': 3,
              'allow_audit_subordinates': null,
              'effective': false
            },
          ]
        : <Map<String, dynamic>>[],
  });
  harness.helper.whenGet('$base/audits', {
    'items': withHistory ? [storedAuditFixture()] : [],
    'has_more': false
  });
  harness.helper
      .whenGet('$base/audits/8', storedAuditFixture(restricted: true));
  harness.helper.whenPost('$base/audits', storedAuditFixture(mode: 'ai'));
}
