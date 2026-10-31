/// 统一异常体系
abstract class AppException implements Exception {
  AppException(this.message, {this.code, this.cause});

  final String message;
  final int? code;
  final Object? cause;

  @override
  String toString() => message;
}

/// 接口异常
class ApiException extends AppException {
  ApiException(
    super.message, {
    this.statusCode,
    super.code,
    super.cause,
    this.detail,
  });

  final int? statusCode;
  final dynamic detail;

  @override
  String toString() => 'ApiException(status: $statusCode, code: $code, message: $message)';
}

/// 网络异常（断网、超时等）
class NetworkException extends AppException {
  NetworkException(super.message, {super.cause});
}

/// 认证异常（未登录、令牌过期且无法续期等）
class AuthException extends AppException {
  AuthException(super.message, {super.code, super.cause});
}

/// 数据校验异常（422 表单字段验证等）
class ValidationException extends AppException {
  ValidationException(
    super.message, {
    this.errors = const {},
    super.code = 422,
    super.cause,
  });

  /// 字段错误映射表，例如 {'username': '字段必填'}
  final Map<String, String> errors;
}
