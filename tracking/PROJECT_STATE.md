# الحالة الحالية —2026-11-13 (Asia/Riyadh)
TaskPilot0.5.1 IMPLEMENTED / VERIFIED / DEPLOYED as a personal single-owner pilot. Owner scanned the real QR and pairing is CONNECTED. Real group ingestion and sending acceptance remain open. Signing is not required (D-037).

## Authoritative sources and runtime
- Branch feat/mvp-foundation. Current API/release aa8dabe1f4848bce0c00e6bcb0779433241164da; Windows functional source b9bb27e2044cb156b992a4a145f8a5fb5b385d6c. Earlier checkpoints are historical.
- /opt/taskpilot/current points to aa8dabe; own taskpilot.service/taskpilot user, API127.0.0.1:8240; own PostgreSQL17 taskpilot-db loopback15488. Eight append-only checksum migrations. API role taskpilot_runtime is DML-only; migration credentials root-only. Other projects/services/configuration untouched.
- Current service active/running/NRestarts0; exact-version health0.5.1 and authenticated health/auth/readiness/replay smoke PASS after final rollout. Mock health identifies the synthetic transport, not absence of a separate live adapter.
- WHATSAPP_CONNECTION_ENABLED=true; WHATSAPP_SENDING_ENABLED=false. Dedicated personal session CONNECTED; saved paired identity survived deployment and a controlled own-service restart without QR. No auth reset/flag rewriting. Final server-local proof:816 encrypted auth rows valid,1 paired/requested session,0 monitored live groups,0 live source messages,0 live reply jobs.
- D-043 authorizes QR connection only. No group discovery/binding/real chat processing or sending performed. QR, auth, phone/JIDs and private group data were not recorded in repository/reports. Provider stdout/stderr actually /dev/null and core limit0 (D-044), installed before first live socket.

## Implemented behavior
Encrypted account/review workflow, namespace/user and account/task/period identity, all-source provenance, conservative routing, scoped/versioned templates, independent task/reply states, preview/reauth/purge/reconciliation, safe CSV, activity/notifications and SSH recovery remain implemented.

Baileys7.0.0-rc14 adapter: encrypted PG auth/Signal state, epoch/process lease, memory-only expiring QR, selected-group text-only durable encrypted inbox, dedupe, bounded recovery/quarantine and explicit retry. Provider-isolated outbox and exact quoted-source binding; ambiguous relay becomes UNKNOWN_DELIVERY without retry. Sending approval remains blocked when policy=false. Actual receiving/quoted sending has not been tested.

QR recovery fix D-045 uses saved me.id as the pinned SDK does; QR auth can retain registered=false. Windows exposes gated sessions, temporary QR, discovery/binding controls, account task/source/flag/current-record history pages and safe code/identity labels. Native fixes D-046/D-047 preserve automatic same-page scroll and enable multiline before assigning Text in review/template editors.

## Verified evidence
-15 Node tests/build/format PASS;34 isolated PostgreSQL tests including two parents PASS. SDK import/codec real, all connector test sockets fake. QR false-flag restart regression PASS. Bounded synthetic replay192 ingests/8 workers retained96 unique sources/24 accounts/48 assignments in4416ms; this is not production capacity.
-20 offline C# checks; WinUI Release/publish0 warnings/errors;34 Windows→SSH→VPS checks PASS with expected connection=true/sending=false. Latest runner namespace synthetic-acceptance-091f48e7e1 cleaned and sessions revoked; permanent keys stay server-local.
- Latest runtime CI43496342263 on aa8dabe: backend and windows SUCCESS. Windows change CI43496210566 on b9bb27e also SUCCESS, including publish/resources guard. https://github.com/ahmed9461/TaskPilot/actions/runs/43496342263
- Own role/DDL denial/migration-write denial/restart/data/startup verifier PASS on6626697; same private paired identity restored CONNECTED without QR. Other running-service sample0 added/removed; no continuous host stability claim. Unrelated historical I-010 left untouched.
- Actual portable0.5.1 native acceptance against VPS: synthetic UNKNOWN_DELIVERY manually reconciled FAILED/no resend; review displayed both source lines,30-second hide and reauthed resolve, source PROCESSED/raw cleared; filtered2-row CSV Save As/reauth succeeded with only five allowlist fields. Automatic refresh retained bottom scroll after a synthetic event. No real transport used in these fixtures.
- Native test GUI closed; synthetic-ui-acceptance accounts remaining0 after scoped cleanup. Original owner0.5.0 pairing window may remain open. Retained mock configuration/audit is intentional; no delete-all.
- Final encrypted backup273956 bytes restored into fresh taskpilot_final051_20261113_restore_test:1 account/1 assignment/8 migrations/0 SENDING.816 auth rows AEAD/JSON-valid with paired identity; no provider connection started from restore. Same-host only, not VPS-loss/key-loss/off-host recovery.

## Delivery
Unsigned self-contained x64 TaskPilot-Windows-x64-0.5.1-pilot.zip in task outputs; exact SHA256/size in TaskPilot-0.5.1-package.json and SHA256SUMS-0.5.1.txt. Archive 94748751 bytes/530 files, ZIP CRC PASS, SHA256 1627BFA973CE4AD69D801E8F8101FCEC7E1B37F48DF6D7A22796A17235E30A7B. Archive is the native-tested published folder, not a later rebuild. Functional Windows source matches b9bb27e; build preceded commit so embedded informational Git hash may identify prior commit plus dirty marker. Package carries no runtime keys/env/DB/backups/logs. Arabic report and synthetic native CSV evidence accompany it.

## Remaining
- Owner selection/authorization of a dedicated test group, then live receive/replay/restart acceptance. Actual send needs separate authorization; sending stays false. No group discovery implied by pairing. Unofficial/prerelease provider and long-running reliability risk remain open.
- Reviewed auth forgetting/identity replacement, retention/key rotation and off-host scheduled backup/recovery policy. No automatic auth regeneration or shared session import.
- Broader native flags/history/source-switch/template multiline/accessibility/dialog matrix and visible toast/click acceptance. Constructor fix for template multiline is built, not fully native-accepted. Closed-app Windows delivery is not implemented.
- Optional AI runtime/UI/key/model/accounting remains disconnected; offline adapters only. Multi-live sessions beyond initial1 not approved/tested. Installer/updater optional; signing and enterprise multi-user identity excluded from personal gates.
