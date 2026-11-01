import 'package:shared_preferences/shared_preferences.dart';

/// 手机号验证提醒的键值存储抽象。
///
/// 网页版用 `localStorage`（`frontend/src/utils/phoneReminder.ts`），
/// 原生端用 `SharedPreferences`；测试可注入内存实现并使用固定时间。
abstract class PhoneReminderStorage {
  Future<String?> getItem(String key);

  Future<void> setItem(String key, String value);
}

/// 内存实现（测试与演示用）
class InMemoryPhoneReminderStorage implements PhoneReminderStorage {
  InMemoryPhoneReminderStorage([Map<String, String>? initial])
      : _data = {...?initial};

  final Map<String, String> _data;

  Map<String, String> get snapshot => Map.unmodifiable(_data);

  @override
  Future<String?> getItem(String key) async => _data[key];

  @override
  Future<void> setItem(String key, String value) async {
    _data[key] = value;
  }
}

/// 基于 `SharedPreferences` 的持久化实现
class SharedPreferencesPhoneReminderStorage implements PhoneReminderStorage {
  SharedPreferencesPhoneReminderStorage(this._prefs);

  final SharedPreferences _prefs;

  static Future<SharedPreferencesPhoneReminderStorage> create() async {
    return SharedPreferencesPhoneReminderStorage(
      await SharedPreferences.getInstance(),
    );
  }

  @override
  Future<String?> getItem(String key) async => _prefs.getString(key);

  @override
  Future<void> setItem(String key, String value) async {
    await _prefs.setString(key, value);
  }
}

/// 手机号验证提醒的“一周窗口”规则。
///
/// 严格对齐 `frontend/src/utils/phoneReminder.ts`：
/// - 已验证或没有用户 id → 不提醒；
/// - 首次触发时写入起始时间，之后固定七天窗口；
/// - “稍后提醒”不延长窗口（关闭弹窗不写存储）；
/// - 已存的起始时间非法或晚于当前时间（设备改时间）时，以当前时间重新起算。
class PhoneReminderPolicy {
  PhoneReminderPolicy._();

  /// 固定七天窗口
  static const Duration window = Duration(days: 7);

  static String storageKey(String userId) =>
      'phone-verification-reminder-start:$userId';

  static Future<bool> isDue({
    required PhoneReminderStorage storage,
    required String userId,
    required bool phoneVerified,
    required DateTime now,
  }) async {
    if (phoneVerified || userId.isEmpty) return false;

    final key = storageKey(userId);
    final nowMs = now.millisecondsSinceEpoch;
    final saved = await storage.getItem(key);
    int? started = saved == null ? null : int.tryParse(saved);
    if (started == null || started > nowMs) {
      started = nowMs;
      await storage.setItem(key, '$started');
    }
    return nowMs - started < window.inMilliseconds;
  }
}
