<#
.SYNOPSIS
  Launches a dedicated debug Chrome with the extension loaded and the
  DevTools Protocol enabled, so the devtools.mjs harness can attach.

.DESCRIPTION
  Uses a SEPARATE user-data-dir (not your default profile) because Chrome 136+
  blocks --remote-debugging-port on the default profile. This opens a second
  Chrome instance that runs alongside your normal browser without touching it.
  The dev profile persists, so the extension and Copilot sign-in are one-time.

  After it opens, click the extension's toolbar icon to open the side panel —
  then the harness can read/drive it.

.EXAMPLE
  ./scripts/launch-debug-chrome.ps1
  ./scripts/launch-debug-chrome.ps1 -Port 9333
#>
param(
  [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Could not find chrome.exe.' }

$root = Split-Path -Parent $PSScriptRoot
$ext = Join-Path $root '.output\chrome-mv3-dev'
if (-not (Test-Path (Join-Path $ext 'manifest.json'))) {
  throw "Dev build not found at $ext. Run 'pnpm dev' first."
}

# Dedicated profile (kept out of the repo). Persists across launches.
$profile = Join-Path $env:LocalAppData 'AIPageChatDebugProfile'

Write-Host "Launching debug Chrome:"
Write-Host "  profile : $profile"
Write-Host "  port    : $Port"
Write-Host "  ext     : $ext"
Write-Host ''
Write-Host 'After it opens, click the extension icon to open the side panel.'
Write-Host "Then attach with: node scripts/devtools.mjs targets --port $Port"

& $chrome `
  "--user-data-dir=$profile" `
  "--remote-debugging-port=$Port" `
  "--load-extension=$ext" `
  '--no-first-run' `
  '--no-default-browser-check'
