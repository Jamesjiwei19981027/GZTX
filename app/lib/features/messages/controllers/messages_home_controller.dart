import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';

class _Loaded<T> {
  const _Loaded({this.items = const [], this.error, this.forbidden = false});

  final List<T> items;
  final String? error;
  final bool forbidden;

  bool get failed => error != null;
}

/// 消息首页（频道 / 私聊列表）状态。
///
/// 频道与私聊分别捕获错误：项目频道无权限时，私聊列表仍然可用，
/// 页面上给出后端返回的无权限说明（与网页版“次级人员进不了频道”一致）。
class MessagesHomeController extends ChangeNotifier {
  MessagesHomeController({
    required this.repository,
    required this.companyId,
    this.projectId,
  });

  final MessagesRepository repository;
  final int companyId;
  final int? projectId;

  bool _loading = true;
  bool get loading => _loading;

  List<ChatChannel> _channels = const [];
  List<ChatChannel> get channels => List.unmodifiable(_channels);

  List<DirectConversation> _conversations = const [];
  List<DirectConversation> get conversations => List.unmodifiable(_conversations);

  String? _channelError;
  String? get channelError => _channelError;

  bool _channelForbidden = false;
  bool get channelForbidden => _channelForbidden;

  String? _conversationError;
  String? get conversationError => _conversationError;

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

  Future<_Loaded<ChatChannel>> _loadChannels() async {
    try {
      final items = await repository.listChannels(companyId, projectId: projectId);
      return _Loaded(items: items);
    } catch (error) {
      return _Loaded(
        error: friendlyMessage(error),
        forbidden: error is ApiException &&
            (error.statusCode == 403 ||
                error.code == 40300 ||
                error.code == 40301),
      );
    }
  }

  Future<_Loaded<DirectConversation>> _loadConversations() async {
    try {
      final items = await repository.listConversations(companyId);
      return _Loaded(items: items);
    } catch (error) {
      return _Loaded(error: friendlyMessage(error));
    }
  }

  Future<void> load() async {
    final seq = ++_seq;
    _loading = true;
    _safeNotify();

    final channelsFuture = _loadChannels();
    final conversationsFuture = _loadConversations();
    final channels = await channelsFuture;
    final conversations = await conversationsFuture;
    if (_disposed || seq != _seq) return;

    _channels = channels.items;
    _channelError = channels.error;
    _channelForbidden = channels.forbidden;
    _conversations = conversations.items;
    _conversationError = conversations.error;
    _loading = false;
    _safeNotify();
  }
}

/// 工作联系人页状态
class WorkContactsController extends ChangeNotifier {
  WorkContactsController({
    required this.repository,
    required this.companyId,
    this.projectId,
  });

  final MessagesRepository repository;
  final int companyId;
  final int? projectId;

  bool _loading = true;
  bool get loading => _loading;

  List<WorkContact> _contacts = const [];
  List<WorkContact> get contacts => List.unmodifiable(_contacts);

  String _query = '';
  String get query => _query;

  String? _error;
  String? get error => _error;

  bool _creating = false;
  bool get creating => _creating;

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

  /// 与网页版一致：按姓名包含关键字本地过滤
  List<WorkContact> get filtered {
    final keyword = _query.trim();
    if (keyword.isEmpty) return contacts;
    return contacts.where((c) => c.name.contains(keyword)).toList(growable: false);
  }

  void setQuery(String value) {
    if (value == _query) return;
    _query = value;
    _safeNotify();
  }

  Future<void> load() async {
    final seq = ++_seq;
    _loading = true;
    _error = null;
    _safeNotify();
    try {
      final items =
          await repository.listWorkContacts(companyId, projectId: projectId);
      if (_disposed || seq != _seq) return;
      _contacts = items;
      _loading = false;
      _safeNotify();
    } catch (error) {
      if (_disposed || seq != _seq) return;
      _error = friendlyMessage(error);
      _loading = false;
      _safeNotify();
    }
  }

  /// 发起私聊；成功返回会话编号，失败返回 null 并把原因写进 [actionError]
  Future<int?> startChat(WorkContact contact) async {
    if (_creating) return null;
    _creating = true;
    _actionError = null;
    _safeNotify();
    try {
      final id = await repository.createDirectConversation(
        companyId,
        contactUserId: contact.id,
        projectId: projectId,
      );
      return id;
    } catch (error) {
      _actionError = friendlyMessage(error);
      return null;
    } finally {
      _creating = false;
      _safeNotify();
    }
  }

  void clearActionError() {
    if (_actionError == null) return;
    _actionError = null;
    _safeNotify();
  }
}
