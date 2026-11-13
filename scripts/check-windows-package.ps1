param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$packageDirectory = (Resolve-Path -LiteralPath $Path).Path
foreach ($required in @('TaskPilot.Windows.exe', 'TaskPilot.Windows.dll', 'TaskPilot.Windows.pri', 'App.xbf', 'MainPage.xbf', 'MainWindow.xbf', 'Assets/AppIcon.ico')) {
    $requiredPath = Join-Path $packageDirectory $required
    if (!(Test-Path -LiteralPath $requiredPath -PathType Leaf) -or (Get-Item -LiteralPath $requiredPath).Length -eq 0) {
        throw "PORTABLE_RESOURCE_MISSING: $required"
    }
}
$forbidden = Get-ChildItem -LiteralPath $packageDirectory -Recurse -File | Where-Object { $_.Name -match '^\.env' -or $_.Extension -in @('.key','.pem','.pfx','.db','.sqlite','.tpg','.log') }
if ($forbidden) { throw 'PORTABLE_RUNTIME_DATA_FORBIDDEN' }
Write-Output 'PASS: portable app resources present; forbidden runtime data absent. Native startup acceptance remains separate.'
