# WorkTodo APP（Flutter）

iOS / Android 客户端，共用仓库内 [`backend/`](../backend/) 的 FastAPI API。

## 前置条件

- Flutter SDK：`D:\Downloads\flutter`（已加入用户 PATH；Cursor 设置 `dart.flutterSdkPath` 指向同路径）
- 后端已启动（推荐 Docker：`docker compose up -d`，宿主 API 为 `http://localhost:8010/api/v1`）

## 平台目录

`android/`、`ios/`、`windows/`、`web/` 等已由 `flutter create` 生成；若缺失可再执行：

```powershell
.\scripts\bootstrap.ps1
```

## 日常开发

```bash
cd app
flutter pub get
# 确保后端已启动：docker compose up -d（宿主 8010）
flutter run -d emulator-5554
```

登录账号与 Web 相同（用户名 / 邮箱 / 手机号 + 密码）。创建任务需要账号已完成邮箱+手机验证，否则会提示 40320。

指定 API 基址：

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8010/api/v1
```

## 分支约定

- 在 **`app`** 分支上主要修改 `app/` 目录。
- 接口变更先在 **`main`** 合入后端，再合入本分支适配。
