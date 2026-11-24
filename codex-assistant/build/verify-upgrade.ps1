param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = 'Stop'

# Old public release still uses Codex Assistant naming
$oldSetupName = 'Codex-Assistant-Setup-1.2.1.exe'
gh release download v1.2.1 --pattern $oldSetupName --dir $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0) { throw 'Could not download the previous installer' }

$oldSetup = Join-Path $env:RUNNER_TEMP $oldSetupName
$newSetup = (Resolve-Path "dist/Codex-Hub-Setup-$Version.exe").Path
$installDir = Join-Path $env:RUNNER_TEMP 'CodexUpgradeTest'

function Get-InstalledExe([string]$Dir) {
    foreach ($name in @('Codex Hub.exe', 'Codex Assistant.exe')) {
        $path = Join-Path $Dir $name
        if (Test-Path -LiteralPath $path) { return $path }
    }
    return $null
}

function Invoke-Installer([string]$Path, [string]$Arguments) {
    $options = @{
        FilePath = $Path
        PassThru = $true
        WorkingDirectory = $env:RUNNER_TEMP
    }
    if ($Arguments) { $options.ArgumentList = $Arguments }
    $process = Start-Process @options
    if (!$process.WaitForExit(180000)) {
        $process.Kill()
        throw "The installer did not finish unattended: $Arguments"
    }
    if ($process.ExitCode -ne 0) {
        throw "Installer exit code $($process.ExitCode) args: $Arguments"
    }
}

function Stop-InstalledApp([string]$ExePath) {
    if (!$ExePath) { return }
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $ExePath } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

# electron-builder NSIS: /S silent, /D= install dir (must be last for NSIS)
# electron-updater args: --updated --force-run
$upgradeArgSets = @(
    "/S --currentuser /D=$installDir",
    "/S --currentuser --updated --force-run /D=$installDir"
)

foreach ($newArgs in $upgradeArgSets) {
    if (Test-Path -LiteralPath $installDir) {
        Stop-InstalledApp (Get-InstalledExe $installDir)
        Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Invoke-Installer $oldSetup "/S --currentuser /D=$installDir"
    $installedExe = Get-InstalledExe $installDir
    if (!$installedExe) { throw 'Previous version executable was not found after install' }
    if ((Get-Item -LiteralPath $installedExe).VersionInfo.FileVersion -ne '1.2.1') {
        throw 'The previous version did not install into the requested directory'
    }

    try {
        Invoke-Installer $newSetup $newArgs
        $updatedExe = Get-InstalledExe $installDir
        if (!$updatedExe) { throw "Updated executable was not found after: $newArgs" }
        if ((Get-Item -LiteralPath $updatedExe).VersionInfo.FileVersion -ne $Version) {
            throw "Update did not replace the installed executable after: $newArgs"
        }

        $shortcutFound = $false
        foreach ($name in @('Codex Hub.lnk', 'Codex Assistant.lnk')) {
            foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
                $link = Join-Path $folder $name
                if (Test-Path -LiteralPath $link) { $shortcutFound = $true }
            }
        }
        if (!$shortcutFound) {
            Write-Warning 'Shortcut not found after update (non-fatal on CI desktop)'
        }

        # App may auto-launch after install; wait briefly
        $launched = $null
        for ($attempt = 0; !$launched -and $attempt -lt 20; $attempt++) {
            $launched = Get-Process -ErrorAction SilentlyContinue |
                Where-Object { $_.Path -eq $updatedExe }
            if (!$launched) { Start-Sleep -Seconds 1 }
        }
        if (!$launched) {
            # If installer did not auto-start, launch once to verify binary runs
            $p = Start-Process -FilePath $updatedExe -PassThru
            Start-Sleep -Seconds 3
            if ($p.HasExited -and $p.ExitCode -ne 0) {
                throw "Updated application failed to start (exit $($p.ExitCode))"
            }
            $launched = $p
            Write-Output "Launched updated app manually after: $newArgs"
        } else {
            Write-Output "Verified unattended upgrade and relaunch ($newArgs)"
        }
    } finally {
        Stop-InstalledApp (Get-InstalledExe $installDir)
    }
}
