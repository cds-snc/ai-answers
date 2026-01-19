# Sync-Workspaces.ps1

# Determine the Repos Root (Assuming this script is in Repos/RepoName/scripts)
# We go up two levels from the script location: scripts -> RepoName -> Repos
$scriptPath = $MyInvocation.MyCommand.Path
if (-not $scriptPath) { $scriptPath = Get-Location } # Fallback for interactive copy-paste if needed
$repoCheck = Get-Item $scriptPath
$reposRoot = $repoCheck.Directory.Parent.Parent.FullName

# If simpler: 
$reposRoot = "c:\Users\hymary\repos"

Write-Host "Scanning for workspaces in: $reposRoot" -ForegroundColor Cyan

# Dynamically find all ai-answers* folders
$repos = Get-ChildItem -Path $reposRoot -Filter "ai-answers*" -Directory | Select-Object -ExpandProperty FullName

Write-Host "Found the following workspaces:" -ForegroundColor Gray
$repos | ForEach-Object { Write-Host " - $_" }

# Files/Paths to sync (relative to repo root)
$patterns = @(
    ".agent\workflows\*.md",
    ".agent\rules\*.md",
    "skills.md"
)

# Files to exclude locally (not committed)
$gitIgnoreLines = @(
    ".agent/workflows/",
    ".agent/rules/",
    "skills.md"
)

# 1. Discover all unique files across all repos
$uniqueRelativePaths = @()

foreach ($repo in $repos) {
    if (-not (Test-Path $repo)) { continue }

    foreach ($pattern in $patterns) {
        $fullSearchstr = "$repo\$pattern"
        # Search for files matching pattern
        $foundVars = Get-ChildItem -Path $fullSearchstr -ErrorAction SilentlyContinue
        
        foreach ($file in $foundVars) {
            # Get relative path
            $relPath = $file.FullName.Substring($repo.Length)
            if ($relPath.StartsWith("\")) { $relPath = $relPath.Substring(1) }
            
            if ($uniqueRelativePaths -notcontains $relPath) {
                $uniqueRelativePaths += $relPath
            }
        }
    }
}

Write-Host "Found $($uniqueRelativePaths.Count) unique files to sync." -ForegroundColor Cyan

# 2. Sync process
foreach ($relPath in $uniqueRelativePaths) {
    
    $latestTime = [DateTime]::MinValue
    $sourceFile = $null
    
    # 2a. Find the newest version
    foreach ($repo in $repos) {
        $fullPath = Join-Path $repo $relPath
        if (Test-Path $fullPath) {
            $item = Get-Item $fullPath
            if ($item.LastWriteTime -gt $latestTime) {
                $latestTime = $item.LastWriteTime
                $sourceFile = $item
            }
        }
    }
    
    if ($null -eq $sourceFile) { continue }
    
    # 2b. Broadcast to others
    foreach ($repo in $repos) {
        $targetPath = Join-Path $repo $relPath
        $shouldCopy = $false
        $action = ""
        
        if (-not (Test-Path $targetPath)) {
            $shouldCopy = $true
            $action = "Copying (Missing)"
        }
        else {
            $targetItem = Get-Item $targetPath
            if ($targetItem.LastWriteTime -lt $latestTime) {
                $shouldCopy = $true
                $action = "Updating (Older)"
            }
        }
        
        if ($shouldCopy) {
            Write-Host "  [$action] $relPath -> $repo" -ForegroundColor Green
            
            # Ensure folder exists
            $parent = Split-Path $targetPath
            if (-not (Test-Path $parent)) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }
            
            Copy-Item -Path $sourceFile.FullName -Destination $targetPath -Force
        }
    }
}

# 3. Update Global Git (Local Exclude)
Write-Host "`nUpdating .git/info/exclude in all found repos..." -ForegroundColor Cyan

foreach ($repo in $repos) {
    $excludeFile = Join-Path $repo ".git\info\exclude"
    if (Test-Path $repo) {
        # Ensure .git/info exists
        $infoDir = Join-Path $repo ".git\info"
        if (-not (Test-Path $infoDir)) {
            New-Item -ItemType Directory -Path $infoDir -Force | Out-Null
        }
        
        $currentContent = ""
        if (Test-Path $excludeFile) {
            $currentContent = Get-Content $excludeFile -Raw
        }
        
        $newContent = $currentContent
        $modified = $false
        
        foreach ($line in $gitIgnoreLines) {
            # Normalize newlines for matching
            if ($null -eq $currentContent -or $currentContent -notmatch [regex]::Escape($line)) {
                $newContent += "`n$line"
                $modified = $true
                Write-Host "  Added '$line' to exclude in: $(Split-Path $repo -Leaf)"
            }
        }
        
        if ($modified) {
            Set-Content -Path $excludeFile -Value $newContent -Encoding UTF8
        }
    }
}

Write-Host "Sync Complete!" -ForegroundColor Green
