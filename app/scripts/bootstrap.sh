#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v flutter >/dev/null 2>&1; then
  echo "flutter not found; install Flutter SDK first." >&2
  exit 1
fi

flutter create --org com.worktodo --project-name worktodo_app .
flutter pub get
echo "Bootstrap done. Run: flutter run"
