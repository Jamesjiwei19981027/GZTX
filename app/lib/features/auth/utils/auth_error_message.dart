import '../../../core/errors/app_error.dart';

/// 把底座结构化异常转换成可直接展示的中文文案。
///
/// 原则：后端返回的中文 message 优先；断网 / 超时统一给可操作的中文提示，
/// 不把底层英文异常细节直接抛给用户，也不静默吞掉。
String describeAuthError(Object error) {
  if (error is NetworkException) {
    return '网络连接异常或请求超时，请检查网络后重试';
  }
  if (error is ValidationException) {
    if (error.message.trim().isNotEmpty) return error.message;
    if (error.errors.isNotEmpty) return error.errors.values.first;
    return '提交的内容未通过校验，请检查后重试';
  }
  if (error is AuthException) {
    return error.message.trim().isNotEmpty ? error.message : '登录已过期，请重新登录';
  }
  if (error is ApiException) {
    final message = error.message.trim();
    if (message.isNotEmpty && !message.startsWith('HTTP ')) return message;
    return '服务暂时不可用，请稍后重试';
  }
  if (error is AppException) {
    return error.message.trim().isNotEmpty ? error.message : '操作失败，请重试';
  }
  return '操作失败，请稍后重试';
}
