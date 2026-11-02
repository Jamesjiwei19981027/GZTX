import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/auth/project_label.dart';
import 'package:worktodo_app/core/models/project.dart';

class _FakeAuthState extends AuthState {
  _FakeAuthState({this.stubCurrentProject, this.stubProjects = const []});

  final Project? stubCurrentProject;
  final List<Project> stubProjects;

  @override
  Project? get currentProject => stubCurrentProject;

  @override
  List<Project> get projects => stubProjects;
}

void main() {
  group('projectLabelFor 测试', () {
    const p1 = Project(id: 10, name: '核心研发项目', companyId: 1);
    const p2 = Project(id: 20, name: '市场推广项目', companyId: 1);
    const p3 = Project(id: 30, name: '运营支持项目', companyId: 1);

    test('命中当前项目：优先返回当前项目名称', () {
      final auth = _FakeAuthState(
        stubCurrentProject: p1,
        stubProjects: [p1, p2, p3],
      );
      expect(projectLabelFor(auth, 10), '核心研发项目');
    });

    test('命中项目列表：当前项目不匹配但列表匹配时，返回列表中对应项目名称', () {
      final auth = _FakeAuthState(
        stubCurrentProject: p1,
        stubProjects: [p1, p2, p3],
      );
      expect(projectLabelFor(auth, 20), '市场推广项目');
      expect(projectLabelFor(auth, 30), '运营支持项目');
    });

    test('都没命中退回编号：当前项目和列表都不匹配时返回“项目 #id”', () {
      final auth = _FakeAuthState(
        stubCurrentProject: p1,
        stubProjects: [p1, p2],
      );
      expect(projectLabelFor(auth, 999), '项目 #999');
    });

    test('auth 为 null：安全退回“项目 #id”且不报错', () {
      expect(projectLabelFor(null, 123), '项目 #123');
    });
  });
}
