import 'package:flutter/material.dart';
import '../../../design/design.dart';
import '../data/axis_audit_models.dart';
import '../data/axis_rules.dart';
import '../widgets/axis_common.dart';

class AxisStoredAuditResult extends StatelessWidget {
  const AxisStoredAuditResult({super.key, required this.record});
  final AxisAuditRecord record;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    final secondary = TextStyle(
        fontSize: 13, height: 1.5, color: AppColors.textSecondaryOf(dark));
    return AxisCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('审计结果',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
      const SizedBox(height: 8),
      Text(record.modeMessage, style: secondary),
      Text(
          '${record.summary.overallRiskLabel} · ${AxisRules.formatDateTime(record.summary.generatedAt)}',
          style: secondary),
      Text(record.restricted ? '针对本人的部分' : '我发起的审计', style: secondary),
      if (record.instruction?.isNotEmpty == true)
        Text('审查要求：${record.instruction}', style: secondary),
      if (record.summary.nodes.isEmpty)
        const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('此范围暂无可审计的人员信息')),
      for (final node in record.summary.nodes) ...[
        const Divider(height: 32),
        Wrap(
            spacing: 16,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(node.title,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w500)),
              Text('${node.riskLabel}风险',
                  style: TextStyle(
                      fontSize: 13,
                      color: node.riskLevel == 'high'
                          ? (dark ? AppColors.darkDanger : AppColors.danger)
                          : node.riskLevel == 'medium'
                              ? (dark
                                  ? AppColors.darkWarning
                                  : AppColors.warning)
                              : AppColors.textTertiaryOf(dark))),
            ]),
        const SizedBox(height: 8),
        Text(node.summary, style: secondary),
        for (final finding
            in record.findings[node.nodeId] ?? <AxisAuditFinding>[]) ...[
          const SizedBox(height: 12),
          Text(finding.type, style: secondary),
          Text(finding.description,
              style: const TextStyle(fontSize: 14, height: 1.5)),
          if (finding.matterIds.isNotEmpty)
            Text('关联事项：${finding.matterIds.map((id) => '#$id').join('、')}',
                style: secondary),
        ],
        if (node.suggestedActions.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('建议',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          for (final action in node.suggestedActions)
            Text(action, style: secondary),
        ],
      ],
      const SizedBox(height: 16),
      Text('审计结论为待核验线索，请结合实际材料确认', style: secondary),
    ]));
  }
}
