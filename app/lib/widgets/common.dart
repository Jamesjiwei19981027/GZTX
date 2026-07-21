import 'package:flutter/material.dart';

import '../models/models.dart';

void showApiError(BuildContext context, Object e, [String fallback = '操作失败']) {
  final msg = e is ApiException ? e.message : '$fallback：$e';
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

bool isVerifyRequired(Object e) => e is ApiException && e.code == 40320;

Future<void> maybeOpenVerify(BuildContext context, Object e) async {
  if (!isVerifyRequired(e)) return;
  await Navigator.of(context).pushNamed('/verify');
}

String formatDue(String? due) {
  if (due == null || due.isEmpty) return '';
  return due.length >= 10 ? due.substring(0, 10) : due;
}

Color priorityColor(int priority) {
  switch (priority) {
    case 2:
      return Colors.orange;
    case 3:
      return Colors.red;
    default:
      return Colors.blueGrey;
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: Theme.of(context).textTheme.titleMedium),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class StatChip extends StatelessWidget {
  const StatChip({super.key, required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c)),
          const SizedBox(height: 2),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class TaskListTile extends StatelessWidget {
  const TaskListTile({
    super.key,
    required this.task,
    this.onTap,
    this.onToggle,
  });

  final TaskItem task;
  final VoidCallback? onTap;
  final ValueChanged<bool>? onToggle;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        onTap: onTap,
        leading: Checkbox(
          value: task.isDone,
          onChanged: onToggle == null
              ? null
              : (v) => onToggle!(v ?? false),
        ),
        title: Text(
          task.title,
          style: TextStyle(
            decoration: task.isDone ? TextDecoration.lineThrough : null,
          ),
        ),
        subtitle: Text(
          [
            task.priorityLabel ?? 'P${task.priority}',
            if (task.dueDate != null) '截止 ${formatDue(task.dueDate)}',
            if (task.isOverdue) '已逾期',
            if (task.needsFollowUp) '需跟进',
          ].where((e) => e.isNotEmpty).join(' · '),
        ),
        trailing: Icon(Icons.chevron_right, color: priorityColor(task.priority)),
      ),
    );
  }
}

class EmptyHint extends StatelessWidget {
  const EmptyHint(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
      ),
    );
  }
}

class BusyBarrier extends StatelessWidget {
  const BusyBarrier({super.key, required this.busy, required this.child});
  final bool busy;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (busy)
          const Positioned.fill(
            child: ColoredBox(
              color: Color(0x33000000),
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
      ],
    );
  }
}
