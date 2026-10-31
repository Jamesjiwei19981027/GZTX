# 个人知识空间

每个人在每个项目中都有自己的知识空间。可记录经验、工作事实、问题与结论，并通过关系图把条目连接起来。例如：“客户需求 → 接口约定 → 验收依据 → 本周汇报”。

## 三端入口

- Web：侧栏“我的知识空间”，支持 `?view=knowledge` 刷新与直达。
- APP：底栏独立“知识”Tab，默认“我的知识”，可切“项目知识”；“我的”旧快捷入口和工作 AI 页面仍可直达。当前 APP 的 Flutter WebView 使用同一组件和后端。2026-10-21 起与 Web 统一为五主入口，见 [导航调整](navigation-web-app-2026-10-21.md)。
- 微信小程序：设置页和汇报页的“我的知识空间”。

进入后先选择具体项目，不会将多个项目的资料混在一起。

## 页面与操作

- **项目选择**：切换当前项目，重新读取本人在该项目的条目与关联；忽略旧项目延迟返回的数据。
- **新建条目**：填写标题、正文和逗号分隔的标签，保存为个人 Wiki。手机会将编辑区滚入视野。
- **打开、编辑、保存**：在列表或图上选择知识，修改正文；保存失败保留编辑内容并显示重试提示。
- **搜索知识**：搜索标题、正文和标签。
- **Wiki 列表 / 关联图**：在文章列表与知识地图之间切换。
- **整理我的资料**：导入当前项目中自己的材料、上传文件解析正文、AI 汇报和向个人 AI 提供的输入；展示来源类型和原始记录编号。
- **独立文件来源**：附件解析晚于第一次整理时，下一次整理能新增文件条目；不会覆盖已经手改的材料条目。
- **关联起点、终点与说明**：选择两条知识，写下“提供依据”“依赖”“进一步说明”等关系；支持新增、编辑说明和删除关联。
- **图上连接点**：Web/APP 可从一个节点连接点拖到另一个节点，再填写说明保存关系。
- **拖动节点**：单独移动卡片，平滑曲线随端点移动；松手后保存位置。
- **缩放与定位**：查看完整知识网络或放大局部。
- **删除条目**：确认后删除个人条目和它的关系；原始材料、汇报和对话仍保留，重复整理不会悄悄恢复已删除的同一来源。
- **来源引用**：查看材料包、文件、汇报、会话和消息等原始记录标识，明确知识从哪里来。

## 权限与智能体

后端根据登录身份决定知识所有者，接口不接收所有者覆盖参数。公司、项目和用户三层隔离；项目经理没有读取他人私人 Wiki 的额外权限。公司、在职或项目成员资格撤销后，空间读写与 AI 检索都会被拒绝。

本人当前项目的 AI 对话会检索本人的 Wiki 正文，并将来源随资料一同提供给模型。长文围绕正文命中位置截取片段，避免只发送开头而丢失后部事实。私人条目不会写入项目公共知识索引。向领导提交的材料与汇报仍沿现有人轴责任链处理。

## 数据与迁移

- 数据表：`personal_knowledge_entries`、`personal_knowledge_links`。
- 接口：`/api/v1/projects/{project_id}/personal-knowledge` 及 entries、links、sync。
- 迁移：`fi7d8e9f0a1b`，继承 `fh6c7d8e9f0a`。部署时执行 `alembic upgrade head`。
- 本机联调使用隔离数据库 `axis_joint_debug_20261020.db`，本次已完成该库迁移与服务重启。

## 验证范围

2026-10-20 本轮验证：

- 后端：`test_personal_knowledge.py`、`test_agent_personal_knowledge_scope.py`、`test_agent_file_evidence_scope.py`、`test_material_voice_input.py` 合计 **18 项通过**。覆盖跨人/跨项目/跨公司、成员资格撤销、晚解析附件补导入、删除防重导入、真实 AI 对话组装以及长文后半段命中；只替换外部模型调用，数据库和 API 实际执行。
- Web：`e2e/personal-knowledge.spec.ts` **8 项通过**。通过接口替身验证桌面/390px、深色、失败重试、编辑保留、来源、实际连接点拖线、单节点拖动及曲线跟随、位置恢复、关系编辑、项目切换延迟响应隔离。另 `mobile-knowledge-navigation.spec.ts` **1 项通过**，验证 APP 壳知识直达链接与返回路径；`mobile-settings.spec.ts` **1 项通过**，回归 16 个设置页面的可达性和角色权限。
- 桌面真实链路：`scripts/test-personal-knowledge-live.ts` 通过真实账号登录，点击侧栏，创建 Wiki，刷新深链并重新读取正文。未模拟 API；临时条目已清理。
- 安卓：Pixel_9_Pro / Android 15 / 已安装 Flutter APP，`scripts/test-android-personal-knowledge.ts` 的 **5 项检查通过**。使用 ADB 实际触摸进入“我的”知识空间、新建两条 Wiki、建关联、独立拖动和保存坐标、重新加载读取正文和标签、知识直达链接及返回“我的”。未模拟 API；临时条目及关系已清理。输入键盘覆盖页面时先正常收起键盘再点击保存，保留产品既有的键盘覆盖行为。
- 小程序：`node --test miniprogram/tests/*.test.cjs` **26 项通过**，其中个人知识 16 项。包含弹层关闭后曲线重绘、跨端负坐标显示及反向保存、快速拖动顺序、项目切换和迟到请求隔离。
- Web 类型检查、现有契约测试、生产构建通过；构建仍有既有大分块提示。
- 本机隔离库完成 `alembic upgrade head`，服务在 `8014`，APP 使用 `5177` 页面。

证据与脚本：

- 安卓结果：`frontend/android-acceptance/test-results/personal-knowledge/result.json`，截图 `wiki.png`。
- 桌面结果：`frontend/android-acceptance/test-results/personal-knowledge-web/result.json`，截图 `desktop.png`。
- 新功能源码：`frontend/src/components/PersonalKnowledgeSpace.tsx`、`backend/app/api/v1/personal_knowledge.py`、`miniprogram/pages/knowledge/`。

真实微信运行时和 iOS 设备尚未验收。当前记录是本功能的定向回归和安卓模拟器验收，不代表本轮已经重新穷举整个产品所有按钮或完成生产全量上线。
