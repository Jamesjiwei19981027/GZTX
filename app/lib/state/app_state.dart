import 'package:flutter/foundation.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/task_service.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class AppState extends ChangeNotifier {
  AppState({ApiClient? api}) : api = api ?? ApiClient() {
    auth = AuthService(this.api);
    tasks = TaskService(this.api);
  }

  final ApiClient api;
  late final AuthService auth;
  late final TaskService tasks;

  AuthStatus status = AuthStatus.unknown;
  AppUser? user;
  List<TaskItem> taskItems = [];
  bool busy = false;
  String? error;

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
      await refreshTasks();
    } catch (_) {
      await api.clearTokens();
      user = null;
      status = AuthStatus.signedOut;
    }
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      user = await auth.login(username: username, password: password);
      status = AuthStatus.signedIn;
      await refreshTasks();
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

  Future<void> logout() async {
    await auth.logout();
    user = null;
    taskItems = [];
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> refreshTasks() async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      taskItems = await tasks.listTasks();
    } on ApiException catch (e) {
      error = e.message;
    } catch (e) {
      error = '加载任务失败：$e';
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> completeTask(int id) async {
    try {
      final updated = await tasks.completeTask(id);
      taskItems = [
        for (final t in taskItems)
          if (t.id == id) updated else t,
      ];
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }

  Future<void> createTask(String title) async {
    try {
      final created = await tasks.createTask(title);
      taskItems = [created, ...taskItems];
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }
}
