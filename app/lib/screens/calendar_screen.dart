import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime _selected = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshTasks();
    });
  }

  List<TaskItem> _tasksOn(DateTime day, List<TaskItem> all) {
    final key = DateFormat('yyyy-MM-dd').format(day);
    return all.where((t) {
      if (t.dueDate == null || t.dueDate!.isEmpty) return false;
      return t.dueDate!.startsWith(key);
    }).toList();
  }

  Set<String> _daysWithTasks(List<TaskItem> all) {
    final set = <String>{};
    for (final t in all) {
      if (t.dueDate != null && t.dueDate!.length >= 10) {
        set.add(t.dueDate!.substring(0, 10));
      }
    }
    return set;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final marked = _daysWithTasks(state.taskItems);
    final dayTasks = _tasksOn(_selected, state.taskItems);
    final first = DateTime(_month.year, _month.month, 1);
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final startWeekday = first.weekday % 7; // Sunday=0 style grid

    return Scaffold(
      appBar: AppBar(
        title: Text(DateFormat('yyyy年M月').format(_month)),
        actions: [
          IconButton(
            onPressed: () => setState(() {
              _month = DateTime(_month.year, _month.month - 1);
            }),
            icon: const Icon(Icons.chevron_left),
          ),
          IconButton(
            onPressed: () => setState(() {
              _month = DateTime(_month.year, _month.month + 1);
            }),
            icon: const Icon(Icons.chevron_right),
          ),
          IconButton(
            onPressed: () => setState(() {
              final now = DateTime.now();
              _month = DateTime(now.year, now.month);
              _selected = now;
            }),
            icon: const Icon(Icons.today),
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
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: ['日', '一', '二', '三', '四', '五', '六']
                  .map(
                    (e) => Expanded(
                      child: Center(
                        child: Text(e, style: Theme.of(context).textTheme.labelMedium),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.all(8),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
            ),
            itemCount: startWeekday + daysInMonth,
            itemBuilder: (ctx, i) {
              if (i < startWeekday) return const SizedBox.shrink();
              final day = i - startWeekday + 1;
              final date = DateTime(_month.year, _month.month, day);
              final key = DateFormat('yyyy-MM-dd').format(date);
              final selected = DateUtils.isSameDay(date, _selected);
              final has = marked.contains(key);
              return InkWell(
                onTap: () => setState(() => _selected = date),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  decoration: BoxDecoration(
                    color: selected
                        ? Theme.of(context).colorScheme.primaryContainer
                        : null,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('$day'),
                      if (has)
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${DateFormat('M月d日').format(_selected)} · ${dayTasks.length} 项',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
          Expanded(
            child: dayTasks.isEmpty
                ? const EmptyHint('当日无到期任务')
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 88),
                    itemCount: dayTasks.length,
                    itemBuilder: (ctx, i) {
                      final t = dayTasks[i];
                      return TaskListTile(
                        task: t,
                        onTap: () =>
                            Navigator.of(context).pushNamed('/tasks/${t.id}'),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
