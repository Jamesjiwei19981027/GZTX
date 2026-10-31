import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../utils/datetime.dart';
import '../widgets/common.dart';

class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, this.taskId, this.createMode = false});

  final int? taskId;
  final bool createMode;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  int _priority = 1;
  DateTime? _due;
  TaskItem? _task;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.createMode) {
      _loading = false;
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final task = await context.read<AppState>().tasks.getTask(widget.taskId!);
      _task = task;
      _title.text = task.title;
      _desc.text = task.description ?? '';
      _priority = task.priority;
      // 出参是 UTC，转本地再交给日期选择器，否则选中日会偏一天
      _due = parseApiDateTime(task.dueDate);
    } catch (e) {
      if (mounted) showApiError(context, e, '加载任务失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _due ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) setState(() => _due = picked);
  }

  /// 提交用 UTC ISO。此前发的是本地墙上时间的裸串（`...T23:59:59`，无时区），
  /// 后端按 UTC 解读，UTC+8 下会整体偏 8 小时。
  String? _dueIso() {
    final d = _due;
    if (d == null) return null;
    return localDayEndToApi(d);
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写标题')),
      );
      return;
    }
    setState(() => _saving = true);
    final state = context.read<AppState>();
    try {
      if (widget.createMode) {
        final created = await state.createTask(
          title: title,
          description: _desc.text,
          priority: _priority,
          dueDate: _dueIso(),
        );
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/tasks/${created.id}');
      } else {
        final updated = await state.tasks.updateTask(
          widget.taskId!,
          title: title,
          description: _desc.text,
          priority: _priority,
          dueDate: _dueIso(),
          clearDueDate: _due == null,
        );
        state.upsertTask(updated);
        _task = updated;
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已保存')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      showApiError(context, e);
      await maybeOpenVerify(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleComplete() async {
    final state = context.read<AppState>();
    try {
      if (_task!.isDone) {
        final updated = await state.tasks.uncompleteTask(_task!.id);
        state.upsertTask(updated);
        setState(() => _task = updated);
      } else {
        final updated = await state.tasks.completeTask(_task!.id);
        state.upsertTask(updated);
        setState(() => _task = updated);
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除任务？'),
        content: const Text('删除后不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AppState>().deleteTask(widget.taskId!);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.createMode ? '新建任务' : '任务详情'),
        actions: [
          if (!widget.createMode && _task != null)
            IconButton(
              onPressed: _delete,
              icon: const Icon(Icons.delete_outline),
            ),
          TextButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? '保存中…' : '保存'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : BusyBarrier(
              busy: _saving,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  TextField(
                    controller: _title,
                    decoration: const InputDecoration(
                      labelText: '标题',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _desc,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: '描述',
                      border: OutlineInputBorder(),
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: _priority,
                    decoration: const InputDecoration(
                      labelText: '优先级',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 0, child: Text('低')),
                      DropdownMenuItem(value: 1, child: Text('中')),
                      DropdownMenuItem(value: 2, child: Text('高')),
                      DropdownMenuItem(value: 3, child: Text('紧急')),
                    ],
                    onChanged: (v) => setState(() => _priority = v ?? 1),
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('截止日期'),
                    subtitle: Text(_due == null ? '未设置' : formatDue(_due!.toIso8601String())),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_due != null)
                          IconButton(
                            onPressed: () => setState(() => _due = null),
                            icon: const Icon(Icons.clear),
                          ),
                        IconButton(
                          onPressed: _pickDue,
                          icon: const Icon(Icons.event),
                        ),
                      ],
                    ),
                  ),
                  if (_task != null) ...[
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('状态：${_task!.statusLabel ?? _task!.status}'),
                      subtitle: Text([
                        if (_task!.isOverdue) '已逾期',
                        if (_task!.needsFollowUp) '需跟进',
                        if (_task!.completedAt != null) '完成于 ${_task!.completedAt}',
                      ].where((e) => e.isNotEmpty).join(' · ')),
                      trailing: FilledButton.tonal(
                        onPressed: _toggleComplete,
                        child: Text(_task!.isDone ? '标为未完成' : '完成'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
