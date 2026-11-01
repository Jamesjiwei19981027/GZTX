/// 新建 / 编辑任务（work-task-edit）。
///
/// 对应网页 `MobileTaskEditScreen`：标题必填、描述、优先级、状态、
/// 截止日期与时刻、周期重复、执行人员、子任务清单、保存失败保留输入。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/models/project.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_widgets.dart';

class WorkTaskEditScreen extends StatefulWidget {
  const WorkTaskEditScreen({
    super.key,
    this.taskId,
    this.initialDate,
    this.initialStatus,
    this.api,
    this.authState,
  });

  /// 为空表示新建。
  final int? taskId;
  final String? initialDate;
  final int? initialStatus;
  final WorkApi? api;
  final AuthState? authState;

  bool get isEditing => taskId != null;

  @override
  State<WorkTaskEditScreen> createState() => _WorkTaskEditScreenState();
}

class _WorkTaskEditScreenState extends State<WorkTaskEditScreen> {
  bool _bootstrapped = false;
  WorkApi? _api;
  AuthState? _auth;

  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _subtaskController = TextEditingController();

  static const _recurrenceRuleOptions = {
    'daily': '每天重复',
    'weekdays': '每个工作日',
    'weekly': '每周重复',
    'monthly': '每月重复',
    'yearly': '每年重复',
  };

  Map<String, String> get _currentRecurrenceOptions {
    final options = Map<String, String>.from(_recurrenceRuleOptions);
    if (!options.containsKey(_recurrenceRule)) {
      options[_recurrenceRule] = '自定义 ($_recurrenceRule)';
    }
    return options;
  }

  int _priority = 1;
  int _status = 0;
  String? _dueDate;
  String? _dueTime;
  int? _categoryId;
  List<TaskTag> _tags = const [];
  final Set<int> _assigneeIds = {};
  bool _recurring = false;
  String _recurrenceRule = 'daily';
  dynamic _rawRecurrenceRule;
  List<ChecklistItem> _checklist = const [];
  @visibleForTesting
  List<ChecklistItem> get checklist => _checklist;

  List<ProjectMember> _members = const [];
  bool _membersLoading = false;
  Object? _membersError;

  bool _loading = true;
  Object? _loadError;
  bool _saving = false;
  String? _formError;
  bool _dirty = false;
  int _loadToken = 0;

  TaskScope? _taskScope;

  TaskScope get _scope =>
      _taskScope ??
      TaskScope.normalizeOrPersonal(_auth?.currentProject?.id.toString());

  String? get _scopeProjectName {
    final pid = _scope.projectId;
    if (pid == null) return null;
    if (_auth?.currentProject?.id == pid) {
      return _auth?.currentProject?.name;
    }
    for (final p in _auth?.projects ?? const <Project>[]) {
      if (p.id == pid) return p.name;
    }
    return '项目 #$pid';
  }

  @override
  void initState() {
    super.initState();
    _dueDate = widget.initialDate;
    if (widget.initialStatus != null) {
      _status = widget.initialStatus!;
    }
    _titleController.addListener(_markDirty);
    _descriptionController.addListener(_markDirty);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _api ??= widget.api ?? WorkApi(context.read<AuthState>().api);
    _auth ??= widget.authState ?? _tryReadAuth();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _bootstrap();
  }

  @override
  void didUpdateWidget(WorkTaskEditScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.taskId != oldWidget.taskId) {
      _loadToken++;
      _resetForm();
      _bootstrap();
    }
  }

  void _resetForm() {
    _taskScope = null;
    _members = const [];
    _titleController.text = '';
    _descriptionController.text = '';
    _priority = 1;
    _status = widget.initialStatus ?? 0;
    _dueDate = widget.initialDate;
    _dueTime = null;
    _categoryId = null;
    _tags = const [];
    _assigneeIds.clear();
    _recurring = false;
    _recurrenceRule = 'daily';
    _rawRecurrenceRule = null;
    _checklist = const [];
    _loading = true;
    _loadError = null;
    _saving = false;
    _formError = null;
    _dirty = false;
  }

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  void _markDirty() {
    if (!_dirty) setState(() => _dirty = true);
  }

  Future<void> _bootstrap() async {
    if (widget.isEditing) {
      await _loadTask();
    } else {
      _taskScope = TaskScope.normalizeOrPersonal(
        _auth?.currentProject?.id.toString(),
      );
      final projectId = _taskScope?.projectId;
      if (projectId != null) {
        _loadMembers(projectId);
      }
      setState(() => _loading = false);
    }
  }

  Future<void> _loadMembers(int projectId) async {
    setState(() {
      _membersLoading = true;
      _membersError = null;
    });
    try {
      final members = await _api!.projectMembers(projectId);
      if (!mounted) return;
      setState(() {
        _members = members;
        _membersLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _membersError = error;
        _membersLoading = false;
      });
    }
  }

  Future<void> _loadTask() async {
    final token = ++_loadToken;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final task = await _api!.getTask(widget.taskId!);
      if (!mounted || token != _loadToken) return;

      final targetScope = TaskScope(
        projectId: task.projectId,
        origin: task.origin,
      );
      if (task.projectId != null) {
        _loadMembers(task.projectId!);
      } else {
        _members = const [];
      }

      setState(() {
        _taskScope = targetScope;
        _titleController.text = task.title;
        _descriptionController.text = task.description ?? '';
        _priority = task.priority;
        _status = task.status;
        _dueDate = task.dueDate ?? widget.initialDate;
        _dueTime = task.dueTime;
        _categoryId = task.categoryId;
        _tags = task.tags;
        _assigneeIds
          ..clear()
          ..addAll(task.assignees.map((a) => a.userId));
        _recurring = task.isRecurring;
        _recurrenceRule =
            task.recurrenceRule ?? 'daily';
        _rawRecurrenceRule = task.rawRecurrenceRule;
        _checklist = List<ChecklistItem>.from(task.checklist);
        _loading = false;
        _dirty = false;
      });
    } catch (error) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loadError = error;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _subtaskController.dispose();
    super.dispose();
  }

  Future<void> _pickDueDate() async {
    final initial = TaskTime.parseLocalDay(_dueDate) ??
        TaskTime.parseLocalDay(TaskTime.todayKey())!;
    final picked = await showAppDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year - 3),
      lastDate: DateTime(initial.year + 6),
    );
    if (picked == null) return;
    setState(() {
      _dueDate = TaskTime.localDateKey(picked);
      _dirty = true;
    });
  }

  Future<void> _pickDueTime() async {
    await showAppActionSheet(
      context: context,
      title: '截止时刻',
      actions: [
        AppActionSheetItem(
          label: '全天（不设具体时刻）',
          onPressed: () => setState(() {
            _dueTime = null;
            _dirty = true;
          }),
        ),
        for (final slot in const ['09:00', '12:00', '18:00', '21:00'])
          AppActionSheetItem(
            label: slot,
            onPressed: () => setState(() {
              _dueTime = slot;
              _dirty = true;
            }),
          ),
        AppActionSheetItem(
          label: '自定义时刻…',
          onPressed: _pickCustomTime,
        ),
      ],
    );
  }

  Future<void> _pickCustomTime() async {
    final initial = TaskTime.parseLocalDay(_dueDate) ??
        TaskTime.parseLocalDay(TaskTime.todayKey())!;
    final base = DateTime(
      initial.year,
      initial.month,
      initial.day,
      int.tryParse((_dueTime ?? '09:00').split(':').first) ?? 9,
      int.tryParse((_dueTime ?? '09:00').split(':').last) ?? 0,
    );
    final picked = await showAppDateTimePicker(
      context: context,
      initialDateTime: base,
      firstDate: DateTime(initial.year - 3),
      lastDate: DateTime(initial.year + 6),
    );
    if (picked == null) return;
    setState(() {
      _dueDate = TaskTime.localDateKey(picked);
      _dueTime =
          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      _dirty = true;
    });
  }

  void _addSubtask() {
    final title = _subtaskController.text.trim();
    if (title.isEmpty) return;
    setState(() {
      final newId = _generateNextSubtaskId();
      _checklist = [
        ..._checklist,
        ChecklistItem(id: newId, title: title),
      ];
      _subtaskController.clear();
      _dirty = true;
    });
  }

  String _generateNextSubtaskId() {
    var maxSeq = 0;
    final usedIds = _checklist.map((e) => e.id).toSet();
    for (final id in usedIds) {
      final match = RegExp(r'^new-(\d+)').firstMatch(id);
      if (match != null) {
        final val = int.tryParse(match.group(1)!);
        if (val != null && val > maxSeq) {
          maxSeq = val;
        }
      }
    }
    var next = maxSeq + 1;
    while (usedIds.contains('new-$next')) {
      next++;
    }
    return 'new-$next';
  }

  dynamic _resolveRecurrenceRuleForSave() {
    if (!_recurring) return null;
    if (_rawRecurrenceRule is Map) {
      final map = Map<String, dynamic>.from(_rawRecurrenceRule as Map);
      map['frequency'] = _recurrenceRule;
      return map;
    }
    return _recurrenceRule;
  }

  Future<void> _save() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _formError = '请输入任务标题');
      return;
    }
    setState(() {
      _saving = true;
      _formError = null;
    });

    final dueIso = _dueDate == null
        ? null
        : TaskTime.toApiDueDate(_dueDate, _dueTime);
    final body = <String, dynamic>{
      'title': title,
      'description': _descriptionController.text.trim(),
      'priority': _priority,
      'status': _status,
      'due_date': dueIso,
      'category_id': _categoryId,
      'tag_ids': _tags.map((tag) => tag.id).toList(),
      'assignee_user_ids': _assigneeIds.toList(),
      'is_recurring': _recurring,
      'recurrence_rule': _resolveRecurrenceRuleForSave(),
      'checklist': _checklist.map((item) => item.toJson()).toList(),
    };

    try {
      if (widget.isEditing) {
        await _api!.updateTask(widget.taskId!, body);
      } else {
        body['project_id'] = _scope.projectId;
        body['origin'] = _scope.origin;
        await _api!.createTask(body);
      }
      if (!mounted) return;
      setState(() => _dirty = false);
      showAppToast(
        context,
        widget.isEditing ? '任务已更新' : '任务已创建',
        type: ToastType.success,
      );
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      // 保存失败必须保留用户输入。
      setState(() {
        _saving = false;
        _formError = error is ValidationException
            ? error.message
            : describeError(error).message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return AppScaffold(
      title: widget.isEditing ? '编辑任务' : '新建任务',
      isDirty: _dirty && !_saving,
      body: WorkStateContainer(
        isLoading: _loading,
        error: _loadError,
        onRetry: _loadTask,
        loadingLabel: '正在载入任务…',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxxl,
          ),
          children: [
            if (_formError != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.dangerLight,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                ),
                child: Text(
                  _formError!,
                  style: const TextStyle(fontSize: 12, color: AppColors.danger),
                ),
              ),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: const Color(0xFFEAF2FE),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Row(
                children: [
                  const AppIcon('work', size: 16, color: AppColors.primary),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      _scope.describe(_scopeProjectName),
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _titleController,
              label: '任务标题（必填）',
              placeholder: '例如：准备项目月度交付汇报材料',
              errorText: _formError == '请输入任务标题' ? '请输入任务标题' : null,
              autofocus: !widget.isEditing,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _descriptionController,
              label: '任务详细描述',
              placeholder: '输入任务背景、行动项或期望结果…',
              minLines: 3,
              maxLines: 6,
            ),
            const SizedBox(height: AppSpacing.md),
            WorkSection(
              title: '优先级与状态',
              child: Column(
                children: [
                  _dropdownRow<int>(
                    label: '优先级',
                    value: _priority,
                    items: const {0: '低优先级', 1: '中优先级', 2: '高优先级'},
                    onChanged: (value) => setState(() {
                      _priority = value;
                      _dirty = true;
                    }),
                  ),
                  _dropdownRow<int>(
                    label: '推进状态',
                    value: _status,
                    items: const {0: '待办', 1: '进行中', 2: '已完成'},
                    onChanged: (value) => setState(() {
                      _status = value;
                      _dirty = true;
                    }),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            WorkSection(
              title: '截止时间与周期重复',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InkWell(
                    onTap: _pickDueDate,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: isDark
                              ? AppColors.darkBorder
                              : AppColors.border,
                        ),
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      child: Row(
                        children: [
                          const AppIcon('calendar', size: 16),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              _dueDate == null
                                  ? '设置截止日期（可选）'
                                  : '截止日期: $_dueDate',
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                          const Icon(Icons.arrow_drop_down, size: 20),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  InkWell(
                    onTap: _pickDueTime,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: isDark
                              ? AppColors.darkBorder
                              : AppColors.border,
                        ),
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      child: Row(
                        children: [
                          const AppIcon('time', size: 16),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              _dueTime == null ? '全天（不设具体时刻）' : '截止时刻: $_dueTime',
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                          const Icon(Icons.arrow_drop_down, size: 20),
                        ],
                      ),
                    ),
                  ),
                  if (_dueDate != null)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => setState(() {
                          _dueDate = null;
                          _dueTime = null;
                          _dirty = true;
                        }),
                        child: const Text('清除截止时间'),
                      ),
                    ),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          '周期性重复任务',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                      AppSwitch(
                        value: _recurring,
                        onChanged: (value) => setState(() {
                          _recurring = value;
                          _dirty = true;
                        }),
                      ),
                    ],
                  ),
                  if (_recurring)
                    _dropdownRow<String>(
                      label: '重复规则',
                      value: _recurrenceRule,
                      items: _currentRecurrenceOptions,
                      onChanged: (value) => setState(() {
                        _recurrenceRule = value;
                        _dirty = true;
                      }),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            WorkSection(
              title: '执行人员',
              footer: '多选成员限定在当前项目范围内，可随时清空指派。',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_membersLoading)
                    const Row(
                      children: [
                        AppLoading(size: 16),
                        SizedBox(width: AppSpacing.sm),
                        Text('正在载入成员…', style: TextStyle(fontSize: 12)),
                      ],
                    )
                  else if (_membersError != null)
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            '成员加载失败',
                            style: TextStyle(fontSize: 12, color: AppColors.danger),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            final projectId = _scope.projectId;
                            if (projectId != null) _loadMembers(projectId);
                          },
                          child: const Text('重试'),
                        ),
                      ],
                    )
                  else if (_scope.isPersonal)
                    const Text(
                      '个人待办无项目成员可指派',
                      style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
                    )
                  else if (_members.isEmpty)
                    const Text(
                      '当前项目无可选成员',
                      style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
                    )
                  else ...[
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '已选 ${_assigneeIds.length} 人',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                        if (_assigneeIds.isNotEmpty)
                          TextButton(
                            onPressed: () => setState(() {
                              _assigneeIds.clear();
                              _dirty = true;
                            }),
                            child: const Text('清空已选执行人'),
                          ),
                      ],
                    ),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: _members
                          .map(
                            (member) => WorkFilterChip(
                              label: member.displayName,
                              selected: _assigneeIds.contains(member.userId),
                              onTap: () => setState(() {
                                if (!_assigneeIds.remove(member.userId)) {
                                  _assigneeIds.add(member.userId);
                                }
                                _dirty = true;
                              }),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            WorkSection(
              title: '子任务清单',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final item in _checklist)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.title,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                          IconButton(
                            tooltip: '删除清单项',
                            icon: const Icon(Icons.close, size: 16),
                            onPressed: () => setState(() {
                              _checklist =
                                  _checklist.where((e) => e.id != item.id).toList();
                              _dirty = true;
                            }),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          controller: _subtaskController,
                          placeholder: '添加清单条目…',
                          onSubmitted: (_) => _addSubtask(),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      AppButton(
                        label: '添加',
                        size: AppButtonSize.sm,
                        variant: AppButtonVariant.secondary,
                        onPressed: _addSubtask,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: _saving
                  ? '正在保存…'
                  : (widget.isEditing ? '确认更新任务' : '创建任务'),
              isFullWidth: true,
              size: AppButtonSize.lg,
              isLoading: _saving,
              onPressed: _saving ? null : _save,
            ),
            if (isDark) const SizedBox(height: 1),
          ],
        ),
      ),
    );
  }

  Widget _dropdownRow<T>({
    required String label,
    required T value,
    required Map<T, String> items,
    required ValueChanged<T> onChanged,
  }) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              width: 84,
              child: Text(label, style: const TextStyle(fontSize: 13)),
            ),
            Expanded(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<T>(
                  value: value,
                  isExpanded: true,
                  items: items.entries
                      .map(
                        (entry) => DropdownMenuItem(
                          value: entry.key,
                          child: Text(
                            entry.value,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (next) {
                    if (next != null) onChanged(next);
                  },
                ),
              ),
            ),
          ],
        ),
      );
}
