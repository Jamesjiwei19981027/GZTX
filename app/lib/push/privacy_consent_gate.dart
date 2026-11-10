import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'push_service.dart';
import '../design/app_theme.dart';

const pushPrivacyNotice =
    '为向你发送任务、材料和汇报的系统通知，本应用在服务器启用推送且你同意隐私政策后，使用极光推送 SDK（深圳市和讯华谷信息技术有限公司）。SDK 处理设备标识（如 Android ID、OAID，视系统授权及 SDK 配置而定）、设备型号与系统版本、网络状态及 IP 地址、推送标识和消息送达/点击记录，用于识别设备、建立推送连接与统计送达。不会向 SDK 提供账号密码或服务器密钥。你可在“我的 → 通知设置”关闭系统推送，并在安卓系统设置撤销通知权限。未配置推送时不初始化 SDK。极光隐私政策：https://www.jiguang.cn/license/privacy。应用仅为受邀用户提供团队工作、知识和消息功能，按项目权限处理数据。';

/// 在挂载 WebView/业务页面前取得授权；拒绝不写入同意记录。
class PrivacyConsentGate extends StatefulWidget {
  const PrivacyConsentGate({super.key, required this.child});
  final Widget child;
  @override
  State<PrivacyConsentGate> createState() => _PrivacyConsentGateState();
}

class _PrivacyConsentGateState extends State<PrivacyConsentGate> {
  bool _loaded = false;
  bool _agreed = false;
  bool _declined = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final agreed = prefs.getBool('privacy_consent_jpush_v1') == true;
    PushService.instance.consentGranted = agreed;
    if (mounted) {
      setState(() {
        _loaded = true;
        _agreed = agreed;
      });
    }
  }

  Future<void> _agree() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('privacy_consent_jpush_v1', true);
    PushService.instance.consentGranted = true;
    if (mounted) setState(() => _agreed = true);
  }

  @override
  Widget build(BuildContext context) {
    if (_agreed) return widget.child;
    return MaterialApp(
      theme: appThemeFor(Brightness.light),
      home: Scaffold(
        backgroundColor: const Color(0xFFF7F6F3),
        body: !_loaded
            ? const Center(child: CircularProgressIndicator())
            : Center(
                child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: Material(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('隐私政策与系统通知',
                                      style: TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w500,
                                          color: Color(0xFF1C1B19))),
                                  const SizedBox(height: 16),
                                  const SelectableText(pushPrivacyNotice,
                                      style: TextStyle(
                                          fontSize: 14,
                                          height: 1.6,
                                          color: Color(0xFF5C5850))),
                                  if (_declined)
                                    const Padding(
                                        padding: EdgeInsets.only(top: 16),
                                        child:
                                            Text('请阅读隐私政策，同意后进入应用。SDK 尚未初始化。')),
                                  const SizedBox(height: 24),
                                  Row(
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      children: [
                                        TextButton(
                                            onPressed: () => setState(
                                                () => _declined = true),
                                            child: const Text('暂不同意')),
                                        const SizedBox(width: 8),
                                        FilledButton(
                                            onPressed: _agree,
                                            style: FilledButton.styleFrom(
                                                backgroundColor:
                                                    const Color(0xFF1D4E9E),
                                                foregroundColor: Colors.white,
                                                shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            8))),
                                            child: const Text('同意并继续')),
                                      ]),
                                ]),
                          )),
                    )),
              ),
      ),
    );
  }
}
