' Roda o atualizador sem abrir a janela preta (usado pela tarefa de hora em hora). Ex.: wscript rodar-escondido.vbs --arquivos
Dim pasta, args, i
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
args = ""
For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & WScript.Arguments(i)
Next
CreateObject("WScript.Shell").Run "node """ & pasta & "\atualizador.mjs""" & args, 0, False
