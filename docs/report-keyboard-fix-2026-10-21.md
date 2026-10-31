# AI 汇报与快速添加：键盘避让和输入框自动增高

日期：2026-10-21。同步范围：桌面 Web、手机浏览器、正式 Flutter WebView APP。

## 原因

APP 按产品约定使用 `adjustNothing` 和 `resizeToAvoidBottomInset: false`，系统键盘覆盖页面。旧版未通知网页键盘遮挡高度，真实键盘打开后 `innerHeight` 和 `visualViewport.height` 都仍为 876，底部输入框因此被覆盖。AI 对话的单行 input、汇报编辑的固定行数 textarea 也无法随内容增高。

## 修复行为

- APP 将键盘遮挡高度转换为 WebView CSS 像素，经原生桥接通知网页，并扣除原生 SafeArea 已处理的底部区域。键盘关闭时同步为零。
- AI 对话与汇报编辑只调整当前输入面板的可用空间，快速添加弹窗及移动底部弹层移到键盘上方，页面整体高度保持不变。
- AI 对话、汇报已完成／风险字段、桌面汇报正文、桌面项目助手、快速添加共用自动增高输入框。支持换行、自然折行、粘贴和草稿恢复；达到上限后框内滚动，删除内容后缩回，宽度变化后重新测量。
- AI 对话的回车用于换行，点击发送或 Ctrl/Cmd+Enter 发送；中文输入法确认候选不触发发送。快速添加保留回车创建，Shift+Enter 换行，并排除输入法组合中的回车。
- 保留项目／用户草稿隔离、提交接口和人轴接收规则。

## 验证

- 新增 `frontend/e2e/report-keyboard.spec.ts`：5 项通过，覆盖原生键盘通知、浏览器 visualViewport、增长／缩回、长文滚动、输入法回车、收起恢复、汇报编辑和快速添加按钮可见、桌面同步。
- 既有汇报流程 `mobile-report-personal.spec.ts`、`mobile-report-manager.spec.ts`、`report-ui.spec.ts`：3 项通过。
- 移动回归 `mobile-feedback.spec.ts`、`mobile-screen-coverage.spec.ts`：13 项通过。
- Web `npm test`、`npm run lint`、`npm run build` 通过；构建保留既有大分块提示。
- Flutter 测试 29 项通过，涉及的 Dart 文件 analyze 通过；Debug APK 构建并安装成功。
- Pixel_9_Pro / Android 15 / `emulator-5554`：6 项真实 APP 检查通过。ADB 实际点击输入框并发送系统输入事件；检查时保持系统键盘打开，未拦截后端接口。覆盖 AI 输入、多行与原生输入、长文滚动、键盘关闭恢复、汇报编辑、快速添加。
- 实测原生键盘顶部屏幕 y=1848，APP 通知键盘遮挡 312 CSS 像素。输入框和操作按钮坐标换算后均在键盘上方；页面 `innerHeight` 保持 876。

## 证据与复测

结果：`frontend/android-acceptance/test-results/report-keyboard/result.json`。

同目录截图：`before.png`、`chat-keyboard.png`、`chat-long-keyboard.png`、`editor-keyboard.png`、`quick-keyboard.png`，均包含原生系统键盘。

Android 脚本检查键盘仍打开后再判断控件坐标，不会通过关闭键盘掩盖遮挡。不提交测试内容到后端，结束后恢复原有本地汇报草稿。

```powershell
cd E:\workspace\gongzuotix\frontend
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:5177'
npx playwright test e2e/report-keyboard.spec.ts e2e/mobile-report-personal.spec.ts e2e/mobile-report-manager.spec.ts e2e/report-ui.spec.ts
npx tsx scripts/test-android-report-keyboard.ts
```

Android 复测前将模拟器 5177 reverse 到宿主机，并将当前 APP WebView 调试 socket forward 到 9222。本轮未执行 iOS 实机和微信真机验证，不代表全产品穷举测试或生产发布放行。
