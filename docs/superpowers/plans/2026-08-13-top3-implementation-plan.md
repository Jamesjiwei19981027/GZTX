# P0 三项实施方案（2026-08-13）

> 背景与优先级见 `2026-08-13-product-improvement-backlog.md`。
> 三个工作流并行实施，文件边界互斥；跨端改动按 CLAUDE.md 分支模型在 `main`
> 完成后同步各端分支。

## 工作流 A：全局快速添加 + 自然语言日期（Web）

**目标**：任意页面通过快捷键或顶栏按钮唤起「快速添加」弹窗，一行输入即可建任务，
支持中文自然语言日期（写进标题的时间短语自动解析为截止/提醒时间并从标题剥离）。

**交付**：

1. `frontend/src/utils/nlDate.ts`：纯函数解析器，无第三方依赖。支持：
   今天/明天/后天/大后天、本周X/下周X、X月X日/X号、上午/下午/晚上 X点[半]、
   X小时后/X分钟后；返回 `{ date: Date | null, cleanedText: string, matched: string | null }`。
   边界：无时间短语返回 null 不猜测；只取第一个匹配短语。
2. `frontend/scripts/test-nl-date.ts`：断言脚本，接入 `package.json` 的 `test` 链。
3. `frontend/src/components/modals/QuickAddModal.tsx`：单输入框 + 实时解析预览
   （识别出的时间以标签展示，可一键取消解析）+ 可选优先级快选；提交走现有任务
   创建 API（复用 MyTasksView 现有创建链路的 api/mappers）。
4. 全局接入：顶栏（`Navbar.tsx`）加「+ 快速添加」按钮；全局快捷键 `Alt+N`
   （避开浏览器保留键），在输入框聚焦时不触发。
5. i18n：文案接入 `src/i18n.ts` 现有模式。

**边界**：不改后端；不改 PeopleAxis* / 项目视图 / Sidebar / api/shell.ts。

**验收**：`npm run lint`（tsc）零错误；`npm test` 全过（含新增 nl-date 断言）；
解析器用例覆盖 ≥10 种表达。

## 工作流 B：「我的项目权限」接口 + 权限提示 UI

**目标**：权限判定从「前端猜」改为「后端说」，补齐委托授权（delegation_grants）
与非成员超管两个盲区；无权操作时 UI 解释原因而非静默隐藏。

**交付**：

1. 后端 `GET /api/v1/projects/{project_id}/my-permissions`：
   返回 `{ role: "pm"|"superadmin"|"member"|"outsider", is_pm, is_superadmin,
   can_edit_all, owned_node_ids: [...], via_delegation: bool,
   can_move: bool, can_delete: bool }`。
   实现复用 `app/services/acl.py`（AclService / `_owns_path` 口径）+
   `app/models/delegation.py` 的委托授权；错误语义与 nodes.py 一致
   （404 项目不存在 / 403 无 progress.read）。
2. 后端测试：PM、普通成员（有/无负责节点）、委托授权用户、非成员超管、
   外人 403 五类角色断言。
3. 前端 `frontend/src/api/shell.ts` 加 `getMyPermissions(projectId)`；
   `PeopleAxisView.tsx` / `PeopleAxisFlowCanvas.tsx` 的权限 memo 改为
   优先用服务端结果（加载失败时回退现有客户端推断，不阻塞渲染）。
4. 提示 UI：只读卡片的「只读」标识加 tooltip 说明原因（如「需项目 PM 授权」）；
   委托授权用户能看到编辑按钮（修复昨天遗留盲区）。

**边界**：不改 Navbar / MyTasksView / i18n.ts / modals；不动 TreeService 校验逻辑
（后端仍是最终强制方）。

**验收**：`pytest tests -q -k "permission or acl or delegation"` 及新增测试全过；
前端 `npm run lint` + `npm test` 全过。

## 工作流 C：小程序轻量伴生端收口

**定位（已拍板）**：登录/任务/日历/设置四类页面；项目协作引导去 Web/APP。

**交付**：

1. 砍页面：从 `app.json` 移除并删除 `pages/project-list`、`pages/project-tree`、
   `pages/agent-chat`、`pages/evidence-submit`；清理仅被这些页面引用的
   `utils/api-collab.js` 与残留跳转入口。
2. 品牌：`navigationBarTitleText` 及各页面标题、登录页文案改「烂笔头PM」，
   与 `frontend/src/constants/brand.ts` 口径一致；README 同步。
3. API 契约对齐：以 `backend/app/api/v1/tasks.py` 现行为准核对任务字段与
   响应信封（`{code,message,data}`）、401 刷新/重登路径；`baseUrl` 改为
   `app.js` globalData 可配置并在 README 写清生产配置方法。
4. 设置页加「项目协作」入口项：说明文案 + 复制 Web 地址引导。

**边界**：只改 `miniprogram/` 与其 README；不动 backend / frontend / app。

**验收**：`app.json` 无悬空页面引用；全目录 grep 无对已删页面/工具的残留引用；
所有 JSON 可解析；核对过的接口路径与后端路由一一对应。

## 集成（主管收口）

三流完成后：全量回归（backend pytest / frontend lint+test / flutter analyze+test）→
分三笔提交到 `main` → `web`/`app`/`miniprogram` 分支快进同步并推送 →
重建/重启 Docker（backend 有改动需 `up -d --build backend`，frontend 重启）。
