<#
.SYNOPSIS
    Starts the local DocumentDB and Redis tunnels and verifies S3 access.

.DESCRIPTION
    DocumentDB and Redis are private TCP services, so they are opened in separate
    PowerShell windows through ECS Exec. S3 is an AWS HTTPS service and is checked
    directly using the local AWS credentials instead of being tunnelled.

.EXAMPLE
    .\scripts\start-local-aws-connections.ps1 -Profile default
#>
[CmdletBinding()]
param(
    [string]$ClusterName = "ai-answers-cluster",
    [string]$ServiceName = "ai-answers-app-service",
    [string]$ContainerName = "ai-answers",
    [string]$Region = $env:AWS_REGION,
    [string]$Profile,
    [string]$TaskArn
)

$ErrorActionPreference = "Stop"

if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
}
if (-not $Region) {
    $Region = "ca-central-1"
}

function Add-AwsContextArgs {
    param([string[]]$Arguments)

    if ($Profile) {
        $Arguments += @("--profile", $Profile)
    }
    if ($Region) {
        $Arguments += @("--region", $Region)
    }
    return $Arguments
}

function Invoke-AwsText {
    param([string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = @(& aws @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')`n$output"
    }

    return ($output | Out-String).Trim()
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found on PATH."
}

$identityArgs = Add-AwsContextArgs @("sts", "get-caller-identity", "--output", "json")
Write-Host "Checking AWS credentials in region '$Region'..."
$identity = Invoke-AwsText -Arguments $identityArgs | ConvertFrom-Json
Write-Host "AWS account: $($identity.Account)"
Write-Host "AWS principal: $($identity.Arn)"

$bucketArgs = Add-AwsContextArgs @(
    "ssm",
    "get-parameter",
    "--name",
    "s3_bucket_name",
    "--query",
    "Parameter.Value",
    "--output",
    "text"
)
$bucketName = Invoke-AwsText -Arguments $bucketArgs
if (-not $bucketName) {
    throw "The SSM parameter 's3_bucket_name' was empty."
}

$headBucketArgs = Add-AwsContextArgs @(
    "s3api",
    "head-bucket",
    "--bucket",
    $bucketName
)
Invoke-AwsText -Arguments $headBucketArgs | Out-Null
Write-Host "S3 access verified for bucket '$bucketName'."
Write-Host "Ensure .env contains: S3_BUCKET_NAME='$bucketName'"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$docDbScript = Join-Path $scriptRoot "start-docdb-tunnel.ps1"
$redisScript = Join-Path $scriptRoot "start-redis-tunnel.ps1"
$commonArguments = @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass"
)

function Start-TunnelWindow {
    param(
        [string]$ScriptPath,
        [string]$WindowTitle
    )

    $arguments = @($commonArguments + @("-File", $ScriptPath, "-ClusterName", $ClusterName, "-ServiceName", $ServiceName, "-ContainerName", $ContainerName, "-Region", $Region))
    if ($Profile) {
        $arguments += @("-Profile", $Profile)
    }
    if ($TaskArn) {
        $arguments += @("-TaskArn", $TaskArn)
    }

    Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory (Get-Location).Path -WindowStyle Normal
    Write-Host "$WindowTitle tunnel window started."
}

Start-TunnelWindow -ScriptPath $docDbScript -WindowTitle "DocumentDB"
Start-TunnelWindow -ScriptPath $redisScript -WindowTitle "Redis"

Write-Host ""
Write-Host "DocumentDB: localhost:27018"
Write-Host "Redis:      localhost:6379"
Write-Host "S3:         direct AWS access, bucket '$bucketName'"
Write-Host "Keep both tunnel windows open while running the app."
