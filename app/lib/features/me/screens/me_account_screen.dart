import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/company.dart';
import '../../../core/models/user.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 账号信息（对应网页「账号」入口，展示只读账号标识）
class MeAccountScreen extends StatefulWidget {
  const MeAccountScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.userOverride,
    this.companyOverride,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final User? userOverride;
  final Company? companyOverride;

  @override
  State<MeAccountScreen> createState() => _MeAccountScreenState();
}

class _MeAccountScreenState extends State<MeAccountScreen> {
  bool _loading = true;
  Object? _error;
  User? _user;
  MeVerificationStatus? _verification;
  MeMembership _membership = MeMembership.none;

  AuthState? get _auth => resolveMeAuthState(context, widget.authState);
  MeApi get _api => resolveMeApi(context, widget.api);
  Company? get _company => widget.companyOverride ?? _auth?.currentCompany;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = _api;
      final user = await api.fetchMe();
      final verification = await api.fetchVerification();
      var membership = MeMembership.none;
      final companyId = _company?.id;
      if (companyId != null) {
        membership = (await api.fetchCompanyContext(companyId)).membership;
      }
      if (!mounted) return;
      setState(() {
        _user = user;
        _verification = verification;
        _membership = membership;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  String _emailText(User? user) {
    final value = (_verification?.email ?? user?.email ?? '').trim();
    return value.isEmpty ? '未绑定' : value;
  }

  String _phoneText(User? user) {
    final value = (_verification?.phone ?? user?.phone ?? '').trim();
    return value.isEmpty ? '未绑定' : value;
  }

  Widget _withBadge(String text, bool verified) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Flexible(
          child: Text(
            text,
            textAlign: TextAlign.right,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
          ),
        ),
        const SizedBox(width: 8),
        verified
            ? const MeBadge(label: '已验证', tone: MeTone.success)
            : const MeBadge(label: '未验证'),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _user ?? widget.userOverride;
    final company = _company;
    final registered = formatDisplayDateTime(
      parseApiDateTime(user?.createdAt),
      withTime: false,
    );

    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '账号信息',
        body: _loading && user == null
            ? const MeLoadingState(message: '正在加载账号信息…')
            : _error != null && user == null
                ? MeErrorState(
                    message: meErrorMessage(_error!),
                    onRetry: _load,
                  )
                : MePageBody(
                    children: [
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: meErrorMessage(_error!),
                            tone: MeTone.danger,
                            onRetry: _load,
                          ),
                        ),
                      MeCard(
                        title: '账号标识',
                        footer: '登录账号与用户 ID 由系统分配，不可自行修改',
                        children: [
                          MeInfoRow(
                            label: '登录账号',
                            value: user?.username ?? '—',
                          ),
                          MeInfoRow(
                            label: '昵称',
                            value: user?.displayName ?? '—',
                          ),
                          MeInfoRow(label: '用户 ID', value: '${user?.id ?? 0}'),
                          MeInfoRow(
                            label: '注册时间',
                            value: registered.isEmpty ? '—' : registered,
                            showDivider: false,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '联系方式与验证',
                        footer: '验证状态由「账号与安全」中的绑定流程更新',
                        children: [
                          MeInfoRow(
                            label: '工作邮箱',
                            value: _emailText(user),
                            valueWidget: _withBadge(
                              _emailText(user),
                              _verification?.emailVerified == true,
                            ),
                          ),
                          MeInfoRow(
                            label: '手机号码',
                            value: _phoneText(user),
                            valueWidget: _withBadge(
                              _phoneText(user),
                              _verification?.phoneVerified == true,
                            ),
                            showDivider: false,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '企业归属',
                        footer: company == null
                            ? '未加入企业时，企业级功能（人轴、项目知识、团队管理）不可用'
                            : null,
                        children: [
                          MeInfoRow(
                            label: '当前企业',
                            value: company?.name ?? '未加入企业',
                          ),
                          MeInfoRow(
                            label: '企业角色',
                            value: _membership.isSuperAdmin
                                ? '超级管理员'
                                : ((_membership.title ?? '').trim().isNotEmpty
                                    ? _membership.title!
                                    : '成员'),
                            showDivider: false,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: '前往账号与安全',
                        variant: AppButtonVariant.secondary,
                        isFullWidth: true,
                        onPressed: () => context.pushNamed('me-security'),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      AppButton(
                        label: '编辑个人资料',
                        isFullWidth: true,
                        onPressed: () => context.push('/me/profile'),
                      ),
                    ],
                  ),
      ),
    );
  }
}
