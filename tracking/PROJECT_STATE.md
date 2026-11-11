# الحالة الحالية — المصدر المرجعي
As of:2026-11-11. Synthetic pilot0.2.0. Production acceptance remains open.
Branch:`feat/mvp-foundation`. Current deployed code:`17f846e5051eebe64bdeb6659c8bb949304fff72`. Windows portable binary source:`bfcbbd416b678650c9796929a5e39e607334dc03`; later changes are ops diagnostics/docs only. Final tracking commit does not change deployed code. Historical results remain in TEST_RESULTS.md.

## DEPLOYED — New-VPS
- Own taskpilot.service active/enabled, taskpilot Linux user, root-owned immutable releases/current symlink.
- API only127.0.0.1:8240, own PostgreSQL17 taskpilot-db/container/volume only127.0.0.1:15488 with resource limits. No shared DB/proxy/firewall/SSH changes.
- Runtime taskpilot_runtime NOSUPERUSER/NOCREATEDB/NOCREATEROLE, DML only; actual DDL/migration-write denial verified. Root-only migration.env separate.
- Five migrations applied. Final diagnostic run verified actual own restart, DDL/migration denial, data preservation, startup enabled and unchanged other running service list for that sample. Earlier strict comparisons failed on other-services: independent existing service auto-restart observed while TaskPilot PID remained stable (I-010). No changes made to that service; continuous host-wide invariance is not claimed. TaskPilot active, NRestarts0, observed memory29,614,080 bytes. No whole-host reboot or rollback drill.

## VERIFIED pilot functionality
- Conservative extraction, encrypted account/review fields, explicit namespace/task/period/all-source identity and concurrent deduplication.
- Task completion independent of reply; source-scoped approvals/mock quoted outbox, UNKNOWN_DELIVERY reconciliation requires evidence and never automatically resends.
- Account archive/restore and snapshot single/selected/all purge; task-only purge preserves account/other tasks. Staleness and uncertain-delivery safeguards.
- D-029: Windows-owned SSH forward with30-minute hashed temporary sessions and60-second one-use reauth grants; revoke/expiry tests. Permanent server keys never exported by this flow. Pilot only, not MFA/RBAC.
- Deterministic keyword/priority routing with tie review, minimized IGNORED chat, page envelopes/scoped filters, reauthenticated safe filtered-page CSV.
- Actual C# Windows→SSH→New-VPS acceptance19 checks PASS; namespace synthetic-acceptance-fb76da4ff9 cleaned, session revoked. Earlier auth-only15 checks PASS.
- Actual WinUI Arabic RTL against deployed server: connection, synthetic account create/edit, namespace filter1/1, archive/restore, deletion preview/cancel. Account cleaned by scoped synthetic API helper. Sensitive GUI confirmation execution and broad UI acceptance are separate and remain open.
-10 Node tests/build,16 PostgreSQL suite tests including parent,6 offline C# checks, WinUI Release0 warnings/errors PASS. Audit0 vulnerabilities, repository encoding/known-secret scan PASS. Final CI17f846e both jobs PASS:https://github.com/ahmed9461/TaskPilot/actions/runs/43093897111.
- Busy indicator and draft-preserving poll deferral built; full new behavior visual acceptance remains open.

## Remaining
Live WhatsApp choice/pairing/receive/send needs explicit approval. AI adapters have4 offline privacy tests but are disconnected from runtime; no keys/live requests/billing. Production MFA/RBAC, retention/key rotation/escrow, off-host scheduled recovery, native toast/push, broader reports/load/accessibility/full GUI acceptance, signed installer/update channel remain open. Final AES-GCM backup42907 bytes: fresh isolated restore1 account/1 assignment/5 migrations/0 SENDING PASS. Same-host only; prior tamper rejection remains separate historical evidence. Portable0.2.0 ZIP94116192 bytes/527 entries testzip PASS; SHA25625AC485AB0D680C8B04753FEFCF396B99B6FDBD744C09D730308DBCFC1B67936. No runtime keys/config/backups in package; unsigned self-contained x64, no installer/update channel.

## Safety and resolved issues
Closed synthetic data only. Automatic permanent-token export was historically rejected by auto-review and remains unused; separate temporary SSH protocol solved direct-server tests. SQL checksum compatibility accepts only verified LF/CRLF equivalence, never changed applied SQL. UTF-8 corruption repaired and scan enforced; actual Arabic rendering/mutation verified. Test fixture missing rule keyword corrected before successful full rerun.

Final deployed HTTP auth/ready/replay smoke PASS, /health version0.2.0 provider mock, liveSending=false. Local native app/owned tunnels stopped; dedicated synthetic UI account and acceptance account fixtures cleaned. Synthetic configuration fixtures remain intentionally as audit/test evidence.

## 0.3 continuation — connection reliability (local VERIFIED)
Windows distinguishes401/revocation/local session expiry from transient transport failures. Read polling backs off10/20/40/60s; mutations are never retried automatically. Explicit reconnect preserves same-workspace cursor/filters; manual token mode disposes prior SSH session; logout clears identity. Added reconnect UI, expiry display, shutdown guards and draft protection when deselecting accounts/changing task status. Release build0 warnings/errors and6 original +7 simulated reliability checks PASS. Not deployed/visually accepted yet; server remains17f846e.

## 0.3 activity/notification stage — local and isolated VERIFIED
Added newest-first notification pages/read filter/bounded read-page API, committed-head/unread state, safe audit filters, aggregate operations snapshot and migration006 indexes. Windows has unread badge/activity/monitoring views and opt-in silent count-only desktop notifications; replay-safe change feed seeds new-workspace head and preserves same-workspace cursor. Backend10 unit tests/build, isolated PostgreSQL18/18 including parent, Windows Release0 warnings/errors,20 offline C# checks PASS. Local Windows notification probe: supported/enabled/accepted/stored/generic all true; payload XML exactly generic TaskPilot/count text with silent audio. This is API receipt/storage evidence, not observed popup/click/closed-app delivery. Probe app closed. Expanded25-check direct-server acceptance added but not yet run; current server still17f846e pending0.3 rollout.

0.3 rollout follow-up:96e4cbe deployed with6 migrations, initial immediate smoke raced listener startup (I-013); unchanged release health/auth/ready/replay PASS, NRestarts0. Added bounded exact-version readiness wait and regression;11 Node tests PASS. Native GUI fixture seeder added for reproducible scoped synthetic acceptance. Hosted CI runs5833c73/96e4cbe are still queued with no jobs; not counted as PASS.
