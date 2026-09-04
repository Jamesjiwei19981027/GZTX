import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/utils/datetime.dart';

void main() {
  group('UTC 出参 → 本地渲染', () {
    test('parseApiDateTime 解析 Z 串并转本地', () {
      final local = parseApiDateTime('2026-05-28T10:00:00Z');
      expect(local, isNotNull);
      expect(local!.isUtc, isFalse);
      expect(
        local.millisecondsSinceEpoch,
        DateTime.utc(2026, 5, 28, 10).millisecondsSinceEpoch,
      );
    });

    test('空值与非法串返回 null', () {
      expect(parseApiDateTime(null), isNull);
      expect(parseApiDateTime(''), isNull);
      expect(parseApiDateTime('garbage'), isNull);
    });

    test('apiDateToLocalKey 用本地日期而非 UTC 日期', () {
      // UTC 23:00 在 UTC+8 是次日 07:00；在 UTC-5 是当日 18:00。
      // 断言只要求「与本地时间的年月日一致」，不写死某个时区。
      const iso = '2026-05-27T23:00:00Z';
      final local = parseApiDateTime(iso)!;
      expect(apiDateToLocalKey(iso), localDateKey(local));
    });

    test('localDateKey 补零到 YYYY-MM-DD', () {
      expect(localDateKey(DateTime(2026, 1, 9)), '2026-01-09');
    });
  });

  group('本地提交 → UTC 入参', () {
    test('localDayStartToApi / localDayEndToApi 回到同一本地日', () {
      final day = DateTime(2026, 5, 28);
      final start = DateTime.parse(localDayStartToApi(day)).toLocal();
      final end = DateTime.parse(localDayEndToApi(day)).toLocal();

      expect(localDateKey(start), '2026-05-28');
      expect(start.hour, 0);
      expect(start.minute, 0);
      expect(localDateKey(end), '2026-05-28');
      expect(end.hour, 23);
      expect(end.minute, 59);
      expect(end.second, 59);
    });

    test('区间起点严格早于终点', () {
      final day = DateTime(2026, 5, 28);
      expect(
        DateTime.parse(localDayStartToApi(day))
            .isBefore(DateTime.parse(localDayEndToApi(day))),
        isTrue,
      );
    });

    test('localToApi 输出 UTC', () {
      final iso = localToApi(DateTime(2026, 5, 28, 18, 30));
      final parsed = DateTime.parse(iso);
      expect(parsed.isUtc, isTrue);
      expect(
        parsed.millisecondsSinceEpoch,
        DateTime(2026, 5, 28, 18, 30).millisecondsSinceEpoch,
      );
    });
  });
}
