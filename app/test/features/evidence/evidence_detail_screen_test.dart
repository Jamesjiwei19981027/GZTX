import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_detail_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/evidence_harness.dart';

class _DetailFakeAuthState extends AuthState {
  _DetailFakeAuthState(this._projects);
  final List<Project> _projects;

  @override
  List<Project> get projects => _projects;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper baseHelper() {
    final helper = MockApiClientHelper();
    helper.whenGet('/nodes/7', {'id': 7, 'title': '完成交互原型评审'});
    return helper;
  }

  testWidgets('材料包详情展示提交说明、支撑文件与状态', (tester) async {
    final helper = baseHelper();
    helper.whenGet(
      '/evidence/91',
      packageJson(files: [fileJson()]),
    );

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(
        api: buildEvidenceApi(helper),
        packageId: 91,
        currentUserId: 11,
      ),
    );
    await settle(tester);

    expect(find.text('完成交互原型评审，附评审纪要与验收清单。'), findsWidgets);
    expect(find.text('已提交'), findsNWidgets(2));
    expect(find.text('文档'), findsNWidgets(2));
    expect(find.text('材料编号 #91'), findsOneWidget);
    expect(find.text('材料信息'), findsOneWidget);
    expect(find.text('支撑文件（1）'), findsOneWidget);
    expect(find.text('交互评审纪要.pdf'), findsOneWidget);
    expect(find.textContaining('2.4 MB'), findsOneWidget);
    expect(find.text('完成交互原型评审'), findsOneWidget);
    expect(find.text('我'), findsOneWidget);
  });

  testWidgets('加载失败显示错误与重试，重试后恢复内容', (tester) async {
    final helper = baseHelper();
    helper.whenGet(
      '/evidence/91',
      {'code': 500, 'message': '服务暂时不可用', 'data': null},
      statusCode: 500,
    );

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 91),
    );
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.textContaining('服务暂时不可用'), findsOneWidget);

    // 服务恢复后重试
    helper.whenGet('/evidence/91', packageJson(files: [fileJson()]));
    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('支撑文件（1）'), findsOneWidget);
  });

  testWidgets('提交时间按本地时区展示，不出现原始 UTC 字符串', (tester) async {
    final helper = baseHelper();
    final json = packageJson(files: [fileJson()]);
    json['submitted_at'] = '2026-10-20T06:10:00Z';
    helper.whenGet('/evidence/91', json);

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 91),
    );
    await settle(tester);

    expect(find.textContaining('2026-10-20T06:10:00'), findsNothing);
    expect(find.textContaining('提交于 2026-10-20'), findsOneWidget);
  });

  testWidgets('断网时给出可见网络提示与重试入口', (tester) async {
    final helper = baseHelper();
    helper.whenGet('/evidence/91', Exception('网络不可达'));

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 91),
    );
    await settle(tester);

    expect(find.textContaining('请检查网络后重试'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('无权限时展示无权限状态而不是空白页', (tester) async {
    final helper = baseHelper();
    helper.whenGet(
      '/evidence/91',
      {'code': 40301, 'message': '非项目成员，无法查看材料', 'data': null},
      statusCode: 403,
    );

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 91),
    );
    await settle(tester);

    expect(find.text('暂无访问权限'), findsOneWidget);
  });

  testWidgets('点击文件弹出文件信息，并说明后端未提供下载接口', (tester) async {
    final helper = baseHelper();
    helper.whenGet('/evidence/91', packageJson(files: [fileJson()]));

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 91),
    );
    await settle(tester);

    await tester.tap(find.text('交互评审纪要.pdf'));
    await tester.pumpAndSettle();

    expect(find.text('文件信息'), findsOneWidget);
    expect(find.text('#501'), findsOneWidget);
    expect(find.textContaining('暂未提供材料文件下载接口'), findsOneWidget);
  });

  testWidgets('没有附件时给出明确说明', (tester) async {
    final helper = baseHelper();
    helper.whenGet('/evidence/92', packageJson(id: 92));

    await pumpEvidenceScreen(
      tester,
      EvidenceDetailScreen(api: buildEvidenceApi(helper), packageId: 92),
    );
    await settle(tester);

    expect(find.text('支撑文件（0）'), findsOneWidget);
    expect(find.text('本次材料没有附件，仅提交了文字说明。'), findsOneWidget);
  });

  testWidgets('有 AuthState 且项目在列表里时，页面显示项目名称，不出现“项目 #”', (tester) async {
    final helper = baseHelper();
    helper.whenGet('/evidence/91', packageJson(files: [fileJson()]));

    final fakeAuth = _DetailFakeAuthState(const [
      Project(id: 3, name: '供应链协同平台', companyId: 1),
    ]);

    await pumpEvidenceScreen(
      tester,
      ChangeNotifierProvider<AuthState>.value(
        value: fakeAuth,
        child: EvidenceDetailScreen(
          api: buildEvidenceApi(helper),
          packageId: 91,
        ),
      ),
    );
    await settle(tester);

    expect(find.text('供应链协同平台'), findsOneWidget);
    expect(find.textContaining('项目 #'), findsNothing);
  });
}
