param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$StateRoot = Join-Path $env:LOCALAPPDATA "CursorZhPack"
$LogFile = Join-Path $StateRoot "updater.log"
$ForceMarker = Join-Path $StateRoot "force-update"
New-Item -ItemType Directory -Force $StateRoot | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Read-JsonUtf8 {
    param([string]$Path)
    return [System.IO.File]::ReadAllText(
        $Path,
        [System.Text.Encoding]::UTF8
    ) | ConvertFrom-Json
}

function Find-CursorExe {
    $candidates = @()
    if ($env:CURSOR_EXE) { $candidates += $env:CURSOR_EXE }
    try {
        $running = Get-Process Cursor -ErrorAction Stop |
            Where-Object { $_.Path } |
            Select-Object -First 1 -ExpandProperty Path
        if ($running) { $candidates += $running }
    } catch {}
    $candidates += @(
        (Join-Path $env:LOCALAPPDATA "Programs\Cursor\Cursor.exe"),
        (Join-Path $env:ProgramFiles "cursor\Cursor.exe")
    )
    return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Select-Object -First 1
}

function Find-ToolRoot {
    $candidates = @()
    if ($env:CURSOR_AGENT_ZH_ROOT) { $candidates += $env:CURSOR_AGENT_ZH_ROOT }
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "apply-cli.js")) {
        $candidates += $PSScriptRoot
    }
    $parent = Split-Path $PSScriptRoot -Parent
    if (Test-Path -LiteralPath (Join-Path $parent "apply-cli.js")) {
        $candidates += $parent
    }
    $extensionRoot = Join-Path $env:USERPROFILE ".cursor\extensions"
    if (Test-Path -LiteralPath $extensionRoot) {
        $candidates += Get-ChildItem -LiteralPath $extensionRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "cursor-agent-zh.cursor-agent-zh-*" } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -ExpandProperty FullName
    }
    return $candidates | Where-Object {
        $_ -and
        (Test-Path -LiteralPath (Join-Path $_ "apply-cli.js")) -and
        (Test-Path -LiteralPath (Join-Path $_ "lib\patch.js"))
    } | Select-Object -First 1
}

function Invoke-CursorNode {
    param(
        [string]$CursorExe,
        [string]$Cli,
        [string]$Action,
        [string]$AppRoot
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $CursorExe
    $startInfo.Arguments = "`"$Cli`" $Action `"$AppRoot`""
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1"
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Failed to start Cursor Electron Node"
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.Result.Trim()
    $stderr = $stderrTask.Result.Trim()
    if ($stderr) {
        Add-Content -LiteralPath $LogFile -Value $stderr -Encoding UTF8
    }
    return $stdout
}

try {
    $cursorExe = Find-CursorExe
    $toolRoot = Find-ToolRoot
    if (-not $cursorExe) {
        Write-Log "Skipped: Cursor.exe was not found"
        exit 2
    }
    if (-not $toolRoot) {
        Write-Log "Skipped: Cursor Chinese language pack tool was not found"
        exit 3
    }

    $appRoot = Join-Path (Split-Path $cursorExe -Parent) "resources\app"
    $packageFile = Join-Path $appRoot "package.json"
    $workbenchFile = Join-Path $appRoot "out\vs\code\electron-sandbox\workbench\workbench.js"
    if (-not (Test-Path -LiteralPath $packageFile) -or
        -not (Test-Path -LiteralPath $workbenchFile)) {
        Write-Log "Skipped: Cursor installation is incomplete or being updated"
        exit 4
    }

    $needsFullCheck = $Force -or (Test-Path -LiteralPath $ForceMarker)
    if (-not $needsFullCheck) {
        try {
            $stateFile = Join-Path $appRoot ".cursor-agent-zh-state.json"
            $toolPackageFile = Join-Path $toolRoot "package.json"
            if (-not (Test-Path -LiteralPath $stateFile) -or
                -not (Test-Path -LiteralPath $toolPackageFile)) {
                $needsFullCheck = $true
            } else {
                $appPackage = Read-JsonUtf8 $packageFile
                $state = Read-JsonUtf8 $stateFile
                $toolPackage = Read-JsonUtf8 $toolPackageFile
                $appVersion = if ($appPackage.version) { $appPackage.version } else { "unknown" }
                $appDistro = if ($appPackage.distro) { $appPackage.distro } else { "unknown" }
                $appBuild = "$appVersion-$appDistro"
                $needsFullCheck =
                    ($state.appBuild -ne $appBuild) -or
                    (-not $state.toolVersion) -or
                    ($state.toolVersion -ne $toolPackage.version)
                if (-not $needsFullCheck -and $state.languagePackPath) {
                    if (-not (Test-Path -LiteralPath $state.languagePackPath)) {
                        $needsFullCheck = $true
                    } else {
                        $languagePack = Get-Item -LiteralPath $state.languagePackPath
                        $mtime = [DateTimeOffset]$languagePack.LastWriteTimeUtc
                        $mtimeMs = $mtime.ToUnixTimeMilliseconds()
                        $needsFullCheck =
                            ([long]$state.languagePackSize -ne [long]$languagePack.Length) -or
                            ([long]$state.languagePackMtimeMs -ne [long]$mtimeMs)
                    }
                }
            }
        } catch {
            $needsFullCheck = $true
        }
    }
    if (-not $needsFullCheck) {
        exit 0
    }

    $cli = Join-Path $toolRoot "apply-cli.js"
    $statusText = Invoke-CursorNode $cursorExe $cli "status" $appRoot
    $status = $statusText | ConvertFrom-Json
    if (-not $Force -and -not $status.result.needsApply) {
        Remove-Item -LiteralPath $ForceMarker -Force -ErrorAction SilentlyContinue
        Write-Log "No update needed: $($status.result.appBuild)"
        exit 0
    }

    Write-Log "Reapply needed: $($status.result.reason)"
    $applyText = Invoke-CursorNode $cursorExe $cli "apply" $appRoot
    $apply = $applyText | ConvertFrom-Json
    if (-not $apply.result.appBuild) {
        throw "Apply result does not contain appBuild"
    }
    Remove-Item -LiteralPath $ForceMarker -Force -ErrorAction SilentlyContinue
    Write-Log "Apply succeeded: $($apply.result.appBuild); untranslated groups: $($apply.result.untranslatedCount)"
    exit 0
} catch {
    Write-Log "Apply failed: $($_.Exception.Message)"
    exit 1
}
