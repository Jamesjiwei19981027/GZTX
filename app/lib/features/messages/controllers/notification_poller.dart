import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../../core/auth/auth_state.dart';
import '../data/messages_repository.dart';

/// Counts real active collaboration notifications; direct-message unread counts
/// require a server read cursor and are deliberately not inferred.
class NotificationPoller extends ChangeNotifier with WidgetsBindingObserver {
  NotificationPoller(
    this.auth, {
    MessagesRepository? repository,
    this.interval = const Duration(seconds: 30),
  }) : repository = repository ?? MessagesRepository(auth.api) {
    WidgetsBinding.instance.addObserver(this);
    auth.addListener(_sync);
    _sync();
  }

  final AuthState auth;
  final MessagesRepository repository;
  final Duration interval;
  Timer? _timer;
  int? _userId;
  int? _companyId;
  int _generation = 0;
  bool _disposed = false;
  bool _foreground = true;
  bool _busy = false;
  int count = 0;
  String? error;

  void _sync() {
    final user = auth.isAuthenticated ? auth.currentUser?.id : null;
    final company = auth.currentCompany?.id;
    if (user == _userId && company == _companyId) return;
    _generation++;
    _userId = user;
    _companyId = company;
    _busy = false;
    count = 0;
    error = null;
    _timer?.cancel();
    if (!_disposed) notifyListeners();
    if (user != null && company != null && _foreground) _start();
  }

  void _start() {
    refresh();
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => refresh());
  }

  Future<void> refresh() async {
    if (_disposed ||
        !_foreground ||
        _userId == null ||
        _companyId == null ||
        _busy) {
      return;
    }
    final generation = _generation;
    _busy = true;
    try {
      var unread = 0;
      var page = 1;
      final seen = <int>{};
      while (true) {
        final items =
            await repository.listNotifications(page: page, pageSize: 100);
        if (_disposed || generation != _generation || !_foreground) return;
        final previousCount = seen.length;
        for (final item in items) {
          if (seen.add(item.id) && !item.read) unread++;
        }
        if (items.length < 100) break;
        if (seen.length == previousCount) {
          throw StateError('通知分页未前进');
        }
        page++;
      }
      count = unread;
      error = null;
    } catch (cause) {
      if (_disposed || generation != _generation || !_foreground) return;
      count = 0;
      error = '通知未读数刷新失败：${friendlyMessage(cause)}';
    } finally {
      if (!_disposed && generation == _generation) {
        _busy = false;
        notifyListeners();
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _generation++;
    _busy = false;
    _timer?.cancel();
    if (_foreground && _userId != null && _companyId != null) _start();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    auth.removeListener(_sync);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
