param(
    [switch]$Quiet,
    [switch]$NoElevation
)

$ErrorActionPreference = "Stop"
$TaskName = "CursorZhPackAutoUpdate"
$InstallRoot = Join-Path $env:LOCALAPPDATA "CursorZhPack"

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($NoElevation) {
        throw "Administrator privileges are required to remove the updater task"
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

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if (Test-Path -LiteralPath $InstallRoot) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}

if (-not $Quiet) {
    Write-Host "Removed Cursor Chinese updater."
}
