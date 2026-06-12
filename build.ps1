#requires -Version 5.1
<#
.SYNOPSIS
  Build Slate installers (MSI + NSIS).

.DESCRIPTION
  One-stop build script. Optionally bumps the version (synced across
  package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json), runs
  `pnpm tauri build`, then opens the bundle folder.

.PARAMETER Bump
  Increment the version: 'patch' (1.0.7 -> 1.0.8), 'minor' (1.0.7 -> 1.1.0),
  or 'major' (1.0.7 -> 2.0.0). Mutually exclusive with -Version.

.PARAMETER Version
  Set an explicit version, e.g. "1.2.0". Mutually exclusive with -Bump.

.PARAMETER NoOpen
  Don't open Explorer to the bundle folder after the build.

.EXAMPLE
  .\build.ps1
  Build with the current version.

.EXAMPLE
  .\build.ps1 -Bump patch
  Bump patch number, then build.

.EXAMPLE
  .\build.ps1 -Version 1.5.0
  Set version to 1.5.0, then build.
#>

[CmdletBinding(DefaultParameterSetName = 'Current')]
param(
  [Parameter(ParameterSetName = 'Bump')]
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump,

  [Parameter(ParameterSetName = 'Explicit')]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$pkgPath  = Join-Path $root 'package.json'
$confPath = Join-Path $root 'src-tauri\tauri.conf.json'
$cargoPath = Join-Path $root 'src-tauri\Cargo.toml'

function Get-CurrentVersion {
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  return $pkg.version
}

function Bump-Semver {
  param([string]$Current, [string]$Kind)
  $parts = $Current.Split('.') | ForEach-Object { [int]$_ }
  switch ($Kind) {
    'patch' { $parts[2]++ }
    'minor' { $parts[1]++; $parts[2] = 0 }
    'major' { $parts[0]++; $parts[1] = 0; $parts[2] = 0 }
  }
  return ($parts -join '.')
}

function Set-Version {
  param([string]$Old, [string]$New)

  # package.json — JSON, narrowly targeted to the top-level "version" field
  # so we don't accidentally touch dependency version strings.
  $pkgText = Get-Content $pkgPath -Raw
  $pkgText = $pkgText -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$New`""
  Set-Content $pkgPath $pkgText -NoNewline

  # tauri.conf.json — same approach
  $confText = Get-Content $confPath -Raw
  $confText = $confText -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$New`""
  Set-Content $confPath $confText -NoNewline

  # Cargo.toml — only the [package] version line, identified by anchoring to
  # the start of a line (so dependency `version = "..."` entries are safe).
  $cargoText = Get-Content $cargoPath -Raw
  $cargoText = $cargoText -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$New`""
  Set-Content $cargoPath $cargoText -NoNewline

  Write-Host "Version: $Old -> $New" -ForegroundColor Cyan
}

# Resolve target version
$current = Get-CurrentVersion
$target = $current
if ($Bump) {
  $target = Bump-Semver -Current $current -Kind $Bump
} elseif ($Version) {
  $target = $Version
}

if ($target -ne $current) {
  Set-Version -Old $current -New $target
} else {
  Write-Host "Building version $current (no bump)" -ForegroundColor Cyan
}

# Run the build
Write-Host "`nRunning pnpm tauri build..." -ForegroundColor Cyan
$buildStart = Get-Date
pnpm tauri build
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nBuild failed (exit code $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}
$buildDuration = (Get-Date) - $buildStart

# Locate output
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle'
$msi  = Get-ChildItem (Join-Path $bundleDir 'msi')  -Filter "Slate_${target}_*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem (Join-Path $bundleDir 'nsis') -Filter "Slate_${target}_*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

Write-Host "`nBuild succeeded in $([int]$buildDuration.TotalSeconds)s" -ForegroundColor Green
if ($msi)  { Write-Host "  MSI:  $($msi.FullName)" }
if ($nsis) { Write-Host "  NSIS: $($nsis.FullName)" }

if (-not $NoOpen -and ($msi -or $nsis)) {
  $openTarget = if ($nsis) { $nsis.DirectoryName } else { $msi.DirectoryName }
  Start-Process explorer.exe $openTarget
}
