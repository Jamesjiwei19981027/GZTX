# T07 AI 汇报

> 可直接整段粘贴给执行的 AI。前置：T00 已合入。执行前先读 `docs/app-native-rewrite/00-总计划.md` 第五、六、七节，以及 `app/lib/design/README.md`。

## 目标

原生实现 AI 汇报全流程：我的智能体对话、写汇报并提交、汇报详情、直属领导收件箱与审阅跟进、项目汇总与对比、领导层汇报、汇报智能体绑定；以及“知识”Tab 的知识助手对话。

## 范围

- 只能改：`app/lib/features/reports/`、`app/test/features/reports/`。

## 页面与功能真源（先读，路径相对 `frontend/src/mobile/features/reports/`）

| 屏幕名 | 内容 | 网页源文件 |
|------|------|------|
| ai-root / ai-chat / knowledge-chat | 我的智能体：对话、快速记录进展 | `MyAgentScreen.tsx` |
| ai-report-create / ai-report-submitted | 写汇报（可选项目、输入框随内容增高、键盘弹出不遮挡）、提交成功 | `MyReportEditor.tsx`、`ReportProjectSelector.tsx`、`ReportSources.tsx` |
| ai-report-detail | 汇报详情与来源 | `ReportDetailScreen.tsx` |
| ai-inbox | 直属领导收件箱 | `ManagerReportInbox.tsx` |
| ai-review-followup / ai-review-conflict | 审阅、跟进、冲突处理 | `ReportReviewScreen.tsx` |
| ai-project-contrast / ai-project-aggregate | 项目汇总、对照项目资料的完成情况 | `ProjectReportScreen.tsx` |
| ai-leadership | 领导层汇报 | `LeadershipReportScreen.tsx` |
| ai-agent-bindings | 汇报智能体绑定 | `ProjectReportScreen.tsx` 中相关部分 |

角色与可见性规则：`reportCapabilities.ts`（必须逐条对齐）。接口：Swagger「智能体」「智能体汇报」。产品背景：`docs/团队协作与智能体-最终实现方案.md`。

## 产品规则

- 每个人有自己的智能体，汇报沿人轴逐级上报到直属领导，直至总领导；直属领导及其智能体收到提示。
- 不同项目的智能体上下文完全隔离：切项目后对话和汇报不得串数据。
- 用户明确报过的缺陷，原生版必须避免：点快速添加后键盘遮住汇报输入框；输入多了输入框不变高。

## 要点

- 写汇报断网时保留草稿（对照 `mobile/features/adaptation/offlineDrafts.ts`）。
- AI 生成可能较慢，显示进行中状态，可离开页面后回来查看结果。

## 验收标准

- 总计划第六节全部条件。
- 组件测试覆盖：`reportCapabilities` 各角色可见性、切项目后数据隔离、键盘弹出时输入框可见、草稿保留。
- 安卓模拟器实测：下属账号写汇报并提交 → 直属领导账号收件箱收到提示 → 审阅跟进 → 项目汇总 → 领导层汇报可见。

## 必须回传的证据

1. 文件清单；2. `flutter analyze`、`flutter test test/features/reports` 输出末尾；3. 每页 iOS／安卓 golden 图路径；4. 模拟器实测截图（两个账号）；5. 与网页版不一致之处；6. 共享改动申请；7. 发现的接口问题。
