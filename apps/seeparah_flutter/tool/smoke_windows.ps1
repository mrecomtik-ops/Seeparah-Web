# CI-only Windows installer installation/uninstallation test.
# Does not prove a code-signed production release or replace physical QA.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Installer)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Installer)) { throw "No Windows setup file: $Installer" }
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$dir = Join-Path $env:LOCALAPPDATA "Programs\Seeparah"
$exe = Join-Path $dir "seeparah_reader.exe"
$uninstaller = Join-Path $dir "unins000.exe"

if (Test-Path -LiteralPath $dir) {
  throw "An existing Seeparah installation would make this smoke test ambiguous"
}

Write-Host "Running silent per-user install"
$install = Start-Process -FilePath $installerPath -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Setup failed with exit code $($install.ExitCode)" }

if (-not (Test-Path -LiteralPath $exe)) {
  throw "The installed application executable is missing"
}
if (-not (Test-Path -LiteralPath $uninstaller)) {
  throw "The installed uninstaller is missing"
}
$payload = @(
  (Join-Path $dir 'flutter_windows.dll'),
  (Join-Path $dir 'data\flutter_assets')
)
foreach ($path in $payload) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "A required Flutter runtime asset is missing: $path"
  }
}
$bytes = [System.IO.File]::ReadAllBytes($exe)
if ($bytes.Length -lt 1024 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90) {
  throw "Installed Windows app does not have a valid PE header"
}

Write-Host "Installation verified; running silent uninstall"
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) {
  throw "Silent uninstall failed with exit code $($uninstall.ExitCode)"
}
Start-Sleep -Seconds 2
if (Test-Path -LiteralPath $exe) {
  throw "Windows uninstall left the app executable installed"
}
Write-Host "Windows silent install, files, and uninstall smoke checks passed"
