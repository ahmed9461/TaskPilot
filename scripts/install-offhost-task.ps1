$ErrorActionPreference = 'Stop'
$taskpilotPrivate = 'E:\TaskPilot-Backups'
$taskpilotName = 'TaskPilot-Offhost-Daily'
if (!(Test-Path -LiteralPath (Join-Path $taskpilotPrivate 'recovery-current-user.dpapi'))) { throw 'TESTED_PRIVATE_RECOVERY_REQUIRED' }
if (Get-ScheduledTask -TaskName $taskpilotName -ErrorAction SilentlyContinue) { throw 'EXISTING_TASK_REQUIRES_REVIEW' }
$taskpilotRunner = Join-Path $taskpilotPrivate 'offhost-backup.mjs'
if (Test-Path -LiteralPath $taskpilotRunner) { throw 'EXISTING_RUNNER_REQUIRES_REVIEW' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'offhost-backup.mjs') -Destination $taskpilotRunner
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'recovery-crypto.mjs') -Destination (Join-Path $taskpilotPrivate 'recovery-crypto.mjs')
$taskpilotNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskpilotAction = New-ScheduledTaskAction -Execute $taskpilotNode -Argument ('"' + $taskpilotRunner + '" --backup-only') -WorkingDirectory $taskpilotPrivate
$taskpilotTrigger = New-ScheduledTaskTrigger -Daily -At '03:15'
$taskpilotIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskpilotPrincipal = New-ScheduledTaskPrincipal -UserId $taskpilotIdentity -LogonType Interactive -RunLevel Limited
$taskpilotSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskpilotName -Action $taskpilotAction -Trigger $taskpilotTrigger -Principal $taskpilotPrincipal -Settings $taskpilotSettings -Description 'TaskPilot only: encrypted off-host snapshot to private Windows folder, requires this user session, trusted SSH and connectivity. No Docker/provider or automatic deletion.' | Out-Null
Write-Output 'PASS: own daily snapshot task installed, 03:15 local, current user session required; independent restore drill remains manual.'
