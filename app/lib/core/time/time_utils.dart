/// 时间契约与工具类（与 Web 的 `frontend/src/utils/datetime.ts` 对齐）
///
/// 契约规则：
/// 1. 后端出参一律为 UTC（带 `Z`），客户端解析后一律转为本地时区 `toLocal()`；
/// 2. 客户端向后端提交一律为 UTC ISO 字符串（带 `Z`）；
/// 3. 日历/日期比较一律使用本地时区的日期键 `YYYY-MM-DD`。
library;

import 'package:intl/intl.dart';

/// 把后端返回的 ISO 串解析成本地时间。解析失败返回 null。
DateTime? parseApiDateTime(String? iso) {
  if (iso == null || iso.trim().isEmpty) return null;
  final parsed = DateTime.tryParse(iso.trim());
  return parsed?.toLocal();
}

String _pad(int n) => n.toString().padLeft(2, '0');

/// 本地日期键 `YYYY-MM-DD`，用于日历分桶 / 选中日比较。
String localDateKey(DateTime local) =>
    '${local.year.toString().padLeft(4, '0')}-${_pad(local.month)}-${_pad(local.day)}';

/// 后端 ISO → 本地日期键；空值或不可解析返回空串。
String apiDateToLocalKey(String? iso) {
  final local = parseApiDateTime(iso);
  return local == null ? '' : localDateKey(local);
}

/// 本地某天的起点（00:00:00）对应的 UTC ISO 串，用作查询区间开始。
String localDayStartToApi(DateTime day) =>
    DateTime(day.year, day.month, day.day).toUtc().toIso8601String();

/// 本地某天的终点（23:59:59.999）对应的 UTC ISO 串，用作查询区间结束。
String localDayEndToApi(DateTime day) =>
    DateTime(day.year, day.month, day.day, 23, 59, 59, 999)
        .toUtc()
        .toIso8601String();

/// 本地时间 → 提交用的 UTC ISO 串。
String localToApi(DateTime local) => local.toUtc().toIso8601String();

/// 格式化为用户友好的本地显示时间
String formatDisplayDateTime(DateTime? dateTime, {bool withTime = true}) {
  if (dateTime == null) return '';
  final local = dateTime.isUtc ? dateTime.toLocal() : dateTime;
  if (!withTime) {
    return DateFormat('yyyy-MM-dd').format(local);
  }
  return DateFormat('yyyy-MM-dd HH:mm').format(local);
}

/// 格式化为简短友好的相对时间（今天、昨天、前天、或日期）
String formatRelativeDate(DateTime? dateTime) {
  if (dateTime == null) return '';
  final local = dateTime.isUtc ? dateTime.toLocal() : dateTime;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final targetDay = DateTime(local.year, local.month, local.day);
  final diffDays = targetDay.difference(today).inDays;

  if (diffDays == 0) {
    return '今天 ${DateFormat('HH:mm').format(local)}';
  } else if (diffDays == -1) {
    return '昨天 ${DateFormat('HH:mm').format(local)}';
  } else if (diffDays == 1) {
    return '明天 ${DateFormat('HH:mm').format(local)}';
  } else if (local.year == now.year) {
    return DateFormat('MM-dd HH:mm').format(local);
  } else {
    return DateFormat('yyyy-MM-dd').format(local);
  }
}
