import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_matter_patch.dart';
import '../data/axis_models.dart';
import 'axis_common.dart';

class AxisMatterForm extends StatefulWidget {
  const AxisMatterForm(
      {super.key,
      required this.api,
      required this.original,
      required this.members,
      required this.canChangeAssignee,
      required this.onSaved});
  final AxisApi api;
  final Map<String, dynamic> original;
  final List<AxisMember> members;
  final bool canChangeAssignee;
  final VoidCallback onSaved;

  @override
  State<AxisMatterForm> createState() => _AxisMatterFormState();
}

class _AxisMatterFormState extends State<AxisMatterForm> {
  late final _title =
      TextEditingController(text: widget.original['title']?.toString() ?? '');
  late final _date = TextEditingController(
      text: axisDateLabel(AxisWorkItem.fromJson(widget.original).dueAt));
  late int? _assignee = axisMatterAssignee(widget.original);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _date.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final due = _date.text.trim();
    if (_title.text.trim().isEmpty || !validAxisDateInput(due)) {
      setState(() => _error =
          _title.text.trim().isEmpty ? '事项名称不能为空' : '请输入有效日期，格式为 年-月-日');
      return;
    }
    final patch = buildAxisMatterPatch(widget.original,
        title: _title.text,
        dueDate: due,
        assigneeUserId: widget.canChangeAssignee ? _assignee : null);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (patch.isNotEmpty) {
        await widget.api
            .updateMatter((widget.original['id'] as num).toInt(), patch);
      }
      if (mounted) widget.onSaved();
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = axisErrorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final members = {
      for (final member in widget.members) member.userId: member
    };
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(
            key: const Key('axis-matter-title'),
            controller: _title,
            maxLength: 200,
            enabled: !_busy,
            decoration: const InputDecoration(labelText: '事项名称')),
        const SizedBox(height: AppSpacing.md),
        TextField(
            key: const Key('axis-matter-date'),
            controller: _date,
            enabled: !_busy,
            keyboardType: TextInputType.datetime,
            decoration: const InputDecoration(
                labelText: '截止日期', hintText: '例如：2026-12-10，留空清除')),
        const SizedBox(height: AppSpacing.md),
        DropdownButtonFormField<int>(
            key: const Key('axis-matter-assignee'),
            initialValue: _assignee,
            decoration: const InputDecoration(labelText: '负责人'),
            items: [
              if (_assignee == null)
                const DropdownMenuItem<int>(value: null, child: Text('保持不变')),
              if (_assignee != null && !members.containsKey(_assignee))
                DropdownMenuItem(value: _assignee, child: const Text('当前负责人')),
              for (final member in members.values)
                DropdownMenuItem(
                    value: member.userId, child: Text(member.displayName)),
            ],
            onChanged: widget.canChangeAssignee && !_busy
                ? (value) => setState(() => _assignee = value)
                : null),
        if (!widget.canChangeAssignee)
          const Padding(
              padding: EdgeInsets.only(top: 8),
              child:
                  Text('只有直属上级或项目负责人可以更换负责人', style: TextStyle(fontSize: 12))),
        if (_error != null)
          Padding(
              padding: const EdgeInsets.only(top: 12),
              child: AxisErrorBanner(message: _error!)),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
            key: const Key('axis-matter-save'),
            label: '保存事项',
            isLoading: _busy,
            isFullWidth: true,
            onPressed: _busy ? null : _save),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
            label: '取消',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: _busy ? null : () => Navigator.of(context).pop()),
      ])),
    );
  }
}
