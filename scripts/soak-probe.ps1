[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [int]$IntervalSeconds = 60,
    [double]$Hours = 48,
    [string]$Out = ''
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($Out)) {
    $Out = "soak-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
}
$outPath = [IO.Path]::GetFullPath($Out)
$duration = [TimeSpan]::FromHours($Hours)
$started = Get-Date
$deadline = $started + $duration
$round = 0
$failures = 0
$consecutiveFailures = 0
$longestConsecutiveFailureSeconds = 0
$endpointStates = @{}
$rows = [System.Collections.Generic.List[object]]::new()

function Invoke-Probe {
    param([string]$Uri)
    $local = Get-Date
    $utc = $local.ToUniversalTime()
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $status = 0
    $errorText = ''
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec ([Math]::Max(10, [Math]::Min(60, $IntervalSeconds)))
        $status = [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $status = [int]$_.Exception.Response.StatusCode.value__
        }
        $errorText = $_.Exception.Message
    } finally {
        $watch.Stop()
    }
    [pscustomobject]@{
        TimestampLocal = $local.ToString('yyyy-MM-dd HH:mm:ss zzz')
        TimestampUtc = $utc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        Endpoint = $Uri
        StatusCode = $status
        DurationMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 1)
        Success = ($status -ge 200 -and $status -lt 400)
        Error = $errorText
    }
}

New-Item -ItemType Directory -Path (Split-Path -Parent $outPath) -Force | Out-Null
Write-Host "Soak probe started: $base; interval=${IntervalSeconds}s; duration=${Hours}h; output=$outPath"
try {
    while ((Get-Date) -lt $deadline) {
        $round++
        $results = @(
            Invoke-Probe -Uri "$base/"
            Invoke-Probe -Uri "$base/api/v1/health"
        )
        foreach ($result in $results) {
            $rows.Add($result)
            if (-not $endpointStates.ContainsKey($result.Endpoint)) {
                $endpointStates[$result.Endpoint] = @{
                    Count = 0
                    Started = $null
                }
            }
            $state = $endpointStates[$result.Endpoint]
            if ($result.Success) {
                if ($state.Count -gt 0) {
                    $durationSeconds = ((Get-Date) - $state.Started).TotalSeconds
                    $longestConsecutiveFailureSeconds = [Math]::Max($longestConsecutiveFailureSeconds, $durationSeconds)
                }
                $state.Count = 0
                $state.Started = $null
            } else {
                $failures++
                if ($state.Count -eq 0) {
                    $state.Started = Get-Date
                }
                $state.Count++
                if ($state.Count -ge 3) {
                    Write-Host "!!! ALERT: consecutive failures=$($state.Count) endpoint=$($result.Endpoint) status=$($result.StatusCode) error=$($result.Error)" -ForegroundColor Red
                }
            }
            Write-Host ("[{0}] {1} status={2} duration_ms={3} success={4}" -f $result.TimestampLocal, $result.Endpoint, $result.StatusCode, $result.DurationMs, $result.Success)
        }
        if ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds $IntervalSeconds
        }
    }
} finally {
    foreach ($state in $endpointStates.Values) {
        if ($state.Count -gt 0) {
            $durationSeconds = ((Get-Date) - $state.Started).TotalSeconds
            $longestConsecutiveFailureSeconds = [Math]::Max($longestConsecutiveFailureSeconds, $durationSeconds)
        }
    }
    $rows | Export-Csv -LiteralPath $outPath -NoTypeInformation -Encoding utf8
    Write-Host ''
    Write-Host "Total rounds: $round"
    Write-Host "Failures: $failures"
    Write-Host ("Longest consecutive failure duration: {0:N1} seconds" -f $longestConsecutiveFailureSeconds)
    Write-Host "CSV: $outPath"
}
