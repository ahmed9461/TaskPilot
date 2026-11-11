# التسليم — 2026-11-11
## المنفذ
Backend foundation commit62fddfe. Subsequent working release adds native WinUI3/.NET10 self-contained client, protected forms/preview/polling, backup/deploy tools, CI, aggregate deletion-staleness hardening. Every repo document read at start.

## الأدلة
3 Node unit tests;14 PostgreSQL integration tests including parent (server-local, own dedicated *_test DB);6 C# client checks; zero npm audit findings; WinUI Release build/publish pass. Actual Windows fixture/account/task/reply preview/cancel observed. Initial tunnel pool-timeout fixed5s→20s; incidental rebuild failed because running test EXE locked output, then app closed and publish passed.
New-VPS taskpilot.service on loopback8240 + own PostgreSQL container15488. Auth/replay smoke and encrypted backup/isolated restore pass. No live external messages or AI calls.

## الإكمال الجاري
Commit/push native pilot, deploy exact immutable release, restart only taskpilot and compare other running services; wait CI and fix failures. Package portable Windows output with instructions/checksum.

## المعلّق
Do not fetch server bearer token into client automatically: auto-review rejected launch carrying that key with generic blocked-by-policy; no detailed reason. Windows direct pilot connection remains manual acceptance; synthetic fixture path works safely.
No live WhatsApp/AI outbound until authorized and scoped; real-data retention/production MFA/key escrow not approved. No other services or shared config changes.

## الاستئناف
Current checkout work/TaskPilot, feat/mvp-foundation. Own runtime /opt/taskpilot/current → releases/FULL_SHA. `/etc/taskpilot` owns secret files; never print/copy to Git/outputs. `ops/deploy-pilot.sh` prepared release; `scripts/pilot-smoke.mjs` on VPS. Integration tests only *_test; restores only *_restore_test. Local SDK ../dotnet. Project state always wins over old planning language.
