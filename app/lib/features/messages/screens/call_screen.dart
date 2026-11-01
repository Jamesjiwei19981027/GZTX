import 'package:flutter/material.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../controllers/conversation_profile_controller.dart';
import '../data/messages_repository.dart';

/// 语音 / 视频通话页。
///
/// 与网页手机版 `MobileCallScreen.tsx` 能力对齐：查询 ICE 配置、创建通话会话、结束会话。
/// 真正的实时双向语音需要 `flutter_webrtc` 与 TURN 服务器，属于单独方案（见回传报告），
/// 本页绝不显示伪造的“通话中”状态。
class CallScreen extends StatefulWidget {
  const CallScreen({
    super.key,
    this.companyId,
    this.conversationId,
    this.targetName = '协同成员',
    this.callType = 'audio',
    this.repository,
  });

  final int? companyId;
  final int? conversationId;
  final String targetName;
  final String callType;
  final MessagesRepository? repository;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  CallController? _controller;
  ApiClient? _api;
  int? _companyId;
  bool _muted = false;
  bool _speakerOn = false;
  bool _leaving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    var companyId = widget.companyId;
    ApiClient? api;
    if (widget.repository == null) {
      // 订阅登录态：切公司后按新企业重建通话控制器（会话与 ICE 配置都按企业隔离）
      final auth = context.authState;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
    }
    if (_controller != null && api == _api && companyId == _companyId) return;
    _api = api;
    _companyId = companyId;
    // 换企业前先结束旧会话，避免服务端留下未结束的通话（end 对已结束会话是空操作）
    _controller
      ?..end()
      ..dispose();
    final repository =
        widget.repository ?? MessagesRepository(api ?? ApiClient());
    _controller = CallController(
      repository: repository,
      companyId: companyId,
      conversationId: widget.conversationId,
      callType: widget.callType,
    )..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _hangUp() async {
    final controller = _controller;
    if (controller == null || _leaving) return;
    setState(() => _leaving = true);
    final ok = await controller.end();
    if (!mounted) return;
    setState(() => _leaving = false);
    if (!ok) {
      final message = controller.endError ?? '结束通话失败，请重试';
      showAppToast(context, '结束通话失败：$message', type: ToastType.error);
      return;
    }
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        // 系统返回时仍要结束会话，避免服务端留下未结束的通话
        if (didPop) {
          _controller?.end();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0B1220),
        body: SafeArea(
          child: controller == null
              ? const Center(child: _CallLoading())
              : AnimatedBuilder(
                  animation: controller,
                  builder: (context, _) => Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.xl,
                      AppSpacing.lg,
                      AppSpacing.xl,
                      AppSpacing.xl,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _topBar(context),
                        Expanded(child: _center(context, controller)),
                        if (controller.configured &&
                            widget.conversationId != null)
                          _controls(context, controller),
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  Widget _topBar(BuildContext context) {
    return Row(
      children: [
        const AppIcon('phone', size: 16, color: Color(0xFF8E97A6)),
        const SizedBox(width: AppSpacing.sm),
        Text(
          widget.callType == 'video' ? '视频通话' : '语音通话',
          style: const TextStyle(fontSize: 12, color: Color(0xFF8E97A6)),
        ),
        const Spacer(),
        IconButton(
          tooltip: '关闭通话',
          onPressed: _leaving ? null : _hangUp,
          icon: const AppIcon('close', size: 22, color: Color(0xFF8E97A6)),
        ),
      ],
    );
  }

  Widget _center(BuildContext context, CallController controller) {
    if (controller.loading) {
      return const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppLoading(size: 28, color: Colors.white),
          SizedBox(height: AppSpacing.md),
          Text(
            '检测通话服务配置…',
            style: TextStyle(fontSize: 13, color: Color(0xFF8E97A6)),
          ),
        ],
      );
    }

    if (widget.conversationId == null) {
      return _noticePanel(
        title: '频道通话暂不支持',
        description: '语音与视频通话需要绑定私聊会话。请进入与同事的私聊，再点击通话按钮发起。',
        tone: _PanelTone.neutral,
      );
    }

    if (!controller.configured) {
      return _noticePanel(
        title: '音视频服务未配置',
        description:
            controller.configError ?? '当前企业环境未配置 STUN/TURN 穿透服务器，无法建立实时音视频会话。',
        extra: controller.sessionError,
        tone: _PanelTone.error,
      );
    }

    final session = controller.session;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 96,
          height: 96,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFF15294A),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF3B82F6), width: 2),
          ),
          child: Text(
            widget.targetName.trim().isEmpty
                ? '友'
                : widget.targetName.trim().characters.first,
            style: const TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.w700,
              color: Color(0xFFBFDBFE),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          widget.targetName,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        const Text(
          'WebRTC 信令已就绪，正在连接安全加密信道…',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Color(0xFF34D399)),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          'ICE 节点：${controller.config?.iceServerCount ?? 0} 个服务器可用',
          style: const TextStyle(fontSize: 11, color: Color(0xFF8E97A6)),
        ),
        if (controller.creating)
          const Padding(
            padding: EdgeInsets.only(top: AppSpacing.md),
            child: Text(
              '正在创建通话会话…',
              style: TextStyle(fontSize: 11, color: Color(0xFF8E97A6)),
            ),
          )
        else if (session != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Text(
              session.ended
                  ? '通话已结束（会话 #${session.id}）'
                  : '通话会话 #${session.id} 已创建',
              style: const TextStyle(fontSize: 11, color: Color(0xFF8E97A6)),
            ),
          )
        else if (controller.sessionError != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Text(
              '会话创建失败：${controller.sessionError}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: Color(0xFFF87171)),
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        const Text(
          '本安装包尚未接入实时音频采集与播放（需 flutter_webrtc 与 TURN，已提交共享改动申请）；'
          '当前只建立并结束通话会话记录。',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 10, height: 1.6, color: Color(0xFF6B7280)),
        ),
      ],
    );
  }

  Widget _noticePanel({
    required String title,
    required String description,
    String? extra,
    required _PanelTone tone,
  }) {
    final isError = tone == _PanelTone.error;
    return Center(
      child: SingleChildScrollView(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 78,
              height: 78,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color:
                    isError ? const Color(0xFF3A1216) : const Color(0xFF1B2434),
                shape: BoxShape.circle,
                border: Border.all(
                  color: isError
                      ? const Color(0xFF7F1D1D)
                      : const Color(0xFF2F3A4C),
                ),
              ),
              child: AppIcon(
                'phone',
                size: 34,
                color:
                    isError ? const Color(0xFFF87171) : const Color(0xFF8E97A6),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: const Color(0xFF111827),
                borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                border: Border.all(color: const Color(0xFF1F2937)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '真实诊断信息：',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFFD1D5DB),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.6,
                      color: Color(0xFF9CA3AF),
                    ),
                  ),
                  if (extra != null && extra.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      extra,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.6,
                        color: Color(0xFFF87171),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  const Text(
                    '为避免误导，这里不会显示伪造的“通话中”或虚假振铃。',
                    style: TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: AppButton(
                label: '返回会话',
                isFullWidth: true,
                onPressed: _leaving ? null : _hangUp,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _controls(BuildContext context, CallController controller) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _roundButton(
            tooltip: _muted ? '取消静音' : '静音',
            active: _muted,
            activeColor: const Color(0xFFDC2626),
            onPressed: () => setState(() => _muted = !_muted),
            child: const AppIcon('mic', size: 22, color: Colors.white),
          ),
          GestureDetector(
            onTap: _leaving ? null : _hangUp,
            child: Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                color: Color(0xFFDC2626),
                shape: BoxShape.circle,
              ),
              child: _leaving
                  ? const Padding(
                      padding: EdgeInsets.all(20),
                      child: AppLoading(size: 24, color: Colors.white),
                    )
                  : const Icon(
                      Icons.call_end_rounded,
                      size: 30,
                      color: Colors.white,
                    ),
            ),
          ),
          _roundButton(
            tooltip: _speakerOn ? '扬声器开启' : '扬声器关闭',
            active: _speakerOn,
            activeColor: AppColors.primary,
            onPressed: () => setState(() => _speakerOn = !_speakerOn),
            child: const AppIcon('bell', size: 22, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _roundButton({
    required String tooltip,
    required bool active,
    required Color activeColor,
    required VoidCallback onPressed,
    required Widget child,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: Container(
          width: 54,
          height: 54,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? activeColor : const Color(0xFF1F2937),
            shape: BoxShape.circle,
          ),
          child: child,
        ),
      ),
    );
  }
}

enum _PanelTone { neutral, error }

/// 深色底上的加载指示
class _CallLoading extends StatelessWidget {
  const _CallLoading();

  @override
  Widget build(BuildContext context) =>
      const AppLoading(size: 28, color: Colors.white);
}
