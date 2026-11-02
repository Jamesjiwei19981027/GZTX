[CmdletBinding()]
param(
    [string]$ComposeFile = 'docker-compose.prod.yml',
    [string]$ProjectName = 'worktodo-drill',
    [int]$Port = 18080
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectName) -or @('worktodo', 'worktodo-t10-walk-backend', 'default') -contains $ProjectName) {
    throw 'ProjectName must be an independent Compose project name.'
}
if ($Port -lt 1024 -or @(5173, 8010, 8011, 5177) -contains $Port) {
    throw 'Port must be an independent frontend port.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$composePath = (Resolve-Path (Join-Path $repoRoot $ComposeFile)).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "worktodo-rollback-$stamp"
$envPath = Join-Path $tempDir 'drill.env'
$overridePath = Join-Path $tempDir 'compose.override.yml'
$vueId = ''
$reactId = ''
$vueCheck = 'FAILED'
$reactCheck = 'FAILED'
$drillStarted = Get-Date
$drillUsername = ''
$drillPassword = ''
$drillSucceeded = $false

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

function Add-Record {
    param([string]$Step, [string]$Result, [string]$Detail)
    $now = Get-Date
    Write-Host ("[{0}] {1}: {2} - {3}" -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $Step, $Result, $Detail)
}

function Invoke-Logged {
    param([string]$Step, [scriptblock]$Action)
    try {
        & $Action | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "command exited with code $LASTEXITCODE" }
        Add-Record $Step 'PASS' 'command completed'
        return $true
    } catch {
        Add-Record $Step 'FAIL' $_.Exception.Message
        return $false
    }
}

function New-HexSecret {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($buffer)
    } finally {
        $generator.Dispose()
    }
    return ([BitConverter]::ToString($buffer).Replace('-', '')).ToLowerInvariant()
}

function Write-DrillEnv {
    $dbPassword = New-HexSecret
    $lines = @(
        "DB_USER=worktodo",
        "DB_PASSWORD=$dbPassword",
        "DB_NAME=worktodo",
        "DATABASE_URL=postgresql+asyncpg://worktodo:$dbPassword@db:5432/worktodo",
        "SECRET_KEY=$(New-HexSecret 48)",
        "LICENSE_VERIFY_MODE=ed25519",
        "LICENSE_PUBLIC_KEY=$(New-HexSecret 32)",
        "APP_URL=http://127.0.0.1:$Port",
        "DEPLOY_MODE=single_company",
        "DEFAULT_COMPANY_SLUG=default",
        "REGISTER_VERIFICATION_REQUIRED=false",
        "ALLOW_FAKE_SSO=false",
        "RATE_LIMIT_ENABLED=false",
        "EXPOSE_API_DOCS=false",
        "APP_VERSION=rollback-drill",
        "CORS_ORIGINS=[`"http://127.0.0.1:$Port`"]"
    )
    [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
}

function Write-ComposeOverride {
    param([string]$FrontendImage)
    $envFile = $envPath.Replace('\', '/')
    # 每次都写完整覆盖文件：env_file / ports / volumes 必须用 !override 替换，
    # 否则 Compose 会与 docker-compose.prod.yml 的 .env、80/443、./backups、./certbot 合并。
    @"
services:
  migrate:
    env_file: !override
      - "$envFile"
  backend:
    env_file: !override
      - "$envFile"
  scheduler:
    env_file: !override
      - "$envFile"
  db:
    env_file:
      - "$envFile"
    volumes: !override
      - postgres_data:/var/lib/postgresql/data
  frontend:
    image: $FrontendImage
    build: !reset null
  nginx:
    ports: !override
      - "$($Port):80"
    volumes: !override
      - ./nginx/default.prod.conf:/etc/nginx/conf.d/default.conf:ro
      - ./landing:/usr/share/nginx/html/landing:ro
"@ | Set-Content -LiteralPath $overridePath -Encoding utf8
}

function Assert-ComposeSafe {
    # 起容器前先看合并结果：只允许发布演练端口，且不得有指向仓库内 backups/certbot 的挂载。
    $json = & docker compose --project-name $ProjectName --env-file $envPath --file $composePath --file $overridePath config --format json
    if ($LASTEXITCODE -ne 0) { throw 'docker compose config failed' }
    $cfg = ($json -join "`n") | ConvertFrom-Json
    $published = @()
    foreach ($svc in $cfg.services.PSObject.Properties) {
        foreach ($p in @($svc.Value.ports)) { if ($p) { $published += "$($svc.Name):$($p.published)->$($p.target)" } }
        foreach ($v in @($svc.Value.volumes)) {
            if ($v -and $v.source -and ($v.source -match 'backups|certbot')) { throw "unsafe mount in $($svc.Name): $($v.source)" }
        }
    }
    Write-Host ("Merged published ports: {0}" -f ($published -join ', '))
    if ($published.Count -ne 1 -or $published[0] -ne "nginx:$Port->80") { throw "unexpected published ports: $($published -join ', ')" }
}

function Assert-FrontendImage {
    param([string]$ExpectedId, [string]$Label)
    # 证明切换真的生效：frontend 容器实际使用的镜像 ID 必须等于期望镜像
    $cid = (& docker compose --project-name $ProjectName --env-file $envPath --file $composePath --file $overridePath ps -q frontend | Select-Object -First 1)
    $actual = (& docker inspect $cid --format '{{.Image}}').Trim()
    if ($actual -ne $ExpectedId) { throw "$Label frontend container runs $actual, expected $ExpectedId" }
    Add-Record "Confirm frontend container image ($Label)" 'PASS' $actual
}

function Invoke-Compose {
    param([string[]]$ComposeArgs)
    & docker compose --project-name $ProjectName --env-file $envPath --file $composePath --file $overridePath @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose exited with code $LASTEXITCODE" }
}

function Wait-Http {
    param([string]$Uri, [int]$ExpectedStatus = 200, [int]$TimeoutSeconds = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10
            if ([int]$response.StatusCode -eq $ExpectedStatus) { return }
        } catch {
            # The service may still be starting.
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "timeout waiting for $Uri to return HTTP $ExpectedStatus"
}

function Test-DrillApplication {
    param([string]$Phase)
    try { return Test-DrillApplicationCore $Phase } catch {
        $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { " body=$($_.ErrorDetails.Message)" } else { '' }
        throw "$($_.Exception.Message)$detail"
    }
}

function Test-DrillApplicationCore {
    param([string]$Phase)
    $baseUrl = "http://127.0.0.1:$Port"
    Wait-Http "$baseUrl/" 200
    Wait-Http "$baseUrl/api/v1/health" 200

    if ($Phase -eq 'initial') {
        $script:drillUsername = "rollback_$($stamp -replace "-", "_")"
        $script:drillPassword = 'rollback-password-123'
        $registerBody = @{
            username = $script:drillUsername
            password = $script:drillPassword
            email = "$($script:drillUsername)@worktodo-drill.com"
            nickname = 'Rollback Drill'
        } | ConvertTo-Json
        $register = Invoke-RestMethod "$baseUrl/api/v1/auth/register" -Method Post -ContentType 'application/json' -Body $registerBody
        if (-not $register) { throw 'drill account registration returned no result' }
    }

    $loginBody = @{ username = $script:drillUsername; password = $script:drillPassword } | ConvertTo-Json
    $login = Invoke-RestMethod "$baseUrl/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
    $token = $login.data.access_token
    if ([string]::IsNullOrWhiteSpace($token)) { throw "$Phase login response did not contain access_token" }
    $tasks = Invoke-WebRequest "$baseUrl/api/v1/tasks" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 20
    if ([int]$tasks.StatusCode -ne 200) { throw "$Phase task list returned HTTP $($tasks.StatusCode)" }
    return "${Phase}: homepage 200; health 200; login passed; task list 200"
}

try {
    Write-Host "Rollback drill started: project=$ProjectName port=$Port"
    Write-DrillEnv

    if (-not (Invoke-Logged 'Build Vue archive image' {
        & docker build -f (Join-Path $repoRoot 'frontend-vue-archive/Dockerfile.prod') -t worktodo-frontend:vue-rollback (Join-Path $repoRoot 'frontend-vue-archive')
    })) { throw 'Vue archive image build failed' }
    $vueId = (& docker image inspect worktodo-frontend:vue-rollback --format '{{.Id}}').Trim()
    Add-Record 'Record Vue image ID' 'PASS' $vueId

    if (-not (Invoke-Logged 'Build React production image' {
        & docker build -f (Join-Path $repoRoot 'frontend/Dockerfile.prod') -t worktodo-frontend:react-drill (Join-Path $repoRoot 'frontend')
    })) { throw 'React production image build failed' }
    $reactId = (& docker image inspect worktodo-frontend:react-drill --format '{{.Id}}').Trim()
    Add-Record 'Record React image ID' 'PASS' $reactId

    Write-ComposeOverride 'worktodo-frontend:react-drill'
    Assert-ComposeSafe
    if (-not (Invoke-Logged 'Start independent prod Compose project' { Invoke-Compose @('up', '-d', '--build') })) {
        throw 'independent prod Compose start failed'
    }
    Assert-FrontendImage $reactId 'React'
    Add-Record 'Initial React application validation' 'PASS' (Test-DrillApplication 'initial')

    Write-ComposeOverride 'worktodo-frontend:vue-rollback'
    if (-not (Invoke-Logged 'Switch to Vue archive image' { Invoke-Compose @('up', '-d', '--no-build', 'frontend') })) {
        throw 'switch to Vue image failed'
    }
    Assert-FrontendImage $vueId 'Vue'
    $vueCheck = Test-DrillApplication 'Vue'
    Add-Record 'Vue homepage login and task-list validation' 'PASS' $vueCheck

    Write-ComposeOverride 'worktodo-frontend:react-drill'
    if (-not (Invoke-Logged 'Switch back to React production image' { Invoke-Compose @('up', '-d', '--no-build', 'frontend') })) {
        throw 'switch back to React image failed'
    }
    Assert-FrontendImage $reactId 'React switch-back'
    $reactCheck = Test-DrillApplication 'React'
    Add-Record 'React homepage login and task-list validation' 'PASS' $reactCheck
    $drillSucceeded = $true
} catch {
    Write-Host ("Rollback drill failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
} finally {
    try {
        if ((-not $drillSucceeded) -and (Test-Path $overridePath) -and (Test-Path $envPath)) {
            Write-Host '--- diagnostic logs (failed drill) ---'
            try { & docker compose --project-name $ProjectName --env-file $envPath --file $composePath --file $overridePath logs --tail 40 migrate backend db 2>&1 | Out-Host } catch { }
        }
        if ((Test-Path $overridePath) -and (Test-Path $envPath)) {
            Invoke-Compose @('down', '-v', '--remove-orphans')
            Add-Record 'Clean independent Compose project and volumes' 'PASS' $ProjectName
        }
    } catch {
        Add-Record 'Clean independent Compose project and volumes' 'FAIL' $_.Exception.Message
    }

    Write-Host ''
    Write-Host 'Rollback drill record (G6)'
    [pscustomobject]@{
        'Drill environment' = 'local compose'
        'Drill time' = "$($drillStarted.ToString('yyyy-MM-dd HH:mm:ss zzz')) - $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
        'Vue image digest / tag' = "worktodo-frontend:vue-rollback ($vueId)"
        'React image digest / tag' = "worktodo-frontend:react-drill ($reactId)"
        'Login validation after Vue switch' = $vueCheck
        'Login validation after React switch-back' = $reactCheck
        Notes = "independent Compose project=$ProjectName; frontend port=$Port"
    } | Format-List
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    if (-not $drillSucceeded) {
        exit 1
    }
}
