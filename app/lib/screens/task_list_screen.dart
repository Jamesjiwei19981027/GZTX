import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';

class TaskListScreen extends StatefulWidget {
  const TaskListScreen({super.key});

  @override
  State<TaskListScreen> createState() => _TaskListScreenState();
}

class _TaskListScreenState extends State<TaskListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshTasks();
    });
  }

  Future<void> _createTask() async {
    final ctrl = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建任务'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '任务标题',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('创建'),
          ),
        ],
      ),
    );
    if (title == null || title.isEmpty || !mounted) return;
    try {
      await context.read<AppState>().createTask(title);
    } catch (_) {
      if (!mounted) return;
      final err = context.read<AppState>().error ?? '创建失败';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final open = state.taskItems.where((t) => !t.isDone).toList();
    final done = state.taskItems.where((t) => t.isDone).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(state.user?.displayName ?? '我的任务'),
        actions: [
          IconButton(
            tooltip: '刷新',
            onPressed: state.busy ? null : () => state.refreshTasks(),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: '退出登录',
            onPressed: () => state.logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createTask,
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: state.refreshTasks,
        child: state.busy && state.taskItems.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 88),
                children: [
                  if (state.error != null) ...[
                    Card(
                      color: Theme.of(context).colorScheme.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(state.error!),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  _Section(title: '待办 (${open.length})'),
                  if (open.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('暂无待办'),
                    )
                  else
                    ...open.map((t) => _TaskTile(task: t)),
                  const SizedBox(height: 12),
                  _Section(title: '已完成 (${done.length})'),
                  if (done.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('暂无已完成'),
                    )
                  else
                    ...done.map((t) => _TaskTile(task: t)),
                ],
              ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 4),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.task});
  final TaskItem task;

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Card(
      child: ListTile(
        leading: Checkbox(
          value: task.isDone,
          onChanged: task.isDone
              ? null
              : (_) => state.completeTask(task.id),
        ),
        title: Text(
          task.title,
          style: TextStyle(
            decoration: task.isDone ? TextDecoration.lineThrough : null,
          ),
        ),
        subtitle: Text(
          [
            task.statusLabel ?? '状态${task.status}',
            if (task.dueDate != null) '截止 ${task.dueDate}',
          ].join(' · '),
        ),
      ),
    );
  }
}
