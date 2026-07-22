import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshTasks();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final stats = state.taskStats;
    final open = state.taskItems.where((t) => !t.isDone).take(8).toList();
    final overdue = state.taskItems.where((t) => t.isOverdue && !t.isDone).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text('你好，${state.user?.displayName ?? ''}'),
        actions: [
          if (state.needsVerification)
            TextButton(
              onPressed: () => Navigator.of(context).pushNamed('/verify'),
              child: const Text('去验证'),
            ),
          IconButton(
            onPressed: state.busy ? null : () => state.refreshTasks(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).pushNamed('/tasks/new'),
        icon: const Icon(Icons.add),
        label: const Text('新建任务'),
      ),
      body: RefreshIndicator(
        onRefresh: state.refreshTasks,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            if (state.needsVerification)
              Card(
                color: Theme.of(context).colorScheme.tertiaryContainer,
                child: ListTile(
                  leading: const Icon(Icons.verified_user_outlined),
                  title: const Text('完成邮箱与手机验证后可创建任务、提交材料、对话智能体'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).pushNamed('/verify'),
                ),
              ),
            if (stats != null) ...[
              const SectionHeader('本周概览'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  SizedBox(
                    width: (MediaQuery.sizeOf(context).width - 40) / 2,
                    child: StatChip(label: '全部', value: '${stats.total}'),
                  ),
                  SizedBox(
                    width: (MediaQuery.sizeOf(context).width - 40) / 2,
                    child: StatChip(
                      label: '已完成',
                      value: '${stats.completed}',
                      color: Colors.green,
                    ),
                  ),
                  SizedBox(
                    width: (MediaQuery.sizeOf(context).width - 40) / 2,
                    child: StatChip(
                      label: '逾期',
                      value: '${stats.overdue}',
                      color: Colors.red,
                    ),
                  ),
                  SizedBox(
                    width: (MediaQuery.sizeOf(context).width - 40) / 2,
                    child: StatChip(
                      label: '完成率',
                      value: '${stats.completionRate.toStringAsFixed(0)}%',
                      color: Colors.indigo,
                    ),
                  ),
                ],
              ),
            ],
            if (overdue.isNotEmpty) ...[
              const SectionHeader('逾期待办'),
              ...overdue.map(
                (t) => TaskListTile(
                  task: t,
                  onTap: () => Navigator.of(context).pushNamed('/tasks/${t.id}'),
                  onToggle: (_) async {
                    try {
                      await state.completeTask(t.id);
                    } catch (e) {
                      if (context.mounted) showApiError(context, e);
                    }
                  },
                ),
              ),
            ],
            SectionHeader(
              '进行中',
              trailing: TextButton(
                onPressed: () {},
                child: Text('共 ${state.taskItems.where((t) => !t.isDone).length}'),
              ),
            ),
            if (open.isEmpty)
              const EmptyHint('暂无进行中任务')
            else
              ...open.map(
                (t) => TaskListTile(
                  task: t,
                  onTap: () => Navigator.of(context).pushNamed('/tasks/${t.id}'),
                  onToggle: (_) async {
                    try {
                      await state.completeTask(t.id);
                    } catch (e) {
                      if (context.mounted) {
                        showApiError(context, e);
                        await maybeOpenVerify(context, e);
                      }
                    }
                  },
                ),
              ),
            if (state.currentCompany != null) ...[
              const SectionHeader('当前公司'),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.business),
                  title: Text(state.currentCompany!.name),
                  subtitle: Text(
                    state.currentCompany!.slug == null ||
                            state.currentCompany!.slug!.isEmpty
                        ? '进入公司设置'
                        : '标识：${state.currentCompany!.slug}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).pushNamed('/company'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
