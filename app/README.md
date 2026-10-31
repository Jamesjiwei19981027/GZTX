# WorkTodo APP（Flutter）

iOS / Android 客户端，共用仓库内 [`backend/`](../backend/) 的 FastAPI API。

## 前置条件

- Flutter SDK：`D:\Downloads\flutter`（已加入用户 PATH；Cursor 设置 `dart.flutterSdkPath` 指向同路径）
- **后端 / Web 用 Docker 启动**（仓库根目录 `docker compose up -d`），宿主 API：`http://localhost:8010/api/v1`  
  完整步骤见 [../启动指导文档.md](../启动指导文档.md)。不要用本机 venv 作为日常联调方式。

## 平台目录

`android/`、`ios/`、`windows/`、`web/` 等已由 `flutter create` 生成；若缺失可再执行：

```powershell
.\scripts\bootstrap.ps1
```

## 日常开发

```bash
cd app
flutter pub get
# 确保 Docker 已启动：仓库根 docker compose up -d（Web :80/:5173，API :8010）
flutter run -d emulator-5554 --dart-define=WEB_BASE_URL=http://10.0.2.2/
```

**正式模式（默认）**：APP 以 WebView 加载与浏览器相同的正式 Web UI。  
**旧原生壳**：`--dart-define=USE_WEB_SHELL=false`。

2026-10-21 主导航统一为“工作｜人轴｜知识｜消息｜我的”。AI 汇报与助手归入工作，知识拥有独立 Tab；桌面 Web 使用同名侧栏入口。以后修改产品时必须同步验证 Web 和正式 APP，详见根目录 `AGENTS.md` 与 [双端导航验收](../docs/navigation-web-app-2026-10-21.md)。

Android 正式包签名：将签名信息写入本地忽略文件 `android/key.properties`（不要提交到仓库），内容示例：

```properties
storeFile=release-upload.jks
storePassword=...
keyAlias=worktodo
keyPassword=...
```

CI 发布时设置 `RELEASE_SIGNING_REQUIRED=true`；缺少签名配置会直接失败。未设置该变量时仍允许本地 `flutter build apk --release` 使用调试签名，便于联调。

登录账号与 Web 相同。创建任务需邮箱+手机已验证，否则可能 40320。

旧原生壳还提供 AI 汇报入口：个人草稿生成、编辑提交、直属领导未读消息、来源/冲突/过期提示、项目下属汇总和总领导摘要均调用与 Web、小程序相同的服务端接口。

```bash
flutter run -d emulator-5554 \
  --dart-define=WEB_BASE_URL=http://10.0.2.2/ \
  --dart-define=API_BASE_URL=http://10.0.2.2:8010/api/v1
```

## 分支约定

- 在 **`app`** 分支上主要修改 `app/` 目录。
- 接口变更先在 **`main`** 合入后端，再合入本分支适配。
