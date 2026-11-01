/// T01 登录注册模块的数据模型
///
/// 字段口径对齐 `frontend/src/api/auth.ts` 与后端
/// `backend/app/api/v1/auth.py`、`backend/app/api/v1/users.py`。
library;

/// 验证码通道：邮箱 / 短信
enum AuthChannel {
  email('email', '邮箱'),
  sms('sms', '短信');

  const AuthChannel(this.apiValue, this.label);

  /// 接口字段值（`email` / `sms`）
  final String apiValue;

  /// 界面展示名称
  final String label;
}

/// 验证码用途：注册 / 登录
enum SendCodePurpose {
  register('register'),
  login('login');

  const SendCodePurpose(this.apiValue);

  final String apiValue;
}

/// 验证门要求补验的通道
enum VerifyRequirement {
  /// 个人待办只需邮箱
  email,

  /// 协作功能需要邮箱 + 手机
  phone,
}

/// 发送验证码接口返回
///
/// 后端返回 `{sent: true, resend_after: 60, debug_code?: "123456"}`
/// （见 `backend/app/services/verification.py:send_code`）。
class SendCodeResult {
  const SendCodeResult({
    required this.sent,
    required this.resendAfterSeconds,
    this.debugCode,
  });

  final bool sent;

  /// 服务端要求的重发间隔（秒），用于倒计时初值
  final int resendAfterSeconds;

  /// 仅 DEBUG 环境回显，用于联调
  final String? debugCode;

  factory SendCodeResult.fromJson(dynamic json) {
    if (json is! Map) {
      return const SendCodeResult(sent: true, resendAfterSeconds: 60);
    }
    final rawResend = json['resend_after'] ?? json['cooldown_seconds'];
    final resend = (rawResend is num) ? rawResend.toInt() : 60;
    final debug = json['debug_code'];
    return SendCodeResult(
      sent: json['sent'] != false,
      resendAfterSeconds: resend > 0 ? resend : 60,
      debugCode: debug is String && debug.isNotEmpty ? debug : null,
    );
  }
}

/// 双验证状态（`GET /users/me/verification`）
class VerificationStatus {
  const VerificationStatus({
    this.email = '',
    this.phone = '',
    this.emailVerified = false,
    this.phoneVerified = false,
    this.isVerified = false,
  });

  final String email;
  final String phone;
  final bool emailVerified;
  final bool phoneVerified;
  final bool isVerified;

  bool get hasEmail => email.trim().isNotEmpty;
  bool get hasPhone => phone.trim().isNotEmpty;

  /// 邮箱与手机都已验证
  bool get fullyVerified => emailVerified && phoneVerified;

  bool satisfies(VerifyRequirement requirement) {
    if (requirement == VerifyRequirement.phone) {
      return emailVerified && phoneVerified;
    }
    return emailVerified;
  }

  /// 解析接口返回。
  ///
  /// `/users/me/verification/confirm` 只返回 `*_verified` 三个布尔值，
  /// 因此可传入 [base] 保留原本的邮箱/手机号展示值。
  factory VerificationStatus.fromJson(
    dynamic json, {
    VerificationStatus? base,
  }) {
    if (json is! Map) {
      return base ?? const VerificationStatus();
    }
    final email = json['email'];
    final phone = json['phone'];
    return VerificationStatus(
      email: email is String ? email : (base?.email ?? ''),
      phone: phone is String ? phone : (base?.phone ?? ''),
      emailVerified: json['email_verified'] == true,
      phoneVerified: json['phone_verified'] == true,
      isVerified: json['is_verified'] == true,
    );
  }

  /// 补验成功后本地合并服务端返回的布尔值，并把本次绑定的目标号码写入展示字段
  VerificationStatus confirmLocal(AuthChannel channel, String target) {
    final nextEmailVerified =
        channel == AuthChannel.email ? true : emailVerified;
    final nextPhoneVerified =
        channel == AuthChannel.sms ? true : phoneVerified;
    return VerificationStatus(
      email: channel == AuthChannel.email ? target : email,
      phone: channel == AuthChannel.sms ? target : phone,
      emailVerified: nextEmailVerified,
      phoneVerified: nextPhoneVerified,
      isVerified: nextEmailVerified && nextPhoneVerified,
    );
  }
}

/// 登录 / 注册成功后的令牌载荷
class AuthSession {
  const AuthSession({
    required this.accessToken,
    this.refreshToken,
  });

  final String accessToken;
  final String? refreshToken;
}
