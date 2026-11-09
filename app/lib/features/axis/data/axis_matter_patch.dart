import 'axis_models.dart';

String axisDateLabel(DateTime? date) => date == null
    ? ''
    : '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

bool validAxisDateInput(String value) {
  if (value.isEmpty) return true;
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return false;
  final parsed = DateTime.tryParse(value);
  return parsed != null && axisDateLabel(parsed) == value;
}

int? axisMatterAssignee(Map<String, dynamic> original) {
  final entries =
      (original['assignees'] as List?)?.whereType<Map>().toList() ?? [];
  if (entries.isEmpty) return null;
  final primary = entries.firstWhere((entry) => entry['role_key'] == 'primary',
      orElse: () => entries.first);
  return (primary['user_id'] as num?)?.toInt();
}

Map<String, dynamic> buildAxisMatterPatch(Map<String, dynamic> original,
    {required String title, required String dueDate, int? assigneeUserId}) {
  final originalDate = AxisWorkItem.fromJson(original).dueAt;
  return {
    if (title.trim() != original['title']) 'title': title.trim(),
    if (dueDate != axisDateLabel(originalDate))
      'due_at': dueDate.isEmpty ? null : '${dueDate}T23:59:59',
    if (assigneeUserId != null &&
        assigneeUserId != axisMatterAssignee(original))
      'assignees': [
        {'user_id': assigneeUserId, 'role_key': 'primary'}
      ],
  };
}
