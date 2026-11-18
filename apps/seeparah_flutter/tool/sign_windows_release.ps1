# Sign all Seeparah Windows PE payloads and the final setup EXE.
# Required for Microsoft Store Win32 submissions: every PE must be trusted.
# Use only in protected, owner-authorized release GitHub Actions environments.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$PfxFile,
  [Parameter(Mandatory=$true)][string]$PfxPassword,
  [switch]$TestOnlyNoTimestamp
)

$ErrorActionPreference = 'Stop'
if ($TestOnlyNoTimestamp -and $env:SEEPARAH_CI_TEST_CERT -ne 'true') { throw 'Untimestamped signing is permitted only for disposable CI test certificates' }
if (-not (Test-Path $PfxFile -PathType Leaf)) { throw 'Windows code-signing PFX is missing' }
if (-not (Test-Path $Path)) { throw "No Windows binary path: $Path" }
$kit = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
if (-not (Test-Path $kit)) { throw 'Windows SDK signtool is not installed' }
$signtool = Get-ChildItem $kit -Filter signtool.exe -File -Recurse |
  Where-Object { $_.FullName -match '[\\/]x64[\\/]signtool\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $signtool) { throw 'Cannot find an x64 signtool.exe' }

$targets = if (Test-Path $Path -PathType Container) {
  @(Get-ChildItem -Path $Path -Recurse -File | Where-Object {
    $_.Extension -in '.dll', '.exe'
  })
} else {
  @(Get-Item -LiteralPath $Path)
}
if ($targets.Count -eq 0) { throw 'No PE executables to sign' }

foreach ($item in $targets) {
  Write-Host "Signing: $($item.Name)"
  $arguments = @('sign', '/fd', 'SHA256', '/f', $PfxFile, '/p', $PfxPassword)
  if (-not $TestOnlyNoTimestamp) { $arguments += @('/tr', 'http://timestamp.digicert.com', '/td', 'SHA256') }
  $arguments += $item.FullName
  & $signtool.FullName @arguments
  if ($LASTEXITCODE -ne 0) { throw "Signing failed for $($item.Name)" }
  & $signtool.FullName verify /pa /all "$($item.FullName)"
  if ($LASTEXITCODE -ne 0) { throw "Signature validation failed for $($item.Name)" }
  $signature = Get-AuthenticodeSignature -FilePath $item.FullName
  if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature on $($item.Name): $($signature.Status)" }
}
Write-Host "Signed and verified $($targets.Count) Windows release PE file(s)"
