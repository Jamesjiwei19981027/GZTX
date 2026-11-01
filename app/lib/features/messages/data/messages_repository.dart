import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/errors/app_error.dart';

import '../models/messages_models.dart';

/// 消息模块接口封装。
///
/// 路径与参数逐条对齐网页版 `frontend/src/api/shell.ts`：
/// 频道与私聊取自 `shell.py`，协作通知取自 `bindings.py`，
/// 外部邮件取自 `external_mail.py`，通话取自 `calls.py`。
/// 令牌、信封解包、超时与 401 续期全部交给底座 `ApiClient`。
class MessagesRepository {
  MessagesRepository(this._api);

  final ApiClient _api;

  ApiClient get api => _api;

  Map<String, dynamic> _map(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.cast<String, dynamic>();
    throw ApiException('接口返回格式异常');
  }

  List<Map<String, dynamic>> _items(dynamic data) {
    final map = _map(data);
    final raw = map['items'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList(growable: false);
  }

  // ---------------- 频道 ----------------

  Future<List<ChatChannel>> listChannels(
    int companyId, {
    int? projectId,
  }) async {
    final data = await _api.get(
      '/companies/$companyId/channels',
      query: projectId == null ? null : {'project_id': '$projectId'},
    );
    return _items(data).map(ChatChannel.fromJson).toList(growable: false);
  }

  Future<List<ChatMessage>> listChannelMessages(
    int channelId, {
    int pageSize = 100,
  }) async {
    final data = await _api.get(
      '/channels/$channelId/messages',
      query: {'page': '1', 'page_size': '$pageSize'},
    );
    return _items(data).map(ChatMessage.fromJson).toList(growable: false);
  }

  Future<ChatMessage> postChannelMessage(
    int channelId,
    String body, {
    List<int> fileIds = const [],
  }) async {
    final data = await _api.post(
      '/channels/$channelId/messages',
      body: {
        'body': body,
        if (fileIds.isNotEmpty) 'file_ids': fileIds,
      },
    );
    return ChatMessage.fromJson(_map(data));
  }

  /// 点赞接口返回 `{id, likes}`，只回传最新计数
  Future<int> likeChannelMessage(int messageId) async {
    final data = await _api.post('/channels/messages/$messageId/like', body: {});
    final map = _map(data);
    final likes = map['likes'];
    return likes is num ? likes.toInt() : 0;
  }

  Future<ChatSummary> createChannelSummary(int channelId) async {
    final data = await _api.post('/channels/$channelId/summaries', body: {});
    return ChatSummary.fromJson(_map(data));
  }

  Future<List<CollabFile>> listChannelFiles(int channelId) async {
    final data = await _api.get('/channels/$channelId/files');
    return _items(data).map(CollabFile.fromJson).toList(growable: false);
  }

  Future<List<PinnedLink>> listPinnedLinks(int channelId) async {
    final data = await _api.get('/channels/$channelId/pinned-links');
    return _items(data).map(PinnedLink.fromJson).toList(growable: false);
  }

  Future<PinnedLink> createPinnedLink(
    int channelId, {
    required String title,
    required String url,
  }) async {
    final data = await _api.post(
      '/channels/$channelId/pinned-links',
      body: {'title': title, 'url': url},
    );
    return PinnedLink.fromJson(_map(data));
  }

  Future<void> deletePinnedLink(int channelId, int linkId) async {
    await _api.delete('/channels/$channelId/pinned-links/$linkId');
  }

  // ---------------- 私聊 ----------------

  Future<List<DirectConversation>> listConversations(int companyId) async {
    final data = await _api.get('/companies/$companyId/conversations');
    return _items(data).map(DirectConversation.fromJson).toList(growable: false);
  }

  Future<List<ChatMessage>> listDirectMessages(
    int conversationId, {
    int pageSize = 100,
  }) async {
    final data = await _api.get(
      '/conversations/$conversationId/messages',
      query: {'page': '1', 'page_size': '$pageSize'},
    );
    return _items(data).map(ChatMessage.fromJson).toList(growable: false);
  }

  Future<ChatMessage> postDirectMessage(
    int conversationId,
    String body, {
    List<int> fileIds = const [],
  }) async {
    final data = await _api.post(
      '/conversations/$conversationId/messages',
      body: {
        'body': body,
        if (fileIds.isNotEmpty) 'file_ids': fileIds,
      },
    );
    return ChatMessage.fromJson(_map(data));
  }

  Future<ChatSummary> createConversationSummary(int conversationId) async {
    final data =
        await _api.post('/conversations/$conversationId/summaries', body: {});
    return ChatSummary.fromJson(_map(data));
  }

  Future<List<CollabFile>> listConversationFiles(int conversationId) async {
    final data = await _api.get('/conversations/$conversationId/files');
    return _items(data).map(CollabFile.fromJson).toList(growable: false);
  }

  // ---------------- 工作联系人 ----------------

  Future<List<WorkContact>> listWorkContacts(
    int companyId, {
    int? projectId,
  }) async {
    final data = await _api.get(
      '/companies/$companyId/contacts',
      query: projectId == null ? null : {'project_id': '$projectId'},
    );
    return _items(data).map(WorkContact.fromJson).toList(growable: false);
  }

  /// 创建（或复用）私聊会话，返回会话编号
  Future<int> createDirectConversation(
    int companyId, {
    required int contactUserId,
    int? projectId,
    String kind = 'direct',
  }) async {
    final data = await _api.post(
      '/companies/$companyId/conversations',
      body: {
        'member_user_ids': [contactUserId],
        'kind': kind,
        if (projectId != null) 'project_id': projectId,
      },
    );
    final map = _map(data);
    final id = map['id'];
    if (id is! num || id <= 0) {
      throw ApiException('创建会话失败：接口未返回会话编号');
    }
    return id.toInt();
  }

  // ---------------- 在线状态 ----------------

  Future<Map<int, PresenceStatus>> listPresence(int companyId) async {
    final data = await _api.get('/companies/$companyId/presence');
    final result = <int, PresenceStatus>{};
    for (final item in _items(data)) {
      final userId = item['user_id'];
      if (userId is num) {
        result[userId.toInt()] = parsePresenceStatus(item['status'] as String?);
      }
    }
    return result;
  }

  // ---------------- 协作通知 ----------------

  Future<List<CollabNotification>> listNotifications({
    String state = 'active',
    int page = 1,
    int pageSize = 20,
  }) async {
    final data = await _api.get(
      '/notifications/collab',
      query: {'page': '$page', 'page_size': '$pageSize', 'state': state},
    );
    return _items(data).map(CollabNotification.fromJson).toList(growable: false);
  }

  Future<void> markNotificationRead(int id) async {
    await _api.put('/notifications/collab/$id/read', body: {});
  }

  Future<int> markAllNotificationsRead() async {
    final data = await _api.put('/notifications/collab/read-all', body: {});
    final map = _map(data);
    final updated = map['updated'];
    return updated is num ? updated.toInt() : 0;
  }

  Future<CollabNotification> updateNotificationState(
    int id, {
    bool? read,
    bool? archived,
  }) async {
    final data = await _api.put(
      '/notifications/collab/$id/state',
      body: {
        if (read != null) 'read': read,
        if (archived != null) 'archived': archived,
      },
    );
    // 接口只回传状态位，调用方用本地记录合并展示
    final map = _map(data);
    return CollabNotification(
      id: id,
      bodyText: '',
      read: map['read'] == true,
      archived: map['archived'] == true,
    );
  }

  Future<void> deleteNotification(int id) async {
    await _api.delete('/notifications/collab/$id');
  }

  Future<CollabNotification> replyNotification(int id, String text) async {
    final data = await _api.post(
      '/notifications/collab/$id/reply',
      body: {'text': text},
    );
    final map = _map(data);
    return CollabNotification(
      id: id,
      bodyText: '',
      read: true,
      replyText: map['reply_text'] as String?,
      repliedAt: parseNullableApiDateTime(map['replied_at'] as String?),
    );
  }

  // ---------------- 外部邮件 ----------------

  Future<ExternalMailStatus> externalMailStatus(int companyId) async {
    final data = await _api.get(
      '/external-mail/status',
      query: {'company_id': '$companyId'},
    );
    return ExternalMailStatus.fromJson(_map(data));
  }

  Future<({int synced, int skipped})> syncExternalMail(int companyId) async {
    final data = await _api.post(
      '/external-mail/sync',
      query: {'company_id': '$companyId'},
      body: {},
    );
    final map = _map(data);
    return (
      synced: (map['synced'] as num?)?.toInt() ?? 0,
      skipped: (map['skipped'] as num?)?.toInt() ?? 0,
    );
  }

  Future<List<ExternalMailItem>> listExternalMail(
    int companyId, {
    String state = 'active',
  }) async {
    final data = await _api.get(
      '/external-mail',
      query: {'company_id': '$companyId', 'state': state},
    );
    return _items(data)
        .map(ExternalMailItem.fromJson)
        .toList(growable: false);
  }

  Future<ExternalMailItem> getExternalMail(int mailId) async {
    final data = await _api.get('/external-mail/$mailId');
    return ExternalMailItem.fromJson(_map(data));
  }

  Future<void> updateExternalMailState(int mailId, String state) async {
    await _api.put('/external-mail/$mailId/state', body: {'state': state});
  }

  // ---------------- 语音通话 ----------------

  Future<CallConfig> getCallConfig(int companyId) async {
    final data = await _api.get(
      '/calls/config',
      query: {'company_id': '$companyId'},
    );
    return CallConfig.fromJson(_map(data));
  }

  Future<CallSession> createCallSession({
    required int conversationId,
    required String callType,
  }) async {
    final data = await _api.post(
      '/calls/sessions',
      body: {'conversation_id': conversationId, 'call_type': callType},
    );
    return CallSession.fromJson(_map(data));
  }

  Future<CallSession> endCallSession(int sessionId) async {
    final data = await _api.post('/calls/sessions/$sessionId/end', body: {});
    return CallSession.fromJson(_map(data));
  }
}

/// 外部邮件详情里的可选时间字段偶尔为空，单独做空值容忍。
DateTime? parseNullableApiDateTime(String? iso) {
  if (iso == null || iso.trim().isEmpty) return null;
  return DateTime.tryParse(iso.trim())?.toLocal();
}

/// 把后端/底座的异常转成可读的中文提示。
///
/// 后端部分接口直接抛 FastAPI `HTTPException(detail="英文原文")`，
/// 这里补齐中文，避免界面出现英文残留。
String friendlyMessage(Object error) {
  if (error is AuthException) {
    return error.message.trim().isEmpty ? '登录已过期，请重新登录' : error.message;
  }
  if (error is NetworkException) {
    return '网络连接异常或请求超时，请检查网络后重试';
  }
  if (error is ValidationException) {
    return error.message.trim().isEmpty ? '提交的内容不符合要求' : error.message;
  }
  if (error is ApiException) {
    final raw = error.message.trim();
    final mapped = _translateBackendMessage(raw);
    if (mapped != null) return mapped;
    if (raw.isEmpty || raw == 'HTTP ${error.statusCode}') {
      return switch (error.statusCode) {
        403 => '没有访问权限',
        404 => '内容不存在或已被删除',
        _ => '请求失败，请稍后重试',
      };
    }
    if (_containsLatinWord(raw)) {
      return switch (error.statusCode) {
        403 => '没有访问权限',
        404 => '内容不存在或已被删除',
        _ => '服务端返回了异常结果，请稍后重试',
      };
    }
    return raw;
  }
  final text = error.toString().replaceFirst('Exception: ', '').trim();
  if (text.isEmpty || _containsLatinWord(text)) return '操作失败，请稍后重试';
  return text;
}

String? _translateBackendMessage(String raw) {
  final lower = raw.toLowerCase();
  if (raw.isEmpty) return null;
  if (lower.contains('not an active company member')) {
    return '您不是该企业的在岗成员，无法访问';
  }
  if (lower.contains('company call feature is not active')) {
    return '当前企业尚未开通通话功能';
  }
  if (lower.contains('company not found')) return '企业不存在';
  if (lower.contains('conversation not found')) return '会话不存在或已被删除';
  if (lower.contains('call session not found')) return '通话记录不存在';
  if (lower.contains('channel not found')) return '频道不存在或已被删除';
  if (lower.contains('not a conversation member')) return '您不是该会话成员，无法查看';
  if (lower.contains('imap credentials are not configured')) {
    return '企业尚未配置 IMAP 外部邮箱，请联系管理员';
  }
  if (lower.contains('external mail not found')) return '外部邮件不存在';
  if (lower.contains('external mail has not been synchronized')) {
    return '这封邮件尚未完成同步，暂时不能修改状态';
  }
  if (lower.contains('file name is required')) return '文件名不能为空';
  if (lower.contains('file is empty')) return '文件内容为空，请重新选择';
  if (lower.contains('unsupported collaboration file type')) {
    return '不支持该文件类型，请选择文档、表格、图片、压缩包或音视频文件';
  }
  if (lower.contains('exceeds 20 mib')) return '文件超过 20 MB，无法发送';
  if (lower.contains('recording is empty')) return '录音内容为空';
  if (lower.contains('recording not found')) return '尚未找到通话录音';
  if (lower.contains('recording too large')) return '录音文件过大';
  if (lower.contains('company call feature')) return '企业通话功能未启用';
  if (lower.contains('project not found')) return '项目不存在';
  return null;
}

bool _containsLatinWord(String text) =>
    RegExp(r'[A-Za-z]{3,}').hasMatch(text);
