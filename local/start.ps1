<#
  Slyshark: start on your own computer.
    powershell -ExecutionPolicy Bypass -File local\start.ps1 [-Mode prod|dev] [-Port 3000] [-Rebuild] [-NoBrowser]
  prod (default): optimised build, rebuilt automatically when the code changed. dev: live reload while editing code.
  Stop with Ctrl+C. The Docker database keeps running in the background (local\db.ps1 stop to stop it).
#>
param(
  [ValidateSet("prod", "dev")] [string]$Mode = "prod",
  [int]$Port = 3000,
  [switch]$Rebuild,
  [switch]$NoBrowser
)
. (Join-Path $PSScriptRoot "common.ps1")

if (-not (Test-Path $EnvFile)) { Fail "Slyshark isn't set up yet. Double-click 'Setup Slyshark.cmd' first (or run local\setup.ps1)." }
Test-Node
if (Uses-LocalDb) { Step "Starting the local database"; Start-LocalDb }

Push-Location $Web
try {
  $env:PORT = "$Port"
  if (-not (Test-Path (Join-Path (Join-Path $Web "node_modules") "next"))) { Step "Installing packages"; Invoke-Npm @("install", "--no-audit", "--no-fund") "Installing packages" }
  Step "Updating the database (new tables after an update)"
  Invoke-Npm @("run", "db:migrate") "Updating the database"
  Step "Health check"
  Invoke-Npm @("run", "doctor") "The health check"

  if ($Mode -eq "prod") {
    $buildId = Join-Path (Join-Path $Web ".next") "BUILD_ID"
    $needBuild = $Rebuild -or -not (Test-Path $buildId)
    if (-not $needBuild) {
      $built = (Get-Item $buildId).LastWriteTimeUtc
      $newer = Get-ChildItem -Path (Join-Path $Web "src"), (Join-Path $Web "public") -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $built } | Select-Object -First 1
      foreach ($f in @("package.json", "package-lock.json", "next.config.ts")) { $p = Join-Path $Web $f; if ((Test-Path $p) -and (Get-Item $p).LastWriteTimeUtc -gt $built) { $newer = $p } }
      if ($newer) { $needBuild = $true; Warn "Code changed since the last build, so it will be rebuilt." }
    }
    if ($needBuild) { Step "Building Slyshark (about a minute)"; Invoke-Npm @("run", "build") "The build" }
  }

  $url = "http://localhost:$Port"
  if (-not $NoBrowser) { Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 5; Start-Process $u } -ArgumentList $url | Out-Null }
  Step "Slyshark is starting at $url  (press Ctrl+C to stop)"
  $ips = @()
  try { $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq "InterNetwork" -and -not $_.ToString().StartsWith("127.") } | ForEach-Object { $_.ToString() } } catch { }
  foreach ($ip in $ips) { Write-Host "    Other devices on your network: http://${ip}:$Port" -ForegroundColor DarkGray }
  if ($Mode -eq "prod") { & npx next start -p $Port } else { & npx next dev -p $Port }
} finally { Pop-Location }
