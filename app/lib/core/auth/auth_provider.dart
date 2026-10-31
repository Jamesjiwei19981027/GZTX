import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/company.dart';
import '../models/project.dart';
import '../models/user.dart';
import 'auth_state.dart';

export 'auth_state.dart';

/// 认证上下文快捷访问扩展
extension AuthContextExtension on BuildContext {
  AuthState get authState => watch<AuthState>();
  AuthState get authStateRead => read<AuthState>();

  ApiClient get apiClient => read<AuthState>().api;

  User? get currentUser => watch<AuthState>().currentUser;
  Company? get currentCompany => watch<AuthState>().currentCompany;
  Project? get currentProject => watch<AuthState>().currentProject;

  bool get isAuthenticated => watch<AuthState>().isAuthenticated;
}
