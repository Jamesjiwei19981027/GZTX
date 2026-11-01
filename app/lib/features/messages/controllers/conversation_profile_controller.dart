import 'package:flutter/foundation.dart';

import '../data/messages_repository.dart';
import '../models/messages_models.dart';

/// 会话资料页状态：频道展示钉选链接与共享文件；私聊展示成员与在线状态。
class ConversationProfileController extends ChangeNotifier {
  ConversationProfileController({
    required this.repository,
    required this.scopeType,
    required this.scopeId,
    required this.name,
    required this.companyId,
  });

  final MessagesRepository repository;
  final String scopeType;
  final int scopeId;
  final String name;
  final int companyId;

  bool get isChannel => scopeType == 'channel';

  bool _loading = true;
  bool get loading => _loading;

  String? _error;
  String? get error => _error;

  List<PinnedLink> _links = const [];
  List<PinnedLink> get links => List.unmodifiable(_links);

  List<CollabFile> _files = const [];
  List<CollabFile> get files => List.unmodifiable(_files);

  List<ConversationMember> _members = const [];
  List<ConversationMember> get members => List.unmodifiable(_members);

  Map<int, PresenceStatus> _presence = const {};
  PresenceStatus presenceOf(int userId) =>
      _presence[userId] ?? PresenceStatus.offline;

  bool _savingLink = false;
  bool get savingLink => _savingLink;

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
      final filesFuture = isChannel
          ? repository.listChannelFiles(scopeId)
          : repository.listConversationFiles(scopeId);
      final linksFuture =
          isChannel ? repository.listPinnedLinks(scopeId) : Future.value(<PinnedLink>[]);
      final membersFuture =
          isChannel ? Future.value(<ConversationMember>[]) : _loadMembers();
      final presenceFuture = isChannel
          ? Future.value(<int, PresenceStatus>{})
          : repository.listPresence(companyId);

      final files = await filesFuture;
      final links = await linksFuture;
      final members = await membersFuture;
      final presence = await presenceFuture;
      if (_disposed || seq != _seq) return;
      _files = files;
      _links = links;
      _members = members;
      _presence = presence;
      _loading = false;
      _safeNotify();
    } catch (error) {
      if (_disposed || seq != _seq) return;
      _error = friendlyMessage(error);
      _loading = false;
      _safeNotify();
    }
  }

  /// 私聊没有“按编号取会话”的接口，从会话列表里定位成员（与网页版一致）
  Future<List<ConversationMember>> _loadMembers() async {
    final conversations = await repository.listConversations(companyId);
    for (final conversation in conversations) {
      if (conversation.id == scopeId) return conversation.members;
    }
    return const [];
  }

  Future<bool> addLink({required String title, required String url}) async {
    if (_savingLink) return false;
    _savingLink = true;
    _actionError = null;
    _safeNotify();
    try {
      final link = await repository.createPinnedLink(
        scopeId,
        title: title.trim(),
        url: url.trim(),
      );
      if (_disposed) return true;
      _links = [link, ..._links];
      return true;
    } catch (error) {
      if (_disposed) return false;
      _actionError = friendlyMessage(error);
      return false;
    } finally {
      _savingLink = false;
      _safeNotify();
    }
  }

  Future<bool> deleteLink(PinnedLink link) async {
    try {
      await repository.deletePinnedLink(scopeId, link.id);
      if (_disposed) return true;
      _links = _links.where((item) => item.id != link.id).toList(growable: false);
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

/// 语音通话页状态：ICE 配置 + 通话会话的创建与结束。
///
/// 与网页手机版一致，本页只负责“查询配置、创建会话、结束会话”，
/// 不做实时音频流；真正的双向语音需要 `flutter_webrtc` 与 TURN 配置，
/// 方案见回传报告的“通话方案”一节。
class CallController extends ChangeNotifier {
  CallController({
    required this.repository,
    required this.companyId,
    required this.conversationId,
    required this.callType,
  });

  final MessagesRepository repository;
  final int? companyId;
  final int? conversationId;

  /// `audio` 或 `video`
  final String callType;

  bool _loading = true;
  bool get loading => _loading;

  CallConfig? _config;
  CallConfig? get config => _config;

  String? _configError;
  String? get configError => _configError;

  CallSession? _session;
  CallSession? get session => _session;

  bool _creating = false;
  bool get creating => _creating;

  String? _sessionError;
  String? get sessionError => _sessionError;

  bool _ending = false;
  bool get ending => _ending;

  String? _endError;
  String? get endError => _endError;

  bool get configured => _config?.configured ?? false;

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    _loading = true;
    _configError = null;
    _safeNotify();

    if (companyId == null) {
      _config = null;
      _configError = '未加入企业工作区，无法查询通话信令网关';
      _loading = false;
      _safeNotify();
      return;
    }

    try {
      final config = await repository.getCallConfig(companyId!);
      if (_disposed) return;
      _config = config;
    } catch (error) {
      if (_disposed) return;
      _config = null;
      _configError = friendlyMessage(error);
    }
    _loading = false;
    _safeNotify();

    // 未配置信令/穿透服务时不创建会话：那通电话本来就无法建立，
    // 建一条“通话记录”只会误导用户（与网页版偏差点见回传报告）。
    if (_config?.configured == true) {
      await _createSession();
    }
  }

  Future<void> _createSession() async {
    final conversation = conversationId;
    if (conversation == null || conversation <= 0) return;
    _creating = true;
    _sessionError = null;
    _safeNotify();
    try {
      final session = await repository.createCallSession(
        conversationId: conversation,
        callType: callType == 'video' ? 'video' : 'audio',
      );
      if (_disposed) return;
      _session = session;
    } catch (error) {
      if (_disposed) return;
      _sessionError = friendlyMessage(error);
    } finally {
      _creating = false;
      _safeNotify();
    }
  }

  /// 结束通话；失败返回 false，由页面提示但仍允许退出
  Future<bool> end() async {
    final current = _session;
    if (current == null || current.ended) return true;
    if (_ending) return false;
    _ending = true;
    _endError = null;
    _safeNotify();
    try {
      final ended = await repository.endCallSession(current.id);
      if (_disposed) return true;
      _session = ended;
      return true;
    } catch (error) {
      if (_disposed) return false;
      _endError = friendlyMessage(error);
      return false;
    } finally {
      _ending = false;
      _safeNotify();
    }
  }
}
