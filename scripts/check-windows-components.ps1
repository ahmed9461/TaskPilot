param(
    [Parameter(Mandatory=$true)][string]$AppPath,
    [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference='Stop'
$app=(Resolve-Path -LiteralPath $AppPath).Path
if([IO.Path]::GetFileName($app) -ne 'TaskPilot.Windows.exe'){throw 'OWN_TASKPILOT_APP_REQUIRED'}
$report=[IO.Path]::GetFullPath($ReportPath)
if((Test-Path -LiteralPath $report) -or [IO.Path]::GetExtension($report) -ne '.json'){throw 'NEW_JSON_REPORT_REQUIRED'}
if(!(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($report)) -PathType Container)){throw 'REPORT_DIRECTORY_REQUIRED'}
$start=[Diagnostics.ProcessStartInfo]::new($app)
$start.UseShellExecute=$false
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
foreach($name in @($start.Environment.Keys | Where-Object {$_ -like 'TASKPILOT_*'})){$start.Environment.Remove($name)|Out-Null}
$start.Environment['TASKPILOT_NOTIFICATION_PROBE_FILE']=$report
$start.Environment['TASKPILOT_NOTIFICATION_PROBE_AUTOCLOSE']='1'
# Canaries prove that the isolated probe branch does not consume client configuration.
$start.Environment['TASKPILOT_CLIENT_CONFIG_FILE']='Z:\TaskPilot-Synthetic-Must-Not-Read\missing.json'
$start.Environment['TASKPILOT_SSH_ALIAS']='TaskPilot-Synthetic-Must-Not-Run'
$process=[Diagnostics.Process]::Start($start)
if(!$process.WaitForExit(30000)){
    if($process.MainModule.FileName -ne $app){throw 'OWN_PROBE_PROCESS_PATH_MISMATCH'}
    $process.Kill()
    throw 'OWN_NATIVE_PROBE_TIMEOUT'
}
if($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $report)){throw 'NATIVE_COMPONENT_PROBE_FAILED'}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
if($result.layout.status -ne 'PASS'){
    Write-Output ($result.layout | ConvertTo-Json -Compress)
    throw 'NATIVE_LAYOUT_CHECK_FAILED'
}
if($result.enabled -and (!$result.accepted -or !$result.stored -or !$result.generic)){throw 'NATIVE_NOTIFICATION_RECEIPT_FAILED'}
[pscustomobject]@{
    nativeLayout=$result.layout
    supported=$result.supported
    elevated=$result.elevated
    enabled=$result.enabled
    accepted=$result.accepted
    stored=$result.stored
    generic=$result.generic
    ownProbeExited=$process.HasExited
    productVersion=(Get-Item -LiteralPath $app).VersionInfo.ProductVersion
    clientCanariesBypassed=$true
    visiblePopup='NOT_OBSERVED'
    keyboardAndResize='NOT_RUN_TOOL_UNAVAILABLE'
} | ConvertTo-Json -Depth 5 -Compress
