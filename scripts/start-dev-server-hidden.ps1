<#
.SYNOPSIS
  Hidden, windowless launcher for the WXT (`pnpm dev`) dev server.

.DESCRIPTION
  PowerShell alternative to start-dev-server-hidden.vbs. Same purpose: keep the
  WXT dev server (which serves the extension side panel at http://localhost:3000)
  running for the whole login session with NO console window.

  The primary launcher used by the "JChat Dev Server" scheduled task is the .vbs
  (wscript.exe has no console, so it is the most reliably windowless option).
  This .ps1 is kept as a maintained fallback for if/when Microsoft removes
  VBScript. To use it instead, point the task's launcher at:

    wscript.exe is replaced by:
      powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass
                     -File "<root>\scripts\start-dev-server-hidden.ps1"

  Even with -WindowStyle Hidden, powershell.exe briefly flashes a window on
  some systems; that is why the .vbs is preferred for the logon task.

.NOTES
  Paths are resolved RELATIVE to this script (scripts\ -> parent), never
  hardcoded, so moving the repo does not break it.
#>

$ErrorActionPreference = 'Stop'

# <projectRoot>\scripts\ -> parent is the root.
$projectRoot = Split-Path -Parent $PSScriptRoot

# Inspectable log location (no terminal in the logon session).
$logDir = Join-Path $env:LOCALAPPDATA 'JChatDevServer'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'dev-server.log'

# Run `pnpm dev` from the project root, redirecting all output to the log.
# Start-Process with the cmd shim keeps this independent of the calling shell.
$inner = 'cd /d "{0}" && pnpm dev 1>"{1}" 2>&1' -f $projectRoot, $logFile

Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/d', '/s', '/c', $inner `
  -WindowStyle Hidden
