import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../data/me_api.dart';

/// 可选地读取 Provider 中的类型（测试或隔离渲染时可能不存在）
T? meReadOrNull<T>(BuildContext context) {
  try {
    return Provider.of<T>(context, listen: false);
  } catch (_) {
    return null;
  }
}

/// 解析当前登录态：优先使用测试注入值
AuthState? resolveMeAuthState(BuildContext context, AuthState? injected) {
  return injected ?? meReadOrNull<AuthState>(context);
}

/// 解析接口层：优先使用测试注入的 [MeApi]，否则复用全局登录态里的 ApiClient
MeApi resolveMeApi(BuildContext context, MeApi? injected) {
  if (injected != null) return injected;
  final auth = meReadOrNull<AuthState>(context);
  if (auth != null) return MeApi(auth.api);
  return MeApi(AuthState().api);
}
