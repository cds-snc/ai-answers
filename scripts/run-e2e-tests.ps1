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

# Output environment variables for verification
Write-Host "`nEnvironment Variables:" -ForegroundColor Green
Write-Host "  NODE_ENV: $($env:NODE_ENV)"
Write-Host "  SESSION_TYPE: $($env:SESSION_TYPE)"
Write-Host "  SESSION_SECRET: $($env:SESSION_SECRET)"
Write-Host "  FP_PEPPER: $($env:FP_PEPPER)"
Write-Host ""

Write-Host "Ensure server is running with NODE_ENV=test mode" -ForegroundColor Yellow
Write-Host ""

# Start the server in background so Playwright can hit localhost:3001
Write-Host "Starting server (node server/server.js) in background..." -ForegroundColor Green
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
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
  } catch {
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

# Run Playwright tests headless with maximum debugging
Write-Host "Starting Playwright E2E Tests..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

npx playwright test `
  --workers=1 `
  --trace=on `
  --reporter=html `
  --reporter=list `
  tests/e2e/chat-test.spec.js

# Capture exit code
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
  Write-Host "Tests PASSED" -ForegroundColor Green
} else {
  Write-Host "Tests FAILED (exit code: $exitCode)" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan

# Stop the test server we started (if running)
if ($serverProc -and $serverProc.Id) {
  Write-Host "Stopping server process $($serverProc.Id)..." -ForegroundColor Yellow
  Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
}

exit $exitCode
