/// 新建项目 / 新建公司
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileWorkspaceCreateScreen`（08/80），
/// 同一页面承载 `project-create` 与 `company-create` 两个屏幕标识。
library;

import 'package:flutter/material.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

enum WorkspaceCreateMode { project, company }

class ProjectCreateScreen extends StatefulWidget {
  const ProjectCreateScreen({
    super.key,
    this.initialMode = WorkspaceCreateMode.project,
  });

  final WorkspaceCreateMode initialMode;

  @override
  State<ProjectCreateScreen> createState() => _ProjectCreateScreenState();
}

class _ProjectCreateScreenState extends State<ProjectCreateScreen> {
  late WorkspaceCreateMode _mode = widget.initialMode;

  final _projectName = TextEditingController();
  final _companyName = TextEditingController();
  final _companySlug = TextEditingController();

  String _policyPreset = 'enterprise_strict';
  String? _error;
  String? _nameError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    for (final controller in [_projectName, _companyName, _companySlug]) {
      controller.addListener(_onTextChanged);
    }
  }

  @override
  void dispose() {
    for (final controller in [_projectName, _companyName, _companySlug]) {
      controller.removeListener(_onTextChanged);
      controller.dispose();
    }
    super.dispose();
  }

  void _onTextChanged() {
    if (!mounted) return;
    setState(() {
      _nameError = null;
      _error = null;
    });
  }

  bool get _isDirty => _projectName.text.trim().isNotEmpty ||
      _companyName.text.trim().isNotEmpty ||
      _companySlug.text.trim().isNotEmpty;

  void _switchMode(WorkspaceCreateMode mode) {
    if (mode == _mode) return;
    setState(() {
      _mode = mode;
      _error = null;
      _nameError = null;
    });
  }

  /// 对齐网页 `cleanSlug`：小写化并剔除 `a-z0-9_-` 之外的字符
  String _cleanSlug(String raw) {
    return raw
        .trim()
        .toLowerCase()
        .replaceAll(RegExp('[^a-z0-9_-]'), '')
        .trim();
  }

  Future<void> _submitProject() async {
    final name = _projectName.text.trim();
    if (name.isEmpty) {
      setState(() => _nameError = '请输入项目名称');
      return;
    }
    final company = context.authStateRead.currentCompany;
    if (company == null) {
      setState(() => _error = '未检测到有效企业所属，请先创建或加入公司');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _nameError = null;
    });
    final auth = context.authStateRead;
    try {
      final created = await ProjectsRepository(auth.api)
          .createProject(name: name, companyId: company.id);
      await auth.refreshProjects();
      final matched = auth.projects.where((item) => item.id == created.id);
      auth.selectProject(matched.isNotEmpty ? matched.first : created);
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, '项目「${created.name}」已创建', type: ToastType.success);
      Navigator.of(context).maybePop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = projectErrorMessage(error);
      });
    }
  }

  Future<void> _submitCompany() async {
    final name = _companyName.text.trim();
    final slug = _cleanSlug(_companySlug.text);
    if (name.isEmpty) {
      setState(() => _nameError = '请输入公司名称');
      return;
    }
    if (slug.isEmpty) {
      setState(() => _error = '请输入有效的公司英文代号 (slug)');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _nameError = null;
    });
    final auth = context.authStateRead;
    try {
      final created = await ProjectsRepository(auth.api).createCompany(
        name: name,
        slug: slug,
        policyPreset: _policyPreset,
      );
      // 新建公司后由底座全局状态加载该公司的项目列表并成为当前企业
      await auth.selectCompany(created);
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, '公司「${created.name}」已创建', type: ToastType.success);
      Navigator.of(context).maybePop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = projectErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isProject = _mode == WorkspaceCreateMode.project;
    return AppScaffold(
      title: isProject ? '新建项目' : '创建新公司',
      isDirty: _isDirty && !_busy,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.lg,
          AppSpacing.xl,
          AppSpacing.xxxl,
        ),
        children: [
          AppSegmentedControl<WorkspaceCreateMode>(
            segments: const {
              WorkspaceCreateMode.project: '新建项目',
              WorkspaceCreateMode.company: '创建公司',
            },
            selectedValue: _mode,
            onValueChanged: _switchMode,
          ),
          const SizedBox(height: AppSpacing.lg),
          if (_error != null) ...[
            InfoBanner(
              message: _error!,
              tone: InfoBannerTone.danger,
              icon: 'alert',
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          if (isProject) ..._buildProjectForm() else ..._buildCompanyForm(),
        ],
      ),
    );
  }

  List<Widget> _buildProjectForm() {
    return [
      AppTextField(
        controller: _projectName,
        label: '项目名称',
        placeholder: '输入项目全名',
        prefix: const AppIcon('folder', size: 18),
        errorText: _nameError,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _submitProject(),
      ),
      const SizedBox(height: AppSpacing.sm),
      const Text(
        '清晰易识别的项目名称，如「智能客服 2.0」',
        style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
      ),
      const SizedBox(height: AppSpacing.xxl),
      AppButton(
        label: _busy ? '正在创建…' : '立即创建项目',
        size: AppButtonSize.lg,
        isFullWidth: true,
        isLoading: _busy,
        onPressed: _busy ? null : _submitProject,
      ),
    ];
  }

  List<Widget> _buildCompanyForm() {
    return [
      AppTextField(
        controller: _companyName,
        label: '公司 / 组织全称',
        placeholder: '例如「未来科技实业有限公司」',
        prefix: const AppIcon('team', size: 18),
        errorText: _nameError,
      ),
      const SizedBox(height: AppSpacing.lg),
      AppTextField(
        controller: _companySlug,
        label: '英文唯一标识 (Slug)',
        placeholder: '例如 future-tech',
        prefix: const AppIcon('lock', size: 18),
      ),
      const SizedBox(height: AppSpacing.sm),
      const Text(
        '小写字母、数字与中划线，用于独立域名与数据隔离',
        style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
      ),
      const SizedBox(height: AppSpacing.lg),
      _buildPolicyPicker(),
      const SizedBox(height: AppSpacing.xxl),
      AppButton(
        label: _busy ? '正在初始化公司…' : '确认创建公司',
        size: AppButtonSize.lg,
        isFullWidth: true,
        isLoading: _busy,
        onPressed: _busy ? null : _submitCompany,
      ),
    ];
  }

  Widget _buildPolicyPicker() {
    final isDark = isDarkMode(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 6),
          child: Text(
            '安全策略预设',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
        ),
        InkWell(
          onTap: _busy ? null : _pickPolicy,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.md,
            ),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceVariant : AppColors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                const AppIcon('shield', size: 18),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    _policyLabel(_policyPreset),
                    style: TextStyle(
                      fontSize: 14,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
                const AppIcon('chevron-down', size: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _pickPolicy() async {
    await showAppActionSheet(
      context: context,
      title: '安全策略预设',
      actions: [
        AppActionSheetItem(
          label: _policyLabel('enterprise_strict'),
          onPressed: () => setState(() => _policyPreset = 'enterprise_strict'),
        ),
        AppActionSheetItem(
          label: _policyLabel('startup_flexible'),
          onPressed: () => setState(() => _policyPreset = 'startup_flexible'),
        ),
      ],
      cancelLabel: '取消',
    );
  }

  String _policyLabel(String value) {
    return value == 'startup_flexible'
        ? '创业敏捷模式（灵活扁平协作）'
        : '企业合规严格模式（强制人轴与逐级汇报）';
  }
}
