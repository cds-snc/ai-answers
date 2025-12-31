param(
  [string]$TestFile = ""
)

# Run Playwright E2E tests with full environment setup and debugging

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "E2E Test Runner - Setting Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Set environment variables
$env:NODE_ENV = "test"
$env:SESSION_TYPE = "memory"
$env:SESSION_SECRET = "test-secret"
$env:FP_PEPPER = "dev-pepper"
$env:DANGEROUSLY_DISABLE_HOST_CHECK = "true"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/dev-database?authSource=admin&retryWrites=true&w=majority"
$env:JWT_SECRET_KEY = "5a6a2e1a5fa4930ede02be93b0aeee2e"
$env:USER_AGENT = "ai-answers"
# Set a dummy key to prevent server crash in test mode
$env:GC_NOTIFY_API_KEY = "test_key-00000000-0000-0000-0000-000000000000-00000000-0000-0000-0000-000000000000"

# Output environment variables for verification
Write-Host "`nEnvironment Variables:" -ForegroundColor Green
Write-Host "  NODE_ENV: $($env:NODE_ENV)"
Write-Host "  SESSION_TYPE: $($env:SESSION_TYPE)"
Write-Host "  SESSION_SECRET: $($env:SESSION_SECRET)"
Write-Host "  FP_PEPPER: $($env:FP_PEPPER)"
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

# 1. Build the frontend (required for server to serve pages)
$buildPath = Join-Path $repoRoot 'build'
if (-not (Test-Path $buildPath)) {
  Write-Host "Build folder missing. Building frontend (npm run build)..." -ForegroundColor Yellow
  # Run build from root
  Push-Location $repoRoot
  npm run build
  Pop-Location
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
  }
}

# 2. Disable 2FA in the database
Write-Host "Disabling 2FA for testing..." -ForegroundColor Yellow
$disableScript = Join-Path $repoRoot 'scripts\disable-2fa.js'
Start-Process -FilePath 'node' -ArgumentList $disableScript -WorkingDirectory $repoRoot -NoNewWindow -Wait

# 3. Start the server in background
Write-Host "Starting server (node server/server.js) in background..." -ForegroundColor Green
$serverPath = Join-Path $repoRoot 'server\server.js'
$stdoutLog = Join-Path $repoRoot 'server_stdout.log'
$stderrLog = Join-Path $repoRoot 'server_stderr.log'

# Clear old logs
"" > $stdoutLog
"" > $stderrLog

$serverProc = Start-Process -FilePath 'node' -ArgumentList $serverPath -WorkingDirectory $repoRoot -PassThru -NoNewWindow -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
Write-Host "Server process started with PID $($serverProc.Id). Logging to server_stdout.log and server_stderr.log" -ForegroundColor Green

# 4. Wait up to 60s for server to respond on http://localhost:3001/health
$maxWait = 60
$waited = 0
Write-Host "Waiting for server to become ready..." -ForegroundColor Yellow
while ($waited -lt $maxWait) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3
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
  Write-Host "Check server_stdout.log and server_stderr.log for details." -ForegroundColor Yellow
  Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "Server is ready after $waited seconds" -ForegroundColor Green

# 5. Run Playwright tests
Write-Host "Starting Playwright E2E Tests..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

$finalTestPath = ""
if ($TestFile) {
  # Try to find the test file
  if (Test-Path $TestFile) {
    $finalTestPath = $TestFile
  }
  elseif (Test-Path (Join-Path "tests/e2e" $TestFile)) {
    $finalTestPath = (Join-Path "tests/e2e" $TestFile)
  }
  elseif (Test-Path (Join-Path "tests/e2e" ($TestFile + ".spec.js"))) {
    $finalTestPath = (Join-Path "tests/e2e" ($TestFile + ".spec.js"))
  }
}

if ($finalTestPath) {
  $finalTestPath = $finalTestPath.Replace('\', '/')
  Write-Host "Running specific test: $finalTestPath" -ForegroundColor Cyan
  npx playwright test $finalTestPath --workers=1 --trace=on --reporter=list
}
else {
  if ($TestFile) {
    Write-Host "Could not find test file: $TestFile. Running ALL tests instead." -ForegroundColor Yellow
  }
  Write-Host "Running ALL tests" -ForegroundColor Cyan
  npx playwright test --workers=1 --trace=on --reporter=list
}

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

# Stop the test server
if ($serverProc -and $serverProc.Id) {
  Write-Host "Stopping server process $($serverProc.Id)..." -ForegroundColor Yellow
  Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
}

exit $exitCode
