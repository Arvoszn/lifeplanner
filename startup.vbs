' Silent start for the Windows Startup folder (no window, no browser).
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d """ & appDir & """ && node autostart.js", 0, False
