param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = 'Stop'
$oldSetupName = 'Codex-Assistant-Setup-1.2.1.exe'
gh release download v1.2.1 --pattern $oldSetupName --dir $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0) { throw 'Could not download the previous installer' }

$oldSetup = Join-Path $env:RUNNER_TEMP $oldSetupName
$newSetup = (Resolve-Path "dist/Codex-Assistant-Setup-$Version.exe").Path
$installDir = Join-Path $env:RUNNER_TEMP 'Codex Assistant Upgrade Test'
$installedExe = Join-Path $installDir 'Codex Assistant.exe'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Assistant.lnk'
$startMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex Assistant.lnk'

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

foreach ($arguments in @('', '--updated --force-run')) {
    Invoke-Installer $oldSetup "/S --currentuser /D=$installDir"
    if ((Get-Item -LiteralPath $installedExe).VersionInfo.FileVersion -ne '1.2.1') {
        throw 'The previous version did not install into the requested directory'
    }

    try {
        Invoke-Installer $newSetup $arguments
        if ((Get-Item -LiteralPath $installedExe).VersionInfo.FileVersion -ne $Version) {
            throw 'Update did not replace the installed executable'
        }
        foreach ($link in $desktopLink,$startMenuLink) {
            if (!(Test-Path -LiteralPath $link)) { throw "Windows shortcut missing after update: $link" }
        }
        $launched = $null
        for ($attempt = 0; !$launched -and $attempt -lt 15; $attempt++) {
            $launched = Get-Process -Name 'Codex Assistant' -ErrorAction SilentlyContinue |
                Where-Object Path -eq $installedExe
            if (!$launched) { Start-Sleep -Seconds 1 }
        }
        if (!$launched) { throw 'The updated application did not launch' }
        Write-Output "Verified unattended upgrade and relaunch ($arguments)"
    } finally {
        Get-Process -Name 'Codex Assistant' -ErrorAction SilentlyContinue |
            Where-Object Path -eq $installedExe | Stop-Process -Force
    }
}
