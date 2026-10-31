import 'package:flutter/foundation.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/collab_service.dart';
import '../services/notification_service.dart';
import '../services/report_service.dart';
import '../services/task_service.dart';

/// offline：本地有凭证但这次没能连上服务端。
/// 与 signedOut 区分开，才不会因为一次断网就把用户的登录态清掉。
enum AuthStatus { unknown, signedOut, signedIn, offline }

class AppState extends ChangeNotifier {
  AppState({ApiClient? api}) : api = api ?? ApiClient() {
    auth = AuthService(this.api);
    tasks = TaskService(this.api);
    notifications = NotificationService(this.api);
    reports = ReportService(this.api);
    collab = CollabService(this.api);
  }

  final ApiClient api;
  late final AuthService auth;
  late final TaskService tasks;
  late final NotificationService notifications;
  late final ReportService reports;
  late final CollabService collab;

  AuthStatus status = AuthStatus.unknown;
  AppUser? user;
  List<TaskItem> taskItems = [];
  TaskStats? taskStats;
  List<CompanyItem> companies = [];
  CompanyItem? currentCompany;
  bool busy = false;
  String? error;

  bool get needsVerification =>
      user != null && !(user!.emailVerified && user!.phoneVerified);

  Future<void> bootstrap() async {
    await api.init();
    if (!api.tokens.hasAccess) {
      status = AuthStatus.signedOut;
      notifyListeners();
      return;
    }
    try {
      user = await auth.fetchMe();
      status = AuthStatus.signedIn;
      await Future.wait([refreshTasks(), refreshCompanies()]);
    } on ApiException catch (e) {
      // 只有认证被明确拒绝才清凭证并登出。
      // 旧实现 catch(_) 一把抓：断网冷启动会把本地 refresh_token 永久删掉，
      // 网络恢复后用户还得重新登录。
      if (e.statusCode == 401 || e.statusCode == 403) {
        await api.clearTokens();
        user = null;
        status = AuthStatus.signedOut;
      } else {
        error = e.message;
        status = AuthStatus.offline;
      }
    } catch (e) {
      // 网络异常/超时：保留凭证，进入离线态，可重试
      error = '网络不可用，请检查连接后重试';
      status = AuthStatus.offline;
    }
    notifyListeners();
  }

  /// 离线态下重试引导（供 UI 的「重试」按钮调用）
  Future<void> retryBootstrap() async {
    error = null;
    status = AuthStatus.unknown;
    notifyListeners();
    await bootstrap();
  }

  Future<bool> login(String username, String password) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      user = await auth.login(username: username, password: password);
      status = AuthStatus.signedIn;
      await Future.wait([refreshTasks(), refreshCompanies()]);
      return true;
    } on ApiException catch (e) {
      error = e.message;
      status = AuthStatus.signedOut;
      return false;
    } catch (e) {
      error = '登录失败：$e';
      status = AuthStatus.signedOut;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> loginWithCode({
    required String channel,
    required String target,
    required String code,
  }) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      user = await auth.loginWithCode(
        channel: channel,
        target: target,
        code: code,
      );
      status = AuthStatus.signedIn;
      await Future.wait([refreshTasks(), refreshCompanies()]);
      return true;
    } on ApiException catch (e) {
      error = e.message;
      status = AuthStatus.signedOut;
      return false;
    } catch (e) {
      error = '登录失败：$e';
      status = AuthStatus.signedOut;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> register({
    required String username,
    required String password,
    required String email,
    required String emailCode,
    String? nickname,
    String? phone,
    String? phoneCode,
  }) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      user = await auth.register(
        username: username,
        password: password,
        email: email,
        emailCode: emailCode,
        nickname: nickname,
        phone: phone,
        phoneCode: phoneCode,
      );
      status = AuthStatus.signedIn;
      await Future.wait([refreshTasks(), refreshCompanies()]);
      return true;
    } on ApiException catch (e) {
      error = e.message;
      status = AuthStatus.signedOut;
      return false;
    } catch (e) {
      error = '注册失败：$e';
      status = AuthStatus.signedOut;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await auth.logout();
    user = null;
    taskItems = [];
    taskStats = null;
    companies = [];
    currentCompany = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> refreshMe() async {
    user = await auth.fetchMe();
    notifyListeners();
  }

  Future<void> refreshTasks() async {
    busy = true;
    error = null;
    notifyListeners();
    // 两个请求各自成败，互不牵连：原来共用一个 Future.wait + 单 try，
    // 统计解析一抛异常，任务列表也跟着丢，界面只显示"暂无任务"而不报错。
    try {
      taskItems = await tasks.listTasks();
    } on ApiException catch (e) {
      error = e.message;
    } catch (e) {
      error = '加载任务失败：$e';
    }
    try {
      taskStats = await tasks.stats(period: 'week');
    } on ApiException catch (e) {
      error ??= e.message;
    } catch (e) {
      error ??= '加载统计失败：$e';
    }
    busy = false;
    notifyListeners();
  }

  Future<void> refreshCompanies() async {
    try {
      companies = await collab.myCompanies();
      final savedId = api.companyId;
      if (companies.isEmpty) {
        currentCompany = null;
        await api.setCompanyId(null);
      } else {
        currentCompany = companies.where((c) => c.id == savedId).isEmpty
            ? companies.first
            : companies.firstWhere((c) => c.id == savedId);
        await api.setCompanyId(currentCompany?.id);
      }
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    } catch (_) {
      // companies optional for personal todo use
    }
  }

  Future<void> selectCompany(CompanyItem company) async {
    currentCompany = company;
    await api.setCompanyId(company.id);
    notifyListeners();
  }

  Future<void> completeTask(int id) async {
    try {
      final updated = await tasks.completeTask(id);
      _replaceTask(updated);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> uncompleteTask(int id) async {
    try {
      final updated = await tasks.uncompleteTask(id);
      _replaceTask(updated);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<TaskItem> createTask({
    required String title,
    String? description,
    int priority = 1,
    String? dueDate,
  }) async {
    try {
      final created = await tasks.createTask(
        title: title,
        description: description,
        priority: priority,
        dueDate: dueDate,
      );
      taskItems = [created, ...taskItems];
      notifyListeners();
      return created;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> deleteTask(int id) async {
    await tasks.deleteTask(id);
    taskItems = taskItems.where((t) => t.id != id).toList();
    notifyListeners();
  }

  void _replaceTask(TaskItem updated) {
    taskItems = [
      for (final t in taskItems)
        if (t.id == updated.id) updated else t,
    ];
    notifyListeners();
  }

  void upsertTask(TaskItem updated) => _replaceTask(updated);
}
