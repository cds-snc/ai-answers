param(
  [string]$TestFile = "",
  [string]$Environment = "dev",
  [switch]$Headed = $false,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

# Handle --headed passed in remaining args or as TestFile
if (-not $RemainingArgs -and $args) { $RemainingArgs = $args }

if ($RemainingArgs -contains "--headed" -or $TestFile -eq "--headed") {
  $Headed = $true
}
# If TestFile was just the flag, clear it
if ($TestFile -eq "--headed") { $TestFile = "" }

# Check if Environment was passed as a positional arg (if TestFile is an environment name)
$envs = @("dev", "sandbox", "production")
if ($TestFile -and ($envs -contains $TestFile.ToLower())) {
  $Environment = $TestFile.ToLower()
  $TestFile = ""
}

# Run Playwright E2E tests with full environment setup and debugging

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "E2E Test Runner - Setting Environment: $Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Set environment variables and paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

# Always force NODE_ENV to test for E2E tests
$env:NODE_ENV = "test"
$env:TEST_ENV = $Environment

# Output environment variables for verification (from .env or inherited)
Write-Host "`nEnvironment Variables (NODE_ENV forced to test):" -ForegroundColor Green
Write-Host "  NODE_ENV: $($env:NODE_ENV)"
Write-Host "  TEST_ENV: $($env:TEST_ENV)"
Write-Host "  SESSION_TYPE: $($env:SESSION_TYPE)"
Write-Host "  MONGODB_URI: $($env:MONGODB_URI)"
Write-Host ""


# Check if server is already running (Only for dev)
if ($Environment -eq "dev") {
  $serverRunning = $false
  try {
    $check = Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($check.StatusCode -eq 200) { $serverRunning = $true }
  }
  catch { }
    
  # Start the server in background if not already running
  if (-not $serverRunning) {
    $serverPath = Join-Path $repoRoot 'server\server.js'
    $outLog = Join-Path $repoRoot 'server-out.log'
    $errLog = Join-Path $repoRoot 'server-err.log'
    if (Test-Path $outLog) { Remove-Item $outLog }
    if (Test-Path $errLog) { Remove-Item $errLog }
    $serverProc = Start-Process -FilePath 'node' -ArgumentList $serverPath -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Write-Host "Server process started with PID $($serverProc.Id). Logs: $outLog, $errLog" -ForegroundColor Green
    
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
}
else {
  Write-Host "Skipping local server startup for environment: $Environment" -ForegroundColor Yellow
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

# $playwrightArgs += "--workers=1" - Removed to allow parallel execution via config or default
$playwrightArgs += "--trace=on"
$playwrightArgs += "--reporter=html"
$playwrightArgs += "--reporter=list"
$playwrightArgs += "--timeout=90000"  # Increase default timeout to 90s to accommodate inspection delay

# Check if headed mode is requested via parameter or environment variable
if ($Headed -or ($env:TEST_HEADED -eq "true")) {
  Write-Host "Running in HEADED mode... (Synchronous execution forced)" -ForegroundColor Yellow
  $playwrightArgs += "--headed"
  $playwrightArgs += "--workers=1"
}
else {
  Write-Host "Running in HEADLESS mode... (Parallel execution enabled)" -ForegroundColor Gray
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
