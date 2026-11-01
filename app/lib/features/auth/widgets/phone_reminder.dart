import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../design/design.dart';
import '../auth_paths.dart';
import '../models/auth_models.dart';
import '../utils/phone_reminder.dart';

/// 本次启动内手机号提醒的去重状态。
///
/// 需求是“一周内每次打开 APP 提示一次”，因此同一次启动内只提示一次，
/// 关闭（稍后提醒）不延长七天窗口，也不影响下次启动再次提示。
class PhoneReminderSession {
  PhoneReminderSession._();

  static String? _shownForUserId;

  static bool alreadyShown(String userId) => _shownForUserId == userId;

  static void markShown(String userId) {
    _shownForUserId = userId;
  }

  @visibleForTesting
  static void resetForTesting() {
    _shownForUserId = null;
  }
}

/// 手机号未验证提醒弹窗（对照 `frontend/src/components/PhoneVerificationReminder.tsx`）
Future<bool> showPhoneVerificationReminderDialog(BuildContext context) {
  return showAppConfirmDialog(
    context: context,
    title: '手机号码尚未验证',
    message: '绑定手机可保障账号与项目协作安全。首次提醒后的一周内，每次开启 APP 会提醒，验证成功后立即停止。',
    confirmLabel: '去绑定手机',
    cancelLabel: '稍后提醒',
  );
}

/// 创建默认的本地存储（SharedPreferences）
Future<PhoneReminderStorage> createDefaultPhoneReminderStorage() {
  return SharedPreferencesPhoneReminderStorage.create();
}

/// 按“一周窗口 + 每次启动一次”的规则决定是否弹出手机号未验证提醒。
///
/// 返回 true 表示用户点了“去绑定手机”。
Future<bool> maybeShowPhoneReminder({
  required BuildContext context,
  required String userId,
  required bool phoneVerified,
  required PhoneReminderStorage storage,
  DateTime? now,
}) async {
  if (userId.isEmpty || phoneVerified) return false;
  if (PhoneReminderSession.alreadyShown(userId)) return false;

  final due = await PhoneReminderPolicy.isDue(
    storage: storage,
    userId: userId,
    phoneVerified: phoneVerified,
    now: now ?? DateTime.now(),
  );
  if (!due) return false;

  PhoneReminderSession.markShown(userId);
  if (!context.mounted) return false;

  final goBind = await showPhoneVerificationReminderDialog(context);
  if (goBind && context.mounted) {
    context.go(AuthPaths.verifyLocation(required: VerifyRequirement.phone));
  }
  return goBind;
}
