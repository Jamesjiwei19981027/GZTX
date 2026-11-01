/// 全局搜索（work-search）。
///
/// 对应网页 `MobileGlobalSearchScreen`：任务标题 / 描述 / 标签与项目名 / 描述
/// 的跨维度检索，结果按「全部 / 事项 / 项目」分类。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../core/models/project.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../widgets/work_widgets.dart';

class WorkSearchScreen extends StatefulWidget {
  const WorkSearchScreen({
    super.key,
    this.api,
    this.authState,
    this.initialQuery,
  });

  final WorkApi? api;
  final AuthState? authState;
  final String? initialQuery;

  @override
  State<WorkSearchScreen> createState() => _WorkSearchScreenState();
}

class _WorkSearchScreenState extends State<WorkSearchScreen> {
  bool _bootstrapped = false;
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialQuery ?? '');

  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;
  String _query = '';
  String _filter = 'all';

  WorkApi get _api => widget.api ?? WorkApi(context.read<AuthState>().api);

  List<Project> get _projects =>
      (widget.authState ?? _tryReadAuth())?.projects ?? const [];

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    _query = _controller.text;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _api.listAllTasks();
      if (!mounted) return;
      setState(() {
        _tasks = items;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  List<WorkTask> get _matchedTasks {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return const [];
    return _tasks.where((task) {
      return task.title.toLowerCase().contains(query) ||
          (task.description ?? '').toLowerCase().contains(query) ||
          task.tags.any((tag) => tag.name.toLowerCase().contains(query));
    }).toList();
  }

  List<Project> get _matchedProjects {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return const [];
    return _projects.where((project) {
      return project.name.toLowerCase().contains(query) ||
          (project.description ?? '').toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final tasks = _matchedTasks;
    final projects = _matchedProjects;
    final hasQuery = _query.trim().isNotEmpty;

    return AppScaffold(
      title: '全局搜索',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: AppTextField(
              controller: _controller,
              placeholder: '搜索任务标题、项目、标签…',
              prefix: const AppIcon('search', size: 18),
              autofocus: true,
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    WorkFilterChip(
                      label: '全部结果',
                      selected: _filter == 'all',
                      onTap: () => setState(() => _filter = 'all'),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    WorkFilterChip(
                      label: '事项 (${tasks.length})',
                      selected: _filter == 'tasks',
                      onTap: () => setState(() => _filter = 'tasks'),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    WorkFilterChip(
                      label: '项目 (${projects.length})',
                      selected: _filter == 'projects',
                      onTap: () => setState(() => _filter = 'projects'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: WorkStateContainer(
              isLoading: _loading,
              error: _error,
              onRetry: _load,
              loadingLabel: '正在载入索引…',
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.xxxl,
                ),
                children: [
                  if (!hasQuery)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Text(
                        '请输入关键词检索事项待办、项目或相关标签',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textTertiary,
                        ),
                      ),
                    )
                  else if (tasks.isEmpty && projects.isEmpty)
                    AppEmptyState(
                      title: '无匹配结果',
                      description: '未找到与「$_query」相关的任务或项目',
                      icon: const AppIcon('search', size: 40),
                    )
                  else ...[
                    if ((_filter == 'all' || _filter == 'projects') &&
                        projects.isNotEmpty) ...[
                      Text(
                        '匹配项目 (${projects.length})',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      WorkSection(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (final project in projects)
                              ListTile(
                                leading: const AppIcon('folder',
                                    size: 20, color: AppColors.primary),
                                title: Text(
                                  project.name,
                                  style: const TextStyle(fontSize: 14),
                                ),
                                subtitle: Text(
                                  project.description?.isNotEmpty == true
                                      ? project.description!
                                      : '项目工作区',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                trailing: const Icon(Icons.chevron_right, size: 18),
                                onTap: () => context.push('/projects/${project.id}'),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    if ((_filter == 'all' || _filter == 'tasks') &&
                        tasks.isNotEmpty) ...[
                      Text(
                        '匹配事项 (${tasks.length})',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      WorkSection(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var i = 0; i < tasks.length; i++) ...[
                              WorkTaskTile(
                                task: tasks[i],
                                dense: true,
                                onTap: () async {
                                  await context.push('/work/task/${tasks[i].id}');
                                  if (!mounted) return;
                                  await _load();
                                },
                                subtitle: WorkTaskMeta(task: tasks[i]),
                              ),
                              if (i < tasks.length - 1)
                                const Divider(height: 0.5, thickness: 0.5),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
