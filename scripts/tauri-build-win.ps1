# Build Tauri on Windows, locating MSVC and the Windows SDK even when the
# Visual Studio installer did not create vcvars64.bat (common with VS 2026 Community).
# Usage: npm run tauri:build:win

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-LatestVersionDir([string]$Parent) {
  Get-ChildItem $Parent -Directory -ErrorAction SilentlyContinue |
    ForEach-Object {
      $parsed = $null
      if ([version]::TryParse($_.Name, [ref]$parsed)) {
        [pscustomobject]@{ Dir = $_; Version = $parsed }
      }
    } |
    Sort-Object Version -Descending |
    Select-Object -First 1
}

$vswhereCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe",
  "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe"
)
$vswhere = $vswhereCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $vswhere) {
  throw 'vswhere.exe not found. Install Visual Studio or Build Tools.'
}

$vsPath = & $vswhere -latest -products * -property installationPath
if (-not $vsPath) {
  throw 'Visual Studio with C++ tools not found. Install the "Desktop development with C++" workload.'
}
Write-Host "Visual Studio: $vsPath"

$vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
if (Test-Path $vcvars) {
  Write-Host "Environment: $vcvars"
  $lines = cmd /c "`"$vcvars`" >nul 2>&1 && set"
  foreach ($line in $lines) {
    $index = $line.IndexOf('=')
    if ($index -le 0) { continue }
    Set-Item -Path ('Env:' + $line.Substring(0, $index)) -Value $line.Substring($index + 1)
  }
} else {
  Write-Host 'vcvars64.bat not found - building PATH/LIB/INCLUDE manually.'
  $msvc = Get-LatestVersionDir (Join-Path $vsPath 'VC\Tools\MSVC')
  if (-not $msvc) { throw 'VC\Tools\MSVC is missing in the Visual Studio installation.' }

  $sdkRootCandidates = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10",
    "$env:ProgramFiles\Windows Kits\10"
  )
  $sdkRoot = $sdkRootCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $sdkRoot) { throw 'Windows SDK not found (Windows Kits\10).' }
  $sdkLib = Get-LatestVersionDir (Join-Path $sdkRoot 'Lib')
  if (-not $sdkLib) { throw 'Windows SDK libraries (Lib) not found.' }
  $sdkVer = $sdkLib.Dir.Name
  Write-Host "MSVC: $($msvc.Dir.Name), Windows SDK: $sdkVer"

  $msvcBin = Join-Path $msvc.Dir.FullName 'bin\Hostx64\x64'
  $sdkBin = Join-Path $sdkRoot "bin\$sdkVer\x64"
  $env:Path = "$msvcBin;$sdkBin;$env:Path"
  $env:LIB = @(
    (Join-Path $msvc.Dir.FullName 'lib\x64'),
    (Join-Path $sdkRoot "Lib\$sdkVer\ucrt\x64"),
    (Join-Path $sdkRoot "Lib\$sdkVer\um\x64")
  ) -join ';'
  $env:INCLUDE = @(
    (Join-Path $msvc.Dir.FullName 'include'),
    (Join-Path $sdkRoot "Include\$sdkVer\ucrt"),
    (Join-Path $sdkRoot "Include\$sdkVer\um"),
    (Join-Path $sdkRoot "Include\$sdkVer\shared"),
    (Join-Path $sdkRoot "Include\$sdkVer\winrt")
  ) -join ';'
}

$env:Path = "$root\.tools\node;$env:USERPROFILE\.cargo\bin;$env:Path"

$npm = Join-Path $root '.tools\node\npm.cmd'
if (-not (Test-Path $npm)) { $npm = 'npm.cmd' }
& $npm run tauri:build
exit $LASTEXITCODE
