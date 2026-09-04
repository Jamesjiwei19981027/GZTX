/// 时间契约（与 Web 的 `frontend/src/utils/datetime.ts` 对齐）：
///
/// - 后端出参一律 UTC 带 `Z`，客户端按本地时区渲染；
/// - 客户端提交一律 UTC ISO（带 `Z`）。
///
/// 历史实现直接 `substring(0, 10)` 取日期，那是 **UTC** 的年月日：UTC+8 下
/// 「本地 5/28 07:00 截止」会被显示成 5/27，日历也会挂到前一天。
library;

/// 把后端返回的 ISO 串解析成本地时间。解析失败返回 null。
DateTime? parseApiDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  final parsed = DateTime.tryParse(iso);
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

/// 本地某天的起点（00:00:00）对应的 UTC ISO，用作 `due_date_from`。
String localDayStartToApi(DateTime day) =>
    DateTime(day.year, day.month, day.day).toUtc().toIso8601String();

/// 本地某天的终点（23:59:59.999）对应的 UTC ISO，用作 `due_date_to`。
String localDayEndToApi(DateTime day) =>
    DateTime(day.year, day.month, day.day, 23, 59, 59, 999)
        .toUtc()
        .toIso8601String();

/// 本地时间 → 提交用的 UTC ISO。
String localToApi(DateTime local) => local.toUtc().toIso8601String();
