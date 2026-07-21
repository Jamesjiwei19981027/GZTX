# 生成 android / ios 等平台目录（需已安装 Flutter 并加入 PATH）
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Error '未找到 flutter 命令。请先安装 Flutter SDK 并加入 PATH。'
}

flutter create --org com.worktodo --project-name worktodo_app .
flutter pub get
Write-Host 'Bootstrap 完成。运行: flutter run'
