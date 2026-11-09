/// 接受项目邀请（含深链接入口处理）
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileInviteAcceptScreen`（81）
/// 与 `frontend/src/App.tsx` 中的邀请自动接受逻辑。
/// 深链接 `?invite={token}` 的解析与路由地址由 `invite_link.dart` 提供；
/// 系统级链接注册（iOS Universal Links / 安卓 App Links）由 T10 统一完成。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../invite_link.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class InviteAcceptScreen extends StatefulWidget {
  const InviteAcceptScreen({super.key, this.initialToken});

  final String? initialToken;

  @override
  State<InviteAcceptScreen> createState() => _InviteAcceptScreenState();
}

class _InviteAcceptScreenState extends State<InviteAcceptScreen> {
  late final TextEditingController _token =
      TextEditingController(text: widget.initialToken ?? '');

  bool _busy = false;
  bool _needPhoneVerify = false;
  String? _error;

  /// 已加入成功、但工作区（公司列表 / 项目列表）没同步上时的结果区状态。
  /// 邀请已被消费、无法重新接受，所以必须留在本页提供幂等重试。
  int? _joinedProjectId;
  int? _joinedCompanyId;
  bool _syncFailed = false;
  String? _syncMessage;

  /// 令牌/页面参数变化时自增，用于丢弃旧令牌请求的迟到结果
  int _acceptSeq = 0;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialToken?.trim();
    if (initial != null && initial.isNotEmpty && !isValidInviteToken(initial)) {
      _error = '邀请链接无效';
    }
  }

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(InviteAcceptScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialToken == widget.initialToken) return;
    // 同一条路由换邀请令牌（深链接 A → 深链接 B）时会复用本页状态：
    // 必须换掉输入框内容，并清空上一个令牌的「已加入 / 同步失败」结果区，
    // 否则用户会把 A 的结果当成 B 的结果，还会对已消费的邀请重复操作。
    _acceptSeq++;
    _token.text = widget.initialToken ?? '';
    final initial = widget.initialToken?.trim();
    setState(() {
      _busy = false;
      _needPhoneVerify = false;
      _error = (initial != null &&
              initial.isNotEmpty &&
              !isValidInviteToken(initial))
          ? '邀请链接无效'
          : null;
      _joinedProjectId = null;
      _joinedCompanyId = null;
      _syncFailed = false;
      _syncMessage = null;
    });
  }

  ProjectsRepository get _repo => ProjectsRepository(context.authStateRead.api);

  Future<void> _accept() async {
    final token = _token.text.trim();
    if (token.isEmpty) {
      setState(() => _error = '请输入或粘贴邀请令牌');
      return;
    }
    if (!isValidInviteToken(token)) {
      setState(() => _error = '邀请链接无效');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _needPhoneVerify = false;
      _syncFailed = false;
      _syncMessage = null;
    });
    final seq = ++_acceptSeq;

    final auth = context.authStateRead;
    try {
      final result = await _repo.acceptInvitation(token);
      ProjectDetail? detail;
      try {
        detail = await _repo.fetchProject(result.projectId);
      } catch (error) {
        // 项目详情拉取失败不影响「已加入」这一结果，但要给出可见提示
        if (mounted && seq == _acceptSeq) {
          showAppToast(
            context,
            '已加入项目，但项目详情加载失败：${projectErrorMessage(error)}',
            type: ToastType.warning,
          );
        }
      }
      if (!mounted || seq != _acceptSeq) return;

      // 刷新公司 → 切公司 → 刷新项目 → 选中受邀项目。
      // 详情失败时不知道受邀公司 ID，靠项目反查公司（见 [_syncWorkspace]）。
      final invitedCompanyId = detail?.companyId;
      final synced = await _syncWorkspace(
        auth,
        projectId: result.projectId,
        invitedCompanyId: invitedCompanyId,
      );
      if (!mounted || seq != _acceptSeq) return;

      setState(() {
        _busy = false;
        _joinedProjectId = result.projectId;
        _joinedCompanyId = invitedCompanyId;
        _syncFailed = !synced;
        _syncMessage = synced ? null : _workspaceErrorText(auth.errorMessage);
      });

      // 同步失败：留在本页的结果区，提供「重试同步工作区」与「先进入项目」，
      // 不再把用户直接丢进团队页（项目切换页不会重拉公司列表，进去等于没法补救）。
      if (!synced) return;

      final name = detail?.name;
      showAppToast(
        context,
        name == null ? '已加入受邀项目' : '已加入「$name」',
        type: ToastType.success,
      );
      context.pushReplacement('/projects/${result.projectId}/team');
    } catch (error) {
      if (!mounted || seq != _acceptSeq) return;
      setState(() {
        _busy = false;
        _needPhoneVerify = _isPhoneGate(error);
        _error = _mapAcceptError(error);
      });
    }
  }

  /// 同步工作区：刷新公司列表 → 选中受邀公司 → 刷新项目 → 选中受邀项目。
  ///
  /// 只调用 [AuthState] 的公开方法，**不会**再次请求接受邀请接口，因此可以安全重试。
  /// 拿不到受邀公司 ID（如 `GET /projects/{id}` 临时失败）时，按项目 ID 逐个公司核对
  /// 项目列表，避免「已加入却选不中项目」；实在找不到也至少选中一家公司，
  /// 不让项目切换页显示「尚未加入任何公司」。
  Future<bool> _syncWorkspace(
    AuthState auth, {
    required int projectId,
    int? invitedCompanyId,
  }) async {
    final companiesRefreshed = await auth.refreshCompanies();
    if (!mounted) return false;
    if (!companiesRefreshed) return false;

    final companies = auth.companies;
    var currentChecked = false;
    if (invitedCompanyId != null) {
      final matchedCompanies = companies
          .where((item) => item.id == invitedCompanyId)
          .toList(growable: false);
      if (matchedCompanies.isNotEmpty) {
        if (auth.currentCompany?.id != invitedCompanyId) {
          // selectCompany 成功时已加载该公司项目；失败会回滚到原公司
          final switched = await auth.selectCompany(matchedCompanies.first);
          if (!mounted) return false;
          if (!switched) return false;
        }
        if (await _refreshAndSelectProject(auth, projectId)) return true;
        if (!mounted) return false;
        currentChecked = true;
      }
    }

    // 先核对当前公司的项目，再逐个公司找包含该项目的公司。
    if (!currentChecked && auth.currentCompany != null) {
      if (await _refreshAndSelectProject(auth, projectId)) return true;
      if (!mounted) return false;
    }
    for (final company in companies) {
      if (company.id == auth.currentCompany?.id) continue;
      final switched = await auth.selectCompany(company);
      if (!mounted) return false;
      if (!switched) continue;
      if (_selectProjectIfPresent(auth, projectId)) return true;
    }

    // 仍找不到该项目（如刚加入、服务端权限延迟）：至少选中一家公司工作区。
    if (auth.currentCompany == null && companies.isNotEmpty) {
      await auth.selectCompany(companies.first);
      if (!mounted) return false;
    }
    return false;
  }

  /// 重新拉当前公司的项目列表并选中 [projectId]；返回是否选中。
  Future<bool> _refreshAndSelectProject(AuthState auth, int projectId) async {
    final refreshed = await auth.refreshProjects();
    if (!refreshed) return false;
    return _selectProjectIfPresent(auth, projectId);
  }

  bool _selectProjectIfPresent(AuthState auth, int projectId) {
    final matched = auth.projects
        .where((item) => item.id == projectId)
        .toList(growable: false);
    if (matched.isEmpty) return false;
    auth.selectProject(matched.first);
    return true;
  }

  /// 只重跑工作区同步（不重复调用接受邀请接口）
  Future<void> _retrySync() async {
    final projectId = _joinedProjectId;
    if (projectId == null || _busy) return;
    // 与接受流程共用序号：重试途中换了邀请令牌，旧重试的结果一律丢弃
    final seq = _acceptSeq;
    setState(() {
      _busy = true;
      _syncMessage = null;
    });

    final auth = context.authStateRead;
    final synced = await _syncWorkspace(
      auth,
      projectId: projectId,
      invitedCompanyId: _joinedCompanyId,
    );
    if (!mounted || seq != _acceptSeq) return;

    setState(() {
      _busy = false;
      _syncFailed = !synced;
      _syncMessage = synced ? null : _workspaceErrorText(auth.errorMessage);
    });
    if (!synced) {
      showAppToast(context, '工作区仍未同步，请稍后重试', type: ToastType.warning);
      return;
    }
    showAppToast(context, '已同步工作区并选中受邀项目', type: ToastType.success);
    context.pushReplacement('/projects/$projectId/team');
  }

  /// 次要入口：跳过工作区同步，先进入受邀项目的团队页（团队页按路由 ID 取数）。
  void _enterProject() {
    final projectId = _joinedProjectId;
    if (projectId == null) return;
    context.pushReplacement('/projects/$projectId/team');
  }

  /// 把底座给的错误文案转成用户能看的说法：`ApiClient` 对 5xx 只给出“HTTP 500”。
  String _workspaceErrorText(String? message) {
    final text = message?.trim() ?? '';
    if (text.isEmpty) return '公司或项目列表未能加载';
    if (RegExp(r'^HTTP \d{3}$').hasMatch(text)) return '服务暂时不可用';
    return text;
  }

  /// 后端 `40320` / 文案含「验证」视为手机验证门禁
  bool _isPhoneGate(Object error) {
    if (error is ApiException) {
      if (error.code == 40320) return true;
      final detail = error.detail;
      final text = '${error.message} ${detail ?? ''}';
      return text.contains('手机') || text.contains('验证');
    }
    if (error is AppException) {
      return error.message.contains('手机验证');
    }
    return false;
  }

  String _mapAcceptError(Object error) {
    if (_isPhoneGate(error)) {
      return '当前项目要求完成手机号实名验证后方可加入';
    }
    // 后端对无效/过期邀请返回 422（ApiClient 会转成 ValidationException），
    // 这里按服务端文案判定，不依赖具体异常子类型
    final message = error is AppException ? error.message : '';
    if (message.contains('过期')) {
      return '该邀请链接已过期，请让项目负责人重新生成';
    }
    if (message.contains('无效')) {
      return '该邀请链接已失效或已被使用';
    }
    if (message.contains('不匹配')) {
      return '该邀请与当前登录账号不匹配，请使用受邀邮箱对应的账号登录';
    }
    if (message.contains('不存在')) {
      return '受邀项目不存在或已被归档';
    }
    return projectErrorMessage(error);
  }

  @override
  Widget build(BuildContext context) {
    // 从 worktodo:// 链接直接进入时没有上一页：给出返回入口，系统返回键回工作首页而不是退出 APP
    final canPop = Navigator.of(context).canPop();
    return PopScope(
      canPop: canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/work');
      },
      child: _buildScaffold(context, canPop),
    );
  }

  Widget _buildScaffold(BuildContext context, bool canPop) {
    return AppScaffold(
      title: '接受项目协同邀请',
      leading: canPop
          ? null
          : IconButton(
              tooltip: '返回工作',
              icon: const AppIcon('back', size: 18),
              onPressed: () => context.go('/work'),
            ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xxl,
          AppSpacing.xxl,
          AppSpacing.xxl,
          AppSpacing.xxxl,
        ),
        children: [
          Center(
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              ),
              alignment: Alignment.center,
              child: const AppIcon(
                'share',
                size: 18,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const Text(
            '加入项目团队',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            '接受邀请后，您将获得该项目的任务协同与人轴汇报权限',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          if (_syncFailed) ...[
            InfoBanner(
              message: '已加入项目，但工作区同步失败（${_syncMessage ?? '服务暂时不可用'}）'
                  '可点「重试同步工作区」重新拉取公司并选中该项目，无需重新接受邀请',
              tone: InfoBannerTone.warning,
              icon: 'alert',
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: '重试同步工作区',
              size: AppButtonSize.lg,
              isFullWidth: true,
              icon: const AppIcon('refresh', size: 18),
              isLoading: _busy,
              onPressed: _busy ? null : _retrySync,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: '先进入项目',
              variant: AppButtonVariant.secondary,
              size: AppButtonSize.lg,
              isFullWidth: true,
              onPressed: _busy ? null : _enterProject,
            ),
          ] else ...[
            if (_error != null) ...[
              InfoBanner(
                message: _error!,
                tone: InfoBannerTone.danger,
                icon: 'alert',
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (_needPhoneVerify) ...[
              AppButton(
                label: '前往验证手机号后继续加入',
                variant: AppButtonVariant.secondary,
                size: AppButtonSize.lg,
                isFullWidth: true,
                icon: const AppIcon('phone', size: 18),
                onPressed: () => context.pushNamed('me-security'),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            AppTextField(
              controller: _token,
              label: '邀请令牌 Token',
              placeholder: '粘贴或输入收到的邀请 Token',
              prefix: const AppIcon('lock', size: 18),
              autofocus: widget.initialToken == null,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _accept(),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: _busy ? '正在加入…' : '接受并进入项目',
              size: AppButtonSize.lg,
              isFullWidth: true,
              isLoading: _busy,
              onPressed: _busy ? null : _accept,
            ),
            const SizedBox(height: AppSpacing.lg),
            const InfoBanner(
              message: '邀请链接由项目负责人生成，仅能使用一次；同一邮箱的邀请需用该邮箱对应的账号接受',
              tone: InfoBannerTone.info,
              icon: 'info',
            ),
          ],
        ],
      ),
    );
  }
}
