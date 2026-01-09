param(
  [string]$TestFile = "",
  [switch]$Headed = $false
)

# Run Playwright E2E tests with full environment setup and debugging

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "E2E Test Runner - Setting Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Set environment variables and paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

# Always force NODE_ENV to test for E2E tests
$env:NODE_ENV = "test"

# Output environment variables for verification (from .env or inherited)
Write-Host "`nEnvironment Variables (NODE_ENV forced to test):" -ForegroundColor Green
Write-Host "  NODE_ENV: $($env:NODE_ENV)"
Write-Host "  SESSION_TYPE: $($env:SESSION_TYPE)"
Write-Host "  MONGODB_URI: $($env:MONGODB_URI)"
Write-Host ""


# Check if server is already running
$serverRunning = $false
try {
  $check = Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
  if ($check.StatusCode -eq 200) { $serverRunning = $true }
}
catch { }

# Start the server in background if not already running
if (-not $serverRunning) {
  Write-Host "Starting server (node server/server.js) in background..." -ForegroundColor Green
  $serverPath = Join-Path $repoRoot 'server\server.js'
  $serverProc = Start-Process -FilePath 'node' -ArgumentList $serverPath -WorkingDirectory $repoRoot -PassThru
  Write-Host "Server process started with PID $($serverProc.Id)" -ForegroundColor Green

  # Wait up to 30s for server to respond on http://localhost:3001
  $maxWait = 30
  $waited = 0
  while ($waited -lt $maxWait) {
    try {
      $resp = Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -eq 200) { break }
    }
    catch {
      # ignore
    }
    Start-Sleep -Seconds 1
    $waited++
  }
  if ($waited -ge $maxWait) {
    Write-Host "Server did not become ready after $maxWait seconds" -ForegroundColor Red
    Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
    exit 1
  }
  Write-Host "Server is ready after $waited seconds" -ForegroundColor Green
}
else {
  Write-Host "Server is already running on port 3001." -ForegroundColor Yellow
}

# Run Playwright tests headless with maximum debugging
Write-Host "Starting Playwright E2E Tests..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# Build Playwright arguments
$playwrightArgs = @("test")
if ($TestFile) {
  $playwrightArgs += $TestFile
  Write-Host "Running specific test: $TestFile" -ForegroundColor Cyan
}
else {
  $playwrightArgs += "tests/e2e"
  Write-Host "Running ALL E2E tests in tests/e2e" -ForegroundColor Cyan
}

$playwrightArgs += "--workers=1"
$playwrightArgs += "--trace=on"
$playwrightArgs += "--reporter=html"
$playwrightArgs += "--reporter=list"

# Check if headed mode is requested via parameter or environment variable
if ($Headed -or ($env:TEST_HEADED -eq "true")) {
  Write-Host "Running in HEADED mode..." -ForegroundColor Yellow
  $playwrightArgs += "--headed"
}
else {
  Write-Host "Running in HEADLESS mode..." -ForegroundColor Gray
}

# Run Playwright
npx playwright @playwrightArgs

# Capture exit code
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
  Write-Host "Tests PASSED" -ForegroundColor Green
}
else {
  Write-Host "Tests FAILED (exit code: $exitCode)" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan

# Stop the test server we started (if running)
if ($serverProc -and $serverProc.Id) {
  Write-Host "Stopping server process $($serverProc.Id)..." -ForegroundColor Yellow
  Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
}

exit $exitCode
