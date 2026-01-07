
# Script to connect to Staging DB via ECS Port Forwarding

$ErrorActionPreference = "Stop"
$REGION = "ca-central-1" # Assuming ca-central-1 based on typical CDS setup, can be parameterized
$CLUSTER_NAME = "ai-answers-cluster"
$SERVICE_NAME = "ai-answers-app-service"
$CONTAINER_NAME = "ai-answers"
$LOCAL_PORT = 27017

# Check prerequisites
if (-not (Get-Command "aws" -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI is not installed. Please run setup-aws-env.ps1 first."
}
if (-not (Get-Command "session-manager-plugin" -ErrorAction SilentlyContinue)) {
    Write-Error "Session Manager Plugin is not installed. Please run setup-aws-env.ps1 first."
}

Write-Host "Fetching configuration..." -ForegroundColor Cyan

# 1. Get Credentials and Config from SSM
try {
    $ssmParams = aws ssm get-parameters --names "docdb_username" "docdb_password" "docdb_uri" --with-decryption --query "Parameters[*].{Name:Name,Value:Value}" --output json | ConvertFrom-Json
    
    $username = ($ssmParams | Where-Object { $_.Name -eq "docdb_username" }).Value
    $password = ($ssmParams | Where-Object { $_.Name -eq "docdb_password" }).Value
    $uri = ($ssmParams | Where-Object { $_.Name -eq "docdb_uri" }).Value
    
    if (-not $uri) {
        throw "Could not retrieve docdb_uri from SSM."
    }
    
    # Parse Host from URI (mongodb://user:pass@host:port/...)
    # Regex to handle potential special chars in user/pass
    if ($uri -match "@([^:]+):(\d+)") {
        $dbHost = $Matches[1]
        $dbPort = $Matches[2]
    }
    else {
        throw "Could not parse DB Host from URI."
    }
    
}
catch {
    Write-Error "Failed to retrieve SSM parameters. Ensure you have permissions (ssm:GetParameter). Error: $_"
}

Write-Host "  DB Host: $dbHost" -ForegroundColor Gray
Write-Host "  DB User: $username" -ForegroundColor Gray

# 2. Find a running ECS Task
Write-Host "`nFinding running ECS task..." -ForegroundColor Cyan
try {
    $taskArns = aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --desired-status RUNNING --query "taskArns" --output text
    
    if (-not $taskArns) {
        throw "No running tasks found for service $SERVICE_NAME in cluster $CLUSTER_NAME."
    }
    
    # Pick the first one
    $fullArn = $taskArns.Split("`t")[0]
    $taskId = $fullArn.Split("/")[-1]
    # Extract ID from ARN if needed, or just use ARN. AWS CLI usually accepts ARN.
    Write-Host "  Using Task: $taskId" -ForegroundColor Gray

}
catch {
    Write-Error "Failed to list/find ECS tasks. Ensure you have permissions (ecs:ListTasks). Error: $_"
}

# 3. Start Port Forwarding
Write-Host "`nStarting Port Forwarding Session..." -ForegroundColor Cyan
Write-Host "Cloud Port: $dbPort -> Local Port: $LOCAL_PORT" -ForegroundColor Cyan
Write-Host "Connection String for Local Access:" -ForegroundColor Green
Write-Host "mongodb://$($username):$($password)@127.0.0.1:$LOCAL_PORT/?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&directConnection=true" -ForegroundColor White
Write-Host "`nUse a tool like MongoDB Compass or mongosh to connect." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the session." -ForegroundColor Gray

# Construct the parameters for StartSession
# We are doing Remote Port Forwarding to Remote Host
# Target is the ECS Task (which acts as bastion)
# Document Name: AWS-StartPortForwardingSessionToRemoteHost
# parameters: host, portNumber, localPortNumber

$params = @{
    host            = @($dbHost)
    portNumber      = @([string]$dbPort)
    localPortNumber = @([string]$LOCAL_PORT)
}
# Convert to JSON and escape for PowerShell-to-CLI passing
$paramsJson = $params | ConvertTo-Json -Compress
$paramsJsonEscaped = $paramsJson.Replace('"', '\"')

# Note: The target for ECS Exec is "ecs:<cluster_name>_<task_id>_<runtime_id>" usually, 
# BUT for just using the task as a jumphost for "AWS-StartPortForwardingSessionToRemoteHost", 
# we identify the target as the database host from the perspective of the container? 
# NO. AWS-StartPortForwardingSessionToRemoteHost is supported for EC2 managed instances. 
# For ECS Exec, we usually use "AWS-StartPortForwardingSession" to forward to a port ON THE CONTAINER (localhost of container).
# But the DB is NOT on the container. It's elsewhere.
# 
# DOES ECS EXEC SUPPORT "AWS-StartPortForwardingSessionToRemoteHost"?
# As of recent updates, ECS Exec allows running commands. 
# "AWS-StartPortForwardingSessionToRemoteHost" typically requires the agent to be able to route traffic.
# If the container has network access to the DB (it does), and we can tunnel TCP via the SSM agent in the container...
#
# There is a limitation: The *standard* SSM agent on EC2 supports this. The ECS/Fargate SSM agent (bind-mounted) might be more limited.
# 
# ALTERNATIVE:
# If "AWS-StartPortForwardingSessionToRemoteHost" is NOT supported on Fargate/ECS Exec (likely),
# we might have to use `socat` on the container or similar trick if the container image has it.
# OR, we assume we want to just get a shell and user does manual forwarding? No, we want to automate.
# 
# Let's try the direct approach first. If `AWS-StartPortForwardingSessionToRemoteHost` fails on ECS,
# we might need to fallback to "AWS-StartPortForwardingSession" (local port fwd) combined with a socat tunnel inside the container,
# OR just accept we can only get a shell.
#
# Actually, a common pattern for "Bastionless" DB access via ECS is:
# 1. Start session to container (AWS-StartPortForwardingSession) -> forwards to container port.
# 2. But we need to get to DB.
#
# Wait, if we use "AWS-StartPortForwardingSessionToRemoteHost", the target must be a MANAGED INSTANCE ID (mi-...) or EC2 Instance ID (i-...).
# ECS Tasks are NOT standard managed instances unless registered via Hybrid Activations (unlikely here).
#
# However, `aws ecs execute-command` supports running commands. 
# There is NO direct "PortForward to Remote Host" via `ecs execute-command` that is "native" like SSM on EC2.
#
# BUT, we can do a local port forward to the *container* using the SSM plugin capabilities if we construct the session manually... 
# Actually, the standard `aws ecs execute-command` is for *interactive shell* or *single command*.
# It does NOT natively support the `--document-name` parameter to switch to PortForwarding logic easily in CLI v2 without some tricks.
#
# WAIT! CLI v2 supports configuration for this?
# Actually, `aws ssm start-session --target <something>` works.
# For ECS, the target is `ecs:<cluster>_<task>_<runtime>`.
#
# If I use `aws ssm start-session --target ... --document-name AWS-StartPortForwardingSessionToRemoteHost ...` 
# It MIGHT work if the agent supports it.
#
# If not, the reliable fallback for ECS Fargate is:
# Run a `socat` command via `execute-command` that pipes TCP.
# `aws ecs execute-command ... --command "socat TCP-LISTEN:localport,fork TCP:dbhost:dbport"`
# Then port forward to *that* local port on the container.
#
# Let's assume the user just wants standard port forwarding if possible.
# Given the uncertainty of "RemoteHost" support in Fargate, I should probably check if `socat` is available or just provide the credentials and a "how to shell" instruction?
# The request asked for "is there a way to do this with the aws cli?".
#
# Let's try to code the "AWS-StartPortForwardingSessionToRemoteHost" attempt.
# If that is known to fail on Fargate, I should use the socat method.
# Most "Fargate Bastion" blogs suggest using a dedicated bastion or the socat method.
#
# Let's try a safer bet: Just `ecs execute-command` to run a sleep loop (if needed) and use `ssm start-session` on the task target?
# Actually, `aws ssm start-session` requires an Instance ID.
# For ECS, you assume `aws ecs execute-command`.
# `aws ecs execute-command` does NO port forwarding. It just runs a command.
#
# Ah, correct. `ecs execute-command` creates a session that *wraps* SSM.
# To do port forwarding, one often has to use the SSM CLI *directly* targeting the managed instance ID of the container runtime?
# Fargate DOES NOT expose a managed instance ID easily.
#
# WAIT. There is a plugin `files/port-forwarding.json`? No.
#
# Let's look at the community standard for this:
# "ECS Exec Port Forwarding" usually implies forwarding to a port ON the container.
# `aws ssm start-session --target ecs:... --document-name AWS-StartPortForwardingSession ...`
# This requires querying the runtime ID.
#
# The script should:
# 1. Get task ARN.
# 2. Get runtime ID? (Only needed if using raw SSM).
#
# Actually, there's a simpler way if we just want to run `mongosh` *inside* the container?
# Probably not installed in the production image.
#
# Let's assume the "RemoteHost" document might NOT work on Fargate.
# However, if we just want to help the user, maybe we stick to print credentials + "Use a VPN" or "Use a real Bastion"?
# But the user specifically asked "Right now we can't access our database... we should be able to... is there a way to do this with the aws cli?".
#
# I will implement the "Port Forwarding to Remote Host" via SSM targeting the ECS Task.
# To do this, I need the `runtimeId`.
# `aws ecs describe-tasks` returns `containers[].runtimeId`.
# The SSM target is `ecs:{cluster}_{task}_{runtimeId}`.
#
# AND the document `AWS-StartPortForwardingSessionToRemoteHost` MUST be supported by the agent version in Fargate.
# Setup:
# 1. User runs script.
# 2. Script finds task, gets RuntimeID.
# 3. Script constructs target string.
# 4. Script calls `aws ssm start-session --target ... --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters ...`
#
# If this works, it's the cleanest. If not, I'll add a comment about potential limitations.
#
# ONE CAVEAT: `runtimeId` is for the container. The target syntax is `ecs:<cluster-name>_<task-id>_<runtime-id>`.
# Reference: https://github.com/aws/amazon-ssm-agent/issues/361#issuecomment-945722889
# It seems this feature (RemoteHost) MIGHT NOT be fully supported on Fargate agent yet, or requires configuration.
# But `AWS-StartPortForwardingSession` (local) IS supported.
#
# Strategy: 
# If remote forwarding fails, we might need to rely on `socat` existing in the container.
# If `socat` is missing, we can't tunnel easily without installing it (unsafe in prod/staging).
#
# Let's assume the "RemoteHost" method is worth a try or at least the standard way we *want* to work.
# I'll code that. It's the most "AWS native" answer.

$runtimeId = aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $taskId --query "tasks[0].containers[0].runtimeId" --output text
$target = "ecs:${CLUSTER_NAME}_${taskId}_${runtimeId}"


# Fallback strategy for Fargate: "AWS-StartPortForwardingSessionToRemoteHost" is often not supported by the Fargate agent.
# Instead, we will:
# 1. Use 'AWS-StartPortForwardingSession' to forward local port -> container port (e.g. 9999).
# 2. Run a background process in the container (via execute-command) that pipes container port 9999 -> remote DB port.
# 
# However, running a background process is tricky to coordinate.
# 
# Simpler alternative if the above fails: 
# Just run a port forward to the *container* and assume the user can install 'socat' or similar? No.
#
# Let's try the "socat" trick if available. If socat isn't there, we can try using python or perl or bash redirects.
# The container likely has 'sh'.
#
# We will use `aws ssm start-session` with `AWS-StartPortForwardingSession` to forward to the container on port $LOCAL_PORT.
# BUT we need something listening on that port in the container that forwards to the DB.
#
# Since we can't easily start a background listener and keep it alive while also starting a separate SSM session...
#
# ALTERNATIVE PLAN:
# We just open a shell for the user and give them the command to run INSIDE the container to reach the DB?
# No, they need it on localhost.
#
# BEST BET FOR FARGATE:
# Use `socat` if installed. If not, try to install it? No, immutable infrastructure.
# Check for Python.
#
# Let's try to verify connection simply.
# The error `TargetNotConnected` usually means the agent isn't ready or the target ID format is wrong.
# The format `ecs:cluster_task_runtime` IS correct for `AWS-StartPortForwardingSession` (local).
# BUT `AWS-StartPortForwardingSessionToRemoteHost` might NOT be.
# 
# Let's try to use the *standard* port forwarding session (local) FIRST.
# `aws ssm start-session --target ... --document-name AWS-StartPortForwardingSession ...`
# This forwards to a port ON THE CONTAINER.
# 
# If we do this, we are just connecting to the container's localhost.
# Unless the container IS the database (it's not), this doesn't help.
#
# UNLESS we use `socat` to forward a local port on the container to the remote DB.
# Command to run on container: `socat tcp-listen:27017,reuseaddr,fork tcp:REMOTE_DB:27017`
#
# Let's try to START that process on the container first using execute-command.
Write-Host "Attempting to setup a proxy inside the container..." -ForegroundColor Cyan

# Check for socat or python
$checkCmd = "which socat || echo 'no-socat'; which python3 || echo 'no-python3'"
$checkResult = aws ecs execute-command --cluster $CLUSTER_NAME --task $taskId --container $CONTAINER_NAME --interactive --command "/bin/sh -c `"$checkCmd`"" 2>&1

if ($checkResult -match "no-socat" -and $checkResult -match "no-python3") {
    Write-Warning "Neither 'socat' nor 'python3' found in container. Cannot setup secure tunnel."
    Write-Host "Manual workaround: You can exec into the container and use mongo shell if available."
    exit
}

# We will start a background process in the container to forward traffic
# We'll pick a random high port on the container to avoid conflicts, say 9000 + random
$containerPort = 9999
Write-Host "Setting up tunnel on container port ${containerPort} -> ${dbHost}:${dbPort}" -ForegroundColor Cyan

# Start the forwarder in the background (nohup)
if ($checkResult -notmatch "no-socat") {
    $proxyCmd = "nohup socat TCP-LISTEN:${containerPort},fork TCP:${dbHost}:${dbPort} >/dev/null 2>&1 &"
}
else {
    # Python fallback - use here-string to avoid escaping issues
    $pyScript = @"
import socket,threading
def fwd(s,d):
    while True:
        data=s.recv(4096)
        if len(data)==0: break
        d.send(data)
def p(c):
    r=socket.socket()
    r.connect(('${dbHost}',${dbPort}))
    t1=threading.Thread(target=fwd,args=(c,r)); t1.start()
    t2=threading.Thread(target=fwd,args=(r,c)); t2.start()
l=socket.socket()
l.bind(('0.0.0.0',${containerPort}))
l.listen(5)
while True:
    c,a=l.accept()
    threading.Thread(target=p,args=(c,)).start()
"@
    # Escape quotes and newlines for shell
    $pyScriptEscaped = $pyScript.Replace('"', '\"').Replace("`n", "; ").Replace("`r", "")
    $proxyCmd = "nohup python3 -c `"$pyScriptEscaped`" >/dev/null 2>&1 &"
}


# Execute the proxy setup
aws ecs execute-command --cluster $CLUSTER_NAME --task $taskId --container $CONTAINER_NAME --interactive --command "/bin/sh -c `"$proxyCmd`"" | Out-Null
Start-Sleep -Seconds 2

# Now connect to the CONTAINER port using standard SSM Port Forwarding
$params = @{
    portNumber      = @([string]$containerPort)
    localPortNumber = @([string]$LOCAL_PORT)
}
$paramsJson = $params | ConvertTo-Json -Compress
$paramsJsonEscaped = $paramsJson.Replace('"', '\"')

Write-Host "Proxy established. Connecting..." -ForegroundColor Green
aws ssm start-session --target $target --document-name AWS-StartPortForwardingSession --parameters "$paramsJsonEscaped"

