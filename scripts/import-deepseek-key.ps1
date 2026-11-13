param([Parameter(Mandatory=$true)][string]$SourcePath)
$ErrorActionPreference = 'Stop'
$privateText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $SourcePath).Path)
$privateKeys = @([regex]::Matches($privateText, '(?<![A-Za-z0-9_-])sk-[a-fA-F0-9]{32,128}(?![A-Za-z0-9_-])') | ForEach-Object { $_.Value } | Select-Object -Unique)
if ($privateKeys.Count -ne 1) { throw 'ONE_DEEPSEEK_KEY_REQUIRED' }
$publicScript = @'
import os,sys,re,grp,hmac,json
from pathlib import Path
try:
 if os.geteuid()!=0:raise RuntimeError()
 value=sys.stdin.read().strip()
 if not re.fullmatch(r'sk-[a-fA-F0-9]{32,128}',value):raise RuntimeError()
 target=Path('/etc/taskpilot/deepseek-key')
 if target.is_symlink():raise RuntimeError()
 if target.exists():
  if not hmac.compare_digest(target.read_text().strip(),value):raise RuntimeError()
 else:
  fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o640)
  with os.fdopen(fd,'w') as f:f.write(value+'\n')
  os.chown(target,0,grp.getgrnam('taskpilot').gr_gid)
 print(json.dumps({'provider':'deepseek','keyStored':True,'secretExported':False}))
except Exception:
 print('PROVIDER_KEY_IMPORT_FAILED',file=sys.stderr);sys.exit(1)
'@
$publicBytes = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicScript))
$startInfo = [Diagnostics.ProcessStartInfo]::new('ssh.exe')
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
foreach ($arg in @('-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','New-VPS',('python3 -c "import base64;exec(base64.b64decode(''' + $publicBytes + '''))"'))) { $startInfo.ArgumentList.Add($arg) }
$child = [Diagnostics.Process]::Start($startInfo)
try {
    $child.StandardInput.WriteLine($privateKeys[0])
    $child.StandardInput.Close()
    $safeOutput = $child.StandardOutput.ReadToEndAsync()
    $privateError = $child.StandardError.ReadToEndAsync()
    if (!$child.WaitForExit(30000)) { $child.Kill(); throw 'PROVIDER_KEY_IMPORT_TIMEOUT' }
    if ($child.ExitCode -ne 0) { throw 'PROVIDER_KEY_IMPORT_FAILED' }
    $metadata = $safeOutput.GetAwaiter().GetResult() | ConvertFrom-Json
    if (!$metadata.keyStored) { throw 'PROVIDER_KEY_IMPORT_FAILED' }
    [PSCustomObject]@{ Provider='deepseek'; KeyStored=$true; PlaintextPrinted=$false } | ConvertTo-Json -Compress
} finally { $child.Dispose(); $privateKeys=$null; $privateText=$null }
