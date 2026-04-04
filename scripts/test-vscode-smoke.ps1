param(
  [string]$BaseUrl = "http://127.0.0.1:31415",
  [string]$Cwd = "d:\AISpace\Apps\NaughtAgent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "[SMOKE FAILED] $Message"
  }
}

Write-Host "==> Build VSCode extension" -ForegroundColor Cyan
Push-Location "d:\AISpace\Apps\NaughtAgent\packages\vscode"
try {
  npm run build | Out-Host
  Assert-True ($LASTEXITCODE -eq 0) "vscode build failed"
} finally {
  Pop-Location
}

Write-Host "==> Check daemon health" -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
} catch {
  Write-Host "Daemon not running, starting..." -ForegroundColor Yellow
  Start-Process -FilePath "node" -ArgumentList @("d:\AISpace\Apps\NaughtAgent\packages\agent\dist\cli\cli.js", "daemon", "start") -WorkingDirectory "d:\AISpace\Apps\NaughtAgent\packages\agent" -WindowStyle Hidden | Out-Null

  $health = $null
  for ($i = 0; $i -lt 12; $i++) {
    try {
      $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
}

Assert-True ($health.status -eq "ok") "daemon health is not ok"

Write-Host "==> Create/find session" -ForegroundColor Cyan
$sessionBody = @{ cwd = $Cwd; agentType = "build" } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "$BaseUrl/sessions/find-or-create" -ContentType "application/json" -Body $sessionBody
Assert-True (-not [string]::IsNullOrWhiteSpace($session.id)) "session id missing"

Write-Host "==> Stream one message" -ForegroundColor Cyan
$msgBody = @{ message = "Say hello in one sentence."; stream = $true } | ConvertTo-Json
$response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/sessions/$($session.id)/messages" -Headers @{ Accept = "text/event-stream" } -ContentType "application/json" -Body $msgBody
$content = $response.Content

$hasDone = $content.Contains("done")
$hasText = $content.Contains("text_delta") -or $content.Contains("text")

Assert-True $hasDone "stream does not contain done event"
Assert-True $hasText "stream does not contain text event"

Write-Host "[SMOKE PASS] build + daemon + stream pipeline is healthy" -ForegroundColor Green
