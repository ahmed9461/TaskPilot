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

## 0.5 connector stage —2026-11-13 VERIFIED offline/isolated, deployment pending
Implemented real Baileys7.0.0-rc14 adapter behind independent false-by-default connection/sending gates; custom encrypted PostgreSQL auth/Signal state, epoch fencing/process lease, memory-only reauthed QR, selected-group text-only durable ingress, bounded recovery and poison-row quarantine/manual retry. API+Windows session/discovery/bind/stop/QR controls implemented; live approval forbidden while sending disabled. Provider-scoped outbox/restart recovery and exact encrypted quoted-source binding; ambiguous relay never retries. Migration008 not yet applied to pilot.

Evidence:14 Node/build PASS;32 isolated PostgreSQL tests including two parent tests PASS on fresh taskpilot_whatsapp_v050_test. Real SDK import/codec only, every socket fake; no real QR/pairing/groups/messages/network relay. Tests cover encrypted auth Buffer/app-state keys, wrong-key rejection/epoch fence, selected-only receive/history/self/private/media rejection, dedupe/reprocessing crash window, QR expiry/reauth/privacy, provider isolation/sending gate, task/account pending-ingress purge/stale preview, quarantine/explicit retry, exact quote/ambiguous delivery, restart/unpaired/retry exhaustion.20 offline C# PASS; native Release build PASS before final UI edits, final checks/CI/native/pilot still pending.

Remaining for this increment: final native session UI and Windows↔pilot checks, exact-source CI, dormant rollout/8-migration backup restore/portable package. Broader remaining work includes account details/history and full sensitive GUI acceptance; real pairing/send require separate owner approval. No auth forgetting/reset UI; use a new session configuration for a different account rather than replacing identity under old sources.

## Account details continuation —2026-11-13
Implemented authenticated snapshot-paged `/v1/accounts/:id/details` sections tasks/sources/flags/history with explicit allowlist fields. Includes linked credential-conflict review sources; never selects payload/transport key/credential. History covers extant related records, not a promise to reconstruct purged identity links. Windows has account detail navigation, independent section/page and recorded-evidence labels. Additional isolated PostgreSQL privacy/isolation/pagination/validation regression and34-check direct-server runner prepared. Final results/deployment follow below.

Account details final local/isolated check:33 PostgreSQL tests including two parents PASS,14 Node/build/format PASS,20 offline C# PASS and WinUI Release0 warnings/errors PASS. Connector commit4314e1c hosted CI43484805939 backend+windows SUCCESS; account-details exact-source CI and dormant deployment/native acceptance next.

## Portable packaging defect —2026-11-13
Observed published0.5 exits with0xc000027b in Microsoft.UI.Xaml.dll while build output launches. Differential inventory: app TaskPilot.Windows.pri and App/MainPage/MainWindow.xbf present only in build directory; runtime SDK PRIs present in both. Added unpackaged MRT Core publish items for app PRI/generated XBF, fail publication if app PRI missing, absolute icon path, and CI publish/resource/no-runtime-data check. Republished package passes artifact check and actual native startup from a different working directory; authenticated SSH dashboard rendered. Broader native section/session checks ongoing. Original0.4 ZIP completeness/startup was not proven by ZIP integrity and build-directory UI evidence; use corrected0.5 package after final checks. Related upstream report: https://github.com/microsoft/WindowsAppSDK/issues/6720 .

## Final0.5 checkpoint —2026-11-13
API5265c5b DEPLOYED; Windows package fix6157855.14 Node/build/format/33 isolated PG incl two parents/20 offline C#/34 Windows-server checks PASS. CI43486994434 backend+Windows/publish-resource guard SUCCESS;5265c5b CI43485552696 also SUCCESS. Native corrected portable EXE from other cwd: SSH dashboard/task+code/source counts/source group-session-message metadata, synthetic Baileys metadata STOPPED and disabled connect/QR/discovery buttons observed. No real QR or socket; app/tunnels closed, UI account deleted1, runner namespace synthetic-acceptance-01752dcd59 cleaned/revoked. Auth/requested/pending0. Final own role/denial/restart/data/startup PASS; other running-service set unchanged in bounded sample (not continuous invariance). Active/running/NRestarts0/memory38563840.
AES-GCM backup60499 bytes restored fresh1 account/1 assignment/8 migrations/0 SENDING, smoke afterward PASS. ZIP94748334 bytes/530 files/CRC+resources/no-runtime-data PASS/SHA256648D7244980DADF5F57AD0135E83C1CB9DB876E1DCEFC0F1290C73FE049472F6. I-020 fixed actual portable startup; historical0.4 package startup not established by build-native/CRC. Live provider/broad GUI/retention/off-host/optional AI runtime remain open; signing excluded from personal gates.

## Approved QR pairing continuation —2026-11-13
D-043 authorizes real connection/owner-scanned QR only; actual send and group monitoring remain unapproved/disabled. Pre-live vendor inspection found libsignal direct console session-object output despite silent Pino. D-044 adds own-service stdout/stderr=null and LimitCORE0 before any real socket.15 Node/build tests PASS incl service privacy guard;20 offline C# regression pending completion. Added explicit private-SSH pairing/status CLI, no QR/auth export/provider discovery/send. Live gate/config/session still unchanged at this implementation checkpoint; deployment and pairing evidence follows.

## Owner-scanned QR and0.5.1 recovery candidate —2026-11-13
Actual owner confirmed scan and API reports CONNECTED; server-local AEAD verification passed for816 auth rows. Sending=false, selected groups0/live sources0/live reply jobs0; no provider group discovery or messaging performed. Actual deployed pre-live privacy unit has stdout/stderr=/dev/null and core limit0.

Found I-022 before attempting restart: QR auth has saved me.id but registered=false; old restore predicate would incorrectly require pairing again. D-045 aligns restore with pinned SDK login identity without modifying credentials. New QR false-flag regression/34 isolated PG tests PASS;15 Node/build/20 local C#/WinUI build PASS. Controlled192-ingest/8-worker burst preserved96 sources/24 accounts/48 tasks in4416ms (bounded synthetic test, not production capacity).34 Windows↔VPS checks PASS with connection=true/sending=false, namespace synthetic-acceptance-6266c98a17 cleaned/revoked. Added redacted state proof and same-private-identity restart verifier;0.5.1 deployment/actual restart still pending at this checkpoint.

## Native0.5.1 continuation —2026-11-13
Actual owner QR session survives0.5.1 deployment and verifier restart with the same private paired identity, CONNECTED/no new QR. Runtime role/DDL denial/migration-write denial/data/startup PASS; bounded other-service sample unchanged. CI43491663741 on6626697 backend+Windows/publish guard SUCCESS.15 Node/34 isolated PG/20 offline C#/34 direct-server checks PASS, latest runner namespace synthetic-acceptance-091f48e7e1 cleaned/revoked. Paired auth816 rows AEAD-valid, live group/source/reply counts0; provider console streams /dev/null. Pre-recovery encrypted backup269056 bytes restored fresh8 migrations/1 account/1 assignment/0 SENDING;816 encrypted auth rows and paired identity shape verified offline in restored DB. No second provider connection started.

Native synthetic acceptance: UNKNOWN_DELIVERY injected only for a strictly mock/namespaced fixture, reauthed manual CONFIRMED_NOT_SENT/checkbox transitioned to FAILED, readback confirmed and no transport called. Automatic same-page refresh preserved bottom scroll position3090.67 after a synthetic event. Review exposed WinUI text assignment coercion: Text set before AcceptsReturn=true truncated subsequent lines. Source view and template editor now enable multiline before assigning text; actual review showed both lines,30-second hide observed, then corrected name/user saved; source PROCESSED/raw NULL and account materialized confirmed. Template multiline constructor fix builds, full template/native source-switch matrix still open.
CSV native filter selected synthetic-ui-acceptance,2 rows; actual Save As flow and SSH reauth completed, UI success observed. TaskPilot-native-051-accounts.csv323 bytes parsed: exact five allowlist fields, only the two fixture users, no credential columns. An immediate pre-completion file check was premature; final success/file validation authoritative. Test0.5.1 GUI closed; original owner pairing0.5.0 window may remain open. No real groups discovered/bound, no live replies sent. Extended fixtures and internal-only fault seeder are explicit operator modes with mock/synthetic guards; cleanup/final package follows.

## Final0.5.1 delivery and recovery —2026-11-13
- Deployed aa8dabe1f4848bce0c00e6bcb0779433241164da, API0.5.1; own service active/running/NRestarts0, stdout/stderr=null. Actual owner QR session CONNECTED, same-identity restart proof on6626697 retained. Connection=true/sending=false, monitored live groups/source/reply jobs0;816 auth rows AEAD-valid. No QR/auth/private identifiers recorded in public evidence.
- CI43496342263 (aa8dabe) and43496210566 (b9bb27e) backend+windows SUCCESS incl portable resource guard. These supersede earlier queued/pending CI checkpoint wording.15 Node/34 isolated PG incl two parents/20 offline C#/34 Windows-server checks PASS. Native acceptance coverage is the explicit synthetic subset above, not all dialogs or live transport.
- Scoped native fixture cleanup confirmed accounts in synthetic-ui-acceptance0. Test0.5.1 GUI closed; original owner pairing0.5.0 window may remain open. Synthetic configuration/audit retained. No delete-all or real auth cleanup performed.
- Final AES-GCM backup273956 bytes. Fresh taskpilot_final051_20261113_restore_test:1 account/1 assignment/8 migrations/0 SENDING.816 encrypted auth rows locally verified with1 paired/requested session; providerConnectionStarted=false. This restore contains real encrypted auth, no real chat sources; it is same-host proof, not off-host/key-loss recovery.
- Postfinal-rollout authenticated health/auth/ready/replay PASS, liveSending=false. No unrelated services modified; prior bounded restart verifier external set delta0 is not continuous host proof.
- Portable ZIP 94748751 bytes/530 files, full CRC/resource/no-runtime-data checks PASS. SHA256 1627BFA973CE4AD69D801E8F8101FCEC7E1B37F48DF6D7A22796A17235E30A7B. Exact native-tested folder, Windows functional source b9bb27e. Build occurred before commit; informational assembly Git hash may be prior source plus dirty marker, documented in output package metadata. No later rebuild substituted for native proof.
- Remaining: owner-selected/authorized test group receive, separate actual send approval, broader native flag/history/source-switch/template multiline/accessibility and toast acceptance; retention/auth forgetting/off-host/key recovery; optional AI runtime/UI/accounting. Signing excluded by D-037.

## Receive-only pilot continuation —2026-11-13 IN_PROGRESS
Owner identified a dedicated test group; exact-title discovery/binding succeeded with1 monitored live group in independent whatsapp-test-acceptance namespace/task/period, sending=false. Earlier discovery returned no exact match; later attempt succeeded, propagation cause unconfirmed. A separately approved single fictitious two-line message was submitted from desktop WhatsApp, visually sent; private identity comparison confirmed sender differs from paired account. No durable live ingress/source/account appeared, so live receive acceptance FAILED/unconfirmed, not PASS. No automatic repeat or TaskPilot send enabled.
Added explicit private SSH receive bind/status operator, no IDs/membership/body output, exact-match/scope guards. Candidate API0.5.2 adds enabled-group-only bounded in-memory diagnostic reason counters, and accepts SDK sender-key distribution metadata accompanying text without retaining that metadata. First failed event root cause remains unconfirmed; counters cannot reconstruct it.16 Node/build and20 offline C# PASS; isolated PG/final deployment/retest pending. Windows app remains native-tested0.5.1, no GUI binary change.

Candidate0.5.2 predeployment verification:16 Node/build/format,35 isolated PostgreSQL tests including two parents,20 offline C# PASS. New regressions cover SDK-protobuf text plus sender-key metadata, no key-material projection, authenticated selected-group-only diagnostic privacy, and500 rejected historical envelopes without durable ingestion/backpressure/disconnect. Diagnostics are best effort, max10 concurrent observations and capped counters; they do not consume the durable queue or fail the connector. Existing fake-socket/provider isolation and replay tests still PASS. Controlled load3405ms is bounded synthetic evidence only. Actual first receive still unconfirmed; deploy/retest pending, sending=false and no further GUI message authorized yet.

## Actual selected-group acceptance —2026-11-13..14 FINAL
API0.5.2 a715fce DEPLOYED; CI43503443694 backend+windows SUCCESS.16 Node/build/format/35 isolated PG incl two parents/20 offline C#/34 direct-server PASS; synthetic-acceptance-b06631b5f0 cleaned/revoked. SDK metadata and diagnostic privacy/history-burst regressions PASS, bounded synthetic replay3405ms (not production capacity).
Owner authorized exact test group discovery/binding (D-048), first reviewed message (D-050), then all scoped tests without repeated questions (D-051). Sender identity privately confirmed different. First pre-update desktop message: sent visually, no durable receive, cause unknown. After compatibility fix/restart, four durable live source rows: repeated complete text2→one account/task, incomplete→encrypted REVIEW then native resolve, unrelated→IGNORED/cleared. Final live sources PROCESSED3/IGNORED1/REVIEW0/raw0; test namespace2 accounts/2 assignments.
Actual quoted send: preview/provider/body/source checked, fresh reauth approval, idempotency replay same job; one SENT/provider ID and recipient desktop incoming quoted reply observed. No read/all-member receipt claim. Sending restored false by finally; deliberate invalid-title harness failure occurred before approval, expected nonzero, finally restored false, job count remained1 SENT/0 unsettled. No automatic send retry.
Native tested portable0.5.1 against0.5.2: actual review reveal→30s hide→name/user correction→save/raw clear; merged account task2 sources/1 reply; two live source metadata records; history4 processing/approval/send events. Native template two-line save/reopen showed both lines, restored original body; template version3, SENT snapshot unchanged. Test0.5.1 window closed, original owner0.5.0 may remain; no private screenshots saved.
Final verifier: own DML role/DDL and migration-write denial/restart/data/startup/same private paired identity CONNECTED without QR PASS. Overall NONZERO EXTERNAL_SERVICE_DRIFT,0 added/1 removed other running-service sample; unrelated service untouched, no global host PASS. Postrestart state proof auth833 valid/group1/source4/reply1/sendingfalse PASS.
Final291605-byte AES-GCM backup restored fresh taskpilot_live052_20261114_restore_test:3 accounts/3 assignments/8 migrations/0 SENDING;833 auth rows valid and live source4/job1. Restored SENT count1. Replay existing received metadata through Service in restored DB returned duplicate=true/all counts unchanged/provider connections0/outbound calls0. Same-host only; no reboot/off-host/key-loss/production DB rollback proof.
Idempotent off operator check also PASS: sending=false/health PASS/restarted=false. Configuration replacement is anchored to the exact sending field, preserving comments and unrelated values.

##0.5.3 stability candidate —2026-11-14
Implemented durable hashed receive receipts, first/last reason and fixed shape bits, aggregate API and new7-day/10000-record diagnostic retention only. Reproduced two old loss mechanisms: valid text with sender-key metadata was rejected; SDK server offline delivery is append and was rejected as history. Group receive_after cutoff and pre-socket monitored-binding cache now accept recent queued text while excluding pre-consent/pre-resume/disabled/unselected traffic. No claim of retrospective proof about the original unrecorded first event.
16 Node/build and40 isolated PG tests PASS, including atomic receipt/ingress rollback, independent-connection persistence,10001-record retention, new append ingestion/dedupe,500 old append rejection without backpressure, and disabled/re-enabled boundaries. Deployment/live outage/observation next. AI key identified by owner imported via private SSH stdin to TaskPilot-only protected server file; model catalog authenticated successfully, no inference/runtime activation yet.

##0.6.0 implementation candidate —2026-11-14
API0.5.3 d94e112 is deployed: controlled45-second own-service outage recovered a newly sent selected-group fictitious message as accepted append. Durable acceptedWithoutIngress=0,3 test accounts/tasks,5 live sources (4 PROCESSED/1 IGNORED), sending=false. Five-minute observer20 samples:0 failed/disconnected/pending/errors, peak memory65376256 bytes. Observer emitted PASS before the SSH channel reset (transport exit1); this is bounded observation, not24-hour acceptance or historical proof of the first missed packet.
AI runtime/API and Windows manual suggestion/configuration/usage UI implemented, disabled by default for new databases. Key reference only; model catalog authenticated. UTC request/token caps, serialized reservations, idempotency, interrupted-request reservation and task-code-only privacy.16 Node/build,45 isolated PostgreSQL (including4 parent tests), C# build and format PASS. Live inference/native0.6.0/off-host restore are pending at this checkpoint.
Off-host encrypted export and Windows DPAPI/RSA/AES escrow/isolated no-network PostgreSQL drill implemented; not verified yet. No plaintext keys/backups in Git or task outputs. No production retention/key rotation or total Windows-profile-loss recovery inferred.

##2026-11-14 —0.6.0 deployed AI/off-host acceptance
- Live offline receive: approved fictitious message sent once while taskpilot.service stopped45s, recovered as accepted append after startup. Diagnostic acceptedWithoutIngress0.5 live sources (4 processed/1 ignored),3 test accounts/3 assignments; sendingfalse. Historical first unrecorded event remains unproven.
-300s observer20 samples/0 failed/0 disconnected/0 pending/0 errors/peak65376256 bytes. Final JSON PASS preceded SSH reset/transport exit1; not a24-hour soak. New600s0.6.0 observer pending.
-16 Node/build/format and45 PG (4 parent tests) PASS,20 offline C# PASS. Initial AI test fixture incorrectly serialized SQL text[] as JSON; corrected test fixture, full45 rerun passed. Migration011 frozen after isolated apply. API deployed ecf75cef9b356cf450baf1a360478a62bdf7adb5, CI43518279193 SUCCESS (d94e112 CI43514324289 SUCCESS).
- DeepSeek authenticated catalog flash/v4-pro. Actual manual request72 input/10 output tokens; returned null/confidence0 (safe abstention), needsReviewtrue, no account/task/source mutation. Same key reused same stored request with no second call. Estimate0.0000336 USD, provider-reported costnull; no claim actual billed amount. Only administrator task codes transmitted by strict adapter; raw canaries excluded in isolated wire tests.
- Native published0.6.0 from alternate working directory: startup/SSH/current backend, AI settings key-presence, explicit catalog retrieval and visible two-model list, local payload preview ai_native_probe only, per-request SSH reauth, live result/estimate/unknown bill and unchanged review. Null result displayed blank task label: fixed0.6.1 to explicit manual selection; updated native acceptance pending. Test0.6.0 closed, owner0.5.0 preserved.
- Off-host Windows snapshot305675 bytes SHA256bfe8a2a0de3ce5dd50038db4683283387b1b2c28fc5b15d2598fd8e16e6e3e1f. Independent PG17 networknone/no ports/temp data:4 accounts/4 assignments/11 migrations/5 live sources/SENT1/SENDING0/AI requests1,833 auth rows AEAD-valid and1 credential decrypted with recovered field key. SQL duplicate insert0, no provider connections/outbound. Separate --restore from only local encrypted files PASS; own temporary containers stopped/removed. This tests independent Windows/key-escrow restore, not provider reconnect, full VPS replacement or Windows-profile loss.
- Windows ACL helper first failed SID translation/module autoload from inherited PS7 path; fixed native SID grants and explicit Windows PowerShell module path. No plaintext master key/dump file. Folder owner+SYSTEM only verified. DPAPI CurrentUser RSA3072 private key; hybrid AES-GCM escrow covers TaskPilot-only runtime/backup/DeepSeek keys.
- TaskPilot-Offhost-Daily scheduled03:15 local, Interactive owner, StartWhenAvailable, no saved password, backup-only/no Docker/delete. Explicit scheduler execution LastTaskResult0 and second encrypted snapshot/escrow/manifest observed. Laptop-on/current-user session/connectivity are prerequisites; natural03:15 trigger not yet observed. Existing snapshots retained.
-0.6.0 own privilege/DDL denial/migration-write denial/restart/data/startup/same833-row paired identity PASS. Overall verifier still EXTERNAL_SERVICE_DRIFT (0added/1removed), unrelated service untouched; no global-host PASS.

##2026-11-14 — final native/recovery delivery
Windows0.6.1 exact ProductVersion0.6.1+bb67c718ca031f0599609f422fd2755c0398b32e, started from alternate working directory. Actual SSH connection, AI preview/same-key result replay, explicit null/abstention label, protected manual review handoff/reveal/editor and cancel PASS. No business change; test window closed, owner0.5.0 untouched. One initial accessibility action lacked geometry; reacquired current window and screenshot before a single successful retry. No blind/repeated click.
Actual AI aggregate:2 successful requests/144 prompt+20 completion tokens/unresolved reservations0/estimated0.0000672 USD/reported costnull. CLI and both native-version replays reused stored requests; no extra inference. Model abstained safely; this proves integration/privacy/manual review, not semantic classification accuracy. Fictitious AI account/source cleanup deleted1 scoped account through API, usage retained; live source5/SENT1/auth833 unchanged.
Post-cleanup independent Windows restore PASS307228 bytes SHA25615822b247e247f9071795b491bf13147ca46ed54aee22b743a9c1e18831597fb;4 accounts/4 assignments/11 migrations/5 live sources/SENT1/SENDING0/AI requests2/833 auth rows/1 credential AEAD-valid, duplicate insert0/provider connections0/outbound0. Own temporary restore container removed. Private backup files stay outside Git/outputs. Own scheduled task Ready/Interactive/Hidden, manual LastTaskResult0, installed runner hash matches committed source; next natural trigger03:15 not yet observed.
Unsigned native-tested portable ZIP94784750 bytes/532 files, CRC/resources/runtime-data guard PASS, SHA256018680fee33c7efa39be43e0c79fad986359a47050499d46b786563c5ee2ae44. Includes Arabic usage guide and exact-source metadata, no keys/backups/runtime data. API remains0.6.0 ecf75ce. Hosted CI43519791816 onbb67c71 backend/windows SUCCESS.

600-second API0.6.0 observer PASS/transport exit0:40 samples,0 failed,0 disconnected,0 pending peak/final,0 errors,peak memory69402624 bytes,acceptedReceiptDelta0. Bounded quiet observation includes concurrent synthetic API/native tests but no new live WhatsApp submission; not24-hour production/network/ban/reboot acceptance.

##2026-11-14 endurance/security continuation — IN_PROGRESS
Owner authorized long endurance/native Windows tests, then project key rotation and Windows-profile-loss recovery. Initial live check:1 CONNECTED identity/833 valid auth rows/5 live sources/1 SENT/sendingfalse. Added read-only1-hour observer with private aggregate checkpoints; no restart during observation. Native synthetic fixture tests and isolated crypto/rotation/recovery preparation follow. No new completion claimed.

##2026-11-14 native matrix checkpoint
Native Windows0.6.1→API0.6.0: namespace filter,53-account pagination1–50/51–53 with correct disabled bounds, Alpha account two tasks and three distinct sources, switch A→B loads only scoped B template, preview body/group/original source B, explicit SSH-reauth mock approval and server-confirmed SENT matching B. One unverified flag saved and both Alpha tasks became NEEDS_REVIEW; no verified-error claim made. Live source5/reply1 unchanged/sendingfalse. Temporary fixture53 accounts/54 tasks/55 sources, mock only. Test app closed cleanly; no owner window existed in this inventory. Windows0.6.2 labels flag kind/evidence in Arabic and adds an explanatory rejection message; native acceptance pending. Hour observer remains running, no restart.

##2026-11-14 rotation/recovery candidate — IMPLEMENTED, not live rotated
21 Node/portable-crypto and49 isolated PG including5 parent tests PASS. Fault after all rewraps rolled back every field; corrupt auth aborted without partial commit; committed test preserved all five AAD domains, credential/auth key_version2 and subsequent credential writes. Legacy snapshots remain readable with their captured keys; altered context/key-ID/format rejected. API0.7.0 adds versioned keyring/core root operator, migration012 per-run marker, serialized maintenance/journal/resume, and old API/reauth/session revocation. Existing migration files unchanged. Root custodian and dual-recipient export/profile recovery implemented but live verification pending after hour observation.
Native Windows0.6.2 Arabic choices/rejection verified: unproven password error refused, manual verified fictitious error accepted. Wrong task-delete phrase refused; exact phrase deleted only Alpha task B, left account/task A/source-B mock SENT. Selected pair preview named only Beta+deletion fixture; DELETE2 removed exactly those accounts. Global preview DELETE55 was CANCELLED, no global deletion. Server before cleanup:51 synthetic accounts/tasks,Alpha1task,1verified+1unverified flags,matching mock sourceB SENT1, live sources5/live SENT1 unchanged/sendingfalse. Windows accepted count-only toast; visible popup/click not observed in exposed surfaces, system settings untouched. Test app closed, no remaining TaskPilot window in inventory.

##2026-11-14 hour/live and resume-hardening checkpoint
Live observer completed3600seconds/239samples,0 failed/disconnected/PID changes/pending/errors/unsettled/gaps, memory70922240..76046336 bytes, exit0. Quiet connected personal socket plus separately recorded synthetic native/API work; not24-hour/capacity/provider-loss/reboot proof. First isolated30-minute load ended FAIL from unquoted camel-case final count alias; business counts independently8accounts/16tasks/871PROCESSED sources/0replies/8version2credentials. Old070 DB/report preserved, corrected driver retries in fresh071 DB (pending).50 isolated PG tests now PASS including mixed old/new writes after a precommit failure; resume reads the authenticated bridge, blocks stale rotations, and safely rewrites interrupted temporary files. Restore selects its snapshot key without needing current active DPAPI registry. No live key rotation yet.

##2026-11-14 live rotation/recovery VERIFIED checkpoint
API0.7.0 deployed9bf0130509fb505ecdd0227097d8698a7714357a; CI43531219188 backend/windows SUCCESS (c116ccb CI43529951361 and Windows99916b1 CI43526236498 also SUCCESS).12 migrations. Actual rotation rotation-20261114000557762 -> keyVersion2:1 credential/1 raw review/4 source quotes/0 pending encrypted ingress/833 auth rows =839 fields rewrapped. Old API/reauth rejected, prior temporary sessions revoked, same paired identity CONNECTED/noQR, sendingfalse. Explicit completed-run resume reused same marker/counts (resumedtrue), no second key version. Audit: active key2 only, no key1 in runtime,0 legacy ciphertext, credential/auth key_version2,1 marker,0 pre-rotation sessions valid. Protected root journal/old backups retained. Provider-issued/SSH/DB credentials and WhatsApp identity not rotated.
Windows protector rotation PASS, previous DPAPI files retained. New snapshot315177 bytes SHA256d54d2486eb499bba8727a69a9c50b808f3ca7e7e625c774db7626ee0f80e0723 restored4accounts/4tasks/12migrations/5live sources/SENT1/SENDING0/AI2/auth833/credential1, all839 encrypted fields AEAD-valid,duplicate0/no provider/outbound. Old snapshot305675 bytes SHA256bfe8a2a0de3ce5dd50038db4683283387b1b2c28fc5b15d2598fd8e16e6e3e1f still restores11migrations/auth833 with old snapshot key after protector/project rotation.
Profile-loss crypto drills on NEW E:\TaskPilot-Recovery-Drill-20261114 copied only ciphertext/manifest/custodian envelope (no DPAPI/private keys): new and oldest snapshots restored successfully, dpapiCalls0, no original field/backup key files read by unseal helper, no provider/outbound. Surviving VPS/root SSH access required; no real Windows profile was deleted, no simultaneous VPS+profile/laptop-loss/fresh-user-login proof. Added --upgrade-escrows to rewrap4 legacy captured-key packets for alternate custodian,3 already dual; old encrypted dump hashes unchanged. Windows master/private keys never written plaintext.
Natural TaskPilot-Offhost-Daily trigger observed03:15 Asia/Riyadh, LastTaskResult0/next day03:15. Its317115-byte snapshot SHA25614279e9e337fe8599961020fcab3cb6bb2e46e353ae6ccab8064467156ec2546 restored via profile recovery:12migrations/4accounts/4tasks/auth833/839 encrypted fields/DPAPI0/duplicate0/provider0/outbound0. Daily job still requires laptop on/current interactive owner/trusted SSH/network.
Postrotation34 direct Windows→SSH→VPS checks PASS, fixture synthetic-acceptance-eee5ed3fc6 cleaned/revoked. Actual native Windows0.6.2 (ProductVersion0.6.2+99916b1691684598e4b9755053939422da668dad) fresh SSH→API0.7.0 shows4accounts/4tasks, receive allowed/sendfalse, closed cleanly. Own privilege/DDL/migration denial/restart/data/startup/same identity PASS; overall verifier remains EXTERNAL_SERVICE_DRIFT0added/1removed unrelated service, untouched. First load070 remains failed harness assertion; fresh07130-minute retry still pending at checkpoint.

## 2026-11-14 final endurance/security/recovery checkpoint — VERIFIED within stated bounds
Fresh071 core endurance PASS1800seconds/874 rounds+874 concurrent duplicate replays/0 errors/max RSS75223040bytes;8 accounts/16 assignments/874 sources/0 replies/8 encrypted credentials AEAD-valid/provider0/outbound0. Direct Service/two DB connections, not HTTP/provider capacity. Original070 harness assertion failure remains FAIL and retained; no final AEAD proof for that first run. Corrected quoted alias/failure-stage checkpoint verified on fresh retry (I-030).
Earlier live hour PASS3600seconds/239samples/0failed-disconnected-PIDchanges-pending-errors-unsettled-gaps/max76046336bytes. It ran before key maintenance, not a postrotation hour claim. Quiet socket/no new actual WhatsApp message, not24h/provider-network/ban/reboot acceptance.
Actual API0.7.0 source9bf0130509fb505ecdd0227097d8698a7714357a remains deployed; native portable0.6.2 functional source99916b1691684598e4b9755053939422da668dad; recovery runner efd2195f399d9f5809384e5327de9fb066f7c2db installed. Hosted runs43531219188/43526236498/43534773239 respectively backend+windows SUCCESS.21 Node/build/format/50 isolated PG incl5parents/20 offline C#/34 postrotation Windows→VPS PASS. Native paged/source-B mock path0.6.1→API0.6.0; Arabic flags/deletion guards0.6.2→0.6.0; fresh0.6.2 SSH/dashboard→0.7.0 verified. Visible toast popup/click NOT_OBSERVED; global delete preview cancelled; scoped fixture accounts cleaned/live untouched.
Actual rotation key2 preserved839 fields/833 auth/same paired identity; old API/reauth/sessions rejected, completed-run resume idempotent. Old/new/scheduled copies restore with captured keys after Windows-protector rotation and separately profile mode DPAPI0. Natural daily03:15 trigger LastTaskResult0;317115bytes SHA25614279e9e337fe8599961020fcab3cb6bb2e46e353ae6ccab8064467156ec2546 restored12migrations/4accounts/4tasks/5live sources/SENT1/SENDING0/AI2/auth833/all839encrypted fields/duplicate0/provider0/outbound0. Surviving VPS custodian/root SSH and copied encrypted files required; real profile untouched, no simultaneous-domain/fresh-user/total-laptop-loss proof. Provider-issued/SSH/DB keys not rotated. No new live AI inference.
Unsigned native-tested package0.6.2:94785036bytes/532files/CRC+resource+runtime-data guard PASS/SHA256a92df715b92382af5a76257c623e8f65ae4b3351e3a70b6b439c249d8049472e. Safe report/JSON in task outputs, no keys/backups/screenshots. Test apps/tunnels/restore containers closed, Docker Desktop returned to stopped state; own live service remains running/connectiontrue/sendfalse. Own checks PASS but overall host verifier NONZERO EXTERNAL_SERVICE_DRIFT0added/1removed unrelated service, untouched. Remaining24h/network/reboot/native accessibility+popup/retention+auth forgetting/third-domain recovery stay open.

## 2026-11-14 network/configuration continuation
D-060: owner WAIVED24h; never report it as PASS or remaining gate. Runtime API0.7.0 source9bf0130/Windows0.6.2 source99916b1 unchanged. Root-only ops/network-fault.mjs preflight verified empty filters/connected identity/sendfalse/one monitored group/no pending or uncertain reply. Actual90-second taskpilot.service-only external-IP block, localhost allowed:19 samples/API failures0/PID changes0; CONNECTED→RECONNECTING at65s, CONNECTED2s after clearing. Same PID/identity/833 auth rows AEAD-valid, live groups1/sources5/SENT1/unsettled0/queue0/total4accounts+4tasks unchanged. Independent125s own transient restore timer installed+active before block; normal finally restored original empty effective filters and cancelled timer, no remaining watchdog unit. Watchdog-trigger-on-operator-kill itself NOT_EXERCISED; no host/global firewall or restart, actual message/AI send or capacity claim. Private aggregate network-20261114012335099.json retained.
Native0.6.2→API0.7.0: create mock session via named field/Tab/Return, create task type native-network-071, choose exact mock session using End/Return and task by stable code, create namespaced mock group, disable only that group, fill another session draft then Escape. Read-only server proof:matching session1/configuration1/cancelled0/blank0, mock group disabled, live1group/5sources/SENT1/4accounts+4tasks unchanged. Config fixtures retained as synthetic audit evidence, no new account/source/reply. Partial keyboard/UIA label acceptance, not complete screen-reader/contrast/scaling or live-configuration matrix. Observed native logout removes expiry/tunnel but incorrectly retains green connected banner (I-032); fix/verification next. Test app closed and no TaskPilot window remains.

## 2026-11-14 Windows0.6.3 candidate — IMPLEMENTED/local verification
Native I-032 stale green connected banner after logout reproduced in0.6.2. Disconnected Render branch now explicitly resets informational title/message; PollChanges captures connection revision and guards both read completions and error before state/badge/feed update. Explicit connect/disconnect advance revision, ordinary read success does not. A delayed actual ApiClient test response released after logout cannot restore disconnected state; old success/401 after new connection ignored; current failure/recovery still works.21 offline C# checks PASS (6 transport+8 reliability+7 feed). Native0.6.3 and portable publication pending. API/runtime/recovery runner unchanged.

Windows0.6.3 candidate WinUI Release build PASS0warnings/errors. Manual connection advances revision immediately after API configuration, before awaiting previous tunnel disposal, preventing the old poll from consuming the new workspace response. Native acceptance next.

## 2026-11-14 native0.6.3 follow-up
Exact45893d7 CI43542011194 backend+windows SUCCESS. Actual portable0.6.3 started with disconnected status, SSH dashboard4accounts/4tasks, explicit logout removed expiry/logout action and displayed disconnected; later readback remained disconnected, new SSH connection succeeded. Delayed polling race is isolated-regression evidence, not a forced native HTTP fault. Native reconnect exposed inherited page-navigation defect I-033: body changed to dashboard while heading/sidebar remained Settings. Both connection buttons now select dashboard/title/sidebar together; rebuild/native verification follows. API unchanged.

## 2026-11-14 final network/native acceptance — VERIFIED within scope
24h WAIVED_BY_OWNER D-060, not PASS/not a release gate. API0.7.0 remains9bf0130509fb505ecdd0227097d8698a7714357a,12 immutable migrations; no API/provider-key/auth/config replacement. Own90-second cgroup network block PASS19samples/0API failures/PID changes; disconnect observed65s/reconnect2s after clear/same PID+identity/833auth AEAD-valid/unchanged live1group+5sources+SENT1+0unsettled+0queue and total4accounts+4tasks. Original effective empty IP filters restored/own timer gone. Independent125s watchdog was installed+active, its forced-operator-loss path NOT_EXERCISED. No host reboot/global firewall/other-service change or new actual WhatsApp/AI message. Private network-20261114012335099.json retained.
Native0.6.2→API0.7.0 mock session/task/group creation+exact selections/Tab-Return/End-Return/Escape/scoped group disable verified by read-only server proof:session1/configuration1/cancelled0/blank0; synthetic config retained, group disabled/no new account/source/reply. Partial keyboard+UIA field labels, not full screen reader/contrast/scaling/live-config acceptance.
I-032 and I-033 CLOSED WITH NATIVE EVIDENCE: final portableWindows0.6.3/sourcea3577810adff62dfa15be2e593f61c2df77a8728 starts disconnected, SSH from Settings opens dashboard with correct heading/sidebar, Settings navigation works, explicit logout removes expiry/action and shows disconnected. Earlier45893d7 native cycle also remained disconnected on later readback and explicitly reconnected. Delayed old HTTP success/401 cannot change logged-out/new session in21 offline C# tests; this race was not injected into native HTTP. Final test app logged out/closed/no TaskPilot window remains. Backend+Windows CI43542629785 on final code SUCCESS;43542011194 and network66562a2/CI43541705383 SUCCESS, prior tracking14841f2/CI43536683320 also SUCCESS.
ZIP0.6.3 94755807bytes/532files/CRC+resources+runtime-data guard PASS/SHA256ee566311c71094dc542d1fee118bb6ef8c10a658f85ac616be01627e93bba922. Exact ProductVersion0.6.3+a3577810adff62dfa15be2e593f61c2df77a8728; no rebuild after native verification, no secrets/backups/screenshots in outputs. Prior0.6.2 retained historical package. Last direct34 Windows→VPS acceptance was before these UI-only fixes on API0.7.0; current21 Node/50 isolated PG incl5parents/21 offline C# CI PASS. Existing global-host EXTERNAL_SERVICE_DRIFT remains outside scope/no global-host PASS. Remaining wider network/late delivery/host reboot, full native accessibility+toast activation, retention/auth forgetting/third recovery domain and optional reporting/OpenRouter.

##2026-11-14 privacy0.8.0 / Windows0.6.4 — IMPLEMENTED, isolated verification
New versioned manual retention with fixed1000-row/class previews/recheck/reauth, minimal run audit; immutable migration013. Local stopped-session forget preserves history/other identity and fences auth/quote/ingress/approved replies; blocks active lease/uncertain sending/reconnect/group-enable/late auth.21 Node/build PASS. New privacy12 including parent PASS after correcting fixture SQL uuid/text parameter; injected mid-transaction failure rolled back all changes. Whole PG suite and native/deploy evidence follow; current production remains0.7.0/key2/actual identity untouched/sendingfalse. Windows0.6.4 privacy controls build0warnings/errors before final recent-run/draft refinement; final build/native pending. D-063/064 approved scope/policy, D-065 independent recovery follows.

Privacy0.8 final isolated suite PASS62 tests including6parents/0failed in taskpilot_whatsapp_v050_test (13 immutable migrations). Final WinUI0.6.4 Release build PASS0warnings/errors,21 Node/build PASS. No live socket/data mutation during these tests; deploy/native next.


## 2026-11-14 privacy0.8 deployment and native acceptance — VERIFIED / DEPLOYED
API0.8.0 and native Windows0.6.4 functional source1bd734426b18d6cebc80b56618a6afaf8afd4623; CI43546799203 backend/windows SUCCESS.13 immutable migrations applied to pilot and isolated test DB;62 PG tests including6parents PASS. Own ops verifier PASS in current bounded sample, other-service additions0/removals0; historical I-010 drift is not erased and continuous host invariance is not claimed.
Native0.6.4→SSH→API0.8: retention defaults30/14/1/90 saved with fresh SSH grant; preview/phrase CLEAN RETENTION/execute/history observed. Actual run cleaned1 synthetic expired review/1 synthetic failed ingress/15 expired client sessions;0 approvals/read notifications/diagnostics. Stopped fictitious session preview showed auth1/quote1/ingress1/approved1; exact FORGET phrase and SSH grant produced read-only FORGOTTEN card with no reconnect controls. Server proof: synthetic account/task/two sources preserved, auth/quotes/raw removed, approved reply CANCELED, expired review IGNORED/rawNULL. Active personal card forget action disabled; personal identity/auth833/live sources5/SENT1 unchanged, sendingfalse/provider0/outbound0. Scoped synthetic account cleaned through existing API afterward;4 total accounts/4 tasks/5 live sources restored. Test app closed/no TaskPilot window. No real pairing/reset/forget or new WhatsApp/AI message.
Standalone owner recovery is in progress in separate uncommitted helper files; do not attribute its future commit to the deployed API/native binary.24h remains WAIVED_BY_OWNER D-060.
