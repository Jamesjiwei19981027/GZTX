# FIXUI 第二轮报告（分支 fix/r2-web-ui）

编号｜结果｜改动文件｜测试
- A-02/A-12/WR-09 更新密钥不改厂商｜已修（密钥区只提交 api_key，厂商 id 取后端预设）｜frontend EnterpriseSettingsSections.tsx、enterpriseHelpers.ts、api/notifications.ts｜test-r2-settings.ts；后端 test_update_key_only_keeps_provider_and_model
- A-03/WR-10 组织同步｜已修（后端只在 wecom/dingtalk/feishu/generic 里选，非组织供应商 422；前端 triggerOrgSync 自动带供应商，未改“组织与单点登录”区块）｜backend api/v1/org.py、frontend api/shell.ts｜test_org_sync_ignores_smtp_and_llm_records、test_org_sync_without_org_integration_is_404、pickOrgSyncProvider 用例
- A-05/WR-06/WR-07 发送记录｜已修（成功按 sent；新增 GET /notify/company-records，仅超管，按公司成员过滤；个人接口仍只看自己）｜backend api/v1/notify.py、frontend 记录页与手机记录页｜test_company_notify_records_scope
- WR-11 集成卡片｜已修（按 has_credentials/enabled/last_sync_at，去掉写死“已接入”）；InboxView 的集成列表同口径｜EnterpriseSettingsSections.tsx、InboxView.tsx｜test-r2-settings.ts
- B-03 邀请邮件｜已修（公司发信已配置则发邮件含链接，同时返回 invite_url/email_status；界面写明已发送或手动转发）｜backend api/v1/projects.py、TeamView.tsx、MobileProjectScreens.tsx、api/shell.ts｜test_invitation_sends_email_when_smtp_configured、…_without_smtp_returns_link_only、…_mail_failure_still_returns_link；前端 inviteDeliveryNotice
- A-15 429 提示｜已修｜api/client.ts｜test-r2-mobile-web.ts
- D-7 成员看不到设置齿轮/邀请｜已修（按 my-permissions 的 is_pm/is_superadmin）｜MobileProjectScreens.tsx、projectPermissions.ts｜test-r2-mobile-web.ts（含源码合同）
- D-9 双顶栏｜已修（mobileChrome.ts 列出自带顶栏页面）｜MobileRouteOutlet.tsx、mobileChrome.ts｜同上
- D-8 记录进展返回人轴｜已修（路由归一化：未指定 Tab 时留在当前 Tab）｜mobileRoutes.ts｜同上
- D-10 顶栏搜索｜已修（进入 work-search）｜MobileRouteOutlet.tsx｜同上
- D-5/WR-27 默认优先级｜部分：网页桌面原本已读取 ui.task_default_priority（核实无误）；手机新建任务原写死“中”，已修｜MobileTaskScreens.tsx、MobileRouteOutlet.tsx｜同上
- D-12 保存失败提示｜已修（提示条紧贴保存按钮并滚动到可见）｜MobileTaskScreens.tsx｜同上
- D-13 受邀落地｜已修（受邀注册/接受邀请后手机端进入该项目概览，项目芯片同步）；未真机验证｜App.tsx、MobileRouteOutlet.tsx｜源码合同
- WR-05 头像被旧值覆盖｜已修（本地头像跟随全局，保存资料不再带头像）｜MobileSettingsScreens.tsx｜源码合同
- WR-25 绑定后立即显示｜已修（后端 confirm 返回 email/phone，前端合并）｜backend api/v1/users.py、api/auth.ts、MobileSettingsScreens.tsx｜test_verification.py 增加断言；withBoundTarget
- WR-46 消息分页｜已修：手机聊天（按钮或滚到顶部加载更早）、桌面 MessagesView（按钮）｜shell.ts、MobileMessageScreens.tsx、MessagesView.tsx、messagePaging.ts｜messagePaging 单测
- WR-50 通知分页｜已修：手机收件箱、网页收件箱、通知中心按后端 total 加载更多｜MobileInboxScreens.tsx、InboxView.tsx、NotificationsModal.tsx｜单测+源码合同
- WR-47 手机聊天附件｜已修（气泡内显示，fetch+Authorization 生成 blob 下载）｜MobileMessageScreens.tsx｜单测+源码合同
- C-8 收件箱中文化｜已修（含来源键名转中文）；同步更新旧合同测试 test-calls-mail-contract.ts 的“configuration”为“配置”｜InboxView.tsx、inboxText.ts｜test-r2-mobile-web.ts

说明：D-13、聊天滚动加载、下载等为代码与源码合同验证，未在浏览器实测。

## 门禁
- 后端全量：6 failed, 592 passed。6 个失败均为 Wiki 引擎未安装（需在 backend/wiki-engine 执行 npm ci && npm run build），属环境问题，与本次改动无关（test_project_llm_wiki 4 个、test_project_wiki_engine 2 个）。
- 前端 lint：通过；npm test：全部通过。
