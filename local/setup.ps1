<#
  Slyshark: first-time setup on your own computer (Windows).
  Double-click "Setup Slyshark.cmd" in the project folder, or run:
    powershell -ExecutionPolicy Bypass -File local\setup.ps1 [-Database docker|neon|existing] [-DatabaseUrl <url>] [-Force]
  It checks Node.js, sets up a database, writes web\.env.local, installs packages and creates the tables.
#>
param(
  [ValidateSet("", "docker", "neon", "existing")] [string]$Database = "",
  [string]$DatabaseUrl = "",
  [switch]$Force
)
. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "Slyshark local setup" -ForegroundColor White
Step "Checking Node.js"
Test-Node

Step "Database"
$keep = (Test-Path $EnvFile) -and (-not $Force) -and (-not $Database)
if ($keep) {
  Ok "web\.env.local already exists, so it's kept. (Run with -Force to choose again.)"
  # Older settings files lack the local-mode options: add any that are missing (existing values are kept).
  $current = [IO.File]::ReadAllText($EnvFile)
  $extra = @()
  foreach ($line in @("ALLOW_PRIVATE_TARGETS=true", "TOOL_BUDGET_MS=30000", "MAX_SCAN_PORTS=1000", "COOKIE_SECURE=false")) {
    $key = $line.Split("=")[0]
    if ($current -notmatch "(?m)^\s*$key=") { $extra += $line }
  }
  if ($extra.Count) {
    $add = "`n# Added by local setup for running on this computer`n" + ($extra -join "`n") + "`n"
    [IO.File]::AppendAllText($EnvFile, $add, (New-Object System.Text.UTF8Encoding($false)))
    Ok "Added local options: $($extra -join ', ')"
  }
  if (Uses-LocalDb) { Start-LocalDb }
} else {
  if (-not $Database) {
    Write-Host "    How should Slyshark store its data?"
    Write-Host "      1) Local database in Docker  - works offline, needs Docker Desktop (recommended for local testing)"
    Write-Host "      2) Neon                      - cloud Postgres; the same database Netlify will use later"
    Write-Host "      3) A Postgres server I already have"
    $choice = Read-Host "    Choose 1, 2 or 3 [1]"
    if (-not $choice) { $choice = "1" }
    $map = @{ "1" = "docker"; "2" = "neon"; "3" = "existing" }
    if (-not $map.ContainsKey($choice)) { Fail "Please run setup again and type 1, 2 or 3." }
    $Database = $map[$choice]
  }
  if ($Database -eq "docker") { Start-LocalDb; $DatabaseUrl = $LocalDbUrl }
  elseif (-not $DatabaseUrl) {
    $prompt = "    Paste the postgresql:// connection string"
    if ($Database -eq "neon") { $prompt = "    Paste the Neon POOLED connection string (Neon console > Connect)" }
    $DatabaseUrl = (Read-Host $prompt).Trim()
  }
  if ($DatabaseUrl -notmatch '^postgres(ql)?://') { Fail "That doesn't look like a postgresql:// connection string. Run setup again." }
  if (Test-Path $EnvFile) {
    $bak = "$EnvFile.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $EnvFile $bak; Warn "Your old settings were saved to $(Split-Path -Leaf $bak)"
  }
  $template = [IO.File]::ReadAllText((Join-Path $Web ".env.local.example"))
  $re = [regex]'(?m)^DATABASE_URL=.*$'
  $text = $re.Replace($template, ("DATABASE_URL=" + $DatabaseUrl.Replace('$', '$$')), 1)
  [IO.File]::WriteAllText($EnvFile, $text, (New-Object System.Text.UTF8Encoding($false)))
  Ok "Saved settings to web\.env.local"
}

Push-Location $Web
try {
  Step "Installing packages (the first time takes a few minutes)"
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Warn "Clean install failed; trying a normal install"; Invoke-Npm @("install", "--no-audit", "--no-fund") "Installing packages" }
  Step "Creating database tables"
  Invoke-Npm @("run", "db:migrate") "Creating the tables (check DATABASE_URL in web\.env.local)"
  Step "Final check"
  Invoke-Npm @("run", "doctor") "The health check"
} finally { Pop-Location }

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "  Start Slyshark:  double-click 'Start Slyshark.cmd'  (or: powershell -ExecutionPolicy Bypass -File local\start.ps1)"
Write-Host "  Then open:       http://localhost:3000   and sign in with  testuser / password123"
