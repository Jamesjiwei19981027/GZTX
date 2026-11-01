import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../widgets/me_common.dart';

/// 帮助中心（网页「系统指引与快捷说明 + 统计口径」的原生落地，无接口）
class MeHelpScreen extends StatelessWidget {
  const MeHelpScreen({super.key, this.appearance});

  final MeAppearanceController? appearance;

  static const List<(String, String)> _shortcuts = [
    ('全局智能搜索', '⌘ + K / Ctrl + K'),
    ('快速新建任务', 'C / N'),
    ('切换工作台与责任链', '1 ~ 5'),
    ('关闭弹层 / 返回', 'Esc'),
  ];

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: appearance,
      child: AppScaffold(
        title: '帮助中心',
        body: MePageBody(
          children: [
            MeCard(
              title: '桌面客户端快捷键',
              footer: '移动端无物理键盘，以下快捷键仅在 Web / 桌面客户端生效。',
              children: [
                for (final (name, keys) in _shortcuts)
                  MeInfoRow(label: name, value: keys),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            const MeCard(
              title: '统计报表计算口径',
              footer: '统计以服务端数据为准，切换企业或项目后重新计算。',
              children: [
                MeInfoRow(
                  label: '完成率',
                  value: '已完成任务 ÷ 全部有效任务',
                ),
                MeInfoRow(
                  label: '周期负荷',
                  value: '按本地时区自然周累计工时',
                ),
                MeInfoRow(
                  label: '责任链分布',
                  value: '按人轴节点负责人统计',
                  showDivider: false,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            const MeCard(
              title: '人轴责任链协同规则',
              children: [
                MeInfoRow(label: '挂接方式', value: '人挂到人上，逐级归属'),
                MeInfoRow(label: '事项归集', value: '事项自动归入责任人节点'),
                MeInfoRow(label: '汇报产出', value: '逐级生成 AI 汇报'),
                MeInfoRow(label: '材料证明', value: '节点可提交材料作为证据', showDivider: false),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            const MeCard(
              title: '常见问题',
              children: [
                MeInfoRow(
                  label: '消息接收不到',
                  value: '检查通知设置与系统权限',
                ),
                MeInfoRow(
                  label: '无法看到管理员入口',
                  value: '需企业超级管理员权限',
                ),
                MeInfoRow(
                  label: '头像无法更换',
                  value: '当前版本未接入选图能力',
                  showDivider: false,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: '前往套餐与隐私',
              variant: AppButtonVariant.secondary,
              isFullWidth: true,
              onPressed: () => context.push('/me/billing-help'),
            ),
          ],
        ),
      ),
    );
  }
}
