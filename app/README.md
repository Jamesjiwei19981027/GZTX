# WorkTodo APP（Flutter）

iOS / Android 客户端，共用仓库内 [`backend/`](../backend/) 的 FastAPI API。

## 前置条件

- [Flutter SDK](https://docs.flutter.dev/get-started/install)（stable）
- 后端已启动（推荐 Docker：`docker compose up -d`，宿主 API 为 `http://localhost:8010/api/v1`）

## 首次初始化（生成 android / ios 平台目录）

本目录已包含 Dart 源码与 `pubspec.yaml`。若尚无 `android/`、`ios/`，在 **app/** 下执行：

```bash
flutter create --org com.worktodo --project-name worktodo_app .
flutter pub get
```

Windows PowerShell 也可：

```powershell
.\scripts\bootstrap.ps1
```

## 日常开发

```bash
cd app
flutter pub get
flutter run
```

指定 API 基址（示例：iOS 模拟器 + 本地 Docker）：

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:8010/api/v1
```

## 分支约定

- 在 **`app`** 分支上主要修改 `app/` 目录。
- 接口变更先在 **`main`** 合入后端，再合入本分支适配。
