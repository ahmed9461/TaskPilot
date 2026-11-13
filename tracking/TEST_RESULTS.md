# نتائج الاختبار الفعلية

Date: 2026-11-11 UTC. Evidence: commands in repository, phase-1 backend commit containing this file.



| ID | Test / environment | Result |

|---|---|---|

| T-001 | Windows Node 24.15 `npm run check`, server Node 24.19 same command | PASS: tsc + 3 unit tests |

| T-101 | New-VPS own PostgreSQL 17, 12 concurrent same-message ingests + 6 same-account new sources | PASS: one assignment, all sources |

| T-102 | Multiple task types/periods/namespaces | PASS |

| T-103 | Source-scoped preview, reauth, one-use token, mock quoted transport, timeout/crash unknown handling | PASS; no real message sent |

| T-104 | Verified/manual versus UNVERIFIED flags | PASS |

| T-105 | Wrong phrase/reauth/stale preview/uncertain delivery block; single/all purge; archive/restore | PASS on synthetic records |

| T-107 | Two synthetic sessions; cross-session spoof rejected | PASS |

| T-109 | Unauthorized API/reveal denial, AEAD, minimized lists/events, encrypted-at-rest fixture | PASS |

| T-110 | `npm run test:integration` on server, ~4.7s | PASS: 13 tests including parent, zero skipped |

| T-111 | `npm audit --audit-level=low` | PASS: zero known vulnerabilities |

| T-106 | Service running independent of Windows; process restart test pending exact release | PARTIAL |

| T-108 | New-VPS AES-256-GCM pg_dump → fresh *_restore_test DB | PASS:1 account,1 assignment,2 migrations,0 sending |



Initial integration execution over high-latency SSH tunnel: FAIL (pool 5s acquisition timeout; downstream tests lacked fixture). Corrected pool wait to 20s and ran whole suite adjacent to PostgreSQL: PASS. Do not treat that failed attempt as a service deployment failure or live-user evidence.



Reproduce: dedicated DB named `*_test`, set TASKPILOT_TEST_DATABASE_URL securely, run `npm ci`, `npm run check`, `npm run test:integration`. Tests truncate only that dedicated database. Real WhatsApp, live AI and human UI acceptance NOT RUN.



## Native pilot phase

- 2026-11-11: isolated PostgreSQL suite expanded14/14 PASS,0 skipped (~7s including harness), including expired/stale reply tokens, idempotent key reuse, source arrival invalidating deletion snapshot.

- .NET10.0.404 / Windows App SDK2.6.5: Release build0 warnings/errors; self-contained x64 publish PASS after closing EXE locked during an intermediate rebuild.

- `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release`:6 checks PASS, no network; rejects insecure/non-root/userinfo/fragment addresses and short token, checks auth/reauth/response/error contracts. HTTP redirects disabled.

- Computer-use observed real WinUI Arabic RTL window; local fixture API18241, own PostgreSQL UI *_test DB reached via SSH25488. Account/task visible, password absent in list, reply target/text preview correct, canceled before approval. UI confirmation for send/delete/reveal not executed; no claims of full human acceptance.

- Deployed HTTP smoke:unauth401, ready PASS, liveSending false, replay dedupe PASS, one synthetic assignment and one review fixture.

- Backup file creation encrypted=true,32302 bytes; isolated restore PASS. No off-host/VPS-loss recovery claim.

- Direct Windows-to-VPS authenticated launch BLOCKED by auto-review; substitute fixture UI pass is distinct evidence.

- CI workflow committed next; hosted runs not yet observed.



## Stability/adapters phase

- `npm run check`: build +8 tests PASS (3 original,4 mocked AI provider/privacy cases,1 LF/CRLF migration-integrity regression).

- CI https://github.com/ahmed9461/TaskPilot/actions/runs/43059625322: PASS, both Ubuntu/PostgreSQL and Windows/.NET jobs on f659d9b.

- Deploy f659d9b: safely BLOCKED by checksum guard. Verified old SQL hash equals CRLF form of new LF SQL for both files; old62fddfe active. Corrected comparison preserves rejection of actual SQL changes; new full deployment evidence follows.

- AI live requests/billing and direct Windows-pilot auth remain NOT RUN.



- Stability rerun on New-VPS dedicated test DB:8 unit/adapter/integrity tests and14 PostgreSQL workflow tests PASS, including reauth/evidence reconciliation and no resend after reconciliation. WinUI rebuild0 errors/warnings. Runtime least-privilege separation and restart verifier added; actual verification pending deployment.



## Final code acceptance — eb0f66b

- CI43061180349 PASS: Ubuntu/PG backend and Windows/.NET jobs. Source https://github.com/ahmed9461/TaskPilot/commit/eb0f66bbc35ff008767501526612bdf0e9a94999 .

- New-VPS runtime role least-privilege PASS: NOSUPERUSER, no create DB/role, CREATE TABLE denied42501, schema_migrations UPDATE denied42501.

- Actual taskpilot restart PASS: changed PID, counts identical, other running service list identical, enabled at startup. Active, NRestarts0, observed MemoryCurrent28762112. Host reboot/rollback NOT RUN.

- Final HTTP auth/ready/replay PASS after restart; liveSendingfalse. API8240/DB15488 only127.0.0.1.

- Final encrypted backup32635 bytes; fresh restore DB1 account/1 assignment/3 migrations/0 SENDING. Tampered ciphertext rejected with no target database created.

- Self-contained Windows publish PASS and6 client checks PASS. ZIP96852413 bytes/527 entries: testzip PASS, executable present, no runtime key/backup/log files. SHA2564FEE0763349A0A0258302CDD1F9526FA14FF4BBEFA1618AA02B38EED88708C04.

- Temporary Windows fixture client/API/SSH forwards stopped; VPS pilot intentionally remains active. Full live acceptance not claimed.



## Continuation stage1 — SSH sessions

Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.



Stage1 predeployment evidence:8 Node tests/build PASS, dedicated New-VPS PostgreSQL suite15/15 PASS including session lifecycle, WinUI Release0 warnings/errors and6 offline C# checks PASS. Direct server acceptance is next, not yet claimed.


Windows-to-New-VPS acceptance stage1 PASS:15 C# checks through SshConnection/ApiClient, namespace synthetic-acceptance-71230d4079; scoped fixture accounts removed, session revoked, no permanent key exported/no real send. This is direct-server transport/workflow evidence; visible WinUI acceptance is separate.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.

Continuation expanded C# Windows-to-New-VPS run PASS:19 checks; namespace synthetic-acceptance-fb76da4ff9 cleaned and client session revoked. Covers rule-routed priority/filter page, CSV export, independent task purge plus original workflow. Initial expanded run failed because the test message lacked its routing keyword; corrected fixture, then reran whole acceptance successfully. Two leftover synthetic accounts from that failed namespace were purged through scoped API (not delete-all).
Native WinUI observed against actual New-VPS: connected SSH login, Arabic rendering, account create/edit, namespace filter yielding1/1, archive then restore. Destructive confirmation not executed by GUI; API/C# scoped purge tests are separate evidence. CI a95b018 both jobs PASS: https://github.com/ahmed9461/TaskPilot/actions/runs/43090281021 .

0.2.0 local final polish: WinUI Release build0 warnings/errors PASS;6 offline C# checks PASS;10 Node tests/build/format/encoding-secret scan PASS; npm audit0. Added busy indicator and draft/selection-preserving poll deferral (built; broad GUI regression remains pending). Native synthetic-ui-acceptance account removed through strict scoped cleanup helper, deleted1; own GUI closed.

0.2.0 exact code bfcbbd4: CI43093142819 both jobs SUCCESS. Own deployment PASS, /health0.2.0 mock. First ops verifier returned generic failure; staged diagnostic copy on unchanged release then PASS for runtime role/DDL denial/migration denial/restart/data/other-service/startup; original failing check unconfirmed (I-010). Verifier gains sanitized stage diagnostics and bounded probes; final rerun follows. HTTP auth/ready/replay PASS, liveSending=false. New AES-GCM backup42907 bytes and isolated fresh restore PASS:1 account/1 assignment/5 migrations/0 SENDING. Portable0.2.0 ZIP94116192 bytes/527 entries testzip PASS, SHA25625AC485AB0D680C8B04753FEFCF396B99B6FDBD744C09D730308DBCFC1B67936. Windows binary source bfcbbd4; later ops/docs changes do not change that binary.

## Final continuation evidence —17f846e (0.2.0)
- Deployed `17f846e5051eebe64bdeb6659c8bb949304fff72`; CI43093897111 backend+Windows SUCCESS: https://github.com/ahmed9461/TaskPilot/actions/runs/43093897111 . API and Windows application code identical to bfcbbd4 except ops verification diagnostics.
- Strict ops verifier17f846e reported other-services mismatch. Diagnostic delta identified one existing service entering/leaving running state. Read-only4 samples over12s, with no TaskPilot restart command: TaskPilot PID338228/NRestarts0 stable; existing service count159261→159262 and auto-restart state observed. No unrelated service modification. This explains later comparison failures; first generic bfcbbd4 assertion still unconfirmed.
- Final diagnostic full verifier on17f846e PASS for actual runtime role/DDL denial/migration denial/changed TaskPilot PID/data counts/startup and other-running-service equality for that sample. No repeated stability/continuous host invariance claim.
- Authenticated HTTP health/ready/replay PASS after final rollout; liveSending=false, provider mock, API0.2.0; service active/running/NRestarts0.
- Final backup/restore5 migrations and package integrity evidence above still applies; ops-only change does not alter schema or Windows binary. No live WhatsApp, AI calls, host reboot or schema rollback was performed.

## 0.3 continuation — connection reliability (local VERIFIED)
Windows distinguishes401/revocation/local session expiry from transient transport failures. Read polling backs off10/20/40/60s; mutations are never retried automatically. Explicit reconnect preserves same-workspace cursor/filters; manual token mode disposes prior SSH session; logout clears identity. Added reconnect UI, expiry display, shutdown guards and draft protection when deselecting accounts/changing task status. Release build0 warnings/errors and6 original +7 simulated reliability checks PASS. Not deployed/visually accepted yet; server remains17f846e.

## 0.3 activity/notification stage — local and isolated VERIFIED
Added newest-first notification pages/read filter/bounded read-page API, committed-head/unread state, safe audit filters, aggregate operations snapshot and migration006 indexes. Windows has unread badge/activity/monitoring views and opt-in silent count-only desktop notifications; replay-safe change feed seeds new-workspace head and preserves same-workspace cursor. Backend10 unit tests/build, isolated PostgreSQL18/18 including parent, Windows Release0 warnings/errors,20 offline C# checks PASS. Local Windows notification probe: supported/enabled/accepted/stored/generic all true; payload XML exactly generic TaskPilot/count text with silent audio. This is API receipt/storage evidence, not observed popup/click/closed-app delivery. Probe app closed. Expanded25-check direct-server acceptance added but not yet run; current server still17f846e pending0.3 rollout.

0.3 rollout follow-up:96e4cbe deployed with6 migrations, initial immediate smoke raced listener startup (I-013); unchanged release health/auth/ready/replay PASS, NRestarts0. Added bounded exact-version readiness wait and regression;11 Node tests PASS. Native GUI fixture seeder added for reproducible scoped synthetic acceptance. Hosted CI runs5833c73/96e4cbe are still queued with no jobs; not counted as PASS.

Windows→New-VPS0.3 direct acceptance25/25 PASS on96e4cbe, namespace synthetic-acceptance-9da8ad78d8 scoped accounts cleaned and both client sessions revoked. Includes real owned-tunnel drop and explicit fresh-session recovery, activity feed replay guard/read IDs, audit filter and operations snapshot. No permanent key export/live send.

## 0.3 checkpoint verified deployment
Deployed dc76227; exact-version wait and auth smoke PASS. Final own role/denial/restart/data/startup PASS; unrelated-service delta removed1 caused overall EXTERNAL_SERVICE_DRIFT/nonzero, not hidden.11 Node/18 PostgreSQL/20 local C# PASS. Native monitoring/audit filter4rows/notifications page2(51–100 of107)/task COMPLETED/reply preview CANCEL/owned-tunnel loss/reconnect with preserved draft PASS. Closed GUI, own child tunnels0, scoped UI account deleted1. Encrypted backup46916 bytes restored1 account/1 assignment/6 migrations/0 SENDING. ZIP94133913 bytes/527 entries/SHA256DE14479211F94E12538F9A8DE2C2935D421F5AB20E281B90C8216C775F94C71B, testzip PASS. Current hosted runs still queued/jobs=[]; not a hosted PASS.

## 0.4 template stage — IN_PROGRESS / local verification
Implemented editable/versioned/scoped/available templates with migration007, paged administration and source-matching choice UI. Preview/approval scope checks and template version rejection protect old unapproved snapshots; approved body remains unchanged. Group FK locks acquired before template locks to align with approval.11 Node tests and first19 PostgreSQL tests PASS; final race extension/WinUI build/direct28-check acceptance and deployment are being verified. Server remains0.3 dc76227 until rollout; do not infer deployment or full GUI acceptance from implementation.

0.4 final predeployment verification:11 Node/build/format tests,19 isolated PostgreSQL tests including scoped-edit versus approval race PASS, WinUI Release0 warnings/errors and20 offline C# checks PASS. New reply selector queries server candidates per selected source with stale-response guards; editing preserves stored scopes absent from the first100 choice rows. Expanded28-check Windows↔VPS runner prepared; runtime/UI acceptance follows deployment. No real WhatsApp/AI or messages.

## Final0.4 verified checkpoint —2026-11-12
Source87f986b deployed and hosted CI43100482889 backend+windows SUCCESS: https://github.com/ahmed9461/TaskPilot/actions/runs/43100482889 .11 Node/19 PG including scoped-edit approval race/20 offline C# PASS.28 direct Windows↔VPS checks PASS, synthetic-acceptance-e46d229b16 accounts removed/runner sessions revoked. Native template create/edit/Arabic body/group/task/disabled reload/filter1of1 observed. Retained config synthetic-ui-template-edit-040 is disabled; no real send. GUI stopped, owned tunnels0.
Final own runtime role/DDL denial/migration denial/restart/data/startup PASS; overall EXTERNAL_SERVICE_DRIFT (other-service removed1) remains nonzero and no other service changed by our commands. Snapshot active/running/NRestarts0/memory29720576 bytes.
AES-GCM backup50631 bytes restored fresh1 account/1 assignment/7 migrations/0 SENDING PASS; post-restore health/readiness/auth/replay/liveSendingfalse PASS. Portable ZIP94138261 bytes/527 entries/testzip PASS; SHA2563ED56F6F9D770D7BBAB3D4A093A94CBA4DD2FBCB10E75E641ED0E7D8C074CC57. Unsigned/self-contained; runtime secrets/config/backups absent. Full production/GUI/live-provider gates remain open.

2026-11-13 D-037 documentation-only personal-use/signing scope update: no application/runtime change and no application tests rerun. Existing0.4 test/deployment evidence remains dated2026-11-12. Checked documentation diff and repository encoding/known-secret scan.
