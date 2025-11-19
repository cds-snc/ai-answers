<#
.SYNOPSIS
    Deletes all branches that have been merged into the main branch, both locally and on the remote.

.DESCRIPTION
    1. Fetches latest changes and prunes deleted remote branches.
    2. Checks out the main branch and pulls the latest changes.
    3. Identifies all local branches merged into main (excluding main and HEAD).
    4. Deletes each merged branch locally and remotely.

.PARAMETER MainBranch
    The name of the main branch (default: main).

.PARAMETER Remote
    The name of the remote (default: origin).
#>
param(
    [string]$MainBranch = "main",
    [string]$Remote    = "origin"
)

Write-Host "Fetching latest changes and pruning remote-tracking branches..."
git fetch $Remote --prune

Write-Host "Switching to branch '$MainBranch' and pulling latest..."
git checkout $MainBranch
ngit pull $Remote $MainBranch

# Get all merged branches, clean up names and exclude main and HEAD
$mergedBranches = git branch --merged $MainBranch |
    ForEach-Object { ($_ -replace '^[\* ]*','').Trim() } |
    Where-Object { $_ -and $_ -ne $MainBranch -and $_ -ne 'HEAD' }

if (-not $mergedBranches) {
    Write-Host "No merged branches to delete."
    exit 0
}

foreach ($branch in $mergedBranches) {
    Write-Host "Deleting local branch: $branch"
    git branch -d $branch

    Write-Host "Deleting remote branch: $branch"
    git push $Remote --delete $branch
}

Write-Host "Completed. Deleted $($mergedBranches.Count) merged branch(es)."
