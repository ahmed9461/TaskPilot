# الحالة الحالية — المصدر المرجعي
As of:2026-11-11. Synthetic pilot0.2.0. Production acceptance remains open.
Branch:`feat/mvp-foundation`. Current deployed code:`a95b0184eabed0354e58c728ad117f523452bf6b`; final0.2.0 polish is built locally, pending exact-release deployment and CI. Historical results remain in TEST_RESULTS.md.

## DEPLOYED — New-VPS
- Own taskpilot.service active/enabled, taskpilot Linux user, root-owned immutable releases/current symlink.
- API only127.0.0.1:8240, own PostgreSQL17 taskpilot-db/container/volume only127.0.0.1:15488 with resource limits. No shared DB/proxy/firewall/SSH changes.
- Runtime taskpilot_runtime NOSUPERUSER/NOCREATEDB/NOCREATEROLE, DML only; actual DDL/migration-write denial verified. Root-only migration.env separate.
- Five migrations applied. Own restart, preserved data and unchanged other running service list verified on a95b018. No whole-host reboot or rollback drill.

## VERIFIED pilot functionality
- Conservative extraction, encrypted account/review fields, explicit namespace/task/period/all-source identity and concurrent deduplication.
- Task completion independent of reply; source-scoped approvals/mock quoted outbox, UNKNOWN_DELIVERY reconciliation requires evidence and never automatically resends.
- Account archive/restore and snapshot single/selected/all purge; task-only purge preserves account/other tasks. Staleness and uncertain-delivery safeguards.
- D-029: Windows-owned SSH forward with30-minute hashed temporary sessions and60-second one-use reauth grants; revoke/expiry tests. Permanent server keys never exported by this flow. Pilot only, not MFA/RBAC.
- Deterministic keyword/priority routing with tie review, minimized IGNORED chat, page envelopes/scoped filters, reauthenticated safe filtered-page CSV.
- Actual C# Windows→SSH→New-VPS acceptance19 checks PASS; namespace synthetic-acceptance-fb76da4ff9 cleaned, session revoked. Earlier auth-only15 checks PASS.
- Actual WinUI Arabic RTL against deployed server: connection, synthetic account create/edit, namespace filter1/1, archive/restore, deletion preview/cancel. Account cleaned by scoped synthetic API helper. Sensitive GUI confirmation execution and broad UI acceptance are separate and remain open.
-10 Node tests/build,16 PostgreSQL suite tests including parent,6 offline C# checks, WinUI Release0 warnings/errors PASS. Audit0 vulnerabilities, repository encoding/known-secret scan PASS. CI a95b018 both jobs PASS:https://github.com/ahmed9461/TaskPilot/actions/runs/43090281021.
- Busy indicator and draft-preserving poll deferral built; full new behavior visual acceptance remains open.

## Remaining
Live WhatsApp choice/pairing/receive/send needs explicit approval. AI adapters have4 offline privacy tests but are disconnected from runtime; no keys/live requests/billing. Production MFA/RBAC, retention/key rotation/escrow, off-host scheduled recovery, native toast/push, broader reports/load/accessibility/full GUI acceptance, signed installer/update channel remain open. Latest backup/restore and output package evidence is recorded after final deployment, not inferred from prior3-migration restore.

## Safety and resolved issues
Closed synthetic data only. Automatic permanent-token export was historically rejected by auto-review and remains unused; separate temporary SSH protocol solved direct-server tests. SQL checksum compatibility accepts only verified LF/CRLF equivalence, never changed applied SQL. UTF-8 corruption repaired and scan enforced; actual Arabic rendering/mutation verified. Test fixture missing rule keyword corrected before successful full rerun.
