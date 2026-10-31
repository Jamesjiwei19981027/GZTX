# APP V2 全量页面设计审核

版本：V2-20261019-R1。状态：**视觉基准已获用户批准，实施与设备验收尚未完成**。

## 实施交接

用户已授权 Gemini 实现，并增加 iOS 风格优化。先阅读 [Gemini 实施入口](GEMINI-HANDOFF.md)、[完整计划](../../superpowers/plans/2026-10-19-app-v2-ui-gemini.md)、[iOS 补充规范](IOS-ADAPTATION.md) 与 [逐页跟踪表](IMPLEMENTATION-TRACKER.md)。用户批准的是视觉与流程方向，未实现的接口能力和未执行的设备测试仍需分别核实。

## 审核入口

打开 index.html；点击任意设计图逐页查看。每页对应 images/ 下独立 PNG，并可通过静态页面查看完整滚动内容。审核意见只保存在当前浏览器，请使用“导出审核意见”交给开发。

共 100 张页面 / 状态图，按现有 Web 壳、Flutter 原生入口与 full-feature-inventory.md 的功能拆分；不是声称当前已有 100 个独立路由。未实现能力及拟补齐交互在页面备注中标出。

## 本轮范围

仅重设计 APP 的页面结构、交互与适配；桌面 Web 不在本轮图片范围内。保留任务、项目、人轴、材料、AI、逐级汇报、通知、协作、设置等功能。APP、Web、小程序的身份、权限和状态继续共用后端。

- 人轴决定人员、岗位、责任、上下级；AI 辅助整理与汇报。
- 每个项目的对话、材料、智能体上下文隔离。总领导接收项目摘要封装。
- 汇报送达、已读、领导 AI 接收、项目汇总分别展示；缺失状态须补实际后端能力。
- 所有图使用示例数据，不代表真实测试结果、真实模型生成、真实推送送达或生产权限。
- 这些是设计页，尚未接入业务 API；原页面所有操作的可用性仍需实现后逐项验收。

## 统一视觉规范

- 品牌主色 #0058BE；浅灰背景、白色内容区、少量语义色。
- 正文基准 16px，主要内容 15–16px，辅助信息 12–13px，页面标题 22px。最终 APP 使用对应逻辑尺寸，并遵从系统字体设置。
- 主要图标基准 22px，同一组 Lucide 轮廓图标，统一粗细；点击目标至少 48px。图标不依赖文字连字字体，避免字库缺失时露出英文名称。
- 统一内容边距 16px、卡片圆角 14px；顶部只保留当前项目 / 页面标题与必要操作；底部五项为 工作、人轴、AI、消息、我的。
- 长表单自然滚动，不把整个页面缩小塞进一屏；主要按钮允许换行和增高。
- 71—78 展示窄屏、宽屏、大字体、深色、平板、横屏与键盘设计。大字体是 token 模拟，系统联动需要实际 APP 验证。

## 生成方式

首页方向参考使用内置 imagegen；提示词见 imagegen-prompt.txt，参考图为 concept-employee-home.png。编号图使用静态 HTML/CSS 和共享 SVG 图标绘制，通过 Playwright 导出，以确保中文、按钮和尺寸一致。build-review.cjs 只生成本目录审核资料，不修改 APP 业务代码。

重建：node build-review.cjs；导出与检查：node export-review.cjs。

## 页面来源目录

### 认证与工作区

- **01 登录**：LoginGate。账号/验证码是同页切换；找回密码帮助须按现有服务能力展示，不能虚构可用的重置链路。 [图片](images/01-%E7%99%BB%E5%BD%95.png) · [静态页](screens/01-%E7%99%BB%E5%BD%95.html)
- **02 注册账号**：RegisterGate。移动端重新组织现有功能。 [图片](images/02-%E6%B3%A8%E5%86%8C%E8%B4%A6%E5%8F%B7.png) · [静态页](screens/02-%E6%B3%A8%E5%86%8C%E8%B4%A6%E5%8F%B7.html)
- **03 验证工作邮箱**：VerifyGate。移动端重新组织现有功能。 [图片](images/03-%E9%AA%8C%E8%AF%81%E5%B7%A5%E4%BD%9C%E9%82%AE%E7%AE%B1.png) · [静态页](screens/03-%E9%AA%8C%E8%AF%81%E5%B7%A5%E4%BD%9C%E9%82%AE%E7%AE%B1.html)
- **04 验证手机号**：手机验证弹层。手机号验证承接原操作；不丢失邀请或工作区创建草稿。 [图片](images/04-%E9%AA%8C%E8%AF%81%E6%89%8B%E6%9C%BA%E5%8F%B7.png) · [静态页](screens/04-%E9%AA%8C%E8%AF%81%E6%89%8B%E6%9C%BA%E5%8F%B7.html)
- **07 切换项目**：Navbar 项目选择器。“全部项目”只做个人任务总览；不能把多项目原始 AI 上下文合并。 [图片](images/07-%E5%88%87%E6%8D%A2%E9%A1%B9%E7%9B%AE.png) · [静态页](screens/07-%E5%88%87%E6%8D%A2%E9%A1%B9%E7%9B%AE.html)
- **08 创建工作区**：WorkspaceSetupModal。公司创建使用同一页面的模式切换；按当前许可与手机验证状态显示阻断原因。 [图片](images/08-%E5%88%9B%E5%BB%BA%E5%B7%A5%E4%BD%9C%E5%8C%BA.png) · [静态页](screens/08-%E5%88%9B%E5%BB%BA%E5%B7%A5%E4%BD%9C%E5%8C%BA.html)
- **79 验证码登录**：LoginGate 验证码模式。移动端重新组织现有功能。 [图片](images/79-%E9%AA%8C%E8%AF%81%E7%A0%81%E7%99%BB%E5%BD%95.png) · [静态页](screens/79-%E9%AA%8C%E8%AF%81%E7%A0%81%E7%99%BB%E5%BD%95.html)
- **80 创建公司**：WorkspaceSetupModal 公司模式。暂存为拟补齐能力；创建所需字段和许可按服务端要求对齐。 [图片](images/80-%E5%88%9B%E5%BB%BA%E5%85%AC%E5%8F%B8.png) · [静态页](screens/80-%E5%88%9B%E5%BB%BA%E5%85%AC%E5%8F%B8.html)

### 工作

- **05 员工工作台**：Dashboard。移动端重新组织现有功能。 [图片](images/05-%E5%91%98%E5%B7%A5%E5%B7%A5%E4%BD%9C%E5%8F%B0.png) · [静态页](screens/05-%E5%91%98%E5%B7%A5%E5%B7%A5%E4%BD%9C%E5%8F%B0.html)
- **06 管理者工作台**：Dashboard + ReportsView。按角色排序内容；管理者仍可进入自己的任务和个人汇报。 [图片](images/06-%E7%AE%A1%E7%90%86%E8%80%85%E5%B7%A5%E4%BD%9C%E5%8F%B0.png) · [静态页](screens/06-%E7%AE%A1%E7%90%86%E8%80%85%E5%B7%A5%E4%BD%9C%E5%8F%B0.html)
- **65 全局搜索**：GlobalSearchModal。当前全局任务/项目搜索与项目知识搜索是不同入口；后者按项目权限过滤。 [图片](images/65-%E5%85%A8%E5%B1%80%E6%90%9C%E7%B4%A2.png) · [静态页](screens/65-%E5%85%A8%E5%B1%80%E6%90%9C%E7%B4%A2.html)

### 项目

- **09 项目概览**：项目选择 + ProjectDetailScreen。移动端重新组织现有功能。 [图片](images/09-%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88.png) · [静态页](screens/09-%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88.html)
- **10 项目设置**：项目配置 + CompanySettingsScreen。仅对有管理权限的用户显示写操作；归档需要二次确认。 [图片](images/10-%E9%A1%B9%E7%9B%AE%E8%AE%BE%E7%BD%AE.png) · [静态页](screens/10-%E9%A1%B9%E7%9B%AE%E8%AE%BE%E7%BD%AE.html)
- **11 成员邀请**：TeamView + 项目邀请。复制、撤销邀请与接受邀请的状态均保留；不把复制链接当成自动发送。 [图片](images/11-%E6%88%90%E5%91%98%E9%82%80%E8%AF%B7.png) · [静态页](screens/11-%E6%88%90%E5%91%98%E9%82%80%E8%AF%B7.html)
- **51 团队与成员**：TeamView。移动端重新组织现有功能。 [图片](images/51-%E5%9B%A2%E9%98%9F%E4%B8%8E%E6%88%90%E5%91%98.png) · [静态页](screens/51-%E5%9B%A2%E9%98%9F%E4%B8%8E%E6%88%90%E5%91%98.html)
- **52 成员详情与职责**：TeamView 成员 / 人轴关联。资料、材料与汇报按人轴和项目读权限展示，不能因为进入成员名片而扩大权限。 [图片](images/52-%E6%88%90%E5%91%98%E8%AF%A6%E6%83%85%E4%B8%8E%E8%81%8C%E8%B4%A3.png) · [静态页](screens/52-%E6%88%90%E5%91%98%E8%AF%A6%E6%83%85%E4%B8%8E%E8%81%8C%E8%B4%A3.html)
- **81 接受项目邀请**：项目 invite accept。失效、已接受、账号不符与需要手机验证各有明确反馈。 [图片](images/81-%E6%8E%A5%E5%8F%97%E9%A1%B9%E7%9B%AE%E9%82%80%E8%AF%B7.png) · [静态页](screens/81-%E6%8E%A5%E5%8F%97%E9%A1%B9%E7%9B%AE%E9%82%80%E8%AF%B7.html)

### 任务

- **12 我的任务**：MyTasksView。移动端重新组织现有功能。 [图片](images/12-%E6%88%91%E7%9A%84%E4%BB%BB%E5%8A%A1.png) · [静态页](screens/12-%E6%88%91%E7%9A%84%E4%BB%BB%E5%8A%A1.html)
- **13 任务筛选与批量操作**：MyTasksView 筛选 / 批量。批量顺延日期选择、部分失败与删除撤销均为必要交互状态。 [图片](images/13-%E4%BB%BB%E5%8A%A1%E7%AD%9B%E9%80%89%E4%B8%8E%E6%89%B9%E9%87%8F%E6%93%8D%E4%BD%9C.png) · [静态页](screens/13-%E4%BB%BB%E5%8A%A1%E7%AD%9B%E9%80%89%E4%B8%8E%E6%89%B9%E9%87%8F%E6%93%8D%E4%BD%9C.html)
- **14 任务详情**：TaskDetailDrawer → 移动详情页。关联人轴生成的只读任务要显示来源与“前往责任节点”，不显示可写完成按钮。 [图片](images/14-%E4%BB%BB%E5%8A%A1%E8%AF%A6%E6%83%85.png) · [静态页](screens/14-%E4%BB%BB%E5%8A%A1%E8%AF%A6%E6%83%85.html)
- **15 新建 / 编辑任务**：NewTaskModal。编辑模式复用表单；字段包含状态、分类、标签、重复、附件、分配清空。 [图片](images/15-%E6%96%B0%E5%BB%BA-%E7%BC%96%E8%BE%91%E4%BB%BB%E5%8A%A1.png) · [静态页](screens/15-%E6%96%B0%E5%BB%BA-%E7%BC%96%E8%BE%91%E4%BB%BB%E5%8A%A1.html)
- **16 快速添加**：QuickAddModal。移动端重新组织现有功能。 [图片](images/16-%E5%BF%AB%E9%80%9F%E6%B7%BB%E5%8A%A0.png) · [静态页](screens/16-%E5%BF%AB%E9%80%9F%E6%B7%BB%E5%8A%A0.html)
- **17 从聊天提取任务**：NewTaskModal 聊天提取。模型不可用时必须显示原因，保留原文；草稿不自动变成已创建任务。 [图片](images/17-%E4%BB%8E%E8%81%8A%E5%A4%A9%E6%8F%90%E5%8F%96%E4%BB%BB%E5%8A%A1.png) · [静态页](screens/17-%E4%BB%8E%E8%81%8A%E5%A4%A9%E6%8F%90%E5%8F%96%E4%BB%BB%E5%8A%A1.html)
- **18 项目看板**：KanbanView。移动端重新组织现有功能。 [图片](images/18-%E9%A1%B9%E7%9B%AE%E7%9C%8B%E6%9D%BF.png) · [静态页](screens/18-%E9%A1%B9%E7%9B%AE%E7%9C%8B%E6%9D%BF.html)
- **19 日历与日程**：CalendarView。移动端重新组织现有功能。 [图片](images/19-%E6%97%A5%E5%8E%86%E4%B8%8E%E6%97%A5%E7%A8%8B.png) · [静态页](screens/19-%E6%97%A5%E5%8E%86%E4%B8%8E%E6%97%A5%E7%A8%8B.html)
- **64 回收站**：TrashView。移动端重新组织现有功能。 [图片](images/64-%E5%9B%9E%E6%94%B6%E7%AB%99.png) · [静态页](screens/64-%E5%9B%9E%E6%94%B6%E7%AB%99.html)
- **82 日期与重复规则**：NewTaskModal 日期 / RRULE。移动端重新组织现有功能。 [图片](images/82-%E6%97%A5%E6%9C%9F%E4%B8%8E%E9%87%8D%E5%A4%8D%E8%A7%84%E5%88%99.png) · [静态页](screens/82-%E6%97%A5%E6%9C%9F%E4%B8%8E%E9%87%8D%E5%A4%8D%E8%A7%84%E5%88%99.html)
- **83 成员、标签与附件选择**：NewTaskModal 分配 / 标签 / 附件。多选成员不得超出当前项目；标签输入和上传错误保留原选择。 [图片](images/83-%E6%88%90%E5%91%98%E3%80%81%E6%A0%87%E7%AD%BE%E4%B8%8E%E9%99%84%E4%BB%B6%E9%80%89%E6%8B%A9.png) · [静态页](screens/83-%E6%88%90%E5%91%98%E3%80%81%E6%A0%87%E7%AD%BE%E4%B8%8E%E9%99%84%E4%BB%B6%E9%80%89%E6%8B%A9.html)
- **84 任务操作菜单**：Kanban 卡片 / 任务更多菜单。不可写的责任关联任务仅保留符合权限的查看与跳转操作。 [图片](images/84-%E4%BB%BB%E5%8A%A1%E6%93%8D%E4%BD%9C%E8%8F%9C%E5%8D%95.png) · [静态页](screens/84-%E4%BB%BB%E5%8A%A1%E6%93%8D%E4%BD%9C%E8%8F%9C%E5%8D%95.html)
- **85 周日历**：CalendarView week。移动端重新组织现有功能。 [图片](images/85-%E5%91%A8%E6%97%A5%E5%8E%86.png) · [静态页](screens/85-%E5%91%A8%E6%97%A5%E5%8E%86.html)

### 人轴

- **20 我的责任链**：PeopleAxisView 我的职责。人轴节点同时展示人和项目内 AI 的汇报状态；点击状态进入报告，不改变责任关系。 [图片](images/20-%E6%88%91%E7%9A%84%E8%B4%A3%E4%BB%BB%E9%93%BE.png) · [静态页](screens/20-%E6%88%91%E7%9A%84%E8%B4%A3%E4%BB%BB%E9%93%BE.html)
- **21 项目全貌**：PeopleAxisView 总览画布。画布可缩放；横向布局是同一功能的显示模式。默认页面不可整体横向溢出。 [图片](images/21-%E9%A1%B9%E7%9B%AE%E5%85%A8%E8%B2%8C.png) · [静态页](screens/21-%E9%A1%B9%E7%9B%AE%E5%85%A8%E8%B2%8C.html)
- **22 人员 / 责任节点详情**：ResponsibilityWorkspace 节点详情。移动端重新组织现有功能。 [图片](images/22-%E4%BA%BA%E5%91%98-%E8%B4%A3%E4%BB%BB%E8%8A%82%E7%82%B9%E8%AF%A6%E6%83%85.png) · [静态页](screens/22-%E4%BA%BA%E5%91%98-%E8%B4%A3%E4%BB%BB%E8%8A%82%E7%82%B9%E8%AF%A6%E6%83%85.html)
- **23 新增 / 编辑人员**：EditResponsibilityPerson。移动端重新组织现有功能。 [图片](images/23-%E6%96%B0%E5%A2%9E-%E7%BC%96%E8%BE%91%E4%BA%BA%E5%91%98.png) · [静态页](screens/23-%E6%96%B0%E5%A2%9E-%E7%BC%96%E8%BE%91%E4%BA%BA%E5%91%98.html)
- **24 节点权限**：ResponsibilityPermissionFields。每个权限项均须与实际后端 ACL 字段逐项对齐；无权操作显示解释。 [图片](images/24-%E8%8A%82%E7%82%B9%E6%9D%83%E9%99%90.png) · [静态页](screens/24-%E8%8A%82%E7%82%B9%E6%9D%83%E9%99%90.html)
- **25 调整直属上级**：PeopleAxis 调整上级 / move。自身、后代节点及跨项目节点不可选，防止循环和越界。 [图片](images/25-%E8%B0%83%E6%95%B4%E7%9B%B4%E5%B1%9E%E4%B8%8A%E7%BA%A7.png) · [静态页](screens/25-%E8%B0%83%E6%95%B4%E7%9B%B4%E5%B1%9E%E4%B8%8A%E7%BA%A7.html)
- **26 提交证据材料**：节点证据提交。拍照能力若尚未实现，不在审核图中伪装成已可用入口。 [图片](images/26-%E6%8F%90%E4%BA%A4%E8%AF%81%E6%8D%AE%E6%9D%90%E6%96%99.png) · [静态页](screens/26-%E6%8F%90%E4%BA%A4%E8%AF%81%E6%8D%AE%E6%9D%90%E6%96%99.html)
- **27 证据包详情**：EvidencePackage 详情。移动端重新组织现有功能。 [图片](images/27-%E8%AF%81%E6%8D%AE%E5%8C%85%E8%AF%A6%E6%83%85.png) · [静态页](screens/27-%E8%AF%81%E6%8D%AE%E5%8C%85%E8%AF%A6%E6%83%85.html)
- **28 进度与记录**：ProgressRecord。当前代码中缺失写入口的进度能力，不凭设计图声称已经实现。 [图片](images/28-%E8%BF%9B%E5%BA%A6%E4%B8%8E%E8%AE%B0%E5%BD%95.png) · [静态页](screens/28-%E8%BF%9B%E5%BA%A6%E4%B8%8E%E8%AE%B0%E5%BD%95.html)
- **29 委托授权**：Delegation 弹层。动作集合由后端支持项生成；到期、撤销后即时失效。 [图片](images/29-%E5%A7%94%E6%89%98%E6%8E%88%E6%9D%83.png) · [静态页](screens/29-%E5%A7%94%E6%89%98%E6%8E%88%E6%9D%83.html)
- **30 画布设置**：PeopleAxis 画布设置。移动端重新组织现有功能。 [图片](images/30-%E7%94%BB%E5%B8%83%E8%AE%BE%E7%BD%AE.png) · [静态页](screens/30-%E7%94%BB%E5%B8%83%E8%AE%BE%E7%BD%AE.html)
- **31 AI 责任链审计**：axis-audit 后台任务。包括排队、运行中、失败可重试；模型不可用时显示明确原因。 [图片](images/31-AI-%E8%B4%A3%E4%BB%BB%E9%93%BE%E5%AE%A1%E8%AE%A1.png) · [静态页](screens/31-AI-%E8%B4%A3%E4%BB%BB%E9%93%BE%E5%AE%A1%E8%AE%A1.html)
- **86 横向责任链**：PeopleAxis 横向总览。横向画布缩放后标签保有可读下限；小屏可切换列表视图查看完整关系。 [图片](images/86-%E6%A8%AA%E5%90%91%E8%B4%A3%E4%BB%BB%E9%93%BE.png) · [静态页](screens/86-%E6%A8%AA%E5%90%91%E8%B4%A3%E4%BB%BB%E9%93%BE.html)
- **87 节点预览与定位**：PeopleAxis 节点预览。移动端重新组织现有功能。 [图片](images/87-%E8%8A%82%E7%82%B9%E9%A2%84%E8%A7%88%E4%B8%8E%E5%AE%9A%E4%BD%8D.png) · [静态页](screens/87-%E8%8A%82%E7%82%B9%E9%A2%84%E8%A7%88%E4%B8%8E%E5%AE%9A%E4%BD%8D.html)
- **88 授权记录与撤销**：Delegation list / revoke。移动端重新组织现有功能。 [图片](images/88-%E6%8E%88%E6%9D%83%E8%AE%B0%E5%BD%95%E4%B8%8E%E6%92%A4%E9%94%80.png) · [静态页](screens/88-%E6%8E%88%E6%9D%83%E8%AE%B0%E5%BD%95%E4%B8%8E%E6%92%A4%E9%94%80.html)

### 项目资料

- **32 项目 Wiki**：ProjectWikiPanel。未配置真实模型时禁止生成看似成功的虚构 Wiki。 [图片](images/32-%E9%A1%B9%E7%9B%AE-Wiki.png) · [静态页](screens/32-%E9%A1%B9%E7%9B%AE-Wiki.html)
- **33 Wiki 草稿与发布**：Wiki drafts / publish。移动端重新组织现有功能。 [图片](images/33-Wiki-%E8%8D%89%E7%A8%BF%E4%B8%8E%E5%8F%91%E5%B8%83.png) · [静态页](screens/33-Wiki-%E8%8D%89%E7%A8%BF%E4%B8%8E%E5%8F%91%E5%B8%83.html)
- **34 项目知识搜索**：knowledge/search。移动端重新组织现有功能。 [图片](images/34-%E9%A1%B9%E7%9B%AE%E7%9F%A5%E8%AF%86%E6%90%9C%E7%B4%A2.png) · [静态页](screens/34-%E9%A1%B9%E7%9B%AE%E7%9F%A5%E8%AF%86%E6%90%9C%E7%B4%A2.html)

### AI 与汇报

- **35 项目内 AI 入口**：Agent 列表 + 汇报入口。普通成员隐藏无权访问的管理入口；项目角色通过服务端权限判定。 [图片](images/35-%E9%A1%B9%E7%9B%AE%E5%86%85-AI-%E5%85%A5%E5%8F%A3.png) · [静态页](screens/35-%E9%A1%B9%E7%9B%AE%E5%86%85-AI-%E5%85%A5%E5%8F%A3.html)
- **36 与我的 AI 对话**：AgentChatScreen。语音输入依赖 ASR 与授权，未配置时提供文字输入并解释原因；报告提交前可编辑确认。 [图片](images/36-%E4%B8%8E%E6%88%91%E7%9A%84-AI-%E5%AF%B9%E8%AF%9D.png) · [静态页](screens/36-%E4%B8%8E%E6%88%91%E7%9A%84-AI-%E5%AF%B9%E8%AF%9D.html)
- **37 编辑我的 AI 汇报**：ReportsView 个人草稿。手动编辑保留；来源不足时明确不确定。生成、保存和正式提交是不同状态。 [图片](images/37-%E7%BC%96%E8%BE%91%E6%88%91%E7%9A%84-AI-%E6%B1%87%E6%8A%A5.png) · [静态页](screens/37-%E7%BC%96%E8%BE%91%E6%88%91%E7%9A%84-AI-%E6%B1%87%E6%8A%A5.html)
- **38 汇报提交与送达**：提交确认 / 消息路由状态。送达、已读、AI 接收、汇总分别按真实服务端状态展示，不用一个“成功”替代所有步骤。 [图片](images/38-%E6%B1%87%E6%8A%A5%E6%8F%90%E4%BA%A4%E4%B8%8E%E9%80%81%E8%BE%BE.png) · [静态页](screens/38-%E6%B1%87%E6%8A%A5%E6%8F%90%E4%BA%A4%E4%B8%8E%E9%80%81%E8%BE%BE.html)
- **39 汇报历史与版本**：ReportsView 列表 / report detail。移动端重新组织现有功能。 [图片](images/39-%E6%B1%87%E6%8A%A5%E5%8E%86%E5%8F%B2%E4%B8%8E%E7%89%88%E6%9C%AC.png) · [静态页](screens/39-%E6%B1%87%E6%8A%A5%E5%8E%86%E5%8F%B2%E4%B8%8E%E7%89%88%E6%9C%AC.html)
- **40 下属汇报收件箱**：ReportsView 管理者收件箱。“全部下属”覆盖授权下属树；缺失、过期、风险筛选是拟完善的审核项，不能与已实现状态混淆。 [图片](images/40-%E4%B8%8B%E5%B1%9E%E6%B1%87%E6%8A%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.png) · [静态页](screens/40-%E4%B8%8B%E5%B1%9E%E6%B1%87%E6%8A%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.html)
- **41 项目资料对照**：项目汇总 task_snapshot / conflicts。差异确认页是移动端拟拆分设计；确认不自动修改任务完成状态。 [图片](images/41-%E9%A1%B9%E7%9B%AE%E8%B5%84%E6%96%99%E5%AF%B9%E7%85%A7.png) · [静态页](screens/41-%E9%A1%B9%E7%9B%AE%E8%B5%84%E6%96%99%E5%AF%B9%E7%85%A7.html)
- **42 项目汇总与发布**：project_report_envelope。草稿、确认、项目封装的边界需要在实现时补齐；此处为待审核流程。 [图片](images/42-%E9%A1%B9%E7%9B%AE%E6%B1%87%E6%80%BB%E4%B8%8E%E5%8F%91%E5%B8%83.png) · [静态页](screens/42-%E9%A1%B9%E7%9B%AE%E6%B1%87%E6%80%BB%E4%B8%8E%E5%8F%91%E5%B8%83.html)
- **43 总领导项目总览**：leadership-reports aggregate。只对组织总领导开放；项目卡片按实际授权和最新封装生成。 [图片](images/43-%E6%80%BB%E9%A2%86%E5%AF%BC%E9%A1%B9%E7%9B%AE%E6%80%BB%E8%A7%88.png) · [静态页](screens/43-%E6%80%BB%E9%A2%86%E5%AF%BC%E9%A1%B9%E7%9B%AE%E6%80%BB%E8%A7%88.html)
- **95 项目智能体绑定管理**：report-agents bindings。项目 A 与 B 中的同一用户拥有不同上下文绑定；同步结果显示实际数量与错误。 [图片](images/95-%E9%A1%B9%E7%9B%AE%E6%99%BA%E8%83%BD%E4%BD%93%E7%BB%91%E5%AE%9A%E7%AE%A1%E7%90%86.png) · [静态页](screens/95-%E9%A1%B9%E7%9B%AE%E6%99%BA%E8%83%BD%E4%BD%93%E7%BB%91%E5%AE%9A%E7%AE%A1%E7%90%86.html)
- **99 待补材料与上级追问**：report missing / follow-up 提案。追问与缺失材料状态是本轮待补齐设计；实现时需要消息类型、收件箱和审计完整支持。 [图片](images/99-%E5%BE%85%E8%A1%A5%E6%9D%90%E6%96%99%E4%B8%8E%E4%B8%8A%E7%BA%A7%E8%BF%BD%E9%97%AE.png) · [静态页](screens/99-%E5%BE%85%E8%A1%A5%E6%9D%90%E6%96%99%E4%B8%8E%E4%B8%8A%E7%BA%A7%E8%BF%BD%E9%97%AE.html)
- **100 资料差异确认**：report_conflict 确认提案。此为待审核补齐流程；实现需增加差异确认记录及权限校验，不能靠前端状态伪装闭环。 [图片](images/100-%E8%B5%84%E6%96%99%E5%B7%AE%E5%BC%82%E7%A1%AE%E8%AE%A4.png) · [静态页](screens/100-%E8%B5%84%E6%96%99%E5%B7%AE%E5%BC%82%E7%A1%AE%E8%AE%A4.html)

### 消息

- **44 消息会话列表**：MessagesView。移动端重新组织现有功能。 [图片](images/44-%E6%B6%88%E6%81%AF%E4%BC%9A%E8%AF%9D%E5%88%97%E8%A1%A8.png) · [静态页](screens/44-%E6%B6%88%E6%81%AF%E4%BC%9A%E8%AF%9D%E5%88%97%E8%A1%A8.html)
- **45 项目聊天 / 私聊**：MessagesView channel / conversation。移动端重新组织现有功能。 [图片](images/45-%E9%A1%B9%E7%9B%AE%E8%81%8A%E5%A4%A9-%E7%A7%81%E8%81%8A.png) · [静态页](screens/45-%E9%A1%B9%E7%9B%AE%E8%81%8A%E5%A4%A9-%E7%A7%81%E8%81%8A.html)
- **46 语音 / 视频通话**：Calls 信令与通话控件。通话依赖真实设备权限、HTTPS、ICE/TURN；设计图不代表服务验收通过。 [图片](images/46-%E8%AF%AD%E9%9F%B3-%E8%A7%86%E9%A2%91%E9%80%9A%E8%AF%9D.png) · [静态页](screens/46-%E8%AF%AD%E9%9F%B3-%E8%A7%86%E9%A2%91%E9%80%9A%E8%AF%9D.html)
- **47 会话资料**：MessagesView 右侧资料栏。移动端重新组织现有功能。 [图片](images/47-%E4%BC%9A%E8%AF%9D%E8%B5%84%E6%96%99.png) · [静态页](screens/47-%E4%BC%9A%E8%AF%9D%E8%B5%84%E6%96%99.html)
- **48 通知收件箱**：InboxView + NotificationsModal。移动端重新组织现有功能。 [图片](images/48-%E9%80%9A%E7%9F%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.png) · [静态页](screens/48-%E9%80%9A%E7%9F%A5%E6%94%B6%E4%BB%B6%E7%AE%B1.html)
- **49 通知 / 汇报详情**：InboxView 通知详情与快捷回复。追问能力按实现阶段标注；输入回复不等于自动发往外部邮件。 [图片](images/49-%E9%80%9A%E7%9F%A5-%E6%B1%87%E6%8A%A5%E8%AF%A6%E6%83%85.png) · [静态页](screens/49-%E9%80%9A%E7%9F%A5-%E6%B1%87%E6%8A%A5%E8%AF%A6%E6%83%85.html)
- **50 外部邮件**：InboxView external-mail。同步、搜索、归档、删除和恢复均保留；转任务必须经过草稿确认。 [图片](images/50-%E5%A4%96%E9%83%A8%E9%82%AE%E4%BB%B6.png) · [静态页](screens/50-%E5%A4%96%E9%83%A8%E9%82%AE%E4%BB%B6.html)
- **89 频道与会话管理**：MessagesView create / rename / archive。创建、重命名、成员邀请、归档和固定链接按实际频道 API 权限控制。 [图片](images/89-%E9%A2%91%E9%81%93%E4%B8%8E%E4%BC%9A%E8%AF%9D%E7%AE%A1%E7%90%86.png) · [静态页](screens/89-%E9%A2%91%E9%81%93%E4%B8%8E%E4%BC%9A%E8%AF%9D%E7%AE%A1%E7%90%86.html)
- **98 通知归档与筛选**：InboxView archived / deleted / filters。移动端重新组织现有功能。 [图片](images/98-%E9%80%9A%E7%9F%A5%E5%BD%92%E6%A1%A3%E4%B8%8E%E7%AD%9B%E9%80%89.png) · [静态页](screens/98-%E9%80%9A%E7%9F%A5%E5%BD%92%E6%A1%A3%E4%B8%8E%E7%AD%9B%E9%80%89.html)

### 我的与设置

- **53 我的**：SettingsView 入口重组。移动端重新组织现有功能。 [图片](images/53-%E6%88%91%E7%9A%84.png) · [静态页](screens/53-%E6%88%91%E7%9A%84.html)
- **54 个人资料**：SettingsView profile。头像支持格式和大小按实际上传接口限制；保留错误重试与保存状态。 [图片](images/54-%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.png) · [静态页](screens/54-%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.html)
- **55 账号安全**：SettingsView security。移动端重新组织现有功能。 [图片](images/55-%E8%B4%A6%E5%8F%B7%E5%AE%89%E5%85%A8.png) · [静态页](screens/55-%E8%B4%A6%E5%8F%B7%E5%AE%89%E5%85%A8.html)
- **56 外观与语言**：SettingsView appearance。跟随系统和字体桥接是拟完善能力；不得只限制缩放来掩盖溢出。 [图片](images/56-%E5%A4%96%E8%A7%82%E4%B8%8E%E8%AF%AD%E8%A8%80.png) · [静态页](screens/56-%E5%A4%96%E8%A7%82%E4%B8%8E%E8%AF%AD%E8%A8%80.html)
- **57 通知与免打扰**：SettingsView notifications。移动端重新组织现有功能。 [图片](images/57-%E9%80%9A%E7%9F%A5%E4%B8%8E%E5%85%8D%E6%89%93%E6%89%B0.png) · [静态页](screens/57-%E9%80%9A%E7%9F%A5%E4%B8%8E%E5%85%8D%E6%89%93%E6%89%B0.html)
- **58 任务默认值**：SettingsView defaults。移动端重新组织现有功能。 [图片](images/58-%E4%BB%BB%E5%8A%A1%E9%BB%98%E8%AE%A4%E5%80%BC.png) · [静态页](screens/58-%E4%BB%BB%E5%8A%A1%E9%BB%98%E8%AE%A4%E5%80%BC.html)
- **59 通知渠道配置**：NotificationSettingsView SMTP / Push / 微信。仅向有权限的用户开放渠道配置；密钥不回显，不在产品常规流程展示实现细节。 [图片](images/59-%E9%80%9A%E7%9F%A5%E6%B8%A0%E9%81%93%E9%85%8D%E7%BD%AE.png) · [静态页](screens/59-%E9%80%9A%E7%9F%A5%E6%B8%A0%E9%81%93%E9%85%8D%E7%BD%AE.html)
- **60 AI 模型与语音配置**：LLM / ASR / storage bindings。管理员页与个人覆盖遵循既有权限；ASR/存储的可用字段需映射当前绑定接口。 [图片](images/60-AI-%E6%A8%A1%E5%9E%8B%E4%B8%8E%E8%AF%AD%E9%9F%B3%E9%85%8D%E7%BD%AE.png) · [静态页](screens/60-AI-%E6%A8%A1%E5%9E%8B%E4%B8%8E%E8%AF%AD%E9%9F%B3%E9%85%8D%E7%BD%AE.html)
- **61 组织与登录集成**：CompanySettingsScreen / org / SSO。为已有后端/旧原生公司管理能力补移动入口；不显示虚构的同步成功记录。 [图片](images/61-%E7%BB%84%E7%BB%87%E4%B8%8E%E7%99%BB%E5%BD%95%E9%9B%86%E6%88%90.png) · [静态页](screens/61-%E7%BB%84%E7%BB%87%E4%B8%8E%E7%99%BB%E5%BD%95%E9%9B%86%E6%88%90.html)
- **62 套餐、隐私与帮助**：billing / privacy / 应用信息。移动端重新组织现有功能。 [图片](images/62-%E5%A5%97%E9%A4%90%E3%80%81%E9%9A%90%E7%A7%81%E4%B8%8E%E5%B8%AE%E5%8A%A9.png) · [静态页](screens/62-%E5%A5%97%E9%A4%90%E3%80%81%E9%9A%90%E7%A7%81%E4%B8%8E%E5%B8%AE%E5%8A%A9.html)
- **63 通知发送记录**：listNotifyRecords。移动端重新组织现有功能。 [图片](images/63-%E9%80%9A%E7%9F%A5%E5%8F%91%E9%80%81%E8%AE%B0%E5%BD%95.png) · [静态页](screens/63-%E9%80%9A%E7%9F%A5%E5%8F%91%E9%80%81%E8%AE%B0%E5%BD%95.html)
- **90 Push 通知设置**：NotificationSettingsView webpush。原生推送桥接为待完善能力；授权被拒绝时显示设置指引并保留站内消息。 [图片](images/90-Push-%E9%80%9A%E7%9F%A5%E8%AE%BE%E7%BD%AE.png) · [静态页](screens/90-Push-%E9%80%9A%E7%9F%A5%E8%AE%BE%E7%BD%AE.html)
- **91 微信提醒设置**：NotificationSettingsView 微信订阅。微信绑定步骤必须适配账号端和微信端真实流程，不能虚构直接绑定成功按钮。 [图片](images/91-%E5%BE%AE%E4%BF%A1%E6%8F%90%E9%86%92%E8%AE%BE%E7%BD%AE.png) · [静态页](screens/91-%E5%BE%AE%E4%BF%A1%E6%8F%90%E9%86%92%E8%AE%BE%E7%BD%AE.html)
- **92 语音识别配置**：ASR bindings。音频录制权限按需请求；不得把前端录音成功等同于转写服务成功。 [图片](images/92-%E8%AF%AD%E9%9F%B3%E8%AF%86%E5%88%AB%E9%85%8D%E7%BD%AE.png) · [静态页](screens/92-%E8%AF%AD%E9%9F%B3%E8%AF%86%E5%88%AB%E9%85%8D%E7%BD%AE.html)
- **93 文件存储配置**：storage bindings。配置字段根据实际服务 schema 展示；不向普通成员开放公司级写配置。 [图片](images/93-%E6%96%87%E4%BB%B6%E5%AD%98%E5%82%A8%E9%85%8D%E7%BD%AE.png) · [静态页](screens/93-%E6%96%87%E4%BB%B6%E5%AD%98%E5%82%A8%E9%85%8D%E7%BD%AE.html)
- **94 单点登录配置**：sso OIDC / SAML。SAML 模式按支持字段切换；真实登录仍需企业身份服务与 HTTPS 回调验收。 [图片](images/94-%E5%8D%95%E7%82%B9%E7%99%BB%E5%BD%95%E9%85%8D%E7%BD%AE.png) · [静态页](screens/94-%E5%8D%95%E7%82%B9%E7%99%BB%E5%BD%95%E9%85%8D%E7%BD%AE.html)

### 状态与适配

- **66 空状态与首次使用**：空列表 / 未选项目 / 无材料。移动端重新组织现有功能。 [图片](images/66-%E7%A9%BA%E7%8A%B6%E6%80%81%E4%B8%8E%E9%A6%96%E6%AC%A1%E4%BD%BF%E7%94%A8.png) · [静态页](screens/66-%E7%A9%BA%E7%8A%B6%E6%80%81%E4%B8%8E%E9%A6%96%E6%AC%A1%E4%BD%BF%E7%94%A8.html)
- **67 断网与启动恢复**：WebShellScreen + OfflineGate。离线草稿持久化是拟完善项；当前实现需逐端验证，不能把提示等同于已有离线能力。 [图片](images/67-%E6%96%AD%E7%BD%91%E4%B8%8E%E5%90%AF%E5%8A%A8%E6%81%A2%E5%A4%8D.png) · [静态页](screens/67-%E6%96%AD%E7%BD%91%E4%B8%8E%E5%90%AF%E5%8A%A8%E6%81%A2%E5%A4%8D.html)
- **68 加载失败 / 模型不可用**：ReportsView 错误 / 重试。移动端重新组织现有功能。 [图片](images/68-%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5-%E6%A8%A1%E5%9E%8B%E4%B8%8D%E5%8F%AF%E7%94%A8.png) · [静态页](screens/68-%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5-%E6%A8%A1%E5%9E%8B%E4%B8%8D%E5%8F%AF%E7%94%A8.html)
- **69 权限不足 / 角色变化**：ACL 403 / 成员退出 / 节点范围变化。移动端重新组织现有功能。 [图片](images/69-%E6%9D%83%E9%99%90%E4%B8%8D%E8%B6%B3-%E8%A7%92%E8%89%B2%E5%8F%98%E5%8C%96.png) · [静态页](screens/69-%E6%9D%83%E9%99%90%E4%B8%8D%E8%B6%B3-%E8%A7%92%E8%89%B2%E5%8F%98%E5%8C%96.html)
- **70 删除与高风险操作确认**：删除 / 归档 / 重置 / 账号删除确认。账号删除另需当前密码；危险操作不能用同一个通用确认替代影响范围。 [图片](images/70-%E5%88%A0%E9%99%A4%E4%B8%8E%E9%AB%98%E9%A3%8E%E9%99%A9%E6%93%8D%E4%BD%9C%E7%A1%AE%E8%AE%A4.png) · [静态页](screens/70-%E5%88%A0%E9%99%A4%E4%B8%8E%E9%AB%98%E9%A3%8E%E9%99%A9%E6%93%8D%E4%BD%9C%E7%A1%AE%E8%AE%A4.html)
- **71 窄屏适配 · 320**：统一尺寸规范 / 员工工作台。窄屏调整布局与换行；正文不自动缩小到难以阅读。完整长图展示滚动内容。 [图片](images/71-%E7%AA%84%E5%B1%8F%E9%80%82%E9%85%8D-320.png) · [静态页](screens/71-%E7%AA%84%E5%B1%8F%E9%80%82%E9%85%8D-320.html)
- **72 宽屏手机 · 430**：统一尺寸规范 / 员工工作台。移动端重新组织现有功能。 [图片](images/72-%E5%AE%BD%E5%B1%8F%E6%89%8B%E6%9C%BA-430.png) · [静态页](screens/72-%E5%AE%BD%E5%B1%8F%E6%89%8B%E6%9C%BA-430.html)
- **73 系统大字体 · 150%**：字体 / 触控 / 内容重排。按钮和行高随内容增高；不通过截断主要任务标题隐藏问题。 [图片](images/73-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-150-.png) · [静态页](screens/73-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-150-.html)
- **74 系统大字体 · 200%**：无障碍大字体验收设计。模拟字体 token 放大，尚非 Android WebView 系统设置联动的实测结果；最终需在模拟器实际调大字体复验。 [图片](images/74-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-200-.png) · [静态页](screens/74-%E7%B3%BB%E7%BB%9F%E5%A4%A7%E5%AD%97%E4%BD%93-200-.html)
- **75 深色模式**：统一主题 / 员工工作台。移动端重新组织现有功能。 [图片](images/75-%E6%B7%B1%E8%89%B2%E6%A8%A1%E5%BC%8F.png) · [静态页](screens/75-%E6%B7%B1%E8%89%B2%E6%A8%A1%E5%BC%8F.html)
- **76 平板双栏**：窗口宽度适配 / 列表详情。按窗口宽度切换双栏；字体保持可读的逻辑尺寸，不随屏幕等比放大。 [图片](images/76-%E5%B9%B3%E6%9D%BF%E5%8F%8C%E6%A0%8F.png) · [静态页](screens/76-%E5%B9%B3%E6%9D%BF%E5%8F%8C%E6%A0%8F.html)
- **77 横屏手机**：横屏窗口 / 键盘与导航。横屏采用两列与紧凑工具栏，不遮挡系统手势区。长内容仍可滚动。 [图片](images/77-%E6%A8%AA%E5%B1%8F%E6%89%8B%E6%9C%BA.png) · [静态页](screens/77-%E6%A8%AA%E5%B1%8F%E6%89%8B%E6%9C%BA.html)
- **78 键盘弹出与输入**：表单 / AI 输入可达性。键盘区域仅是静态示意；实际需在 Android 中验证 visualViewport、SafeArea 与滚动定位。 [图片](images/78-%E9%94%AE%E7%9B%98%E5%BC%B9%E5%87%BA%E4%B8%8E%E8%BE%93%E5%85%A5.png) · [静态页](screens/78-%E9%94%AE%E7%9B%98%E5%BC%B9%E5%87%BA%E4%B8%8E%E8%BE%93%E5%85%A5.html)
- **96 删除账号确认**：users/me/delete。仅展示流程设计，不执行删除；按钮需校验当前密码与再次确认。 [图片](images/96-%E5%88%A0%E9%99%A4%E8%B4%A6%E5%8F%B7%E7%A1%AE%E8%AE%A4.png) · [静态页](screens/96-%E5%88%A0%E9%99%A4%E8%B4%A6%E5%8F%B7%E7%A1%AE%E8%AE%A4.html)
- **97 启动与同步中**：App bootstrap / WebShell progress。真实启动状态不显示设计稿中的示例任务；避免加载过程中反复闪到登录页。 [图片](images/97-%E5%90%AF%E5%8A%A8%E4%B8%8E%E5%90%8C%E6%AD%A5%E4%B8%AD.png) · [静态页](screens/97-%E5%90%AF%E5%8A%A8%E4%B8%8E%E5%90%8C%E6%AD%A5%E4%B8%AD.html)
