<#
.SYNOPSIS
    Starts an AWS Session Manager tunnel from an ECS Exec-enabled task to Redis.

.DESCRIPTION
    This script looks up a running ECS task for the given cluster/service, reads the
    container runtime ID, and opens a port forward through that task to a private
    Redis host.

    The script uses whatever AWS credentials are already available to the AWS CLI.
    In PowerShell, that usually means exported AWS_* environment variables or an
    AWS profile configured on the machine.

.EXAMPLE
    .\scripts\start-redis-tunnel.ps1 `
      -ClusterName ai-answers-cluster `
      -ServiceName ai-answers-app-service `
      -RedisHost your-redis.xxxxxx.ca-central-1.cache.amazonaws.com
#>
[CmdletBinding()]
param(
    [string]$ClusterName = "ai-answers-cluster",
    [string]$ServiceName = "ai-answers-app-service",
    [string]$ContainerName = "ai-answers",
    [string]$RedisHost,
    [int]$RemotePort = 6379,
    [int]$LocalPort = 6379,
    [string]$TaskArn,
    [string]$Region = $env:AWS_REGION,
    [string]$Profile
)

$ErrorActionPreference = "Stop"

if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
}
if (-not $Region) {
    $Region = "ca-central-1"
}

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = Invoke-AwsCommand -Arguments $Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')`n$output"
    }

    if (-not $output) {
        return $null
    }

    return $output | ConvertFrom-Json
}

function Invoke-AwsText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = Invoke-AwsCommand -Arguments $Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')`n$output"
    }

    return ($output | Out-String).Trim()
}

function Invoke-AwsCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Capture native stderr without PowerShell turning it into a truncated error record.
        $ErrorActionPreference = "Continue"
        return @(& aws @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Get-EcsTask {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EcsTaskArn
    )

    $describeArgs = Add-AwsContextArgs @(
        "ecs",
        "describe-tasks",
        "--cluster",
        $ClusterName,
        "--tasks",
        $EcsTaskArn,
        "--output",
        "json"
    )

    $describe = Invoke-AwsJson -Arguments $describeArgs
    return $describe.tasks | Select-Object -First 1
}

function Test-EcsTaskReadyForSession {
    param(
        [Parameter(Mandatory = $true)]
        $Task
    )

    if (-not $Task.enableExecuteCommand) {
        return $false
    }

    $container = $Task.containers | Where-Object { $_.name -eq $ContainerName } | Select-Object -First 1
    if (-not $container) {
        return $false
    }

    $agent = $container.managedAgents | Where-Object { $_.name -eq "ExecuteCommandAgent" } | Select-Object -First 1
    if (-not $agent -or $agent.lastStatus -ne "RUNNING") {
        return $false
    }

    if (-not $container.runtimeId) {
        return $false
    }

    return $true
}

function Add-AwsContextArgs {
    param(
        [string[]]$Arguments
    )

    if ($Profile) {
        $Arguments += @("--profile", $Profile)
    }

    if ($Region) {
        $Arguments += @("--region", $Region)
    }

    return $Arguments
}

function Get-RedisHost {
    if ($RedisHost) {
        return $RedisHost
    }

    if ($env:REDIS_HOST) {
        return $env:REDIS_HOST
    }

    $ssmArgs = Add-AwsContextArgs @(
        "ssm",
        "get-parameter",
        "--name",
        "redis_url",
        "--with-decryption",
        "--query",
        "Parameter.Value",
        "--output",
        "text"
    )

    try {
        $redisUrl = Invoke-AwsText -Arguments $ssmArgs
        if (-not $redisUrl) {
            throw "Empty redis_url parameter"
        }
        return [uri]$redisUrl | Select-Object -ExpandProperty Host
    } catch {
        if ($env:REDIS_URL) {
            try {
                return [uri]$env:REDIS_URL | Select-Object -ExpandProperty Host
            } catch {
                throw "Could not infer the Redis host from SSM parameter 'redis_url' or REDIS_URL. Pass -RedisHost explicitly."
            }
        }
        throw "Could not infer the Redis host from SSM parameter 'redis_url'. Pass -RedisHost or set REDIS_HOST explicitly."
    }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found on PATH. Install AWS CLI v2 before running this script."
}

if (-not $TaskArn) {
    Write-Host "Finding a running task in cluster '$ClusterName' and service '$ServiceName'..."
    $listArgs = Add-AwsContextArgs @(
        "ecs",
        "list-tasks",
        "--cluster",
        $ClusterName,
        "--service-name",
        $ServiceName,
        "--desired-status",
        "RUNNING",
        "--output",
        "json"
    )

    $taskList = Invoke-AwsJson -Arguments $listArgs
    if (-not $taskList -or -not $taskList.taskArns -or $taskList.taskArns.Count -eq 0) {
        throw "No running ECS tasks were found for cluster '$ClusterName' and service '$ServiceName'."
    }

    $TaskArn = $null
    foreach ($candidateTaskArn in $taskList.taskArns) {
        $candidateTask = Get-EcsTask -EcsTaskArn $candidateTaskArn
        if ($candidateTask -and (Test-EcsTaskReadyForSession -Task $candidateTask)) {
            $TaskArn = $candidateTaskArn
            break
        }
    }

    if (-not $TaskArn) {
        throw "No ECS Exec-ready running task was found for cluster '$ClusterName' and service '$ServiceName'. ECS Exec must be enabled on the service, and the task's ExecuteCommandAgent must be RUNNING before Session Manager can open the tunnel."
    }
}

$taskId = ($TaskArn -split "/")[-1]
if (-not $taskId) {
    throw "Could not derive a task ID from ARN '$TaskArn'."
}

Write-Host "Reading container runtime ID from task '$TaskArn'..."
$task = Get-EcsTask -EcsTaskArn $TaskArn
if (-not $task) {
    throw "AWS ECS did not return task details for '$TaskArn'."
}

$container = $task.containers | Where-Object { $_.name -eq $ContainerName } | Select-Object -First 1
if (-not $container) {
    $availableContainers = $task.containers | ForEach-Object { $_.name } | Sort-Object
    $availableLabel = if ($availableContainers) { $availableContainers -join ", " } else { "(none)" }
    throw "Container '$ContainerName' was not found in task '$TaskArn'. Available containers: $availableLabel"
}

if (-not $container.runtimeId) {
    throw "Container '$ContainerName' in task '$TaskArn' did not include a runtimeId."
}

$RedisHost = Get-RedisHost
$target = "ecs:{0}_{1}_{2}" -f $ClusterName, $taskId, $container.runtimeId
$parameters = @{
    host = @($RedisHost)
    portNumber = @("$RemotePort")
    localPortNumber = @("$LocalPort")
} | ConvertTo-Json -Compress
$parameterFile = Join-Path ([System.IO.Path]::GetTempPath()) ("redis-tunnel-{0}.json" -f ([guid]::NewGuid().ToString("N")))
[System.IO.File]::WriteAllText($parameterFile, $parameters, [System.Text.UTF8Encoding]::new($false))
$parameterFileUri = "file://" + ($parameterFile -replace '\\', '/')

Write-Host "Opening tunnel: localhost:${LocalPort} -> ${RedisHost}:${RemotePort}"
Write-Host "Session target: $target"
Write-Host "Session parameters file: $parameterFileUri"

$startSessionArgs = Add-AwsContextArgs @(
    "ssm",
    "start-session",
    "--target",
    $target,
    "--document-name",
    "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters",
    $parameterFileUri
)

$exitCode = 0
try {
    & aws @startSessionArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Remove-Item -LiteralPath $parameterFile -ErrorAction SilentlyContinue
}

exit $exitCode
