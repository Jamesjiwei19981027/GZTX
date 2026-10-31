# Android 模拟器与 APK 验收（2026-10-19）

## 本次运行环境与启动证据

在本机以 CIM 启动独立进程后，Pixel_9_Pro 成功完整开机。启动命令返回之后，emulator 与 QEMU 进程继续存活。此前直接启动后进程消失的具体回收机制未单独追踪；不能据此断言 Windows DLL 损坏。

```text
boot ok after 40s
List of devices attached
emulator-5554	device

sys.boot_completed = 1
ro.build.version.release = 15
```

- Android Emulator：37.2.12，Pixel_9_Pro，Android 15。
- Android System WebView：124.0.6367.219。
- 物理屏幕：1280×2856，density 480；APP WebView 实际视口：427×816，DPR 3。
- SDK：`C:\Users\11580\AppData\Local\Android\Sdk`。
- AVD：`D:\Android\avd`。本次不修改 AVD 文件、不升级/降级 SDK。
- 本次安装当前源码构建的 Android debug APK，启动 `com.worktodo.worktodo_app/.MainActivity`；正式默认 WebView 壳，`USE_WEB_SHELL=true`。
- 不是 Flutter Web 手机尺寸替代测试：脚本连接的是模拟器里安装的 APK 所暴露的 WebView 调试端口。

## 可复用启动步骤

在 PowerShell 中先确认没有已经运行的设备，再使用下列方式启动：

```powershell
$adb = 'C:\Users\11580\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices

Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = '"C:\Users\11580\AppData\Local\Android\Sdk\emulator\emulator.exe" -avd Pixel_9_Pro -no-window -no-snapshot -no-boot-anim -no-audio -gpu off'
}

for ($i = 0; $i -lt 30; $i++) {
  $boot = & $adb -s emulator-5554 shell getprop sys.boot_completed 2>$null
  if ($boot -match '^1\s*$') {
    "boot ok after $($i * 10)s"
    break
  }
  Start-Sleep -Seconds 10
}
& $adb devices
& $adb -s emulator-5554 shell getprop sys.boot_completed
& $adb -s emulator-5554 shell getprop ro.build.version.release
```

不要把直接执行 `qemu-system-x86_64.exe --version` 的退出码当作模拟器运行库损坏证据。需要关机时只使用 `& $adb -s emulator-5554 emu kill`。

## APK 与服务连接

- 隔离后端：`http://127.0.0.1:8011`。
- Vite：`http://127.0.0.1:5174`，代理到 8011。
- 隔离 SQLite：`backend/data/axis_joint_debug_android_20261019.db`，由 `scripts/seed_people_axis_joint.py` 准备两个项目及不同角色账号。
- APK 编译参数：`USE_WEB_SHELL=true`、`WEB_BASE_URL=http://127.0.0.1:5174/`、`API_BASE_URL=http://127.0.0.1:8011/api/v1`。
- ADB reverse：`tcp:5174` 与 `tcp:8011`；动态读取 `/proc/net/unix` 中当前 APP 的 `webview_devtools_remote_<pid>`，通过 ADB forward 暴露到主机 9223。

## 本次实际通过范围

`frontend/scripts/test-people-axis-android.ts`：14 项检查通过。脚本在 APK 的 Android WebView 中派发触摸事件，覆盖登录、卡片布局、节点详情、新建事项、横纵总览、缩放适配、预览、调整/还原上级、新增三级人员、编辑岗位部门、权限保存重开、下辖端口、触摸拖拽、刷新后位置持久化。

`frontend/scripts/test-android-core.ts`：12 项检查通过。该脚本读取 WebView 中的控件位置，并用 `adb shell input tap` 派发 Android 系统触摸；根据真实 API 响应和页面状态断言结果，未 mock API。

1. 在“全部项目”中创建个人任务，确认 `origin=personal`、`project_id=null`。
2. 完成/取消完成，确认 UI 状态与后端状态一致。
3. 删除到回收站，再恢复到任务列表。
4. 移动“更多”菜单及日历任务显示。
5. 设置页面入口。
6. PM 同步项目隔离的汇报智能体。
7. 未配置 LLM 时，生成草稿明确返回 422 并显示真实原因。
8. 成员编辑汇报并提交，确认直属领导为 PM，且非成员本人。
9. 直属领导收到收件箱消息，点击标记已读，并回查后端状态。
10. 项目管理者汇总真实已提交汇报。
11. 总领导汇总项目封装摘要。
12. 切到另一项目，UI 和 API 均不包含前一项目的成员汇报。

另执行 Android HOME 后恢复 APP，应用任务回到前台；`logcat -d -s AndroidRuntime:E` 未输出崩溃记录。该项仅证明本次前后台切换，没有覆盖进程被系统回收后的恢复。

## 验收发现并修复

1. `frontend/src/App.tsx`：原先在“全部项目”打开新建任务，弹窗会偷偷使用第一个项目，生成只读项目任务。现保留所选上下文，“全部项目”中创建个人任务；Android 自动化同时断言来源和项目归属。
2. `backend/app/services/hierarchical_reporting.py`：直属领导查询原先也遍历成员负责的事项节点，可能将该事项的人员负责人（即成员本人）识别为领导。现限定上下级均为同项目的人员节点，排除自身；无人员上级时回落到项目管理者。新增回归用例已先复现 `assert 2 == 1`，修复后汇报模块 8 项测试通过。
3. `backend/scripts/seed_people_axis_joint.py`：补齐直接创建的测试账号所缺默认分类，保持重复执行幂等，避免其任务创建失败；这是测试数据修正。

## 修复后回归结果

- 后端完整测试：`.venv312\Scripts\python.exe -m pytest -q`，**456 passed in 389.29s**。
- Web 浏览器：`smoke.spec.ts`、`people-axis-native.spec.ts`、`project-wiki.spec.ts`、`report-ui.spec.ts`，**41 passed**。其中 10 项 smoke 连接本次 8011 隔离后端，其余 31 项使用接口模拟验证页面交互。
- Android：实际安装的 debug APK 中，人轴 14 项检查、核心业务 12 项检查通过；这两组检查连接真实隔离后端，不模拟接口。

## 证据与重跑

- 人轴截图：`frontend/android-acceptance/test-results/axis/`。
- 核心业务截图及最终结果：`frontend/android-acceptance/test-results/core/result.json`、`android-screen.png`、`member-report.png`、`leader-aggregate.png`。
- `android-screen.png` 由模拟器内 `screencap` 获取，包含 Android 状态栏和 Flutter 调试壳。

在 `frontend/` 目录下重跑（需先启动上述隔离服务和 APK，并转发当前 WebView）：

```powershell
$env:AXIS_ANDROID_CDP = 'http://127.0.0.1:9223'
$env:AXIS_LIVE_PROJECT_ID = '1'
npx tsx scripts/test-people-axis-android.ts
npx tsx scripts/test-android-core.ts
```

测试产物目录被 Git 忽略，需在本机保留或随验收归档。覆盖的是本次列出的默认 APP 壳流程；不代表所有页面、所有按钮及所有设备均已验收。真实 LLM 生成、外部邮件/推送、摄像头/麦克风、iOS、旧原生 Flutter 壳尚未在本轮验证。

## 2026-10-20 复验：当前移动 UI 与真实 Android APK

为验证交接后移动 UI 修复，我重新构建并安装了当前源码 APK，使用独立 CIM 进程启动 Pixel_9_Pro，并将 WebView 连接到新的隔离服务：

```text
boot ok after 20s
List of devices attached
emulator-5554	device

1
15
```

- WebView：427×876，DPR 3，Android System WebView 124.0.6367.219。
- 隔离服务：8014；Vite：5177；数据库：`backend/data/axis_joint_debug_20261020.db`。
- 新增脚本：`frontend/scripts/test-android-mobile-smoke.ts`。
- 真实触摸结果：**5 项通过**（项目人轴切换与节点预览/详情、项目内 AI 入口、成员提交汇报并送达直属领导）；结果文件：`frontend/android-acceptance/test-results/mobile-smoke/result.json`，截图：`android-mobile-smoke.png`。
- `adb -s emulator-5554 shell logcat -d -s AndroidRuntime:E` 无输出。

本轮还修复了两个实际移动端问题：Flutter 注入 `__NATIVE_RUNTIME__` 后前端未切换移动壳；默认“全部项目”进入人轴时项目 ID 为 `NaN` 导致永久加载。人轴现在提供项目选择器，移动 Android 测试可进入真实项目数据。

重跑命令：

```powershell
$env:AXIS_ANDROID_CDP = 'http://127.0.0.1:9224'
npx tsx scripts/test-android-mobile-smoke.ts
```

这组脚本专门对应当前移动壳；桌面真实后端 smoke 另有 10/10 通过证据。小程序开发者工具、iOS 真机、真实 LLM、外部推送仍需相应环境。

