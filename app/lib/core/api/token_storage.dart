import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 令牌存储抽象接口
abstract class TokenStorage {
  String? get accessToken;
  String? get refreshToken;
  bool get hasAccess => accessToken != null && accessToken!.isNotEmpty;

  Future<void> init();
  Future<void> save({required String access, String? refresh});
  Future<void> clear();
}

/// 基于 FlutterSecureStorage 的持久化安全存储，带内存高速缓存
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? secureStorage})
      : _storage = secureStorage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'worktodo_access_token';
  static const _refreshKey = 'worktodo_refresh_token';

  String? _accessToken;
  String? _refreshToken;

  @override
  String? get accessToken => _accessToken;

  @override
  String? get refreshToken => _refreshToken;

  @override
  bool get hasAccess => _accessToken != null && _accessToken!.isNotEmpty;

  @override
  Future<void> init() async {
    try {
      _accessToken = await _storage.read(key: _accessKey);
      _refreshToken = await _storage.read(key: _refreshKey);
    } catch (e) {
      debugPrint('SecureTokenStorage.init warning: $e');
      // 在不支持 secure_storage 的测试环境或特定平台上安全降级
      _accessToken = null;
      _refreshToken = null;
    }
  }

  @override
  Future<void> save({required String access, String? refresh}) async {
    _accessToken = access;
    try {
      await _storage.write(key: _accessKey, value: access);
    } catch (e) {
      debugPrint('SecureTokenStorage.save access_token warning: $e');
    }

    if (refresh != null) {
      _refreshToken = refresh;
      try {
        await _storage.write(key: _refreshKey, value: refresh);
      } catch (e) {
        debugPrint('SecureTokenStorage.save refresh_token warning: $e');
      }
    }
  }

  @override
  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
    try {
      await _storage.delete(key: _accessKey);
      await _storage.delete(key: _refreshKey);
    } catch (e) {
      debugPrint('SecureTokenStorage.clear warning: $e');
    }
  }
}

/// 纯内存存储，方便测试或无外部依赖场景
class InMemoryTokenStorage implements TokenStorage {
  InMemoryTokenStorage({String? access, String? refresh})
      : _accessToken = access,
        _refreshToken = refresh;

  String? _accessToken;
  String? _refreshToken;

  @override
  String? get accessToken => _accessToken;

  @override
  String? get refreshToken => _refreshToken;

  @override
  bool get hasAccess => _accessToken != null && _accessToken!.isNotEmpty;

  @override
  Future<void> init() async {}

  @override
  Future<void> save({required String access, String? refresh}) async {
    _accessToken = access;
    if (refresh != null) {
      _refreshToken = refresh;
    }
  }

  @override
  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
  }
}
