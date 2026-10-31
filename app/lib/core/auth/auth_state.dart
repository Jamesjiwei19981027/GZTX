import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  AuthState({ApiClient? apiClient}) : _api = apiClient ?? ApiClient() {
    // 监听客户端认证失效通知（最终 401），立即同步重置为 unauthenticated 并清空状态
    _api.onAuthExpired = _handleAuthExpired;
  }

  void _handleAuthExpired() {
    _status = AuthStatus.unauthenticated;
    _currentUser = null;
    _currentCompany = null;
    _companies = const [];
    _currentProject = null;
    _projects = const [];
    _errorMessage = '登录已过期，请重新登录';
    _api.tokens.clear();
    notifyListeners();
  }

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

      // 原生模式启动时清除旧外壳遗留在 SharedPreferences 里的明文令牌
      await _cleanLegacySharedPreferencesToken();

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
      _projectLoadSeq++;
      _applyProjects(await _fetchProjects(_currentCompany?.id));

      _status = AuthStatus.authenticated;
      notifyListeners();
    } catch (e) {
      await _applySessionError(e, duringBootstrap: true);
    }
  }

  /// 会话级异常统一处理（bootstrap 与运行中刷新共用）：
  /// - 认证失效（AuthException、401/403）→ 清会话回未登录；
  /// - 断网、服务端错误 → 离线（保留令牌，可重试）；
  /// - 其他请求错误（如 422 参数校验）→ 启动时按离线处理，运行中保留会话与原状态，只记录错误信息。
  Future<void> _applySessionError(Object e, {required bool duringBootstrap}) async {
    if (e is AuthException ||
        (e is ApiException && (e.statusCode == 401 || e.statusCode == 403))) {
      await _clearSession();
      _errorMessage = (e as AppException).message;
      _status = AuthStatus.unauthenticated;
    } else if (e is NetworkException ||
        (e is ApiException && (e.statusCode == null || e.statusCode! >= 500))) {
      _errorMessage = (e as AppException).message;
      _status = AuthStatus.offline;
    } else {
      _errorMessage = e is AppException ? e.message : '请求失败: $e';
      if (duringBootstrap) _status = AuthStatus.offline;
    }
    notifyListeners();
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
      await _cleanLegacySharedPreferencesToken();
      await _clearSession();
      _status = AuthStatus.unauthenticated;
      notifyListeners();
    }
  }

  /// 切换当前所在公司/企业工作区。
  /// 项目加载失败时回滚到原公司与原项目，再按会话异常统一处理；返回是否切换成功。
  /// 并发时只采用最后一次发起的项目加载结果（成功或回滚），较早的请求结果直接丢弃。
  Future<bool> selectCompany(Company company) async {
    if (_currentCompany?.id == company.id) return true;
    final prevCompany = _currentCompany;
    final prevProjects = _projects;
    final prevProject = _currentProject;
    final seq = ++_projectLoadSeq;
    _currentCompany = company;
    try {
      final list = await _fetchProjects(company.id);
      if (seq != _projectLoadSeq) return false;
      _applyProjects(list);
      notifyListeners();
      return true;
    } catch (e) {
      if (seq != _projectLoadSeq) return false;
      _currentCompany = prevCompany;
      _projects = prevProjects;
      _currentProject = prevProject;
      await _applySessionError(e, duringBootstrap: false);
      return false;
    }
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

  /// 重新加载项目列表。失败时保留原列表，再按会话异常统一处理；返回是否成功。
  Future<bool> refreshProjects() async {
    final seq = ++_projectLoadSeq;
    try {
      final list = await _fetchProjects(_currentCompany?.id);
      if (seq != _projectLoadSeq) return false;
      _applyProjects(list);
      notifyListeners();
      return true;
    } catch (e) {
      if (seq != _projectLoadSeq) return false;
      await _applySessionError(e, duringBootstrap: false);
      return false;
    }
  }

  /// 项目加载序号：每次发起加载自增，结果返回时与最新序号比对，防止并发请求互相覆盖。
  int _projectLoadSeq = 0;

  /// 写入项目列表并维持当前项目（原选中项仍在则保留，否则默认第一项）。
  void _applyProjects(List<Project> list) {
    _projects = list;
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
  }

  /// 拉取指定公司的项目列表，不修改任何状态；异常原样向上传递。
  Future<List<Project>> _fetchProjects(int? cid) async {
    if (cid == null) return const [];

    // 对照网页版 backend.ts:377-380：使用 /projects 路径，且带 as_admin=true
    final dynamic projData = await _api.get(
      '/projects',
      query: {
        'company_id': cid.toString(),
        'as_admin': 'true',
      },
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
    return projList;
  }

  /// 清除历史旧外壳遗留在 SharedPreferences 里的明文令牌
  Future<void> _cleanLegacySharedPreferencesToken() async {
    try {
      final prefs = await SharedPreferences.getInstance()
          .timeout(const Duration(milliseconds: 200));
      if (prefs.containsKey('access_token') ||
          prefs.containsKey('refresh_token') ||
          prefs.containsKey('token')) {
        await prefs.remove('access_token');
        await prefs.remove('refresh_token');
        await prefs.remove('token');
        debugPrint('Legacy plaintext tokens removed from SharedPreferences');
      }
    } catch (e) {
      debugPrint('Error cleaning legacy tokens: $e');
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
