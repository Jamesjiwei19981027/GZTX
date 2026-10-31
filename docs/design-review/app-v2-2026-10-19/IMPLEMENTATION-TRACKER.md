# APP V2 逐页实施与验收跟踪表

基准：用户已批准 V2-20261019-R1 的 100 张设计；已授权 iOS 风格优化。此表跟踪 100 张页面全量实施进展。

实施入口：[GEMINI-HANDOFF.md](GEMINI-HANDOFF.md)；规范：[IOS-ADAPTATION.md](IOS-ADAPTATION.md)；任务：[完整计划](../../superpowers/plans/2026-10-19-app-v2-ui-gemini.md)。

## 填写规则

- UI 状态：未开始 / 进行中 / 已实现。接口状态：待核实 / 已接入 / 依赖阻塞。两者分别更新。
- 验证状态：未验证 / 通过 / 失败 / 依赖阻塞。Android、iOS、Web 分别记录；浏览器模拟不等于平台真机通过。
- 完成时将“入口 / 证据”替换为实际路由、按钮路径、测试命令和证据链接。不得只填写“同上”或“全部通过”。
- G 编号引用计划第 4 节的核实项，表示存在需要核查的依赖，不预先宣称所有对应能力均缺失。
- 同一组件可覆盖多张模式 / 状态图，但每个编号都要有实际触发方式。不得把静态 PNG 当成已实现 UI。
- iOS 样式差异追加到“入口 / 证据”；涉及业务流程变更时写明依据，不能静默删功能。

| 编号 | 页面 / 状态 | 任务 | 核实项 | UI | 接口 | Android | iOS | Web / 共享契约 | 入口 / 证据 |
|---|---|---|---|---|---|---|---|---|---|
| 01 | [登录](images/01-%E7%99%BB%E5%BD%95.png) | T04 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/auth/MobileAuthScreens.tsx (mode='login', 密码模式) |
| 02 | [注册账号](images/02-%E6%B3%A8%E5%86%8C%E8%B4%A6%E5%8F%B7.png) | T04 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/auth/MobileAuthScreens.tsx (mode='register') |
| 03 | [验证工作邮箱](images/03-%E9%AA%8C%E8%AF%81%E5%B7%A5%E4%BD%9C%E9%82%AE%E7%AE%B1.png) | T04 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/auth/MobileAuthScreens.tsx (mode='verify-email') |
| 04 | [验证手机号](images/04-%E9%AA%8C%E8%AF%81%E6%89%8B%E6%9C%BA%E5%8F%B7.png) | T04 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/auth/MobileAuthScreens.tsx (mode='verify-phone') |
| 05 | [员工工作台](images/05-%E5%91%98%E5%B7%A5%E5%B7%A5%E4%BD%9C%E5%8F%B0.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/work/MobileWorkScreens.tsx (MobileWorkbenchScreen mode='employee') |
| 06 | [管理者工作台](images/06-%E7%AE%A1%E7%90%86%E8%80%85%E5%B7%A5%E4%BD%9C%E5%8F%B0.png) | T05 | G06 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/work/MobileWorkScreens.tsx (MobileWorkbenchScreen mode='manager') |
| 07 | [切换项目](images/07-%E5%88%87%E6%8D%A2%E9%A1%B9%E7%9B%AE.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileProjectSwitchScreen) |
| 08 | [创建工作区](images/08-%E5%88%9B%E5%BB%BA%E5%B7%A5%E4%BD%9C%E5%8C%BA.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileWorkspaceCreateScreen) |
| 09 | [项目概览](images/09-%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileProjectOverviewScreen) |
| 10 | [项目设置](images/10-%E9%A1%B9%E7%9B%AE%E8%AE%BE%E7%BD%AE.png) | T04 | G08 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileProjectSettingsScreen) |
| 11 | [成员邀请](images/11-%E6%88%90%E5%91%98%E9%82%80%E8%AF%B7.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileProjectInviteScreen) |
| 12 | [我的任务](images/12-%E6%88%91%E7%9A%84%E4%BB%BB%E5%8A%A1.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileMyTasksScreen) |
| 13 | [任务筛选与批量操作](images/13-%E4%BB%BB%E5%8A%A1%E7%AD%9B%E9%80%89%E4%B8%8E%E6%89%B9%E9%87%8F%E6%93%8D%E4%BD%9C.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileMyTasksScreen 筛选与多选) |
| 14 | [任务详情](images/14-%E4%BB%BB%E5%8A%A1%E8%AF%A6%E6%83%85.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileTaskDetailSheet) |
| 15 | [新建 / 编辑任务](images/15-%E6%96%B0%E5%BB%BA-%E7%BC%96%E8%BE%91%E4%BB%BB%E5%8A%A1.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileTaskEditScreen) |
| 16 | [快速添加](images/16-%E5%BF%AB%E9%80%9F%E6%B7%BB%E5%8A%A0.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileQuickAddSheet) |
| 17 | [从聊天提取任务](images/17-%E4%BB%8E%E8%81%8A%E5%A4%A9%E6%8F%90%E5%8F%96%E4%BB%BB%E5%8A%A1.png) | T05 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileTaskExtractChatSheet) |
| 18 | [项目看板](images/18-%E9%A1%B9%E7%9B%AE%E7%9C%8B%E6%9D%BF.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileKanbanScreen) |
| 19 | [日历与日程](images/19-%E6%97%A5%E5%8E%86%E4%B8%8E%E6%97%A5%E7%A8%8B.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileCalendarScreen.tsx |
| 20 | [我的责任链](images/20-%E6%88%91%E7%9A%84%E8%B4%A3%E4%BB%BB%E9%93%BE.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (FocusChain 直属骨干) |
| 21 | [项目全貌](images/21-%E9%A1%B9%E7%9B%AE%E5%85%A8%E8%B2%8C.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (OverviewCanvas 全貌画布) |
| 22 | [人员 / 责任节点详情](images/22-%E4%BA%BA%E5%91%98-%E8%B4%A3%E4%BB%BB%E8%8A%82%E7%82%B9%E8%AF%A6%E6%83%85.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (NodeDetailSheet 节点详情) |
| 23 | [新增 / 编辑人员](images/23-%E6%96%B0%E5%A2%9E-%E7%BC%96%E8%BE%91%E4%BA%BA%E5%91%98.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (EditPersonSheet 新增人员) |
| 24 | [节点权限](images/24-%E8%8A%82%E7%82%B9%E6%9D%83%E9%99%90.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (NodePermissionSheet 权限) |
| 25 | [调整直属上级](images/25-%E8%B0%83%E6%95%B4%E7%9B%B4%E5%B1%9E%E4%B8%8A%E7%BA%A7.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (ChangeSupervisorSheet 防环) |
| 26 | [提交证据材料](images/26-%E6%8F%90%E4%BA%A4%E8%AF%81%E6%8D%AE%E6%9D%90%E6%96%99.png) | T07 | G07 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (SubmitEvidenceSheet) |
| 27 | [证据包详情](images/27-%E8%AF%81%E6%8D%AE%E5%8C%85%E8%AF%A6%E6%83%85.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (EvidencePackageDetail) |
| 28 | [进度与记录](images/28-%E8%BF%9B%E5%BA%A6%E4%B8%8E%E8%AE%B0%E5%BD%95.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (ProgressRecordTimeline) |
| 29 | [委托授权](images/29-%E5%A7%94%E6%89%98%E6%8E%88%E6%9D%83.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (CreateDelegationSheet) |
| 30 | [画布设置](images/30-%E7%94%BB%E5%B8%83%E8%AE%BE%E7%BD%AE.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (CanvasSettingsSheet) |
| 31 | [AI 责任链审计](images/31-AI-%E8%B4%A3%E4%BB%BB%E9%93%BE%E5%AE%A1%E8%AE%A1.png) | T07 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (AxisAuditScreen) |
| 32 | [项目 Wiki](images/32-%E9%A1%B9%E7%9B%AE-Wiki.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/wiki/MobileWikiScreens.tsx (ProjectWikiScreen) |
| 33 | [Wiki 草稿与发布](images/33-Wiki-%E8%8D%89%E7%A8%BF%E4%B8%8E%E5%8F%91%E5%B8%83.png) | T07 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/wiki/MobileWikiScreens.tsx (WikiDraftEditor) |
| 34 | [项目知识搜索](images/34-%E9%A1%B9%E7%9B%AE%E7%9F%A5%E8%AF%86%E6%90%9C%E7%B4%A2.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/wiki/MobileWikiScreens.tsx (KnowledgeSearchScreen) |
| 35 | [项目内 AI 入口](images/35-%E9%A1%B9%E7%9B%AE%E5%86%85-AI-%E5%85%A5%E5%8F%A3.png) | T08 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/MyAgentScreen.tsx (项目内 AI 入口) |
| 36 | [与我的 AI 对话](images/36-%E4%B8%8E%E6%88%91%E7%9A%84-AI-%E5%AF%B9%E8%AF%9D.png) | T08 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/MyAgentScreen.tsx (与我的 AI 对话) |
| 37 | [编辑我的 AI 汇报](images/37-%E7%BC%96%E8%BE%91%E6%88%91%E7%9A%84-AI-%E6%B1%87%E6%8A%A5.png) | T08 | G02、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/MyReportEditor.tsx (编辑我的 AI 汇报) |
| 38 | [汇报提交与送达](images/38-%E6%B1%87%E6%8A%A5%E6%8F%90%E4%BA%A4%E4%B8%8E%E9%80%81%E8%BE%BE.png) | T08 | G01 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ReportDetailScreen.tsx (汇报提交与送达) |
| 39 | [汇报历史与版本](images/39-%E6%B1%87%E6%8A%A5%E5%8E%86%E5%8F%B2%E4%B8%8E%E7%89%88%E6%9C%AC.png) | T08 | G02 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ReportDetailScreen.tsx (汇报历史与版本) |
| 40 | [下属汇报收件箱](images/40-%E4%B8%8B%E5%B1%9E%E6%B1%87%E6%8A%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.png) | T09 | G01、G06 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ManagerReportInbox.tsx (下属汇报收件箱) |
| 41 | [项目资料对照](images/41-%E9%A1%B9%E7%9B%AE%E8%B5%84%E6%96%99%E5%AF%B9%E7%85%A7.png) | T09 | G05 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ProjectReportScreen.tsx (项目资料对照) |
| 42 | [项目汇总与发布](images/42-%E9%A1%B9%E7%9B%AE%E6%B1%87%E6%80%BB%E4%B8%8E%E5%8F%91%E5%B8%83.png) | T09 | G03 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ProjectReportScreen.tsx (项目汇总与发布) |
| 43 | [总领导项目总览](images/43-%E6%80%BB%E9%A2%86%E5%AF%BC%E9%A1%B9%E7%9B%AE%E6%80%BB%E8%A7%88.png) | T09 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/LeadershipReportScreen.tsx (总领导项目总览) |
| 44 | [消息会话列表](images/44-%E6%B6%88%E6%81%AF%E4%BC%9A%E8%AF%9D%E5%88%97%E8%A1%A8.png) | T10 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileMessageScreens.tsx (MobileMessageListScreen) |
| 45 | [项目聊天 / 私聊](images/45-%E9%A1%B9%E7%9B%AE%E8%81%8A%E5%A4%A9-%E7%A7%81%E8%81%8A.png) | T10 | G07 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileMessageScreens.tsx (MobileChatDetailScreen) |
| 46 | [语音 / 视频通话](images/46-%E8%AF%AD%E9%9F%B3-%E8%A7%86%E9%A2%91%E9%80%9A%E8%AF%9D.png) | T10 | G07、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileCallScreen.tsx (MobileCallScreen 信令降级) |
| 47 | [会话资料](images/47-%E4%BC%9A%E8%AF%9D%E8%B5%84%E6%96%99.png) | T10 | G07 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileMessageScreens.tsx (MobileConversationProfileScreen) |
| 48 | [通知收件箱](images/48-%E9%80%9A%E7%9F%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.png) | T10 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileInboxScreens.tsx (MobileInboxScreen) |
| 49 | [通知 / 汇报详情](images/49-%E9%80%9A%E7%9F%A5-%E6%B1%87%E6%8A%A5%E8%AF%A6%E6%83%85.png) | T10 | G04 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileInboxScreens.tsx (通知详情与转任务) |
| 50 | [外部邮件](images/50-%E5%A4%96%E9%83%A8%E9%82%AE%E4%BB%B6.png) | T10 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileInboxScreens.tsx (MobileExternalMailView) |
| 51 | [团队与成员](images/51-%E5%9B%A2%E9%98%9F%E4%B8%8E%E6%88%90%E5%91%98.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileTeamScreens.tsx (MobileTeamScreen) |
| 52 | [成员详情与职责](images/52-%E6%88%90%E5%91%98%E8%AF%A6%E6%83%85%E4%B8%8E%E8%81%8C%E8%B4%A3.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileTeamScreens.tsx (MobileMemberDetailScreen) |
| 53 | [我的](images/53-%E6%88%91%E7%9A%84.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileSettingsScreens.tsx (MobileSettingsScreen) |
| 54 | [个人资料](images/54-%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileSettingsScreens.tsx (MobileProfileScreen) |
| 55 | [账号安全](images/55-%E8%B4%A6%E5%8F%B7%E5%AE%89%E5%85%A8.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileSettingsScreens.tsx (MobileSecurityScreen) |
| 56 | [外观与语言](images/56-%E5%A4%96%E8%A7%82%E4%B8%8E%E8%AF%AD%E8%A8%80.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileAppearanceScreen.tsx |
| 57 | [通知与免打扰](images/57-%E9%80%9A%E7%9F%A5%E4%B8%8E%E5%85%8D%E6%89%93%E6%89%B0.png) | T11 | G07 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileNotificationSettingsScreen.tsx |
| 58 | [任务默认值](images/58-%E4%BB%BB%E5%8A%A1%E9%BB%98%E8%AE%A4%E5%80%BC.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileTaskDefaultsScreen.tsx |
| 59 | [通知渠道配置](images/59-%E9%80%9A%E7%9F%A5%E6%B8%A0%E9%81%93%E9%85%8D%E7%BD%AE.png) | T11 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminNotifyChannelsScreen) |
| 60 | [AI 模型与语音配置](images/60-AI-%E6%A8%A1%E5%9E%8B%E4%B8%8E%E8%AF%AD%E9%9F%B3%E9%85%8D%E7%BD%AE.png) | T11 | G08、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminLlmConfigScreen) |
| 61 | [组织与登录集成](images/61-%E7%BB%84%E7%BB%87%E4%B8%8E%E7%99%BB%E5%BD%95%E9%9B%86%E6%88%90.png) | T11 | G08、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminOrgSyncScreen) |
| 62 | [套餐、隐私与帮助](images/62-%E5%A5%97%E9%A4%90%E3%80%81%E9%9A%90%E7%A7%81%E4%B8%8E%E5%B8%AE%E5%8A%A9.png) | T11 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileSettingsScreens.tsx (MobileBillingHelpScreen) |
| 63 | [通知发送记录](images/63-%E9%80%9A%E7%9F%A5%E5%8F%91%E9%80%81%E8%AE%B0%E5%BD%95.png) | T11 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/MobileNotifyRecordsScreen.tsx |
| 64 | [回收站](images/64-%E5%9B%9E%E6%94%B6%E7%AB%99.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/work/MobileWorkScreens.tsx (MobileTrashScreen) |
| 65 | [全局搜索](images/65-%E5%85%A8%E5%B1%80%E6%90%9C%E7%B4%A2.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/work/MobileWorkScreens.tsx (MobileGlobalSearchScreen) |
| 66 | [空状态与首次使用](images/66-%E7%A9%BA%E7%8A%B6%E6%80%81%E4%B8%8E%E9%A6%96%E6%AC%A1%E4%BD%BF%E7%94%A8.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptEmptyScreen) |
| 67 | [断网与启动恢复](images/67-%E6%96%AD%E7%BD%91%E4%B8%8E%E5%90%AF%E5%8A%A8%E6%81%A2%E5%A4%8D.png) | T12 | G09 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptOfflineRecoveryScreen) |
| 68 | [加载失败 / 模型不可用](images/68-%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5-%E6%A8%A1%E5%9E%8B%E4%B8%8D%E5%8F%AF%E7%94%A8.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptLoadErrorScreen) |
| 69 | [权限不足 / 角色变化](images/69-%E6%9D%83%E9%99%90%E4%B8%8D%E8%B6%B3-%E8%A7%92%E8%89%B2%E5%8F%98%E5%8C%96.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptPermissionDeniedScreen) |
| 70 | [删除与高风险操作确认](images/70-%E5%88%A0%E9%99%A4%E4%B8%8E%E9%AB%98%E9%A3%8E%E9%99%A9%E6%93%8D%E4%BD%9C%E7%A1%AE%E8%AE%A4.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptDangerConfirmScreen) |
| 71 | [窄屏适配 · 320](images/71-%E7%AA%84%E5%B1%8F%E9%80%82%E9%85%8D-320.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (窄屏 320px 适配) |
| 72 | [宽屏手机 · 430](images/72-%E5%AE%BD%E5%B1%8F%E6%89%8B%E6%9C%BA-430.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (宽屏 430px 适配) |
| 73 | [系统大字体 · 150%](images/73-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-150-.png) | T12 | G09 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (系统大字体 150%) |
| 74 | [系统大字体 · 200%](images/74-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-200-.png) | T12 | G09 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (系统大字体 200%) |
| 75 | [深色模式](images/75-%E6%B7%B1%E8%89%B2%E6%A8%A1%E5%BC%8F.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (深色模式) |
| 76 | [平板双栏](images/76-%E5%B9%B3%E6%9D%BF%E5%8F%8C%E6%A0%8F.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (平板双栏) |
| 77 | [横屏手机](images/77-%E6%A8%AA%E5%B1%8F%E6%89%8B%E6%9C%BA.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (横屏手机) |
| 78 | [键盘弹出与输入](images/78-%E9%94%AE%E7%9B%98%E5%BC%B9%E5%87%BA%E4%B8%8E%E8%BE%93%E5%85%A5.png) | T12 | G09 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (键盘自适应) |
| 79 | [验证码登录](images/79-%E9%AA%8C%E8%AF%81%E7%A0%81%E7%99%BB%E5%BD%95.png) | T04 | G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/auth/MobileAuthScreens.tsx (mode='login', 验证码) |
| 80 | [创建公司](images/80-%E5%88%9B%E5%BB%BA%E5%85%AC%E5%8F%B8.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileWorkspaceCreateScreen 公司模式) |
| 81 | [接受项目邀请](images/81-%E6%8E%A5%E5%8F%97%E9%A1%B9%E7%9B%AE%E9%82%80%E8%AF%B7.png) | T04 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/projects/MobileProjectScreens.tsx (MobileInviteAcceptScreen) |
| 82 | [日期与重复规则](images/82-%E6%97%A5%E6%9C%9F%E4%B8%8E%E9%87%8D%E5%A4%8D%E8%A7%84%E5%88%99.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileTaskEditScreen RRULE) |
| 83 | [成员、标签与附件选择](images/83-%E6%88%90%E5%91%98%E3%80%81%E6%A0%87%E7%AD%BE%E4%B8%8E%E9%99%84%E4%BB%B6%E9%80%89%E6%8B%A9.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileTaskEditScreen 成员/标签) |
| 84 | [任务操作菜单](images/84-%E4%BB%BB%E5%8A%A1%E6%93%8D%E4%BD%9C%E8%8F%9C%E5%8D%95.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileKanbanScreen 泳道流转与批量) |
| 85 | [周日历](images/85-%E5%91%A8%E6%97%A5%E5%8E%86.png) | T05 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/tasks/MobileTaskScreens.tsx (MobileCalendarScreen 周视图) |
| 86 | [横向责任链](images/86-%E6%A8%AA%E5%90%91%E8%B4%A3%E4%BB%BB%E9%93%BE.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (CanvasHorizontalChain 横向总览) |
| 87 | [节点预览与定位](images/87-%E8%8A%82%E7%82%B9%E9%A2%84%E8%A7%88%E4%B8%8E%E5%AE%9A%E4%BD%8D.png) | T06 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileAxisScreens.tsx (NodePreviewSheet 节点预览) |
| 88 | [授权记录与撤销](images/88-%E6%8E%88%E6%9D%83%E8%AE%B0%E5%BD%95%E4%B8%8E%E6%92%A4%E9%94%80.png) | T07 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/people-axis/MobileEvidenceScreens.tsx (DelegationRevoke / EvidenceQuote) |
| 89 | [频道与会话管理](images/89-%E9%A2%91%E9%81%93%E4%B8%8E%E4%BC%9A%E8%AF%9D%E7%AE%A1%E7%90%86.png) | T10 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileMessageScreens.tsx (频道与单聊分类管理) |
| 90 | [Push 通知设置](images/90-Push-%E9%80%9A%E7%9F%A5%E8%AE%BE%E7%BD%AE.png) | T11 | G07、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (MobileThirdPartyBindingsScreen) |
| 91 | [微信提醒设置](images/91-%E5%BE%AE%E4%BF%A1%E6%8F%90%E9%86%92%E8%AE%BE%E7%BD%AE.png) | T11 | G07、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminPushCertScreen) |
| 92 | [语音识别配置](images/92-%E8%AF%AD%E9%9F%B3%E8%AF%86%E5%88%AB%E9%85%8D%E7%BD%AE.png) | T11 | G08、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminModelKeysScreen) |
| 93 | [文件存储配置](images/93-%E6%96%87%E4%BB%B6%E5%AD%98%E5%82%A8%E9%85%8D%E7%BD%AE.png) | T11 | G08、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminAsrScreen) |
| 94 | [单点登录配置](images/94-%E5%8D%95%E7%82%B9%E7%99%BB%E5%BD%95%E9%85%8D%E7%BD%AE.png) | T11 | G08、G10 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/settings/AdminIntegrationScreens.tsx (AdminSsoScreen) |
| 95 | [项目智能体绑定管理](images/95-%E9%A1%B9%E7%9B%AE%E6%99%BA%E8%83%BD%E4%BD%93%E7%BB%91%E5%AE%9A%E7%AE%A1%E7%90%86.png) | T09 | G01 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ReportReviewScreen.tsx (bindings 模式) |
| 96 | [删除账号确认](images/96-%E5%88%A0%E9%99%A4%E8%B4%A6%E5%8F%B7%E7%A1%AE%E8%AE%A4.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (MobileDeleteAccountScreen) |
| 97 | [启动与同步中](images/97-%E5%90%AF%E5%8A%A8%E4%B8%8E%E5%90%8C%E6%AD%A5%E4%B8%AD.png) | T12 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/adaptation/MobileAdaptationScreens.tsx (AdaptBootstrapSyncScreen) |
| 98 | [通知归档与筛选](images/98-%E9%80%9A%E7%9F%A5%E5%BD%92%E6%A1%A3%E4%B8%8E%E7%AD%9B%E9%80%89.png) | T10 | 常规权限 / API | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/messages/MobileInboxScreens.tsx (MobileInboxScreen 归档筛选) |
| 99 | [待补材料与上级追问](images/99-%E5%BE%85%E8%A1%A5%E6%9D%90%E6%96%99%E4%B8%8E%E4%B8%8A%E7%BA%A7%E8%BF%BD%E9%97%AE.png) | T09 | G04 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ReportReviewScreen.tsx (followup 模式) |
| 100 | [资料差异确认](images/100-%E8%B5%84%E6%96%99%E5%B7%AE%E5%BC%82%E7%A1%AE%E8%AE%A4.png) | T09 | G05 | 已实现 | 已接入 | 待实测 | 待实测 | UI/接口就绪 | 实际组件：mobile/features/reports/ReportReviewScreen.tsx (conflict 模式) |

## 原功能额外保留项

- [x] 原统计报表：趋势、状态分布、团队负载、时间范围；工作 → 统计 (mobile/features/work/MobileStatisticsScreen.tsx)，归 T05。
- [x] 帮助与快捷键：手机帮助入口与桌面键盘操作；我的 → 帮助 (MobileBillingHelpScreen)，归 T05 / T11。
- [x] 原 API / 日期 / 重复任务 / 认证刷新 / 权限语义，归 T13。
- [x] APP 提交 → Web 已读 → 小程序回读的三端契约保持，归 T13。

## 模块交付记录

- T00—T03：基础组件、移动导航独立栈与 Flutter 宿主双向桥接全部交付并通过测试。
- T04—T12：全量 100 张页面 UI 与真实接口接入全部就绪，各模块契约单元测试全绿。
- T13—T15：保留桌面端 10/10 烟雾回归基线；本次 UI 复核完成移动专项 5/5 Playwright、Flutter 28/28、Android debug APK 构建。桌面真实后端 smoke、Android 安装后点击、微信开发者工具和 iOS 真机仍需在对应环境复验。
- 接口缺口明细参见 API-GAPS.md。
- 实施总结参见 IMPLEMENTATION-REPORT.md。

## 2026-10-20 环境验收更新

- [x] 桌面真实后端 smoke：10/10 通过（隔离后端 8012）。
- [x] Android Pixel_9_Pro：Android 15，APK 安装成功，WebView 427×876 / DPR 3。
- [x] Android 移动壳触摸 smoke：5 项通过；证据 `frontend/android-acceptance/test-results/mobile-smoke/`。
- [x] 移动运行时识别、默认项目选择、人轴项目选择器修复并完成 Web lint / contract / build 回归。
- [ ] 微信开发者工具与微信真机。
- [ ] iOS Simulator / iPhone。
- [ ] 真实 LLM、外部推送、摄像头/麦克风。

