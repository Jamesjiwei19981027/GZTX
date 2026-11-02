[CmdletBinding()]
param(
  [string]$Apk = (Join-Path (Get-Location) 'build/app/outputs/flutter-apk/app-release.apk'),
  [string]$Adb = (Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe')
)

$ErrorActionPreference = 'Stop'
$packageName = 'com.worktodo.worktodo_app'

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if (-not (Test-Path -LiteralPath $Adb)) {
  Fail "adb not found: $Adb"
}

if (-not (Test-Path -LiteralPath $Apk)) {
  Fail "APK not found: $Apk"
}

$devices = & $Adb devices
if ($LASTEXITCODE -ne 0) {
  Fail "adb devices failed with exit code $LASTEXITCODE"
}

$connected = @(
  $devices | Where-Object { $_ -match '^\S+\s+device\s*$' }
)
if ($connected.Count -eq 0) {
  Fail 'No connected Android device was found.'
}

& $Adb install -r $Apk
if ($LASTEXITCODE -ne 0) {
  Fail "adb install failed with exit code $LASTEXITCODE"
}

& $Adb shell monkey -p $packageName 1
if ($LASTEXITCODE -ne 0) {
  Fail "adb shell monkey failed with exit code $LASTEXITCODE"
}

Start-Sleep -Seconds 20
$pidOutput = (& $Adb shell pidof $packageName | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($pidOutput)) {
  Write-Error "Process $packageName is not running after launch."
  & $Adb logcat -d -t 200 '*:E'
  exit 1
}

$screenshot = Join-Path (Get-Location) 'android-launch.png'
& $Adb exec-out screencap -p > $screenshot
if ($LASTEXITCODE -ne 0) {
  Fail "adb screencap failed with exit code $LASTEXITCODE"
}

Write-Output "Android launch smoke passed. PID: $pidOutput"
Write-Output "Screenshot: $screenshot"
exit 0
