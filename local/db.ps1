<#
  Slyshark local database (Docker).
    powershell -ExecutionPolicy Bypass -File local\db.ps1 up|stop|status|logs|reset
  reset deletes ALL local Slyshark data (accounts, projects, runs) and asks first.
#>
param([ValidateSet("up", "stop", "status", "logs", "reset")] [string]$Action = "status")
. (Join-Path $PSScriptRoot "common.ps1")
Test-Docker
Push-Location $Root
try {
  switch ($Action) {
    "up" { Start-LocalDb }
    "stop" { docker compose stop db; Ok "Database stopped (your data is kept)." }
    "status" { docker compose ps db }
    "logs" { docker compose logs --tail 100 db }
    "reset" {
      $answer = Read-Host "    This deletes ALL local Slyshark data. Type DELETE to continue"
      if ($answer -ne "DELETE") { Warn "Cancelled. Nothing was deleted."; return }
      docker compose down -v; Start-LocalDb
      Push-Location $Web; try { Invoke-Npm @("run", "db:migrate") "Creating the tables" } finally { Pop-Location }
      Ok "Fresh database ready (testuser / password123)."
    }
  }
} finally { Pop-Location }
