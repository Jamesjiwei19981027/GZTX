import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/evidence_models.dart';

/// 材料提交离线草稿存储。
///
/// 键格式沿用网页版 `frontend/src/mobile/features/adaptation/offlineDrafts.ts`：
/// `gzt_draft_v1:{userId}:{projectId}:evidence:{nodeId}`，
/// 按 用户 + 项目 + 表单类型 + 实体 四段隔离，避免跨项目串草稿。
class EvidenceDraftStore {
  EvidenceDraftStore({SharedPreferences? prefs}) : _injected = prefs;

  static const String keyPrefix = 'gzt_draft_v1';

  final SharedPreferences? _injected;
  SharedPreferences? _cached;

  Future<SharedPreferences> get _prefs async =>
      _injected ?? (_cached ??= await SharedPreferences.getInstance());

  static String buildKey({
    required int userId,
    required int projectId,
    required int? nodeId,
  }) =>
      '$keyPrefix:$userId:$projectId:evidence:${nodeId ?? 'new'}';

  Future<EvidenceDraft?> load({
    required int userId,
    required int projectId,
    required int? nodeId,
  }) async {
    final key = buildKey(userId: userId, projectId: projectId, nodeId: nodeId);
    try {
      final prefs = await _prefs;
      final raw = prefs.getString(key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final draft = EvidenceDraft.fromJson(decoded.cast<String, dynamic>());
      return draft.isNotEmpty ? draft : null;
    } catch (error) {
      // 草稿损坏不应阻断页面，但要留下可见日志而不是静默吞掉
      debugPrint('EvidenceDraftStore.load 跳过损坏草稿($key): $error');
      return null;
    }
  }

  Future<void> save({
    required int userId,
    required int projectId,
    required int? nodeId,
    required EvidenceDraft draft,
  }) async {
    final key = buildKey(userId: userId, projectId: projectId, nodeId: nodeId);
    try {
      final prefs = await _prefs;
      await prefs.setString(key, jsonEncode(draft.toJson()));
    } catch (error) {
      debugPrint('EvidenceDraftStore.save 写入失败($key): $error');
      rethrow;
    }
  }

  Future<void> clear({
    required int userId,
    required int projectId,
    required int? nodeId,
  }) async {
    final key = buildKey(userId: userId, projectId: projectId, nodeId: nodeId);
    try {
      final prefs = await _prefs;
      await prefs.remove(key);
    } catch (error) {
      debugPrint('EvidenceDraftStore.clear 清理失败($key): $error');
    }
  }

  /// 退出登录时清理该用户全部草稿（对齐网页版 `clearUserOfflineDrafts`）
  Future<void> clearForUser(int userId) async {
    try {
      final prefs = await _prefs;
      final prefix = '$keyPrefix:$userId:';
      for (final key in prefs.getKeys().toList(growable: false)) {
        if (key.startsWith(prefix)) {
          await prefs.remove(key);
        }
      }
    } catch (error) {
      debugPrint('EvidenceDraftStore.clearForUser 清理失败: $error');
    }
  }
}
