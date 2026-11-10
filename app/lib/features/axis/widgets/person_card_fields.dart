import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import '../data/axis_models.dart';
import '../data/axis_card_tasks.dart';
import '../data/person_cards.dart';

class PersonCardFields extends StatelessWidget {
  const PersonCardFields(
      {super.key,
      required this.node,
      required this.config,
      this.folded = false});
  final AxisPersonNode node;
  final Map<String, dynamic> config;
  final bool folded;

  Widget _tag(Map tag, Color text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
            color: (personCardColors[tag['color']] ?? personCardColors['ink']!)
                .withValues(alpha: .12),
            borderRadius: BorderRadius.circular(6)),
        child: Text(tag['text'] as String,
            maxLines: folded ? 1 : null,
            overflow: folded ? TextOverflow.ellipsis : null,
            style: TextStyle(fontSize: 12, color: text)),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = theme.colorScheme.onSurface;
    final accent =
        personCardColors[config['color']] ?? personCardColors['ink']!;
    final tags = config['tags'] as List? ?? [];
    final point = Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: accent, shape: BoxShape.circle));
    if (folded) {
      return Row(children: [
        point,
        const SizedBox(width: 8),
        Flexible(
            child: Text(node.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500, color: text))),
        if (tags.isNotEmpty) ...[
          const SizedBox(width: 8),
          Flexible(child: _tag(tags.first as Map, text))
        ]
      ]);
    }
    final items = node.workItems;
    final percent = items.isEmpty
        ? 0
        : (items.fold<int>(0, (sum, i) => sum + (i.isDone ? 100 : i.percent)) /
                items.length)
            .round();
    final due = items
        .where((i) => !i.isDone && i.dueAt != null)
        .map((i) => i.dueAt!)
        .toList()
      ..sort();
    final recent = items.where((i) => i.lastProgressAt != null).toList()
      ..sort((a, b) => b.lastProgressAt!.compareTo(a.lastProgressAt!));
    final notes = (node.description ?? '')
        .split('\n')
        .where((l) => !l.startsWith('@axis-person '))
        .join('\n');
    final spacing = config['density'] == 'compact'
        ? 4.0
        : config['density'] == 'detailed'
            ? 12.0
            : 8.0;
    Widget label(String value) => Text(value,
        style: TextStyle(
            fontSize: config['density'] == 'compact' ? 12 : 14, color: text));
    final values = <String, Widget>{
      'avatar': CircleAvatar(
          radius: 16,
          backgroundColor: theme.colorScheme.surfaceContainerHighest,
          child:
              node.profileAvatarUrl.isNotEmpty && config['avatar'] == 'profile'
                  ? ClipOval(
                      child: Image.network(node.profileAvatarUrl,
                          width: 32,
                          height: 32,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stack) =>
                              Text(node.name.characters.firstOrNull ?? '人')))
                  : Text(node.name.characters.firstOrNull ?? '人',
                      style: TextStyle(color: text, fontSize: 14))),
      'name': Text(node.name,
          style: TextStyle(
              fontSize: 16, color: text, fontWeight: FontWeight.w500)),
      'role': label(node.roleTitle.isEmpty ? '未填写职位' : node.roleTitle),
      'department': label(node.department.isEmpty ? '未填写部门' : node.department),
      'description': label(notes.isEmpty ? '暂无职责描述' : notes),
      'task_count': label('任务 ${items.length}'),
      'overdue_count': label('逾期 ${cardOverdueCount(items, clock.now())}'),
      'progress':
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        label('进度 $percent%'),
        const SizedBox(height: 4),
        LinearProgressIndicator(
            value: percent / 100, color: accent, minHeight: 4)
      ]),
      'recent_progress': label(recent.isEmpty
          ? '暂无进展'
          : '${recent.first.title} · ${recent.first.isDone ? '已完成' : '${recent.first.percent}%'}'),
      'next_due': label(due.isEmpty
          ? '暂无截止日期'
          : '最近截止 ${due.first.toIso8601String().substring(0, 10)}'),
      'tags': Wrap(
          spacing: 4,
          runSpacing: 4,
          children: tags.map((t) => _tag(t as Map, text)).toList()),
      'custom_fields': Column(
          children: (config['custom_fields'] as List? ?? [])
              .map((f) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: label(f['key'] as String)),
                        const SizedBox(width: 8),
                        Expanded(
                            child: label((f['value'] as String).isEmpty
                                ? '—'
                                : f['value'] as String))
                      ])))
              .toList()),
    };
    return Semantics(
        label: '人员卡片 ${node.name}',
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(padding: EdgeInsets.only(bottom: spacing), child: point),
              for (final key in config['fields'] as List? ?? personCardFields)
                if (values[key] != null)
                  Padding(
                      padding: EdgeInsets.only(bottom: spacing),
                      child: values[key]),
            ]));
  }
}
