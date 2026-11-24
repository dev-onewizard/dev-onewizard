param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = 'Stop'

# Old public release still uses Codex Assistant naming
$oldSetupName = 'Codex-Assistant-Setup-1.2.1.exe'
gh release download v1.2.1 --pattern $oldSetupName --dir $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0) { throw 'Could not download the previous installer' }

$oldSetup = Join-Path $env:RUNNER_TEMP $oldSetupName
$newSetup = (Resolve-Path "dist/Codex-Hub-Setup-$Version.exe").Path
$installDir = Join-Path $env:RUNNER_TEMP 'Codex Upgrade Test'

function Get-InstalledExe([string]$Dir) {
    foreach ($name in @('Codex Hub.exe', 'Codex Assistant.exe')) {
        $path = Join-Path $Dir $name
        if (Test-Path -LiteralPath $path) { return $path }
    }
    return $null
}

function Invoke-Installer([string]$Path, [string]$Arguments) {
    $options = @{ FilePath = $Path; PassThru = $true }
    if ($Arguments) { $options.ArgumentList = $Arguments }
    $process = Start-Process @options
    if (!$process.WaitForExit(90000)) {
        $process.Kill()
        throw "The installer did not finish unattended: $Arguments"
    }
    if ($process.ExitCode -ne 0) { throw "Installer exit code $($process.ExitCode)" }
}

function Stop-InstalledApp([string]$ExePath) {
    if (!$ExePath) { return }
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $ExePath } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

foreach ($arguments in @('', '--updated --force-run')) {
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
        Invoke-Installer $newSetup $arguments
        $updatedExe = Get-InstalledExe $installDir
        if (!$updatedExe) { throw 'Updated executable was not found' }
        if ((Get-Item -LiteralPath $updatedExe).VersionInfo.FileVersion -ne $Version) {
            throw 'Update did not replace the installed executable'
        }

        $shortcutFound = $false
        foreach ($name in @('Codex Hub.lnk', 'Codex Assistant.lnk')) {
            foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
                $link = Join-Path $folder $name
                if (Test-Path -LiteralPath $link) { $shortcutFound = $true }
            }
        }
        if (!$shortcutFound) { throw 'Windows shortcut missing after update' }

        $launched = $null
        for ($attempt = 0; !$launched -and $attempt -lt 15; $attempt++) {
            $launched = Get-Process -ErrorAction SilentlyContinue |
                Where-Object { $_.Path -eq $updatedExe }
            if (!$launched) { Start-Sleep -Seconds 1 }
        }
        if (!$launched) { throw 'The updated application did not launch' }
        Write-Output "Verified unattended upgrade and relaunch ($arguments)"
    } finally {
        Stop-InstalledApp (Get-InstalledExe $installDir)
    }
}
