import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 汇报本地草稿。
///
/// 键与网页版 `reportCapabilities.ts` 完全一致：
/// `wt_ai_report_draft_{userId}_{projectId}`，按用户 + 项目严格隔离，
/// 断网时仍保留在本地，切项目不会串草稿。
class ReportDraft {
  const ReportDraft({
    required this.summary,
    this.draftReportId,
    required this.updatedAt,
    required this.projectId,
    required this.userId,
  });

  final String summary;
  final int? draftReportId;
  final String updatedAt;
  final int projectId;
  final int userId;

  bool get isEmpty => summary.trim().isEmpty;

  factory ReportDraft.fromJson(Map<String, dynamic> json) {
    return ReportDraft(
      summary: (json['summary'] as String?) ?? '',
      draftReportId: (json['draftReportId'] as num?)?.toInt(),
      updatedAt: (json['updatedAt'] as String?) ?? '',
      projectId: (json['projectId'] as num?)?.toInt() ?? 0,
      userId: (json['userId'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'summary': summary,
        'draftReportId': draftReportId,
        'updatedAt': updatedAt,
        'projectId': projectId,
        'userId': userId,
      };
}

class ReportDraftStore {
  ReportDraftStore({SharedPreferences? prefs}) : _injected = prefs;

  final SharedPreferences? _injected;
  SharedPreferences? _cached;

  static String buildKey({required int userId, required int projectId}) =>
      'wt_ai_report_draft_${userId}_$projectId';

  Future<SharedPreferences> get _prefs async =>
      _injected ?? (_cached ??= await SharedPreferences.getInstance());

  Future<ReportDraft?> load({
    required int userId,
    required int projectId,
  }) async {
    final key = buildKey(userId: userId, projectId: projectId);
    try {
      final prefs = await _prefs;
      final raw = prefs.getString(key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final draft = ReportDraft.fromJson(decoded.cast<String, dynamic>());
      // 校验归属，防止旧版本或人为篡改导致跨项目串草稿
      if (draft.userId != userId || draft.projectId != projectId) {
        debugPrint('ReportDraftStore.load 归属不匹配，忽略草稿：$key');
        return null;
      }
      return draft.isEmpty ? null : draft;
    } catch (error) {
      debugPrint('ReportDraftStore.load 读取草稿失败($key): $error');
      return null;
    }
  }

  /// 写入草稿；内容为空时删除草稿，避免已清空的旧内容再次出现。
  Future<bool> save({
    required int userId,
    required int projectId,
    required String summary,
    int? draftReportId,
  }) async {
    final key = buildKey(userId: userId, projectId: projectId);
    try {
      final prefs = await _prefs;
      final trimmed = summary.trim();
      if (trimmed.isEmpty) {
        await prefs.remove(key);
        return true;
      }
      final draft = ReportDraft(
        summary: trimmed,
        draftReportId: draftReportId,
        updatedAt: DateTime.now().toUtc().toIso8601String(),
        projectId: projectId,
        userId: userId,
      );
      await prefs.setString(key, jsonEncode(draft.toJson()));
      return true;
    } catch (error) {
      debugPrint('ReportDraftStore.save 写入草稿失败($key): $error');
      return false;
    }
  }

  Future<void> clear({required int userId, required int projectId}) async {
    final key = buildKey(userId: userId, projectId: projectId);
    try {
      final prefs = await _prefs;
      await prefs.remove(key);
    } catch (error) {
      debugPrint('ReportDraftStore.clear 清理草稿失败($key): $error');
    }
  }

  /// 退出登录时清理该用户全部汇报草稿（与网页版 `clearUserOfflineDrafts` 思路一致）
  Future<void> clearForUser(int userId) async {
    try {
      final prefs = await _prefs;
      final prefix = 'wt_ai_report_draft_${userId}_';
      for (final key in prefs.getKeys().toList(growable: false)) {
        if (key.startsWith(prefix)) {
          await prefs.remove(key);
        }
      }
    } catch (error) {
      debugPrint('ReportDraftStore.clearForUser 清理草稿失败: $error');
    }
  }
}
