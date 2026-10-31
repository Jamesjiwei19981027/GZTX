import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../errors/app_error.dart';
import '../models/company.dart';
import '../models/project.dart';
import '../models/user.dart';

/// 认证与当前会话状态
enum AuthStatus {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
  offline,
}

class AuthState extends ChangeNotifier {
  AuthState({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  ApiClient get api => _api;

  AuthStatus _status = AuthStatus.initial;
  AuthStatus get status => _status;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isAuthenticating => _status == AuthStatus.authenticating;

  User? _currentUser;
  User? get currentUser => _currentUser;

  Company? _currentCompany;
  Company? get currentCompany => _currentCompany;

  List<Company> _companies = const [];
  List<Company> get companies => List.unmodifiable(_companies);

  Project? _currentProject;
  Project? get currentProject => _currentProject;

  List<Project> _projects = const [];
  List<Project> get projects => List.unmodifiable(_projects);

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  /// 初始化与恢复登录态
  /// 对照 `frontend/src/App.tsx` 中的登录后数据加载顺序：
  /// 1. 获取 me
  /// 2. 获取 companies/mine
  /// 3. 获取当前公司的 projects
  Future<void> bootstrap() async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      await _api.init();

      if (!_api.tokens.hasAccess) {
        _status = AuthStatus.unauthenticated;
        notifyListeners();
        return;
      }

      // 1. 获取用户信息
      final dynamic meData = await _api.get('/users/me');
      if (meData is Map<String, dynamic>) {
        _currentUser = User.fromJson(meData);
      }

      // 2. 获取企业/公司列表
      final dynamic compData = await _api.get('/companies/mine');
      final compList = <Company>[];
      if (compData is Map<String, dynamic>) {
        final items = compData['items'];
        if (items is List) {
          for (final item in items) {
            if (item is Map<String, dynamic>) {
              compList.add(Company.fromJson(item));
            }
          }
        }
      } else if (compData is List) {
        for (final item in compData) {
          if (item is Map<String, dynamic>) {
            compList.add(Company.fromJson(item));
          }
        }
      }
      _companies = compList;

      if (_companies.isNotEmpty) {
        // 如果原有选中的公司仍在列表里则保留，否则默认第一家
        if (_currentCompany != null &&
            _companies.any((c) => c.id == _currentCompany!.id)) {
          _currentCompany =
              _companies.firstWhere((c) => c.id == _currentCompany!.id);
        } else {
          _currentCompany = _companies.first;
        }
      } else {
        _currentCompany = null;
      }

      // 3. 获取项目列表
      await _loadProjectsForCurrentCompany();

      _status = AuthStatus.authenticated;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.statusCode == 401 || e.statusCode == 403) {
        await _clearSession();
        _status = AuthStatus.unauthenticated;
      } else {
        _errorMessage = e.message;
        _status = AuthStatus.offline;
      }
      notifyListeners();
    } on NetworkException catch (e) {
      _errorMessage = e.message;
      _status = AuthStatus.offline;
      notifyListeners();
    } catch (e) {
      _errorMessage = '启动初始化失败: $e';
      _status = AuthStatus.unauthenticated;
      notifyListeners();
    }
  }

  /// 账号密码登录
  Future<void> login(String username, String password) async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      final dynamic res = await _api.post(
        '/auth/login',
        body: {'username': username, 'password': password},
      );

      String? access;
      String? refresh;
      if (res is Map<String, dynamic>) {
        access = res['access_token'] as String?;
        refresh = res['refresh_token'] as String?;
      }

      if (access == null || access.isEmpty) {
        throw ApiException('登录失败：未获取到访问令牌');
      }

      await _api.tokens.save(access: access, refresh: refresh);
      await bootstrap();
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = e is AppException ? e.message : '登录失败: $e';
      notifyListeners();
      rethrow;
    }
  }

  /// 退出登录
  Future<void> logout() async {
    try {
      if (_api.tokens.hasAccess) {
        await _api.post('/auth/logout').catchError((_) => null);
      }
    } finally {
      await _clearSession();
      _status = AuthStatus.unauthenticated;
      notifyListeners();
    }
  }

  /// 切换当前所在公司/企业工作区
  Future<void> selectCompany(Company company) async {
    if (_currentCompany?.id == company.id) return;
    _currentCompany = company;
    await _loadProjectsForCurrentCompany();
    notifyListeners();
  }

  /// 切换当前选中的项目
  void selectProject(Project project) {
    if (_currentProject?.id == project.id) return;
    _currentProject = project;
    notifyListeners();
  }

  /// 重新刷新当前用户信息
  Future<void> refreshUser() async {
    try {
      final dynamic meData = await _api.get('/users/me');
      if (meData is Map<String, dynamic>) {
        _currentUser = User.fromJson(meData);
        notifyListeners();
      }
    } catch (_) {}
  }

  /// 重新加载项目列表
  Future<void> refreshProjects() async {
    await _loadProjectsForCurrentCompany();
    notifyListeners();
  }

  Future<void> _loadProjectsForCurrentCompany() async {
    final cid = _currentCompany?.id;
    if (cid == null) {
      _projects = const [];
      _currentProject = null;
      return;
    }

    try {
      final dynamic projData = await _api.get(
        '/projects/',
        query: {'company_id': cid.toString()},
      );

      final projList = <Project>[];
      if (projData is Map<String, dynamic>) {
        final items = projData['items'];
        if (items is List) {
          for (final item in items) {
            if (item is Map<String, dynamic>) {
              projList.add(Project.fromJson(item));
            }
          }
        }
      } else if (projData is List) {
        for (final item in projData) {
          if (item is Map<String, dynamic>) {
            projList.add(Project.fromJson(item));
          }
        }
      }
      _projects = projList;

      if (_projects.isNotEmpty) {
        if (_currentProject != null &&
            _projects.any((p) => p.id == _currentProject!.id)) {
          _currentProject =
              _projects.firstWhere((p) => p.id == _currentProject!.id);
        } else {
          _currentProject = _projects.first;
        }
      } else {
        _currentProject = null;
      }
    } catch (e) {
      _projects = const [];
      _currentProject = null;
    }
  }

  Future<void> _clearSession() async {
    await _api.tokens.clear();
    _currentUser = null;
    _currentCompany = null;
    _companies = const [];
    _currentProject = null;
    _projects = const [];
    _errorMessage = null;
  }
}
