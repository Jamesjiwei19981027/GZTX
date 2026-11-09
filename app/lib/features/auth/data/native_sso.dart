import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/errors/app_error.dart';
import '../models/auth_models.dart';
import 'auth_api.dart';

/// PKCE 只存入安全存储，包含有效期与服务地址，支持系统浏览器返回时 APP 冷启动。
class NativeSso {
  NativeSso(this.api,
      {FlutterSecureStorage? storage,
      Future<bool> Function(Uri)? launch,
      DateTime Function()? now})
      : _storage = storage ?? const FlutterSecureStorage(),
        _launch = launch ??
            ((uri) => launchUrl(uri, mode: LaunchMode.externalApplication)),
        _now = now ?? DateTime.now;

  final AuthApi api;
  final FlutterSecureStorage _storage;
  final Future<bool> Function(Uri) _launch;
  final DateTime Function() _now;
  static const storageKey = 'worktodo_pending_sso_pkce';

  static String challengeFor(String verifier) =>
      base64UrlEncode(sha256.convert(ascii.encode(verifier)).bytes)
          .replaceAll('=', '');

  Future<void> begin(int companyId) async {
    final random = Random.secure();
    final verifier =
        base64UrlEncode(List<int>.generate(32, (_) => random.nextInt(256)))
            .replaceAll('=', '');
    await _storage.write(
        key: storageKey,
        value: jsonEncode({
          'verifier': verifier,
          'api_base': api.baseUrl,
          'expires_at':
              _now().add(const Duration(minutes: 10)).millisecondsSinceEpoch,
        }));
    try {
      if (!await _launch(api.dingtalkBrowserUrl(
          companyId: companyId, challenge: challengeFor(verifier)))) {
        throw ApiException('无法打开系统浏览器，请稍后重试');
      }
    } catch (_) {
      await _storage.delete(key: storageKey);
      rethrow;
    }
  }

  Future<AuthSession> complete(String ticket) async {
    if (!RegExp(r'^[A-Za-z0-9_-]{20,256}$').hasMatch(ticket)) {
      throw ApiException('企业登录返回凭据无效，请重新登录');
    }
    final raw = await _storage.read(key: storageKey);
    dynamic pending;
    try {
      pending = raw == null ? null : jsonDecode(raw);
    } catch (_) {
      pending = null;
    }
    if (pending is! Map ||
        pending['api_base'] != api.baseUrl ||
        pending['expires_at'] is! num ||
        (pending['expires_at'] as num).toInt() <=
            _now().millisecondsSinceEpoch ||
        pending['verifier'] is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{43,128}$')
            .hasMatch(pending['verifier'] as String)) {
      await _storage.delete(key: storageKey);
      throw ApiException('企业登录已过期或不是在本机发起，请重新登录');
    }
    final session = await api.completeSso(
        ticket: ticket, verifier: pending['verifier'] as String);
    await _storage.delete(key: storageKey);
    return session;
  }
}
