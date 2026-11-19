# Shared helpers for the Slyshark local scripts (Windows PowerShell 5.1 and PowerShell 7).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root "web"
$EnvFile = Join-Path $Web ".env.local"
$LocalDbUrl = "postgresql://slyshark:slyshark@localhost:5433/slyshark"

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "    $m" -ForegroundColor Red; exit 1 }

function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js isn't installed. Install the LTS with:  winget install OpenJS.NodeJS.LTS   (or from https://nodejs.org), open a NEW window, and run this again." }
  $v = (node -v).TrimStart("v"); $p = $v.Split(".")
  if ([int]$p[0] -lt 20 -or ([int]$p[0] -eq 20 -and [int]$p[1] -lt 9)) { Fail "Node.js $v is too old: Slyshark needs 20.9 or newer. Update with:  winget upgrade OpenJS.NodeJS.LTS" }
  Ok "Node.js $v"
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker isn't installed. Install Docker Desktop (winget install Docker.DockerDesktop), start it, then run this again. Or re-run setup and choose Neon." }
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  docker info *> $null; $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { Fail "Docker is installed but not running. Open Docker Desktop, wait until it says it's running, then try again." }
}

function Start-LocalDb {
  Test-Docker
  Push-Location $Root
  try { docker compose up -d db; if ($LASTEXITCODE -ne 0) { Fail "Couldn't start the database container (see the messages above)." } } finally { Pop-Location }
  Write-Host "    Waiting for the database" -NoNewline
  $status = ""
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  for ($i = 0; $i -lt 60; $i++) {
    $status = (docker inspect -f "{{.State.Health.Status}}" slyshark-db 2>$null)
    if ($status -eq "healthy") { break }
    Start-Sleep -Seconds 1; Write-Host "." -NoNewline
  }
  $ErrorActionPreference = $prev
  Write-Host ""
  if ($status -ne "healthy") { Fail "The database didn't become ready. Look at:  docker logs slyshark-db" }
  Ok "Local database is running (localhost:5433)"
}

function Uses-LocalDb { (Test-Path $EnvFile) -and ((Get-Content $EnvFile -Raw) -match '(?m)^DATABASE_URL=.*localhost:5433') }

function Invoke-Npm([string[]]$NpmArgs, [string]$What) {
  & npm @NpmArgs
  if ($LASTEXITCODE -ne 0) { Fail "$What failed (see the messages above)." }
}
