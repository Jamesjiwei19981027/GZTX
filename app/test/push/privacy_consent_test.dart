import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/push/privacy_consent_gate.dart';
import 'package:worktodo_app/push/push_service.dart';

void main() {
  testWidgets('未同意前不挂载业务，拒绝不写授权，同意后持久化', (tester) async {
    SharedPreferences.setMockInitialValues({});
    PushService.instance.consentGranted = false;
    await tester.pumpWidget(
        const PrivacyConsentGate(child: MaterialApp(home: Text('业务页面'))));
    await tester.pumpAndSettle();
    expect(find.text('业务页面'), findsNothing);
    expect(PushService.instance.initialized, isFalse);
    await tester.ensureVisible(find.text('暂不同意'));
    await tester.tap(find.text('暂不同意'));
    await tester.pumpAndSettle();
    expect(
        (await SharedPreferences.getInstance())
            .getBool('privacy_consent_jpush_v1'),
        isNull);
    await tester.ensureVisible(find.text('同意并继续'));
    await tester.tap(find.text('同意并继续'));
    await tester.pumpAndSettle();
    expect(find.text('业务页面'), findsOneWidget);
    expect(PushService.instance.consentGranted, isTrue);
    expect(PushService.instance.initialized, isFalse, reason: '无 AppKey');
    expect(
        (await SharedPreferences.getInstance())
            .getBool('privacy_consent_jpush_v1'),
        isTrue);
  });
}
