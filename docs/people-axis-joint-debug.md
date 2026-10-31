# 责任树联合调试

## 本地环境

- Web 生产构建：`http://localhost/?view=people-axis`
- Web 开发服务：`http://localhost:5174/?view=people-axis`
- API：`http://localhost:8010/api/v1`
- Docker 容器：`worktodo-axis-debug-backend`、`worktodo-axis-debug-web`
- 独立数据库：`backend/data/axis_joint_debug_20261018.db`
- 测试项目：责任树联合调试，初始 ID 为 `1`。
- 跨项目角色样例：跨项目角色联调，初始 ID 为 `2`。`axis_member` 在项目 1 是设计负责人，在项目 2 是 PM。
- 本地测试账号：`axis_pm`、`axis_member`、`axis_reader`，密码均为 `axis-debug-2026`。

这些账号仅供独立开发数据库使用。调试容器关闭了调度器，避免测试材料触发定时通知。

## 数据准备

后端启动时设置 `DEBUG=true`、`DATABASE_URL=sqlite+aiosqlite:///./data/axis_joint_debug_20261018.db`、`SCHEDULER_ENABLED=false`。
使用仓库 Compose 配置挂载源码和 `backend/data`；本次用临时 Compose 覆盖文件及已缓存后端镜像启动，未改动日常开发配置。

向独立后端容器复制并执行初始化脚本：

```powershell
docker cp backend/scripts/seed_people_axis_joint.py worktodo-axis-debug-backend:/tmp/seed_people_axis_joint.py
docker exec -e PYTHONPATH=/app worktodo-axis-debug-backend python /tmp/seed_people_axis_joint.py
```

脚本限制数据库路径包含 `axis_joint_debug_`，重复执行时保留已有项目并补齐第二个角色样例项目。所有测试写入保留在该独立库中。

## 职责展示

全部项目使用独立目录，卡片显示当前用户在各项目中的岗位。进入具体项目后，PM 默认查看项目全貌；有指派的成员默认查看我的职责，保留直属上级路径及本人下属，可切换查看项目全貌。展示筛选不授予编辑权限，服务端 ACL 仍强制校验写操作。

横向从左到右、纵向从上到下依次呈现项目终责、一级负责人及下级；同级并列。层级来自实际挂载关系，卡片同时显示项目岗位。选择新上级时停用折叠按钮，避免缩小总览后的触摸误判。

## 人员与节点管理

- 有权限的节点提供「新增下级」「编辑人员」；PM 可管理整个项目，成员可管理本人负责的子树。新增下级后，责任链与横纵总览同步显示实际层级。
- 编辑支持关联成员、姓名、项目岗位和部门，保留原有下级、事项及说明。人员信息使用描述中的 `@axis-person` 元数据保存，兼容旧的岗位／部门描述格式。负责人指派和节点信息由同一 PATCH 事务提交，避免本人移交职责时只保存一半。
- 桌面可直接拖动人员卡片调整位置；手机浏览器及 APP 在总览中点击「调整位置」后拖动，点击「完成」退出。拖动空白可浏览画布，双指可缩放。
- 位置保存到节点布局，刷新后保留；「调整上级」改变实际责任关系。连续拖动与重置按节点顺序保存，失败时提示并退回最后成功保存的位置。

## 节点权限与下辖挂载

- 同一张图同时显示项目定义和下辖分支。项目定义采用实线；下辖分支采用青绿色虚线、虚线卡片和「下辖分支」标记。横向、纵向总览均从独立的圆形下辖挂载口引出分支，责任链也保留来源标记。
- 节点的「新增下级」与圆形挂载口默认创建下辖分支。PM 从全局添加入口可定义项目骨架或选择下辖分支。下辖人员必须挂在人员节点下，项目定义人员不能挂入下辖分支。改类型、移动、刷新均保留来源约束。
- 创建节点或编辑人员时，可配置材料提交范围：沿用上级与项目规则、项目成员、负责此分支的人员及上级、禁止提交材料；另可控制负责人新增下级和新增事项。
- 每个节点的实际权限由项目 ACL 与全部上级限制共同决定，下级不能放宽上级限制。直接负责本节点的人员可编辑人员资料，权限配置需直属上级责任人或项目管理人员操作；项目管理人员可维护项目结构，但「禁止提交材料」对其也生效。
- 手机总览缩放低于 65% 时，节点内的微小操作按钮暂停交互，点击卡片先进入预览。预览中仍可编辑与新增，也可点击「定位」放大后使用卡片挂载口，避免 WebView 扩大触摸命中区域造成误操作。
- 拖动保存后保留当前缩放，不因节点重新测量而跳回全图；切换朝向、调整上下级、展开收起和重置布局仍会按结构适配。
- 总览连线采用三次贝塞尔曲线。拖动任一端时，连接位置实时沿卡片边缘调整；下辖分支共用独立挂载口，挂载口朝向可见下级的中心并连续换边。项目定义的实线与下辖分支的虚线保持区分。
- 材料查看、材料提交、人员编辑分别判断。事项直接指派也纳入材料提交判断，界面按具体事项显示入口，服务端在实际提交目标上再次校验。
- 防绕过回归覆盖：直接修改本人授权、事项和人员之间转换以绕过新增限制、跨来源移动后转换、下辖人员反复改类型后尝试升根。

### 数据库升级

本次新增迁移 `de22fa33bc00`，给 `tree_nodes` 增加 `node_origin` 和 `responsibility_permissions`。历史节点默认归为项目定义，既有 ACL 保持原有默认权限；旧数据缺乏可靠来源记录，不自动推断历史下辖分支。

已有数据库应先备份，并在更新后端启动前，从 `backend` 目录运行 `alembic upgrade head`。开发环境的旧版 DEBUG 自动纳管逻辑可能只推进版本号、不补已有表的列，升级时应核对这两个字段，不能仅以版本号判断完成。本次只迁移了独立联调库，迁移前已做 SQLite 备份。

## 浏览器回归

真实接口用例加载完整 App，不拦截 API。覆盖 PM 新增责任人、事项、材料，调整上级并刷新确认；成员在本人节点下新增；跨节点写入和只读账号越权均返回 403；桌面详情和横纵总览切换；同一用户跨项目的岗位及责任链切换；二级人员下新增三级人员、修改负责人和岗位、拖动并刷新核对位置。

节点权限用例另验证：PM 在界面保存权限、下级仍能编辑身份资料但不能自改授权、禁用后提交入口消失且接口返回 403、恢复为负责此分支后可提交、未负责分支的项目成员仍被拒绝，以及两种朝向的来源标记和独立挂载口。

```powershell
cd frontend
$env:AXIS_LIVE_PROJECT_ID='1'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1'
npx playwright test e2e/people-axis-live.spec.ts --reporter=line --output=test-results/live-final
```

不设置 `AXIS_LIVE_PROJECT_ID` 时，真实接口套件默认跳过。原有组件交互测试需要 Vite 开发服务：

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5174'
npx playwright test e2e/people-axis-native.spec.ts --reporter=line --output=test-results/native-final
```

## Android WebView

模拟器 `Pixel_9_Pro` 中已安装的 Flutter 调试壳默认加载 `http://10.0.2.2/`，由本地 nginx 提供当前 `frontend/dist`，API 转发至同一独立后端。

启动 APP 后，查询调试 socket 并转发（PID 每次启动可能变化）：

```powershell
adb shell cat /proc/net/unix | Select-String webview_devtools
adb forward tcp:9223 localabstract:webview_devtools_remote_<PID>
cd frontend
$env:AXIS_ANDROID_CDP='http://127.0.0.1:9223'
$env:AXIS_LIVE_PROJECT_ID='1'
npx tsx scripts/test-people-axis-android.ts
```

该脚本只接受 `axis_pm` 测试账号。通过真实 WebView 的触摸事件验证详情、新增事项、横纵总览、缩放／适配、预览、调整上级／移回主干，以及在二级节点下新增三级人员、修改岗位与回读部门、配置并重新打开节点权限、两种朝向的下辖挂载口、定位放大后的触摸拖动并刷新确认位置。临时人员验证后删除，截图存放在 `frontend/test-results/android-joint/`。

Android WebView 的按钮默认对齐与桌面 Chromium 不同；责任链按钮已明确使用 `align-items: stretch`，避免内部进度和事项行缩短。

真实后端浏览器测试与 Android 脚本应顺序执行，它们会操作同一份独立测试数据中的责任关系。

此次 APK 重新打包受 Gradle 依赖网络请求阻塞，APP 检查使用既有调试壳加载最新 Web 生产构建。iOS 未验证。

## 本轮验证记录（2026-10-18）

- 相关后端权限、形态、ACL 与迁移回归：42 项通过。
- 责任链浏览器组件回归：28 项通过，含小比例手机总览误触回归和横纵曲线端点拖动回归。
- 独立联调数据库的真实接口浏览器用例：6 项通过，含 PM 配置、成员权限、材料提交和横纵挂载样式。
- TypeScript 检查、前端单元脚本与生产构建通过；责任层级布局脚本包含 332 项断言。
- Android 模拟器实际 WebView：427 × 816 CSS 像素、DPR 3，权限配置回读、两种朝向挂载口、触摸拖动、刷新持久化等 14 类检查通过。
