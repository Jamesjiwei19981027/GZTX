import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 令牌存储抽象接口
abstract class TokenStorage {
  int get sessionGeneration;
  String? get accessToken;
  String? get refreshToken;
  bool get hasAccess => accessToken != null && accessToken!.isNotEmpty;

  Future<void> init();
  Future<void> save(
      {required String access, String? refresh, bool preserveSession = false});
  Future<void> clear();
}

/// 基于 FlutterSecureStorage 的持久化安全存储，带内存高速缓存
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? secureStorage})
      : _storage = secureStorage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  Future<void> _writes = Future<void>.value();

  static const _accessKey = 'worktodo_access_token';
  static const _refreshKey = 'worktodo_refresh_token';

  String? _accessToken;
  String? _refreshToken;
  @override
  int sessionGeneration = 0;

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
  Future<void> save(
      {required String access,
      String? refresh,
      bool preserveSession = false}) async {
    if (!preserveSession) sessionGeneration++;
    _accessToken = access;
    if (refresh != null) _refreshToken = refresh;
    return _writes = _writes.then((_) async {
      try {
        await _storage.write(key: _accessKey, value: access);
        if (refresh != null) {
          await _storage.write(key: _refreshKey, value: refresh);
        }
      } catch (e) {
        debugPrint('SecureTokenStorage.save warning: $e');
      }
    });
  }

  @override
  Future<void> clear() async {
    sessionGeneration++;
    _accessToken = null;
    _refreshToken = null;
    return _writes = _writes.then((_) async {
      try {
        await _storage.delete(key: _accessKey);
        await _storage.delete(key: _refreshKey);
      } catch (e) {
        debugPrint('SecureTokenStorage.clear warning: $e');
      }
    });
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
  int sessionGeneration = 0;

  @override
  String? get accessToken => _accessToken;

  @override
  String? get refreshToken => _refreshToken;

  @override
  bool get hasAccess => _accessToken != null && _accessToken!.isNotEmpty;

  @override
  Future<void> init() async {}

  @override
  Future<void> save(
      {required String access,
      String? refresh,
      bool preserveSession = false}) async {
    if (!preserveSession) sessionGeneration++;
    _accessToken = access;
    if (refresh != null) {
      _refreshToken = refresh;
    }
  }

  @override
  Future<void> clear() async {
    sessionGeneration++;
    _accessToken = null;
    _refreshToken = null;
  }
}
