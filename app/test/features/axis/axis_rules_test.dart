import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_rules.dart';

AxisPersonNode person(
  int id, {
  int? parentId,
  String name = '人员',
  String origin = 'project',
  bool terminal = false,
  List<int> owners = const [],
}) {
  return AxisPersonNode(
    id: id,
    parentId: parentId,
    title: name,
    description: null,
    name: name,
    roleTitle: '岗位',
    department: '部门',
    nodeOrigin: origin,
    isTerminalPm: terminal,
    ownerUserIds: owners,
    workItems: const [],
    responsibilityPermissions: const {},
  );
}

void main() {
  group('人轴拖放规则（与后端 assert_shape / assert_person_limit 对齐）', () {
    final nodes = [
      person(1, name: '一层'),
      person(2, parentId: 1, name: '二层'),
      person(3, parentId: 2, name: '三层'),
      person(5, parentId: 3, name: '四层'),
      person(6, parentId: 1, name: '另一位二层'),
      person(4, name: '另一位一层'),
    ];

    test('人挂人可以：二层人员改挂到另一位人员下', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: const AxisDragSubject(id: 1, isPerson: true),
        nodes: nodes,
      );
      expect(result.allowed, isTrue);
    });

    test('事项挂人可以：工作项可以挂到人员下', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 201, isPerson: false, parentId: 2),
        target: const AxisDragSubject(id: 6, isPerson: true),
        nodes: nodes,
      );
      expect(result.allowed, isTrue);
    });

    test('事项下挂人不行：人员不能挂到事项下面', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: const AxisDragSubject(id: 201, isPerson: false),
        nodes: nodes,
      );
      expect(result.allowed, isFalse);
      expect(result.reason, contains('主干只排人'));
    });

    test('事项不能挂到事项上', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 201, isPerson: false),
        target: const AxisDragSubject(id: 202, isPerson: false),
        nodes: nodes,
      );
      expect(result.allowed, isFalse);
      expect(result.reason, contains('事项只能挂在「人」下面'));
    });

    test('层数上限为四层：第四层允许，第五层被拒', () {
      expect(axisMaxPersonLevels, 4);
      expect(AxisRules.personLevel(5, nodes), 4);
      // 6 挂到第三层人员 3 下面 = 第四层，允许。
      final fourth = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: const AxisDragSubject(id: 3, isPerson: true),
        nodes: nodes,
      );
      expect(fourth.allowed, isTrue);
      // 6 挂到第四层人员 5 下面 = 第五层，被拒。
      final fifth = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: const AxisDragSubject(id: 5, isPerson: true),
        nodes: nodes,
      );
      expect(fifth.allowed, isFalse);
      expect(fifth.reason, contains('最多四层'));
    });

    test('根（终责人）不能拖到别人下面', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 1, isPerson: true),
        target: const AxisDragSubject(id: 4, isPerson: true),
        nodes: nodes,
      );
      expect(result.allowed, isFalse);
      expect(result.reason, contains('根'));
    });

    test('已有根时，不能把人员拖到根位置；没有根时可以', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: null,
        allowRootTarget: true,
        nodes: nodes,
      );
      expect(result.allowed, isFalse);
      expect(result.reason, contains('已有终责人'));
      final noRoot = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: null,
        allowRootTarget: true,
        nodes: [person(6, parentId: 99)],
      );
      expect(noRoot.allowed, isTrue);
    });

    test('不能拖到自己身上，也不能拖进自己的后代', () {
      final self = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 2, isPerson: true),
        target: const AxisDragSubject(id: 2, isPerson: true),
        nodes: nodes,
      );
      expect(self.allowed, isFalse);

      final descendant = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 1, isPerson: true),
        target: const AxisDragSubject(id: 3, isPerson: true),
        nodes: nodes,
      );
      expect(descendant.allowed, isFalse);
      expect(descendant.reason, contains('闭环'));
    });

    test('目标人员未开放新增下属时拒绝', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 6, isPerson: true, parentId: 1),
        target: const AxisDragSubject(id: 2, isPerson: true),
        nodes: nodes,
        canAddUnderTarget: false,
      );
      expect(result.allowed, isFalse);
      expect(result.reason, contains('新增直属下属'));
    });

    test('拖到空白处只调整位置，不改变上级', () {
      final result = AxisRules.validateDrop(
        dragged: const AxisDragSubject(id: 2, isPerson: true),
        target: null,
        nodes: nodes,
      );
      expect(result.allowed, isTrue);
    });
  });

  group('委托有效期换算（本地日期 23:59:59 → UTC）', () {
    test('跨时区保持本地当天结束', () {
      final localDay = DateTime(2026, 12, 31);
      final iso = AxisRules.delegationValidTo(localDay);
      expect(iso, isNotNull);
      final parsed = DateTime.parse(iso!);
      expect(parsed.isUtc, isTrue);
      final local = parsed.toLocal();
      expect(local.year, 2026);
      expect(local.month, 12);
      expect(local.day, 31);
      expect(local.hour, 23);
      expect(local.minute, 59);
      expect(local.second, 59);
    });

    test('未选日期表示长期，返回 null', () {
      expect(AxisRules.delegationValidTo(null), isNull);
    });

    test('与网页 delegationValidTo 同一换算口径', () {
      final day = DateTime(2026, 3, 10);
      final expected =
          DateTime(2026, 3, 10, 23, 59, 59).toUtc().toIso8601String();
      expect(AxisRules.delegationValidTo(day), expected);
    });
  });
}
