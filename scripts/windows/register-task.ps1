# Windowsにログオンしたとき、TikTok企画エージェントを自動で起動するタスクを登録します。
# 使い方（PowerShellで、プロジェクトのフォルダから）:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\register-task.ps1
# 解除するとき:
#   Unregister-ScheduledTask -TaskName "TikTokAgents" -Confirm:$false

$ErrorActionPreference = "Stop"
$StartScript = Join-Path $PSScriptRoot "start-agent.cmd"

$Action = New-ScheduledTaskAction -Execute $StartScript
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
  -TaskName "TikTokAgents" `
  -Description "TikTok企画エージェント（Slackボット＋毎朝の企画づくり）" `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Force | Out-Null

Write-Host "登録しました。次回のログオンから自動で起動します。今すぐ起動するには:"
Write-Host '  Start-ScheduledTask -TaskName "TikTokAgents"'
