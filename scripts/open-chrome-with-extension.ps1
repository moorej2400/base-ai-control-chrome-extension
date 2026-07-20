<#
.SYNOPSIS
  Launches your normal Chrome profile with the AI Page Chat dev build loaded.

.DESCRIPTION
  Chrome only applies --load-extension when it starts fresh, so all existing
  Chrome windows must be closed first. By default this script refuses to run
  while Chrome is open (so it never kills your tabs). Pass -Force to let it
  close Chrome for you first.

  Because it uses your default profile, all your logins persist, and the
  extension's storage (Copilot auth, chat sessions) persists across launches
  as long as the extension path below stays the same.

.EXAMPLE
  ./scripts/open-chrome-with-extension.ps1
  ./scripts/open-chrome-with-extension.ps1 -Force   # closes Chrome first
#>
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Resolve chrome.exe
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "Could not find chrome.exe." }

# Resolve the dev build (prefer dev, fall back to production build)
$root = Split-Path -Parent $PSScriptRoot
$extPath = Join-Path $root '.output\chrome-mv3-dev'
if (-not (Test-Path (Join-Path $extPath 'manifest.json'))) {
  $extPath = Join-Path $root '.output\chrome-mv3'
}
if (-not (Test-Path (Join-Path $extPath 'manifest.json'))) {
  throw "No build found. Run 'pnpm dev' (or 'pnpm build') first."
}

# Chrome must be closed for the flag to take effect.
$running = Get-Process chrome -ErrorAction SilentlyContinue
if ($running) {
  if ($Force) {
    Write-Host "Closing $($running.Count) Chrome process(es)..."
    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Seconds 2
    Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
  }
  else {
    Write-Warning "Chrome is already running. Close ALL Chrome windows first, then re-run this script (or pass -Force to close it automatically)."
    return
  }
}

Write-Host "Launching Chrome with extension: $extPath"
& $chrome "--load-extension=$extPath"
