import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/common.dart';

class TaskListScreen extends StatefulWidget {
  const TaskListScreen({super.key});

  @override
  State<TaskListScreen> createState() => _TaskListScreenState();
}

class _TaskListScreenState extends State<TaskListScreen> {
  String _query = '';
  int _filter = 0; // 0 all open, 1 done, 2 all

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
    var items = state.taskItems;
    if (_filter == 0) {
      items = items.where((t) => !t.isDone).toList();
    } else if (_filter == 1) {
      items = items.where((t) => t.isDone).toList();
    }
    if (_query.trim().isNotEmpty) {
      final q = _query.trim().toLowerCase();
      items = items.where((t) => t.title.toLowerCase().contains(q)).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('任务'),
        actions: [
          IconButton(
            onPressed: state.busy ? null : () => state.refreshTasks(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.of(context).pushNamed('/tasks/new'),
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '搜索任务',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('待办')),
                ButtonSegment(value: 1, label: Text('已完成')),
                ButtonSegment(value: 2, label: Text('全部')),
              ],
              selected: {_filter},
              onSelectionChanged: (s) => setState(() => _filter = s.first),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: state.refreshTasks,
              child: items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 80),
                        EmptyHint('暂无任务'),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 88),
                      itemCount: items.length,
                      itemBuilder: (ctx, i) {
                        final t = items[i];
                        return TaskListTile(
                          task: t,
                          onTap: () =>
                              Navigator.of(context).pushNamed('/tasks/${t.id}'),
                          onToggle: (done) async {
                            try {
                              if (done) {
                                await state.completeTask(t.id);
                              } else {
                                await state.uncompleteTask(t.id);
                              }
                            } catch (e) {
                              if (context.mounted) showApiError(context, e);
                            }
                          },
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
