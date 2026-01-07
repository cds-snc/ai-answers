
# Script to setup AWS Environment (CLI + Session Manager Plugin) on Windows

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param ($command)
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "Checking AWS Environment Setup..." -ForegroundColor Cyan

if (-not (Test-IsAdmin)) {
    Write-Host "⚠️  Warning: This script may need Administrator privileges to install software globally." -ForegroundColor Yellow
    Write-Host "If the installation fails, please restart your terminal as Administrator." -ForegroundColor Yellow
}

# 1. Check/Install AWS CLI
if (Test-CommandExists "aws") {
    Write-Host "✅ AWS CLI is already installed." -ForegroundColor Green
}
else {
    Write-Host "⚠️ AWS CLI not found. Attempting to install..." -ForegroundColor Yellow
    $awsCliUrl = "https://awscli.amazonaws.com/AWSCLIV2.msi"
    $awsCliInstaller = "$env:TEMP\AWSCLIV2.msi"
    
    Write-Host "Downloading AWS CLI from $awsCliUrl..."
    Invoke-WebRequest -Uri $awsCliUrl -OutFile $awsCliInstaller
    
    Write-Host "Installing AWS CLI (this may take a minute)..."
    # Added /passive to show progress but not require interaction, and /qn for fallback
    $process = Start-Process msiexec.exe -ArgumentList "/i `"$awsCliInstaller`" /passive /norestart" -Wait -PassThru
    
    if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) {
        Write-Host "❌ AWS CLI installation failed with exit code $($process.ExitCode)." -ForegroundColor Red
        Write-Host "Try downloading and installing manually: $awsCliUrl" -ForegroundColor Gray
    }
    else {
        # Refresh env vars for current session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        if (Test-CommandExists "aws") {
            Write-Host "✅ AWS CLI installed successfully." -ForegroundColor Green
        }
        else {
            Write-Host "⚠️ AWS CLI installed but not in current PATH. You will need to RESTART your terminal." -ForegroundColor Yellow
        }
    }
}

# 2. Check/Install Session Manager Plugin
if (Test-CommandExists "session-manager-plugin") {
    Write-Host "✅ Session Manager Plugin is already installed." -ForegroundColor Green
}
else {
    Write-Host "⚠️ Session Manager Plugin not found. Attempting to install..." -ForegroundColor Yellow
    $pluginUrl = "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe"
    $pluginInstaller = "$env:TEMP\SessionManagerPluginSetup.exe"
    
    Write-Host "Downloading Session Manager Plugin from $pluginUrl..."
    Invoke-WebRequest -Uri $pluginUrl -OutFile $pluginInstaller
    
    Write-Host "Installing Session Manager Plugin..."
    # /S is silent for this installer
    $process = Start-Process $pluginInstaller -ArgumentList "/S" -Wait -PassThru
    
    if ($process.ExitCode -ne 0) {
        Write-Host "❌ Session Manager Plugin installation failed with exit code $($process.ExitCode)." -ForegroundColor Red
        Write-Host "Try downloading and installing manually: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html#install-plugin-windows" -ForegroundColor Gray
    }
    else {
        # Refresh path again
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        if (Test-CommandExists "session-manager-plugin") {
            Write-Host "✅ Session Manager Plugin installed successfully." -ForegroundColor Green
        }
        else {
            Write-Host "⚠️ Session Manager Plugin installed but not in current PATH. You will need to RESTART your terminal." -ForegroundColor Yellow
        }
    }
}

# 3. Check Credentials
Write-Host "`nChecking AWS Credentials..." -ForegroundColor Cyan
if (Test-CommandExists "aws") {
    try {
        aws sts get-caller-identity | Out-Null
        Write-Host "✅ AWS Credentials are configured and valid." -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️ AWS Credentials not configured or invalid." -ForegroundColor Yellow
        Write-Host "Launching 'aws configure'..." -ForegroundColor Cyan
        aws configure
    }
}
else {
    Write-Host "❌ Cannot check credentials because 'aws' command is missing. Please restart your terminal and run this script again." -ForegroundColor Red
}

Write-Host "`nSetup Check Complete!" -ForegroundColor Cyan
Write-Host "NOTE: If you installed tools, you MUST restart your terminal (and maybe your IDE/VS Code) to use them." -ForegroundColor Gray
