import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/time/time_utils.dart';

void main() {
  group('time_utils 时间契约与格式化测试', () {
    test('parseApiDateTime 解析 UTC 串并转为本地时区', () {
      final parsed = parseApiDateTime('2026-10-31T12:00:00Z');
      expect(parsed, isNotNull);
      expect(parsed!.isUtc, false);
    });

    test('localToApi 输出以 Z 结尾的 UTC 串', () {
      final local = DateTime(2026, 10, 31, 20, 0, 0);
      final apiStr = localToApi(local);
      expect(apiStr.endsWith('Z'), true);
      final roundTrip = parseApiDateTime(apiStr);
      expect(roundTrip, equals(local));
    });

    test('localDayStartToApi 和 localDayEndToApi 覆盖完整本地日', () {
      final day = DateTime(2026, 10, 31);
      final start = parseApiDateTime(localDayStartToApi(day))!;
      final end = parseApiDateTime(localDayEndToApi(day))!;

      expect(start.hour, 0);
      expect(start.minute, 0);
      expect(start.second, 0);

      expect(end.hour, 23);
      expect(end.minute, 59);
      expect(end.second, 59);
      expect(start.isBefore(end), true);
    });

    test('formatDisplayDateTime 格式化测试', () {
      final dt = DateTime(2026, 10, 31, 9, 5);
      expect(formatDisplayDateTime(dt, withTime: true), '2026-10-31 09:05');
      expect(formatDisplayDateTime(dt, withTime: false), '2026-10-31');
      expect(formatDisplayDateTime(null), '');
    });
  });
}
