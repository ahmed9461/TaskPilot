# سجل التغيير
## [0.1.0-dev] — 2026-11-11
### Added
- Executable TypeScript API, PostgreSQL migrations/contracts, conservative Arabic/English parser.
- Mock sessions/groups, deduplicated multi-source assignments, encrypted review/credentials.
- Auth/reauth, audit/notifications/cursor, status concurrency, preview/approval/outbox and safe purge.
- Isolated pilot PostgreSQL provisioning and hardened systemd definition (API deployment pending).
- Unit and PostgreSQL adversarial integration tests.
### Fixed
- Increased pool acquisition timeout after reproducing queue pressure over SSH tunnel.
- Conflicting/archived credentials retain an encrypted review with account ownership; all purge clears unassigned inbox too.
### Security
- Live WhatsApp absent and sending hard-disabled; AI disabled. Loopback only, external keys, redacted errors.
- Updated zod/tsx/esbuild until npm audit reported zero vulnerabilities.
### Pending
- Windows app, running API pilot, encrypted restore and production identity/retention/live connector acceptance.

## Native pilot phase — 2026-11-11
### Added
- WinUI3 native Arabic RTL navigation/dashboard/accounts/tasks/inbox/session/group/templates/notification forms, secure connection, theme, timed credential view and confirmation previews. Synthetic message entry for testing.
- Self-contained portable x64 publication; client contract checks, locked NuGet graph and pinned GitHub Actions CI.
- Hardened independent pilot API deployment, SSH-only access, encrypted dump/isolated restore tooling and actual HTTP smoke.
### Fixed / Security
- New task/source/reply invalidates account deletion preview via aggregate version; account lock ordering before status/approval writes.
- Disabled HTTP redirects for sensitive headers; bounded lists/body/rate, independent reauth, repository pattern scan.
- Deferred navigation refresh during active actions and serialized poll refresh.
### Pending
- Live WhatsApp/AI, production identity/retention/escrow, selected bulk UI, advanced rules/paging/toasts, unknown reconciliation, signed installer and update channel.

## Stability/adapters phase — 2026-11-11
### Added
- Owner-confirmed unknown-delivery reconciliation with evidence/reauth; no automatic resend. Selected-account Windows purge preview.
- DeepSeek/OpenRouter task-code-only adapters with disabled/approval gates, bounded output/time, usage counters and mocked tests; not activated in runtime.
### Fixed
- Historical Windows CRLF migration archive caused checksum guard to block Linux rollout. Verify LF/CRLF byte equivalence only and store canonical LF checksum; SQL edits still rejected. Prior release stayed running.
- Arabic validation feedback in Windows.

Security deployment follow-up: runtime DB role separated from root-only migration owner; grants limited to DML in own pilot DB, DDL/migration writes denied by design. ops/verify-pilot.mjs checks actual privileges, restart/data preservation and unchanged other running services. Final deployed evidence follows.

## Final pilot verification — 2026-11-11
Deployment eb0f66b, restart/least-privilege/isolation/HTTP smoke and encrypted restore/tamper checks PASS. CI43061180349 both jobs PASS. Portable Windows ZIP validated; temporary local fixtures stopped. Remaining production and UI work is explicit in TODO.

## Continuation stage1 — SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.

## [0.2.0-pilot] — 2026-11-11
- SSH-issued30-minute Windows sessions with hashed storage, revoke/expiry and60-second one-use reauth; permanent server keys stay server-local.
- Deterministic group keyword/priority rules and ambiguity review; unrelated chat raw text is discarded.
- Snapshot page envelopes and scoped filters, Arabic statuses, safe filtered-page CSV, task-only preview/purge preserving account/other tasks.
- Windows busy indicator and deferred polling refresh while draft filters/selection are active.
- Direct C# Windows↔New-VPS19-check acceptance PASS, actual native account create/edit/filter/archive/restore and deletion preview/cancel observed. Own fixtures cleaned.
- Fixed acceptance fixture missing routing keyword; explicit UTF-8 edit/scan enforcement after locale corruption was repaired.
- Still synthetic-only and unsigned; real WhatsApp/AI, production MFA/retention/off-host recovery and full human GUI acceptance remain open.

Operations follow-up: a single generic verifier failure was not reproducible on the unchanged bfcbbd4 release. Added safe per-check stage diagnostics and bounded DB/HTTP probes rather than exposing raw errors/secrets; cause remains unconfirmed in I-010. Five-migration encrypted restore and bfcbbd4 CI both PASS.

Final0.2.0 source17f846e deployed; CI43093897111 both jobs PASS. Encrypted5-migration restore and portable ZIP verified. I-010 later isolated to independent existing-service auto-restart, left untouched; final single-sample diagnostic full verifier PASS. No claim that the other service is repaired.

## 0.3 continuation — connection reliability (local VERIFIED)
Windows distinguishes401/revocation/local session expiry from transient transport failures. Read polling backs off10/20/40/60s; mutations are never retried automatically. Explicit reconnect preserves same-workspace cursor/filters; manual token mode disposes prior SSH session; logout clears identity. Added reconnect UI, expiry display, shutdown guards and draft protection when deselecting accounts/changing task status. Release build0 warnings/errors and6 original +7 simulated reliability checks PASS. Not deployed/visually accepted yet; server remains17f846e.

## 0.3 activity/notification stage — local and isolated VERIFIED
Added newest-first notification pages/read filter/bounded read-page API, committed-head/unread state, safe audit filters, aggregate operations snapshot and migration006 indexes. Windows has unread badge/activity/monitoring views and opt-in silent count-only desktop notifications; replay-safe change feed seeds new-workspace head and preserves same-workspace cursor. Backend10 unit tests/build, isolated PostgreSQL18/18 including parent, Windows Release0 warnings/errors,20 offline C# checks PASS. Local Windows notification probe: supported/enabled/accepted/stored/generic all true; payload XML exactly generic TaskPilot/count text with silent audio. This is API receipt/storage evidence, not observed popup/click/closed-app delivery. Probe app closed. Expanded25-check direct-server acceptance added but not yet run; current server still17f846e pending0.3 rollout.

0.3 rollout follow-up:96e4cbe deployed with6 migrations, initial immediate smoke raced listener startup (I-013); unchanged release health/auth/ready/replay PASS, NRestarts0. Added bounded exact-version readiness wait and regression;11 Node tests PASS. Native GUI fixture seeder added for reproducible scoped synthetic acceptance. Hosted CI runs5833c73/96e4cbe are still queued with no jobs; not counted as PASS.

## 0.3 checkpoint verified deployment
Deployed dc76227; exact-version wait and auth smoke PASS. Final own role/denial/restart/data/startup PASS; unrelated-service delta removed1 caused overall EXTERNAL_SERVICE_DRIFT/nonzero, not hidden.11 Node/18 PostgreSQL/20 local C# PASS. Native monitoring/audit filter4rows/notifications page2(51–100 of107)/task COMPLETED/reply preview CANCEL/owned-tunnel loss/reconnect with preserved draft PASS. Closed GUI, own child tunnels0, scoped UI account deleted1. Encrypted backup46916 bytes restored1 account/1 assignment/6 migrations/0 SENDING. ZIP94133913 bytes/527 entries/SHA256DE14479211F94E12538F9A8DE2C2935D421F5AB20E281B90C8216C775F94C71B, testzip PASS. Current hosted runs still queued/jobs=[]; not a hosted PASS.

## 0.4 template stage — IN_PROGRESS / local verification
Implemented editable/versioned/scoped/available templates with migration007, paged administration and source-matching choice UI. Preview/approval scope checks and template version rejection protect old unapproved snapshots; approved body remains unchanged. Group FK locks acquired before template locks to align with approval.11 Node tests and first19 PostgreSQL tests PASS; final race extension/WinUI build/direct28-check acceptance and deployment are being verified. Server remains0.3 dc76227 until rollout; do not infer deployment or full GUI acceptance from implementation.

0.4 final predeployment verification:11 Node/build/format tests,19 isolated PostgreSQL tests including scoped-edit versus approval race PASS, WinUI Release0 warnings/errors and20 offline C# checks PASS. New reply selector queries server candidates per selected source with stale-response guards; editing preserves stored scopes absent from the first100 choice rows. Expanded28-check Windows↔VPS runner prepared; runtime/UI acceptance follows deployment. No real WhatsApp/AI or messages.

## Final0.4 verified checkpoint —2026-11-12
Source87f986b deployed and hosted CI43100482889 backend+windows SUCCESS: https://github.com/ahmed9461/TaskPilot/actions/runs/43100482889 .11 Node/19 PG including scoped-edit approval race/20 offline C# PASS.28 direct Windows↔VPS checks PASS, synthetic-acceptance-e46d229b16 accounts removed/runner sessions revoked. Native template create/edit/Arabic body/group/task/disabled reload/filter1of1 observed. Retained config synthetic-ui-template-edit-040 is disabled; no real send. GUI stopped, owned tunnels0.
Final own runtime role/DDL denial/migration denial/restart/data/startup PASS; overall EXTERNAL_SERVICE_DRIFT (other-service removed1) remains nonzero and no other service changed by our commands. Snapshot active/running/NRestarts0/memory29720576 bytes.
AES-GCM backup50631 bytes restored fresh1 account/1 assignment/7 migrations/0 SENDING PASS; post-restore health/readiness/auth/replay/liveSendingfalse PASS. Portable ZIP94138261 bytes/527 entries/testzip PASS; SHA2563ED56F6F9D770D7BBAB3D4A093A94CBA4DD2FBCB10E75E641ED0E7D8C074CC57. Unsigned/self-contained; runtime secrets/config/backups absent. Full production/GUI/live-provider gates remain open.

## Personal-use scope —2026-11-13
Recorded owner decision D-037: no signing requirement; portable ZIP accepted, installer/update optional, enterprise multi-user identity outside personal scope. Updated active tracking/memory/roadmap; no runtime/binary/deploy change.

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

Operations follow-up: normalized restore diagnostic formatting after the format guard flagged ops/backup.mjs; full format check now PASS. Own systemd description now reflects personal pilot rather than synthetic-only scope; security/ports/policy unchanged.

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

##0.5.2 live pilot acceptance —2026-11-14
Deployed a715fce with SDK sender-key metadata compatibility and bounded selected-group diagnostic counters. Added private exact-group receive operator, scoped quoted-reply/idempotency harness and root-only atomic test send gate with finally cleanup wrapper. D-051 owner permission persists for scoped tests without repeated confirmation. Actual receive/merge/review/ignore/quoted recipient visibility and restart recovery verified; native template multiline acceptance completed. Sending restored false; actual test evidence retained, no unrelated resources touched.16 Node/35 PG/20 offline C#/34 direct-server and exact-source hosted CI PASS. Final own-service checks PASS but overall external-service drift nonzero. Encrypted same-host restore and restored-source dedupe verified; remaining boundaries in PROJECT_STATE.

##0.5.3 stability candidate —2026-11-14
Implemented durable hashed receive receipts, first/last reason and fixed shape bits, aggregate API and new7-day/10000-record diagnostic retention only. Reproduced two old loss mechanisms: valid text with sender-key metadata was rejected; SDK server offline delivery is append and was rejected as history. Group receive_after cutoff and pre-socket monitored-binding cache now accept recent queued text while excluding pre-consent/pre-resume/disabled/unselected traffic. No claim of retrospective proof about the original unrecorded first event.
16 Node/build and40 isolated PG tests PASS, including atomic receipt/ingress rollback, independent-connection persistence,10001-record retention, new append ingestion/dedupe,500 old append rejection without backpressure, and disabled/re-enabled boundaries. Deployment/live outage/observation next. AI key identified by owner imported via private SSH stdin to TaskPilot-only protected server file; model catalog authenticated successfully, no inference/runtime activation yet.

##0.6.0 implementation candidate —2026-11-14
API0.5.3 d94e112 is deployed: controlled45-second own-service outage recovered a newly sent selected-group fictitious message as accepted append. Durable acceptedWithoutIngress=0,3 test accounts/tasks,5 live sources (4 PROCESSED/1 IGNORED), sending=false. Five-minute observer20 samples:0 failed/disconnected/pending/errors, peak memory65376256 bytes. Observer emitted PASS before the SSH channel reset (transport exit1); this is bounded observation, not24-hour acceptance or historical proof of the first missed packet.
AI runtime/API and Windows manual suggestion/configuration/usage UI implemented, disabled by default for new databases. Key reference only; model catalog authenticated. UTC request/token caps, serialized reservations, idempotency, interrupted-request reservation and task-code-only privacy.16 Node/build,45 isolated PostgreSQL (including4 parent tests), C# build and format PASS. Live inference/native0.6.0/off-host restore are pending at this checkpoint.
Off-host encrypted export and Windows DPAPI/RSA/AES escrow/isolated no-network PostgreSQL drill implemented; not verified yet. No plaintext keys/backups in Git or task outputs. No production retention/key rotation or total Windows-profile-loss recovery inferred.

0.6.0 API deployed ecf75ce / hosted CI43518279193 SUCCESS. DeepSeek live+same-key replay PASS72 input/10 output, null task/confidence0 safely abstained. Native0.6.0 catalog/preview/reauth/result/usage PASS; found blank task label when model abstains, fixed Windows0.6.1 to explicitly request manual selection. Windows test window closed; owner0.5.0 untouched.
Off-host snapshot305675 bytes restored on Windows using recovered keys only:11 migrations/4 accounts/4 assignments/5 live sources/1 SENT/0 SENDING/833 auth AEAD-valid/1 credential. SQL duplicate insertion0, no provider/socket/outbound. Independent local-only --restore also PASS. Folder ACL owner+SYSTEM and DPAPI RSA private key, no plaintext master key/dump. Fixed Windows PowerShell module-path inheritance and SID ACL translation in the runner. Own daily03:15 task installed and explicit scheduler run LastTaskResult0; laptop/current-user session required.
