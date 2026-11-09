import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../data/auth_flow.dart';
import '../data/native_sso.dart';
import '../utils/auth_error_message.dart';
import '../widgets/auth_message_banner.dart';

class SsoCallbackScreen extends StatefulWidget {
  const SsoCallbackScreen({super.key, required this.ticket, this.sso});
  final String ticket;
  final NativeSso? sso;

  @override
  State<SsoCallbackScreen> createState() => _SsoCallbackScreenState();
}

class _SsoCallbackScreenState extends State<SsoCallbackScreen> {
  AuthState? _auth;
  bool _started = false;
  bool _busy = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_auth == null) {
      _auth = context.read<AuthState>();
      _auth!.addListener(_whenReady);
      WidgetsBinding.instance.addPostFrameCallback((_) => _whenReady());
    }
  }

  void _whenReady() {
    if (!mounted ||
        _started ||
        _auth == null ||
        _auth!.status == AuthStatus.initial ||
        _auth!.status == AuthStatus.authenticating) {
      return;
    }
    _started = true;
    _auth!.removeListener(_whenReady);
    _complete();
  }

  Future<void> _complete() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = _auth!;
      final session = await (widget.sso ?? NativeSso(AuthApi(auth.api)))
          .complete(widget.ticket);
      if (!mounted) return;
      await AuthFlow(auth).completeSignInAndEnter(context, session);
      if (!mounted) return;
      if (auth.status == AuthStatus.offline) {
        context.go('/offline');
      } else if (!auth.isAuthenticated) {
        throw ApiException(auth.errorMessage ?? '登录未完成，请重新登录');
      }
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _auth?.removeListener(_whenReady);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScaffold(
        title: '企业登录',
        body: Center(
            child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_error == null) ...[
              const AppLoading(),
              const SizedBox(height: AppSpacing.lg),
              const Text('正在安全完成企业登录…')
            ],
            if (_error != null) ...[
              AuthMessageBanner(message: _error!),
              AppButton(label: '重试登录验证', onPressed: _busy ? null : _complete),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                  label: '返回登录', onPressed: () => context.go(AuthPaths.login)),
            ],
          ]),
        )),
      );
}
