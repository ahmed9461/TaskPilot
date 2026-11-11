# تسليم قابل للاستئناف —2026-11-12
Read AGENTS/README/PROJECT_STATE/TODO/DECISION_LOG first. Latest user asked to continue. Actual implementation and protected pilot deployment/scoped synthetic cleanup are authorized; real WhatsApp pairing/messages and live AI remain gated. Preserve existing VPS services.

## Current result
API+Windows0.4 source `87f986b8bd7ce18717f112611e3937642d1b69b1` deployed.0.3 implemented connection recovery, notification/audit pages, unread badge/count-only local toasts and monitoring, plus exact-version deployment readiness.0.4 closes POST-only/global template gap with editing/scopes/availability and stale-preview guards. Final tracking-only commit records evidence.
CI43100482889 both jobs SUCCESS.11 Node,19 PostgreSQL including parent,20 offline C#,28 Windows→VPS checks PASS; current exact-source CI supersedes earlier0.3 runs that remained queued without jobs. Do not attribute old queue to a specific cause.
Actual native0.3 task/status/monitoring/audit/page2/preview cancel/tunnel-loss/reconnect/draft retention and0.4 template create/edit/group-task scope/disable/reload verified. Full sensitive GUI confirmations, popup/click and broad UI acceptance remain distinct/open. No real sends or providers.
Final encrypted restore7 migrations/1 account/1 assignment/0 sending PASS; same-host only. Portable0.4 ZIP/hash/report in task outputs. GUI/owned SSH children stopped. Scoped acceptance accounts removed; synthetic group/task/template configs retained, UI template disabled. Window close stops tunnel with token expiry fallback; explicit logout/revocation separate.

## Runtime/reproduction
Own taskpilot.service loopback8240, own taskpilot-db loopback15488. External /etc/taskpilot files never printed/copied. Root-only migration env; runtime DML restricted. /opt/taskpilot/current exact release. ops/deploy-pilot.sh now waits for exact-version/mock health before reporting success. Authenticated smoke separate.
`npm run check`, secrets, format:check; integration only TASKPILOT_TEST_DATABASE_URL ending _test. /opt/taskpilot/stage has dev dependencies; never run destructive integration against pilot DB. SDK ../dotnet. `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release -- --server-acceptance New-VPS` runs28 checks using temporary private SSH IPC, no permanent API-key export. --seed-native-ui uses only synthetic-ui-acceptance; cleanup mode is strict namespaced IDs, never delete-all.
Migrations append-only.007 adds template version/enabled/scopes. New unapproved snapshots require templateVersion; pre007 previews fail stale. Already-approved jobs never change body/target on edit. Group FK locks before template row locks prevent scope-edit/approval lock inversion. Source selection requests enabled candidates per group/task and discards old responses.
`node ops/verify-pilot.mjs` changes only TaskPilot service and always reports own checks; final overall nonzero EXTERNAL_SERVICE_DRIFT because another running service disappeared from the sample. Known unrelated loop was observed independently; never fix/restart other projects for a green check. No whole-host reboot/rollback.
Backup only encrypted unique files and fresh *_restore_test DB,64MiB cap. No off-host key-loss recovery/production retention inference.

## Next useful authorized work
1. Account details with flags/task/source history; UI choices should show stable codes for duplicate display names (I-016).
2. Continue native review/reconciliation/export and template source-switch/accessibility/reconnect acceptance with synthetic data; keep UI sensitive confirmations separate from API tests.
3. Broader load/recovery/reporting, retained monitoring; current operations view is a snapshot, not proof of scheduled backup success.
4. Production identity/MFA, retention/key rotation/off-host escrow, signing/update materials and live connector/provider setup require owner decisions. Do not reuse another project's secrets or sessions, and do not bypass any OS trust prompt.
