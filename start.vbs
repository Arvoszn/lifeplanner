' Opens the planner in the default browser, starting the server if needed.
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d """ & appDir & """ && node server.js", 0, False
WScript.Sleep 1500
WshShell.Run "http://localhost:3141", 1, False
