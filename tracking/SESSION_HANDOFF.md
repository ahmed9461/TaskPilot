# تسليم قابل للاستئناف — 2026-11-11
Read AGENTS.md, PROJECT_STATE, TODO and DECISION_LOG first. All initial project docs/memory were read; latest user instruction is to continue implementation, Windows-server tests and commits. User authorized protected pilot deployment; real WhatsApp pairing/messages remain prohibited without separate approval.

## Work completed this continuation
8b49ae5: temporary SSH client sessions/reauth and Windows transport lifecycle. a95b018: group rules/priority, paging/filters, safe CSV and task-only purge plus Windows controls.0.2.0 follow-up:19-check acceptance fixture correction, strict synthetic cleanup helper, busy indicator and draft-preserving poll deferral. Exact final deployed SHA/CI follows in PROJECT_STATE.

## Evidence and boundaries
10 Node tests/build,16 dedicated PostgreSQL suite tests including parent,6 offline C# checks, WinUI Release0 warnings/errors PASS. Direct C# Windows→SSH→New-VPS19 checks PASS; synthetic account fixtures purged and session revoked. Actual native UI against server: create/edit/filter/archive/restore and deletion preview/cancel observed. No GUI send/delete/reveal confirmation automated; API/C# sensitive tests remain distinct. CI a95b018 backend+Windows PASS.
Own service restart/data/other running services preservation and least privilege verified on a95b018. Final backup/package/runtime verification after follow-up deployment is recorded in PROJECT_STATE/TEST_RESULTS. No real WhatsApp/AI or production data used.

## Runtime and reproduction
Own taskpilot.service loopback8240, own taskpilot-db loopback15488. Root-owned releases and /etc/taskpilot external keys; migration.env root-only. Never print/copy values. Windows settings «اتصال عبر SSH» uses existing trusted New-VPS alias;30-minute session then reconnect,60-second one-use reauth per sensitive action. No permanent API key export; no host-trust bypass or password automation.
`npm run check`, `npm run secrets`, `npm run format:check`; integration only TASKPILOT_TEST_DATABASE_URL ending _test. New-VPS /opt/taskpilot/stage retains dev dependencies for that isolated test DB; deployed current prunes them. `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release -- --server-acceptance New-VPS` runs19 direct-server checks. Cleanup mode allows only named synthetic fixture namespaces and never delete-all; harmless synthetic session/group/task/template config remains as audit evidence.
`node ops/verify-pilot.mjs` restarts only taskpilot and checks invariants; `node scripts/pilot-smoke.mjs` auth/readiness/replay. Backup tool creates encrypted unique file and restores only fresh *_restore_test DB,64MiB memory cap. Never delete/reset volumes or mutate applied migrations.

## Next useful work
1. Broaden native UI acceptance: review/task/status/rules/export/reconciliation, reconnect/session-expiry/accessibility/load. Draft/poll refinement was built; extended visual checks open.
2. Native toast/push, reports and operational monitoring can progress with synthetic data.
3. Production identity/MFA and data retention/key escrow/off-host recovery need owner decisions before real data. Installer/signing needs release materials.
4. Live WhatsApp adapter and live AI require explicit approved setup; do not reuse another project's secrets/sessions.
5. Whole-host reboot/rollback requires safe coordination to protect existing services; no host restart was performed.

Local native test app closed and scoped UI account removed; server remains active. No local helper required. Isolated SDK ../dotnet retained. See task outputs for portable package/hash/report; files contain no credentials. Old attempts and evidence remain in TEST_RESULTS, not proof of current release.
