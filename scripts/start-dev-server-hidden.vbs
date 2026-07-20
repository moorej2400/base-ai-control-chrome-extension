' start-dev-server-hidden.vbs
'
' Hidden, windowless launcher for the WXT (`pnpm dev`) dev server.
'
' WHY THIS EXISTS
'   In dev mode the extension's side panel loads ALL its code over HTTP from the
'   Vite/WXT dev server at http://localhost:3000. If that server isn't running,
'   the side panel renders blank. This launcher keeps `pnpm dev` running for the
'   whole login session, started by a Task Scheduler "At log on" trigger, with
'   NO console window ever appearing.
'
' HOW IT STAYS WINDOWLESS
'   wscript.exe (which runs .vbs) has no console of its own, and WshShell.Run
'   with intWindowStyle = 0 launches the child cmd.exe fully hidden. We do NOT
'   wait for it (bWaitOnReturn = False) so this script exits immediately while
'   the dev server keeps running, parented to the Task Scheduler host chain.
'
' PORTABILITY
'   The project root is resolved RELATIVE to this script's own location
'   (scripts\ -> parent), never hardcoded, so moving/renaming the repo folder
'   does not silently break the launcher.
'
' NOTE: VBScript still ships and runs on this Windows 11 build, but Microsoft
'   has announced it is deprecated long-term (a future "feature on demand",
'   then eventual removal). If/when that lands, swap this for the PowerShell
'   equivalent (Start-Process -WindowStyle Hidden). See the .ps1 sibling.

Option Explicit

Dim fso, shell, scriptDir, projectRoot, logDir, logFile, cmdLine

Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' This script lives in <projectRoot>\scripts\ -> parent folder is the root.
scriptDir   = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)

' Log directory under %LOCALAPPDATA% so output is inspectable without a terminal.
logDir  = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\JChatDevServer"
If Not fso.FolderExists(logDir) Then
    fso.CreateFolder(logDir)
End If
logFile = logDir & "\dev-server.log"

' Build the command. We go through `cmd /c` so we can:
'   - cd /d into the project root (logon env has a minimal/foreign CWD), and
'   - redirect BOTH stdout and stderr (1>file 2>&1) into the log file.
' `pnpm` is resolved via the cmd shim (pnpm.CMD) which is on PATH for the
' logged-on user; we still cd with an absolute path so CWD is never assumed.
'
' Quoting: the whole cmd /c payload is wrapped in one pair of double quotes,
' and the inner paths each get their own quotes, per cmd.exe parsing rules.
cmdLine = "cmd.exe /d /s /c """ & _
          "cd /d """ & projectRoot & """ && " & _
          "pnpm dev 1>""" & logFile & """ 2>&1" & _
          """"

' intWindowStyle = 0  -> hidden (no window at all)
' bWaitOnReturn = False -> fire-and-forget; dev server outlives this script.
shell.Run cmdLine, 0, False
