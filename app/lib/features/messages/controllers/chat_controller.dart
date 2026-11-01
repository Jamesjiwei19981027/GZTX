import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../data/message_file_transfer.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';

enum ChatLoadState { loading, ready, error }

/// 会话（频道 / 私聊）页面状态。
///
/// 轮询规则与网页版 MobileMessageScreens.tsx 对齐：页面在前台时每 6 秒拉一次新消息，
/// 退到后台或页面销毁时停止；不引入推送协议。所有异步结果都带序号校验，
/// 页面重置或参数变化后旧请求的结果不会写回。
class ChatController extends ChangeNotifier {
  ChatController({
    required this.repository,
    required this.scopeType,
    required this.scopeId,
    this.currentUserId,
    this.pollInterval = const Duration(seconds: 6),
    this.uploader,
    this.picker,
  });

  final MessagesRepository repository;

  /// `channel` 或 `direct`
  final String scopeType;
  final int scopeId;
  final int? currentUserId;
  final Duration pollInterval;
  final MessageFileUploader? uploader;
  final MessageFilePicker? picker;

  bool get isChannel => scopeType == 'channel';

  ChatLoadState _state = ChatLoadState.loading;
  ChatLoadState get state => _state;

  List<ChatMessage> _messages = const [];
  List<ChatMessage> get messages => List.unmodifiable(_messages);

  String? _error;
  String? get error => _error;

  bool _forbidden = false;
  bool get isForbidden => _forbidden;

  /// 轮询失败时的轻提示；不清空已有消息
  String? _pollError;
  String? get pollError => _pollError;

  bool _sending = false;
  bool get sending => _sending;

  String? _sendError;
  String? get sendError => _sendError;

  String? _failedText;
  String? get failedText => _failedText;

  bool _uploading = false;
  bool get uploading => _uploading;

  ChatSummary? _summary;
  ChatSummary? get summary => _summary;

  bool _summaryLoading = false;
  bool get summaryLoading => _summaryLoading;

  String? _summaryError;
  String? get summaryError => _summaryError;

  bool _disposed = false;
  bool _polling = false;
  Timer? _pollTimer;
  int _requestSeq = 0;

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    stopPolling();
    super.dispose();
  }

  Future<List<ChatMessage>> _fetchMessages() {
    return isChannel
        ? repository.listChannelMessages(scopeId)
        : repository.listDirectMessages(scopeId);
  }

  Future<void> load({bool silent = false}) async {
    final seq = ++_requestSeq;
    if (!silent) {
      _state = ChatLoadState.loading;
      _error = null;
      _forbidden = false;
      _safeNotify();
    }

    try {
      final items = await _fetchMessages();
      if (_disposed || seq != _requestSeq) return;
      _messages = items;
      _state = ChatLoadState.ready;
      _error = null;
      _forbidden = false;
      _pollError = null;
      _safeNotify();
    } catch (error) {
      if (_disposed || seq != _requestSeq) return;
      final message = friendlyMessage(error);
      final forbidden =
          error is ApiException && (error.statusCode == 403 || error.code == 40300 || error.code == 40301);
      if (silent) {
        // 轮询失败保留已有消息，只给出可见提示，避免把聊天记录清空
        _pollError = message;
      } else {
        _state = ChatLoadState.error;
        _error = message;
        _forbidden = forbidden;
        // 首屏就失败（尤其无权限）时停止轮询，避免对一个打不开的会话持续发请求；
        // 用户点“重试”或页面重新进入时再启动。
        stopPolling();
      }
      _safeNotify();
    }
  }

  /// 前台开始轮询（重复调用安全）
  void startPolling() {
    if (_polling || _disposed) return;
    _polling = true;
    _scheduleNextPoll();
  }

  void stopPolling() {
    _polling = false;
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  void _scheduleNextPoll() {
    _pollTimer?.cancel();
    if (!_polling || _disposed) return;
    _pollTimer = Timer(pollInterval, () async {
      if (!_polling || _disposed) return;
      await load(silent: true);
      _scheduleNextPoll();
    });
  }

  /// 发送文字；失败时保留内容并可重试
  Future<bool> send(String text) async {
    final body = text.trim();
    if (body.isEmpty || _sending) return false;
    _sending = true;
    _sendError = null;
    _safeNotify();
    try {
      final message = isChannel
          ? await repository.postChannelMessage(scopeId, body)
          : await repository.postDirectMessage(scopeId, body);
      if (_disposed) return true;
      _messages = [..._messages, message];
      _failedText = null;
      _state = ChatLoadState.ready;
      return true;
    } catch (error) {
      if (_disposed) return false;
      _sendError = friendlyMessage(error);
      _failedText = body;
      return false;
    } finally {
      _sending = false;
      _safeNotify();
    }
  }

  Future<bool> retryFailedSend() async {
    final text = _failedText;
    if (text == null || text.isEmpty) return false;
    return send(text);
  }

  /// 选择并发送文件；不可用时抛出带中文说明的异常由页面提示
  Future<bool> pickAndSendFile() async {
    final picker = this.picker;
    if (picker == null) {
      throw MessageFilePickerException('当前环境未提供文件选择能力（已提交共享改动申请）。');
    }
    if (_uploading) return false;
    final picked = await picker.pickFile();
    if (picked == null) return false;
    final uploader = this.uploader;
    if (uploader == null) {
      throw MessageFilePickerException('文件上传通道未就绪，请稍后重试。');
    }

    _uploading = true;
    _sendError = null;
    _safeNotify();
    try {
      final fileId = await uploader.upload(
        scopeType: isChannel ? 'channel' : 'conversation',
        scopeId: scopeId,
        file: picked,
      );
      final message = isChannel
          ? await repository.postChannelMessage(scopeId, '', fileIds: [fileId])
          : await repository
              .postDirectMessage(scopeId, '', fileIds: [fileId]);
      if (_disposed) return true;
      _messages = [..._messages, message];
      _state = ChatLoadState.ready;
      return true;
    } catch (error) {
      if (_disposed) return false;
      _sendError = friendlyMessage(error);
      return false;
    } finally {
      _uploading = false;
      _safeNotify();
    }
  }

  /// 频道消息点赞；返回是否成功，失败信息通过 [sendError] 暴露给页面提示
  Future<bool> like(ChatMessage message) async {
    if (!isChannel) return false;
    try {
      final likes = await repository.likeChannelMessage(message.id);
      if (_disposed) return true;
      _messages = _messages
          .map((item) => item.id == message.id ? item.copyWith(likes: likes) : item)
          .toList(growable: false);
      _safeNotify();
      return true;
    } catch (error) {
      if (_disposed) return false;
      _sendError = friendlyMessage(error);
      _safeNotify();
      return false;
    }
  }

  Future<bool> summarize() async {
    if (_summaryLoading) return false;
    _summaryLoading = true;
    _summaryError = null;
    _summary = null;
    _safeNotify();
    try {
      final result = isChannel
          ? await repository.createChannelSummary(scopeId)
          : await repository.createConversationSummary(scopeId);
      if (_disposed) return true;
      _summary = result;
      return true;
    } catch (error) {
      if (_disposed) return false;
      _summaryError = friendlyMessage(error);
      return false;
    } finally {
      _summaryLoading = false;
      _safeNotify();
    }
  }

  void clearSendError() {
    if (_sendError == null) return;
    _sendError = null;
    _safeNotify();
  }

  void dismissFailedSend() {
    if (_failedText == null) return;
    _failedText = null;
    _safeNotify();
  }
}
