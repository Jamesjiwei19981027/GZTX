import 'models/auth_models.dart';

/// T01 认证模块的路径常量与生成器。
///
/// 单独成文件，避免 `routes.dart`（依赖三个页面）与页面（需要跳转路径）
/// 之间形成循环引用。
class AuthPaths {
  AuthPaths._();

  /// 登录页
  static const String login = '/login';

  /// 注册页（登录页的子路由，返回键回到登录页）
  static const String register = '/login/register';

  /// 旧外壳使用过的注册路径，保留重定向避免旧链接失效
  static const String legacyRegister = '/register';

  /// 邮箱 / 手机验证门
  static const String verify = '/verify';

  /// 登录后的工作 Tab 根页
  static const String work = '/work';

  /// 构造验证门地址
  static String verifyLocation({VerifyRequirement required = VerifyRequirement.email}) {
    final value =
        required == VerifyRequirement.phone ? 'phone' : 'email';
    return '$verify?required=$value';
  }

  /// 解析验证门的 `required` 参数，非法值回退为邮箱
  static VerifyRequirement parseRequirement(String? raw) {
    return raw == 'phone' ? VerifyRequirement.phone : VerifyRequirement.email;
  }
}
