param(
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$BaseUrl = "http://localhost:8080/api/v1"
)

$ErrorActionPreference = "Stop"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$BaseUrl/auth/csrf" -WebSession $session
$headers = @{ "X-CSRF-Token" = $csrf.csrfToken }
$body = @{ email = "student001@seed.invalid"; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -ContentType "application/json" -Headers $headers -Body $body -WebSession $session

if ($login.user.role -ne "STUDENT") {
  throw "Unexpected login role: $($login.user.role)"
}

$before = 0
1..20 | ForEach-Object {
  $me = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -WebSession $session
  if ($me.user.email -eq "student001@seed.invalid") { $before += 1 }
}

$during = 0
try {
  docker compose stop api-1 | Out-Null
  Start-Sleep -Seconds 3
  1..10 | ForEach-Object {
    $me = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -WebSession $session
    if ($me.user.email -eq "student001@seed.invalid") { $during += 1 }
  }
}
finally {
  docker compose start api-1 | Out-Null
}

Write-Output "LOGIN_ROLE=$($login.user.role)"
Write-Output "SESSION_READS_BEFORE_FAILOVER=$before/20"
Write-Output "SESSION_READS_DURING_FAILOVER=$during/10"
