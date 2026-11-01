/// T08 消息模块数据模型。
///
/// 字段逐项对照后端真实返回，不臆造：
/// - 频道 / 私聊：`backend/app/api/v1/shell.py`
/// - 协作通知：`backend/app/api/v1/bindings.py`
/// - 外部邮件：`backend/app/api/v1/external_mail.py`
/// - 语音通话：`backend/app/api/v1/calls.py`
library;

import '../../../core/time/time_utils.dart';

int _asInt(dynamic value, [int fallback = 0]) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

int? _asNullableInt(dynamic value) {
  if (value == null) return null;
  return _asInt(value);
}

String _asString(dynamic value, [String fallback = '']) {
  if (value == null) return fallback;
  return value.toString();
}

bool _asBool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  return fallback;
}

List<String> _asStringList(dynamic value) {
  if (value is List) {
    return value
        .map((item) => _asString(item))
        .where((e) => e.isNotEmpty)
        .toList();
  }
  return const [];
}

/// 频道
class ChatChannel {
  const ChatChannel({
    required this.id,
    required this.key,
    required this.name,
    this.projectId,
  });

  final int id;
  final String key;
  final String name;
  final int? projectId;

  factory ChatChannel.fromJson(Map<String, dynamic> json) => ChatChannel(
        id: _asInt(json['id']),
        key: _asString(json['key']),
        name: _asString(json['name'], '未命名频道'),
        projectId: _asNullableInt(json['project_id']),
      );
}

/// 私聊成员
class ConversationMember {
  const ConversationMember({
    required this.userId,
    required this.name,
    this.avatar = '',
  });

  final int userId;
  final String name;
  final String avatar;

  factory ConversationMember.fromJson(Map<String, dynamic> json) =>
      ConversationMember(
        userId: _asInt(json['user_id']),
        name: _asString(json['name'], '成员'),
        avatar: _asString(json['avatar']),
      );
}

/// 私聊 / 讨论组
class DirectConversation {
  const DirectConversation({
    required this.id,
    required this.kind,
    this.title,
    this.projectId,
    this.members = const [],
    this.lastMessageBody,
    this.lastMessageAt,
  });

  final int id;
  final String kind;
  final String? title;
  final int? projectId;
  final List<ConversationMember> members;
  final String? lastMessageBody;
  final DateTime? lastMessageAt;

  /// 与网页版 MobileMessageScreens.tsx 一致：标题优先取会话标题，其次成员名，最后会话编号
  String get displayTitle {
    final explicit = title?.trim() ?? '';
    if (explicit.isNotEmpty) return explicit;
    final names = members.map((m) => m.name).where((n) => n.trim().isNotEmpty);
    if (names.isNotEmpty) return names.join('、');
    return '会话 #$id';
  }

  factory DirectConversation.fromJson(Map<String, dynamic> json) {
    final rawMembers = json['members'];
    final members = <ConversationMember>[];
    if (rawMembers is List) {
      for (final item in rawMembers) {
        if (item is Map) {
          members
              .add(ConversationMember.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    final last = json['last_message'];
    return DirectConversation(
      id: _asInt(json['id']),
      kind: _asString(json['kind'], 'direct'),
      title: (json['title'] as String?)?.trim(),
      projectId: _asNullableInt(json['project_id']),
      members: members,
      lastMessageBody: last is Map ? (last['body'] as String?) : null,
      lastMessageAt:
          last is Map ? parseApiDateTime(last['created_at'] as String?) : null,
    );
  }
}

/// 消息附件（后端把上传后的文件元数据写进 attachments_json）
class ChatAttachment {
  const ChatAttachment({
    this.fileId,
    required this.name,
    this.sizeBytes = 0,
    this.downloadUrl,
    this.mimeType,
  });

  final int? fileId;
  final String name;
  final int sizeBytes;
  final String? downloadUrl;
  final String? mimeType;

  String get sizeLabel {
    if (sizeBytes <= 0) return '';
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(sizeBytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  static ChatAttachment? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final json = raw.cast<String, dynamic>();
    final name = _asString(
      json['original_name'] ?? json['name'] ?? json['file_name'],
    ).trim();
    if (name.isEmpty) return null;
    return ChatAttachment(
      fileId: _asNullableInt(json['file_id'] ?? json['id']),
      name: name,
      sizeBytes: _asInt(json['size_bytes'] ?? json['file_size']),
      downloadUrl: (json['download_url'] ?? json['url']) as String?,
      mimeType: json['mime_type'] as String?,
    );
  }

  factory ChatAttachment.fromJson(Map<String, dynamic> json) =>
      ChatAttachment.tryParse(json)!;
}

/// 频道 / 私聊消息
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.userId,
    required this.senderName,
    required this.body,
    this.channelId,
    this.conversationId,
    this.senderAvatar,
    this.likes = 0,
    this.attachments = const [],
    this.createdAt,
  });

  final int id;
  final int? channelId;
  final int? conversationId;
  final int userId;
  final String senderName;
  final String? senderAvatar;
  final String body;
  final int likes;
  final List<ChatAttachment> attachments;
  final DateTime? createdAt;

  bool isMine(int? currentUserId) =>
      currentUserId != null && userId == currentUserId;

  ChatMessage copyWith({int? likes}) => ChatMessage(
        id: id,
        channelId: channelId,
        conversationId: conversationId,
        userId: userId,
        senderName: senderName,
        senderAvatar: senderAvatar,
        body: body,
        likes: likes ?? this.likes,
        attachments: attachments,
        createdAt: createdAt,
      );

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final items = <ChatAttachment>[];
    final raw = json['attachments'];
    if (raw is List) {
      for (final item in raw) {
        final parsed = ChatAttachment.tryParse(item);
        if (parsed != null) items.add(parsed);
      }
    }
    return ChatMessage(
      id: _asInt(json['id']),
      channelId: _asNullableInt(json['channel_id']),
      conversationId: _asNullableInt(json['conversation_id']),
      userId: _asInt(json['user_id']),
      senderName: _asString(json['sender_name'], '协同成员'),
      senderAvatar: json['sender_avatar'] as String?,
      body: _asString(json['body']),
      likes: _asInt(json['likes']),
      attachments: items,
      createdAt: parseApiDateTime(json['created_at'] as String?),
    );
  }
}

/// AI 聊天总结
class ChatSummary {
  const ChatSummary({
    required this.id,
    required this.sourceCount,
    required this.summaryText,
    required this.provider,
    this.keyPoints = const [],
    this.decisions = const [],
    this.actionItems = const [],
    this.risks = const [],
    this.createdAt,
  });

  final int id;
  final int sourceCount;
  final String summaryText;
  final String provider;
  final List<String> keyPoints;
  final List<String> decisions;
  final List<String> actionItems;
  final List<String> risks;
  final DateTime? createdAt;

  /// 与网页版一致：`deterministic` 展示为“事实规则摘要”
  String get providerLabel => provider == 'deterministic'
      ? '事实规则摘要'
      : (provider.isEmpty ? '未知来源' : provider);

  factory ChatSummary.fromJson(Map<String, dynamic> json) => ChatSummary(
        id: _asInt(json['id']),
        sourceCount: _asInt(json['source_count']),
        summaryText: _asString(json['summary_text']),
        provider: _asString(json['provider']),
        keyPoints: _asStringList(json['key_points']),
        decisions: _asStringList(json['decisions']),
        actionItems: _asStringList(json['action_items']),
        risks: _asStringList(json['risks']),
        createdAt: parseApiDateTime(json['created_at'] as String?),
      );
}

/// 工作联系人
class WorkContact {
  const WorkContact({
    required this.id,
    required this.name,
    this.avatar = '',
  });

  final int id;
  final String name;
  final String avatar;

  factory WorkContact.fromJson(Map<String, dynamic> json) => WorkContact(
        id: _asInt(json['id']),
        name: _asString(json['name'], '联系人'),
        avatar: _asString(json['avatar']),
      );
}

/// 频道钉选链接
class PinnedLink {
  const PinnedLink({required this.id, required this.title, required this.url});

  final int id;
  final String title;
  final String url;

  factory PinnedLink.fromJson(Map<String, dynamic> json) => PinnedLink(
        id: _asInt(json['id']),
        title: _asString(json['title'], '未命名链接'),
        url: _asString(json['url']),
      );
}

/// 会话共享文件
class CollabFile {
  const CollabFile({
    required this.id,
    required this.originalName,
    this.sizeBytes = 0,
    this.downloadUrl,
    this.createdAt,
  });

  final int id;
  final String originalName;
  final int sizeBytes;
  final String? downloadUrl;
  final DateTime? createdAt;

  String get sizeLabel => ChatAttachment(
        name: originalName,
        sizeBytes: sizeBytes,
      ).sizeLabel;

  factory CollabFile.fromJson(Map<String, dynamic> json) => CollabFile(
        id: _asInt(json['id'] ?? json['file_id']),
        originalName: _asString(
          json['original_name'] ?? json['name'],
          '未命名文件',
        ),
        sizeBytes: _asInt(json['size_bytes'] ?? json['file_size']),
        downloadUrl: (json['download_url'] ?? json['url']) as String?,
        createdAt: parseApiDateTime(json['created_at'] as String?),
      );
}

/// 协作通知
class CollabNotification {
  const CollabNotification({
    required this.id,
    required this.bodyText,
    required this.read,
    this.templateKey = '',
    this.senderName,
    this.requiresReply = false,
    this.replyText,
    this.repliedAt,
    this.archived = false,
    this.createdAt,
  });

  final int id;
  final String templateKey;
  final String bodyText;
  final bool read;
  final String? senderName;
  final bool requiresReply;
  final String? replyText;
  final DateTime? repliedAt;
  final bool archived;
  final DateTime? createdAt;

  bool get hasReply => (replyText ?? '').trim().isNotEmpty;

  CollabNotification copyWith({
    bool? read,
    bool? archived,
    String? replyText,
    DateTime? repliedAt,
  }) =>
      CollabNotification(
        id: id,
        templateKey: templateKey,
        bodyText: bodyText,
        read: read ?? this.read,
        senderName: senderName,
        requiresReply: requiresReply,
        replyText: replyText ?? this.replyText,
        repliedAt: repliedAt ?? this.repliedAt,
        archived: archived ?? this.archived,
        createdAt: createdAt,
      );

  factory CollabNotification.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'];
    return CollabNotification(
      id: _asInt(json['id']),
      templateKey: _asString(json['template_key']),
      bodyText: _asString(json['body_text']),
      read: _asBool(json['read']),
      senderName: sender is Map ? (sender['name'] as String?) : null,
      requiresReply: _asBool(json['requires_reply']),
      replyText: json['reply_text'] as String?,
      repliedAt: parseApiDateTime(json['replied_at'] as String?),
      archived: _asBool(json['archived']),
      createdAt: parseApiDateTime(json['created_at'] as String?),
    );
  }
}

/// 外部邮箱同步状态
class ExternalMailStatus {
  const ExternalMailStatus({
    required this.provider,
    required this.configured,
    this.host,
    this.username,
    this.reason,
  });

  final String provider;
  final bool configured;
  final String? host;
  final String? username;
  final String? reason;

  factory ExternalMailStatus.fromJson(Map<String, dynamic> json) =>
      ExternalMailStatus(
        provider: _asString(json['provider'], 'imap'),
        configured: _asBool(json['configured']),
        host: json['host'] as String?,
        username: json['username'] as String?,
        reason: json['reason'] as String?,
      );
}

/// 外部邮件
class ExternalMailItem {
  const ExternalMailItem({
    required this.id,
    required this.fromAddress,
    required this.state,
    this.subject,
    this.bodyText,
    this.receivedAt,
    this.createdAt,
  });

  final int id;
  final String fromAddress;
  final String state;
  final String? subject;
  final String? bodyText;
  final DateTime? receivedAt;
  final DateTime? createdAt;

  String get subjectLabel =>
      (subject ?? '').trim().isEmpty ? '（无主题）' : subject!.trim();

  factory ExternalMailItem.fromJson(Map<String, dynamic> json) =>
      ExternalMailItem(
        id: _asInt(json['id']),
        fromAddress: _asString(json['from_address'], '未知发件人'),
        state: _asString(json['state'], 'active'),
        subject: json['subject'] as String?,
        bodyText: json['body_text'] as String?,
        receivedAt: parseApiDateTime(json['received_at'] as String?),
        createdAt: parseApiDateTime(json['created_at'] as String?),
      );
}

/// 语音通话 ICE 配置
class CallConfig {
  const CallConfig({
    required this.configured,
    this.iceServers = const [],
    this.message = '',
  });

  final bool configured;
  final List<Map<String, dynamic>> iceServers;
  final String message;

  int get iceServerCount => iceServers.length;

  factory CallConfig.fromJson(Map<String, dynamic> json) {
    final servers = <Map<String, dynamic>>[];
    final raw = json['ice_servers'];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) servers.add(item.cast<String, dynamic>());
      }
    }
    return CallConfig(
      configured: _asBool(json['configured']),
      iceServers: servers,
      message: _asString(json['message']),
    );
  }
}

/// 通话会话
class CallSession {
  const CallSession({
    required this.id,
    required this.conversationId,
    required this.callType,
    required this.status,
    this.participants = const [],
    this.startedAt,
    this.endedAt,
  });

  final int id;
  final int conversationId;
  final String callType;
  final String status;
  final List<int> participants;
  final DateTime? startedAt;
  final DateTime? endedAt;

  bool get ended => status == 'ended';

  factory CallSession.fromJson(Map<String, dynamic> json) {
    final participants = <int>[];
    final raw = json['participants'];
    if (raw is List) {
      for (final item in raw) {
        participants.add(_asInt(item));
      }
    }
    return CallSession(
      id: _asInt(json['id']),
      conversationId: _asInt(json['conversation_id']),
      callType: _asString(json['call_type'], 'audio'),
      status: _asString(json['status'], 'active'),
      participants: participants,
      startedAt: parseApiDateTime(json['started_at'] as String?),
      endedAt: parseApiDateTime(json['ended_at'] as String?),
    );
  }
}

/// 在线状态
enum PresenceStatus { online, busy, offline }

PresenceStatus parsePresenceStatus(String? raw) {
  switch (raw) {
    case 'online':
      return PresenceStatus.online;
    case 'busy':
      return PresenceStatus.busy;
    default:
      return PresenceStatus.offline;
  }
}

extension PresenceStatusLabel on PresenceStatus {
  String get label {
    switch (this) {
      case PresenceStatus.online:
        return '在线';
      case PresenceStatus.busy:
        return '忙碌';
      case PresenceStatus.offline:
        return '离线';
    }
  }
}
