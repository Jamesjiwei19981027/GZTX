import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/user.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 相册/相机选图结果
class MePickedImage {
  const MePickedImage({required this.bytes, required this.filename});

  final Uint8List bytes;
  final String filename;
}

/// 个人资料（对应网页 `MobileProfileScreen`，设计 ID 54）
class MeProfileScreen extends StatefulWidget {
  const MeProfileScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.userOverride,
    this.pickImage,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final User? userOverride;

  /// 选图能力注入：底座尚未引入 image_picker（已提交共享改动申请），
  /// 未注入时点击「更换头像」会明确提示暂不可用，而不是假装上传成功。
  final Future<MePickedImage?> Function()? pickImage;

  @override
  State<MeProfileScreen> createState() => _MeProfileScreenState();
}

class _MeProfileScreenState extends State<MeProfileScreen> {
  final TextEditingController _nicknameController = TextEditingController();

  bool _loading = true;
  Object? _loadError;
  User? _user;
  MeVerificationStatus? _verification;
  String _initialNickname = '';

  bool _saving = false;
  bool _uploading = false;
  String? _errorMessage;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    super.dispose();
  }

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);

  bool get _isDirty => !_loading &&
      _nicknameController.text.trim() != _initialNickname.trim();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final user = await _api.fetchMe();
      MeVerificationStatus? verification;
      try {
        verification = await _api.fetchVerification();
      } catch (e) {
        // 验证状态属于附加信息，失败不阻断资料编辑，但保留错误提示
        debugPrint('读取验证状态失败: $e');
        _errorMessage = '验证状态读取失败：${meErrorMessage(e)}';
      }
      if (!mounted) return;
      setState(() {
        _user = user;
        _verification = verification;
        _initialNickname = user.nickname ?? '';
        _nicknameController.text = _initialNickname;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e;
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    final nickname = _nicknameController.text.trim();
    if (nickname.isEmpty) {
      setState(() => _errorMessage = '姓名/昵称不能为空');
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final updated = await _api.updateMe(nickname: nickname);
      await _auth?.refreshUser();
      if (!mounted) return;
      setState(() {
        _user = updated;
        _initialNickname = nickname;
        _saving = false;
        _successMessage = '个人资料已保存';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = meErrorMessage(e);
      });
    }
  }

  Future<void> _changeAvatar() async {
    final picker = widget.pickImage;
    if (picker == null) {
      setState(() {
        _errorMessage = '更换头像需要系统相册/相机权限支持，当前版本尚未接入选图能力，已提交共享改动申请';
        _successMessage = null;
      });
      return;
    }
    final picked = await picker();
    if (picked == null || !mounted) return;

    final name = picked.filename.toLowerCase();
    final allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (!allowed.any(name.endsWith)) {
      setState(() {
        _errorMessage = '仅支持 JPG、PNG、GIF、WebP 格式头像';
        _successMessage = null;
      });
      return;
    }
    if (picked.bytes.length > 5 * 1024 * 1024) {
      setState(() {
        _errorMessage = '头像文件大小不得超过 5MB';
        _successMessage = null;
      });
      return;
    }

    setState(() {
      _uploading = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final url = await _api.uploadAvatar(
        bytes: picked.bytes,
        filename: picked.filename,
      );
      final updated = await _api.updateMe(avatarUrl: url);
      await _auth?.refreshUser();
      if (!mounted) return;
      setState(() {
        _user = updated;
        _uploading = false;
        _successMessage = '头像已成功更新';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _errorMessage = meErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '个人资料',
        isDirty: _isDirty,
        body: _loading
            ? const MeLoadingState(message: '正在加载个人资料…')
            : _loadError != null
                ? MeErrorState(
                    message: meErrorMessage(_loadError!),
                    onRetry: _load,
                  )
                : MeKeyboardSafeBody(
                    child: MePageBody(
                      children: [
                        _avatarCard(),
                        if (_errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.md),
                            child: MeBanner(
                              message: _errorMessage!,
                              tone: MeTone.danger,
                            ),
                          ),
                        if (_successMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.md),
                            child: MeBanner(
                              message: _successMessage!,
                              tone: MeTone.success,
                            ),
                          ),
                        const SizedBox(height: AppSpacing.md),
                        MeCard(
                          title: '基本信息',
                          children: [
                            const MeFieldLabel(label: '姓名 / 昵称', required: true),
                            AppTextField(
                              controller: _nicknameController,
                              placeholder: '请输入您的姓名',
                              onChanged: (_) => setState(() {}),
                            ),
                            const SizedBox(height: AppSpacing.md),
                            const MeFieldLabel(label: '工作邮箱'),
                            _readonlyField(
                              value: (_verification?.email ??
                                      _user?.email ??
                                      '')
                                  .trim(),
                              emptyLabel: '未绑定',
                              badge: _verification?.emailVerified == true
                                  ? const MeBadge(
                                      label: '已验证',
                                      tone: MeTone.success,
                                    )
                                  : const MeBadge(label: '未验证'),
                            ),
                            const SizedBox(height: AppSpacing.md),
                            const MeFieldLabel(label: '手机号码'),
                            _readonlyField(
                              value: (_verification?.phone ??
                                      _user?.phone ??
                                      '')
                                  .trim(),
                              emptyLabel: '未绑定手机',
                              badge: _verification?.phoneVerified == true
                                  ? const MeBadge(
                                      label: '已验证',
                                      tone: MeTone.success,
                                    )
                                  : const MeBadge(label: '未验证'),
                            ),
                            const SizedBox(height: AppSpacing.lg),
                            AppButton(
                              label: '保存修改',
                              isFullWidth: true,
                              size: AppButtonSize.lg,
                              isLoading: _saving,
                              onPressed: _saving || _uploading ? null : _save,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _avatarCard() {
    final name = _user?.displayName ?? '';
    return MeCard(
      children: [
        Center(
          child: Stack(
            children: [
              MeAvatar(url: _user?.avatarUrl, name: name, size: 96),
              Positioned(
                right: 0,
                bottom: 0,
                child: GestureDetector(
                  onTap: _uploading ? null : _changeAvatar,
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: _uploading
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.8,
                              color: Colors.white,
                            ),
                          )
                        : const AppIcon('edit', size: 14, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Center(
          child: Text(
            '支持 JPG、PNG、WebP（上限 5MB）',
            style: TextStyle(
              fontSize: 12,
              color: isDarkMode(context)
                  ? AppColors.darkTextTertiary
                  : AppColors.textTertiary,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Center(
          child: MeInlineButton(
            label: '更换头像',
            icon: 'edit',
            isLoading: _uploading,
            onPressed: _uploading ? null : _changeAvatar,
          ),
        ),
      ],
    );
  }

  Widget _readonlyField({
    required String value,
    required String emptyLabel,
    required Widget badge,
  }) {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 46),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : const Color(0xFFF5F6F7),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              value.isEmpty ? emptyLabel : value,
              style: TextStyle(
                fontSize: 14,
                color: value.isEmpty
                    ? (isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary)
                    : (isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary),
              ),
            ),
          ),
          badge,
        ],
      ),
    );
  }
}
