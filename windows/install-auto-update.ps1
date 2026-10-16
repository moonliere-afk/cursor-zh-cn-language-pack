param(
    [switch]$Quiet,
    [switch]$NoElevation
)

$ErrorActionPreference = "Stop"
$TaskName = "CursorZhPackAutoUpdate"
$InstallRoot = Join-Path $env:LOCALAPPDATA "CursorZhPack"
$SourceRoot = Split-Path $PSScriptRoot -Parent
$SourceEnsure = Join-Path $PSScriptRoot "ensure-cursor-zh.ps1"
$TargetEnsure = Join-Path $InstallRoot "ensure-cursor-zh.ps1"

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($NoElevation) {
        throw "Administrator privileges are required to install the updater task"
    }
    $elevatedArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`""
    )
    if ($Quiet) { $elevatedArgs += "-Quiet" }
    $process = Start-Process "powershell.exe" `
        -Verb RunAs `
        -ArgumentList $elevatedArgs `
        -Wait `
        -PassThru
    exit $process.ExitCode
}

if (-not (Test-Path -LiteralPath $SourceEnsure)) {
    throw "Updater script not found: $SourceEnsure"
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot "apply-cli.js"))) {
    throw "Language pack CLI not found: $SourceRoot"
}

New-Item -ItemType Directory -Force $InstallRoot | Out-Null
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Copy-Item -LiteralPath $SourceEnsure -Destination $TargetEnsure -Force
Copy-Item -LiteralPath (Join-Path $SourceRoot "apply-cli.js") -Destination $InstallRoot -Force
Copy-Item -LiteralPath (Join-Path $SourceRoot "package.json") -Destination $InstallRoot -Force
foreach ($directory in @("lib", "inject", "translations")) {
    $target = Join-Path $InstallRoot $directory
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $SourceRoot $directory) -Destination $target -Recurse -Force
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$actionArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $TargetEnsure
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$logonTrigger.Delay = "PT5M"
$triggers = @(
    $logonTrigger,
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) `
        -RepetitionInterval (New-TimeSpan -Minutes 30) `
        -RepetitionDuration (New-TimeSpan -Days 3650))
)
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -MultipleInstances IgnoreNew `
    -Priority 7

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -User $identity `
    -RunLevel Highest `
    -Description "Cursor Chinese language pack updater." `
    -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

if (-not $Quiet) {
    Write-Host "Installed Cursor Chinese updater: $TaskName"
    Write-Host "Schedule: 5 minutes after logon; lightweight check every 30 minutes"
    Write-Host "Log: $(Join-Path $InstallRoot 'updater.log')"
}
