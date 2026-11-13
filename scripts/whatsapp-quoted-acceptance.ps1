param(
    [Parameter(Mandatory = $true)][string]$TestGroupTitle,
    [string]$DotnetPath = 'dotnet'
)
$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$gateScript = Join-Path $repoDirectory 'ops/whatsapp-test-sending.py'
$checksProject = Join-Path $repoDirectory 'apps/windows-tests/TaskPilot.ClientChecks.csproj'
$quotedExit = 1
try {
    Get-Content -LiteralPath $gateScript -Raw -Encoding UTF8 | ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes New-VPS 'python3 - on'
    if ($LASTEXITCODE -ne 0) { throw 'TEST_GATE_ENABLE_FAILED' }
    & $DotnetPath run --project $checksProject -c Release -- --whatsapp-test-quoted-reply $TestGroupTitle
    $quotedExit = $LASTEXITCODE
} finally {
    # Always close the test gate, including failed enable/readiness/preview/relay checks.
    # Unknown delivery remains preserved for explicit reconciliation, never resent here.
    Get-Content -LiteralPath $gateScript -Raw -Encoding UTF8 | ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes New-VPS 'python3 - off'
    if ($LASTEXITCODE -ne 0) { throw 'TEST_GATE_DISABLE_FAILED' }
}
exit $quotedExit
