import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';

/// 通知筛选（与网页版 InboxView 的 active / archived / all 对齐）
enum NotificationFilter { active, archived, all }

extension NotificationFilterApi on NotificationFilter {
  String get apiValue {
    switch (this) {
      case NotificationFilter.active:
        return 'active';
      case NotificationFilter.archived:
        return 'archived';
      case NotificationFilter.all:
        return 'all';
    }
  }

  String get label {
    switch (this) {
      case NotificationFilter.active:
        return '未归档';
      case NotificationFilter.archived:
        return '已归档';
      case NotificationFilter.all:
        return '全部通知';
    }
  }
}

/// 协作通知收件箱状态
class InboxController extends ChangeNotifier {
  InboxController({required this.repository});

  final MessagesRepository repository;

  NotificationFilter _filter = NotificationFilter.active;
  NotificationFilter get filter => _filter;

  List<CollabNotification> _items = const [];
  List<CollabNotification> get items => List.unmodifiable(_items);

  bool _loading = true;
  bool get loading => _loading;

  String? _error;
  String? get error => _error;

  bool _forbidden = false;
  bool get forbidden => _forbidden;

  bool _markingAll = false;
  bool get markingAll => _markingAll;

  bool _busy = false;
  bool get busy => _busy;

  String? _actionError;
  String? get actionError => _actionError;

  int _unreadCount = 0;
  int get unreadCount => _unreadCount;

  bool _disposed = false;
  int _seq = 0;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  void _recountUnread() {
    _unreadCount = _items.where((item) => !item.read).length;
  }

  Future<void> setFilter(NotificationFilter filter) async {
    if (filter == _filter) return;
    _filter = filter;
    _items = const [];
    _safeNotify();
    await load();
  }

  Future<void> load() async {
    final seq = ++_seq;
    _loading = true;
    _error = null;
    _forbidden = false;
    _safeNotify();
    try {
      final items = await repository.listNotifications(state: _filter.apiValue);
      if (_disposed || seq != _seq) return;
      _items = items;
      _recountUnread();
      _loading = false;
      _safeNotify();
    } catch (error) {
      if (_disposed || seq != _seq) return;
      _error = friendlyMessage(error);
      _forbidden = error is ApiException &&
          (error.statusCode == 403 || error.code == 40300 || error.code == 40301);
      _loading = false;
      _safeNotify();
    }
  }

  /// 标记单条已读（打开详情时调用，失败不阻断阅读）
  Future<void> markRead(int id) async {
    final index = _items.indexWhere((item) => item.id == id);
    if (index < 0 || _items[index].read) return;
    try {
      await repository.markNotificationRead(id);
      if (_disposed) return;
      _items = [
        for (final item in _items)
          item.id == id ? item.copyWith(read: true) : item,
      ];
      _recountUnread();
      _safeNotify();
    } catch (error) {
      if (_disposed) return;
      _actionError = friendlyMessage(error);
      _safeNotify();
    }
  }

  /// 全部标为已读；返回后端确认更新的条数，失败返回 null
  Future<int?> markAllRead() async {
    if (_markingAll) return null;
    _markingAll = true;
    _actionError = null;
    _safeNotify();
    try {
      final updated = await repository.markAllNotificationsRead();
      if (_disposed) return updated;
      _items = _items.map((item) => item.copyWith(read: true)).toList(growable: false);
      _recountUnread();
      return updated;
    } catch (error) {
      if (_disposed) return null;
      _actionError = friendlyMessage(error);
      return null;
    } finally {
      _markingAll = false;
      _safeNotify();
    }
  }

  Future<bool> archive(CollabNotification item) async {
    if (_busy) return false;
    _busy = true;
    _actionError = null;
    _safeNotify();
    try {
      await repository.updateNotificationState(item.id, archived: !item.archived);
      if (_disposed) return true;
      if (_filter == NotificationFilter.all) {
        _items = [
          for (final current in _items)
            current.id == item.id
                ? current.copyWith(archived: !item.archived, read: true)
                : current,
        ];
      } else {
        _items = _items.where((current) => current.id != item.id).toList(growable: false);
      }
      _recountUnread();
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      return false;
    } finally {
      _busy = false;
      _safeNotify();
    }
  }

  Future<bool> remove(CollabNotification item) async {
    if (_busy) return false;
    _busy = true;
    _actionError = null;
    _safeNotify();
    try {
      await repository.deleteNotification(item.id);
      if (_disposed) return true;
      _items = _items.where((current) => current.id != item.id).toList(growable: false);
      _recountUnread();
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      return false;
    } finally {
      _busy = false;
      _safeNotify();
    }
  }

  /// 回复通知；成功返回 true，失败原因写入 [actionError]
  Future<bool> reply(CollabNotification item, String text) async {
    final body = text.trim();
    if (body.isEmpty || _busy) return false;
    _busy = true;
    _actionError = null;
    _safeNotify();
    try {
      final updated = await repository.replyNotification(item.id, body);
      if (_disposed) return true;
      _items = [
        for (final current in _items)
          current.id == item.id
              ? current.copyWith(
                  read: true,
                  replyText: updated.replyText,
                  repliedAt: updated.repliedAt,
                )
              : current,
      ];
      _recountUnread();
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      return false;
    } finally {
      _busy = false;
      _safeNotify();
    }
  }

  void clearActionError() {
    if (_actionError == null) return;
    _actionError = null;
    _safeNotify();
  }
}

/// 外部邮件状态
class ExternalMailController extends ChangeNotifier {
  ExternalMailController({required this.repository, required this.companyId});

  final MessagesRepository repository;
  final int companyId;

  ExternalMailStatus? _status;
  ExternalMailStatus? get status => _status;

  List<ExternalMailItem> _items = const [];
  List<ExternalMailItem> get items => List.unmodifiable(_items);

  bool _loading = true;
  bool get loading => _loading;

  String? _error;
  String? get error => _error;

  bool _syncing = false;
  bool get syncing => _syncing;

  String? _notice;
  String? get notice => _notice;

  String? _actionError;
  String? get actionError => _actionError;

  bool _disposed = false;
  int _seq = 0;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    final seq = ++_seq;
    _loading = true;
    _error = null;
    _safeNotify();
    try {
      final status = await repository.externalMailStatus(companyId);
      if (_disposed || seq != _seq) return;
      _status = status;
      if (status.configured) {
        final list = await repository.listExternalMail(companyId);
        if (_disposed || seq != _seq) return;
        _items = list;
      } else {
        _items = const [];
      }
      _loading = false;
      _safeNotify();
    } catch (error) {
      if (_disposed || seq != _seq) return;
      _error = friendlyMessage(error);
      _loading = false;
      _safeNotify();
    }
  }

  /// 立即拉取；结果写进 [notice]，失败写进 [actionError]
  Future<bool> sync() async {
    if (_syncing) return false;
    _syncing = true;
    _notice = null;
    _actionError = null;
    _safeNotify();
    try {
      final result = await repository.syncExternalMail(companyId);
      final list = await repository.listExternalMail(companyId);
      if (_disposed) return true;
      _items = list;
      _notice = '同步完成：新抓取 ${result.synced} 封，跳过 ${result.skipped} 封';
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      return false;
    } finally {
      _syncing = false;
      _safeNotify();
    }
  }

  Future<ExternalMailItem> openDetail(ExternalMailItem item) async {
    if ((item.bodyText ?? '').isNotEmpty) return item;
    return repository.getExternalMail(item.id);
  }

  Future<bool> archive(ExternalMailItem item) async {
    try {
      await repository.updateExternalMailState(item.id, 'archived');
      if (_disposed) return true;
      _items = _items.where((current) => current.id != item.id).toList(growable: false);
      _safeNotify();
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      _safeNotify();
      return false;
    }
  }

  void clearActionError() {
    if (_actionError == null) return;
    _actionError = null;
    _safeNotify();
  }
}
