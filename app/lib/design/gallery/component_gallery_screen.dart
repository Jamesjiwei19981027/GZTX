import 'package:flutter/material.dart';

import '../design.dart';

/// 控件展示页（展示所有自适应控件在 iOS 与 Android 端的渲染表现）
class ComponentGalleryScreen extends StatefulWidget {
  const ComponentGalleryScreen({super.key});

  @override
  State<ComponentGalleryScreen> createState() => _ComponentGalleryScreenState();
}

class _ComponentGalleryScreenState extends State<ComponentGalleryScreen> {
  String _selectedSegment = 'tab1';
  bool _switchVal = true;
  final _textController = TextEditingController(text: '自适应输入文本');

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '自适应控件展示',
      actions: [
        IconButton(
          icon: const AppIcon('bell', size: 20),
          onPressed: () {
            showAppToast(context, '点击了通知按钮', type: ToastType.info);
          },
        ),
      ],
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. 断网横条展示
            const AppOfflineBanner(message: '模拟断网提示：网络已断开'),
            const SizedBox(height: AppSpacing.lg),

            // 2. 分段切换器（iOS 胶囊式 vs 安卓下划线式）
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('分段切换器 (SegmentedControl)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  const SizedBox(height: AppSpacing.sm),
                  AppSegmentedControl<String>(
                    selectedValue: _selectedSegment,
                    segments: const {
                      'tab1': '精选任务',
                      'tab2': '进行中',
                      'tab3': '已完成',
                    },
                    onValueChanged: (val) => setState(() => _selectedSegment = val),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 3. 按钮系列
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('按钮系列 (AppButton)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      AppButton(
                        label: '主按钮',
                        variant: AppButtonVariant.primary,
                        onPressed: () => showAppToast(context, '点击主按钮', type: ToastType.success),
                      ),
                      AppButton(
                        label: '次按钮',
                        variant: AppButtonVariant.secondary,
                        onPressed: () {},
                      ),
                      AppButton(
                        label: '危险按钮',
                        variant: AppButtonVariant.danger,
                        onPressed: () {},
                      ),
                      const AppButton(
                        label: '加载中',
                        isLoading: true,
                        onPressed: null,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 4. 输入框系列
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('输入框 (AppTextField)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  const SizedBox(height: AppSpacing.sm),
                  AppTextField(
                    label: '任务标题',
                    placeholder: '请输入任务名称',
                    controller: _textController,
                    prefix: const AppIcon('edit', size: 18),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const AppTextField(
                    label: '多行自增高备注',
                    placeholder: '写点什么...',
                    minLines: 2,
                    maxLines: 4,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 5. 开关与交互项
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('开关选项 (AppSwitch)',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  AppSwitch(
                    value: _switchVal,
                    onChanged: (val) => setState(() => _switchVal = val),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 6. 列表分组与列表项
            AppListSection(
              header: '系统设置与信息',
              children: [
                AppListTile(
                  leading: const AppIcon('user'),
                  title: '个人账号信息',
                  subtitle: '张三 (示例成员)',
                  onTap: () {},
                ),
                AppListTile(
                  leading: const AppIcon('shield'),
                  title: '安全中心与权限',
                  onTap: () {},
                ),
                AppListTile(
                  leading: const AppIcon('calendar'),
                  title: '日期选择器',
                  subtitle: '点击弹出自适应日期框',
                  onTap: () {
                    showAppDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                    );
                  },
                ),
                AppListTile(
                  leading: const AppIcon('calendar'),
                  title: '日期时间选择器',
                  subtitle: '点击弹出自适应日期+时间框',
                  onTap: () {
                    showAppDateTimePicker(
                      context: context,
                      initialDateTime: DateTime.now(),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),

            // 7. 弹窗与交互触发按钮
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('模态弹窗与操作菜单',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      AppButton(
                        label: '确认对话框',
                        size: AppButtonSize.sm,
                        onPressed: () {
                          showAppConfirmDialog(
                            context: context,
                            title: '删除任务',
                            message: '确认删除该任务吗？此操作不可撤销。',
                            isDestructive: true,
                          );
                        },
                      ),
                      AppButton(
                        label: '操作菜单',
                        size: AppButtonSize.sm,
                        onPressed: () {
                          showAppActionSheet(
                            context: context,
                            title: '更多操作',
                            actions: [
                              AppActionSheetItem(
                                label: '置顶任务',
                                icon: const AppIcon('pin', size: 18),
                                onPressed: () {},
                              ),
                              AppActionSheetItem(
                                label: '删除任务',
                                icon: const AppIcon('trash', size: 18),
                                isDestructive: true,
                                onPressed: () {},
                              ),
                            ],
                          );
                        },
                      ),
                      AppButton(
                        label: '底部抽屉',
                        size: AppButtonSize.sm,
                        onPressed: () {
                          showAppBottomSheet(
                            context: context,
                            title: '快捷筛选',
                            builder: (ctx) => Container(
                              height: 180,
                              alignment: Alignment.center,
                              child: const Text('底部模态内容区域'),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 8. 加载状态
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Row(
                children: [
                  Text('加载指示器: ', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  SizedBox(width: AppSpacing.md),
                  AppLoading(),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // 9. 空状态展示
            const AppEmptyState(
              icon: AppIcon('file', size: 48, color: AppColors.textTertiary),
              title: '暂无待办事项',
              description: '当前分类下没有任务，快去新建一个吧！',
              actionLabel: '新建任务',
            ),
            const SizedBox(height: AppSpacing.xl),

            // 10. 常用自适应图标集预览
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('图标集预览 (AppIcon)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      AppIcon('work'),
                      AppIcon('axis'),
                      AppIcon('knowledge'),
                      AppIcon('messages'),
                      AppIcon('me'),
                      AppIcon('search'),
                      AppIcon('filter'),
                      AppIcon('plus'),
                      AppIcon('trash'),
                      AppIcon('check-circle'),
                      AppIcon('alert'),
                      AppIcon('settings'),
                      AppIcon('wifi'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xxxl),
          ],
        ),
      ),
    );
  }
}

