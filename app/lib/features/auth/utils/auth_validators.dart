import '../models/auth_models.dart';

/// 登录注册表单校验规则。
///
/// 对齐网页版：
/// - 通道识别：`frontend/src/api/auth.ts:detectChannel`
/// - 用户名 / 密码 / 确认密码：`frontend/src/components/LoginGate.tsx:handleRegister`
///
/// 返回 `null` 表示通过，否则返回可直接展示的中文错误文案。
class AuthValidators {
  AuthValidators._();

  static final RegExp _usernamePattern = RegExp(r'^[A-Za-z0-9_]{3,50}$');
  static final RegExp _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  static final RegExp _smsPattern = RegExp(r'^\+?\d{6,20}$');

  /// 自动识别邮箱 / 短信通道；无法识别返回 null
  static AuthChannel? detectChannel(String target) {
    final value = target.trim();
    if (value.isEmpty) return null;
    if (value.contains('@')) return AuthChannel.email;
    final cleaned = value.replaceAll(RegExp(r'[\s-]'), '');
    if (_smsPattern.hasMatch(cleaned)) return AuthChannel.sms;
    return null;
  }

  static String? validateUsername(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return '请输入用户名';
    if (!_usernamePattern.hasMatch(value)) {
      return '用户名需 3–50 位字母、数字或下划线';
    }
    return null;
  }

  static String? validatePassword(String raw) {
    if (raw.isEmpty) return '请输入密码';
    if (raw.length < 6) return '密码至少 6 位';
    return null;
  }

  static String? validateEmail(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return '请输入工作邮箱';
    if (!_emailPattern.hasMatch(value)) return '请输入有效的邮箱地址';
    return null;
  }

  /// 手机号为可选字段；填写后至少 7 位（与网页版一致，具体格式由后端校验）
  static String? validateOptionalPhone(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return null;
    if (value.replaceAll(RegExp(r'[\s-]'), '').length < 7) {
      return '请输入有效的手机号';
    }
    return null;
  }
}
