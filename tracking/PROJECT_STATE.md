# الحالة الحالية —2026-11-13 (Asia/Riyadh)
TaskPilot0.5.0 IMPLEMENTED / VERIFIED / DEPLOYED within a synthetic, personal single-owner pilot. Real WhatsApp provider acceptance remains open. Signing is not required (D-037).

## Sources and runtime
- Branch feat/mvp-foundation. Connector4314e1c; account detail/API release `5265c5b0f5ddd5bdeb65924aee909e0f8eb74856`; Windows packaging fix `6157855f63838156a9653b4693a517a49f3d787d`. Later tracking commits do not change deployed code.
- `/opt/taskpilot/current` points to5265c5b; own taskpilot.service/taskpilot user, API127.0.0.1:8240, own PG17 taskpilot-db loopback15488. Eight append-only migrations. Runtime taskpilot_runtime DML only; migration env root-only. No other service/config/database modified.
- Authenticated smoke/readiness/replay PASS; active/running/NRestarts0, observed memory38563840 bytes. Own role/DDL denial/migration-write denial/restart/data/startup PASS. Other running-service set unchanged in this bounded sample (0 added/removed); prior unrelated drift I-010 remains historical, no continuous host-wide claim.
- WHATSAPP_CONNECTION_ENABLED and WHATSAPP_SENDING_ENABLED remain false. Pilot whatsapp_auth rows0, requested live sessions0, pending ingress0. Only stopped synthetic-ui-whatsapp-050 metadata created; no actual pairing/QR/provider groups/messages/AI calls.

## Implemented behavior
Existing encrypted account/review workflow, namespace/user + task/period identity, all-source provenance, conservative routing/review, template scopes/versions, separate task/reply status, explicit preview/reauth/purge/reconciliation, safe CSV/activity/notifications/SSH recovery remain intact.

Real Baileys7.0.0-rc14 adapter now implemented behind independent default-off gates. Custom encrypted PG auth/Signal keys with awaited persistence/BufferJSON/app-state revival, epoch fencing and per-session lease. Reauthed45-second memory QR, selected-group text-only durable encrypted inbox, dedupe tombstones, backoff/registered restart/manual stop and three-failure quarantine with reauthed internal retry. Private/self/history/media/ephemeral/view-once/edited events rejected. Purge binds pending/quarantined queue snapshot and clears matching identities without discarding unrelated work. New future messages are not blocked by purge.

Mock/live outboxes isolated; live approve forbidden when sending disabled. Exact encrypted quote binding; generic quoted text avoids copying credentials; link previews disabled; ambiguous relay becomes UNKNOWN_DELIVERY without retry. Interrupted live SENDING recovers even while live policy is disabled.

Windows includes gated session configuration/connect/QR/discovery/bind/stop, provider-specific reply confirmation, queue/error monitoring, stable code/identity labels, and account detail sections tasks/sources/recorded flags/current-record history with independent pages. Explicit projection excludes raw/encrypted payload/transport/auth/credential values. Purged identity links are not reconstructed by per-account history.

## Verification
-14 Node tests/build/format PASS;33 isolated PostgreSQL tests including two parents PASS on fresh taskpilot_whatsapp_v050_test. All connector sockets fake; actual SDK import/auth codec only. Encryption/fencing/restart/retry/filter/dedupe/purge/quarantine/quoted ambiguity/provider isolation tests PASS.
-20 offline C# checks, Release/publish0 warnings/errors,34 Windows→SSH→New-VPS checks PASS. Runner namespace synthetic-acceptance-01752dcd59 accounts cleaned and client sessions revoked. Permanent keys never exported.
- CI43485552696 on5265c5b backend+Windows SUCCESS; CI43486994434 on6157855 backend+Windows SUCCESS including added publish/resource check: https://github.com/ahmed9461/TaskPilot/actions/runs/43486994434 .
- Actual corrected portable folder, launched from a different cwd: SSH dashboard, account detail task/code/source counts, source group/session/message metadata, session metadata creation and STOPPED/Baileys card with disabled connect/QR/discovery observed. No actual QR opened. GUI closed; own app/tunnels0. Scoped synthetic-ui-acceptance account deleted1; synthetic configuration retained.
- I-020: original dotnet publish omitted app PRI/XBF and crashed0xc000027b despite build success. Explicit generated-resource publish + app-relative icon fixed it. Historical0.4 ZIP CRC/build UI proof does not prove portable startup; use corrected0.5.
- Final AES-GCM backup60499 bytes; fresh same-host restore1 account/1 assignment/8 migrations/0 SENDING PASS; subsequent smoke PASS. No real auth rows or off-host/key-loss recovery inferred.

## Delivery
Portable unsigned self-contained x64: TaskPilot-Windows-x64-0.5.0-pilot.zip,94748334 bytes/530 files/ZIP CRC and resource checks PASS. SHA256:648D7244980DADF5F57AD0135E83C1CB9DB876E1DCEFC0F1290C73FE049472F6. No runtime secrets/config/backups. Output report/package metadata in task outputs.

## Remaining
- Separate owner permission for real pairing/selected test-group receive; separate actual send approval, receipt/restart/long-running provider acceptance. Baileys unofficial/prerelease risk remains open.
- Reviewed auth forgetting/identity replacement/retention/key rotation/recovery and off-host scheduled backup policy before real data. No automatic auth reset or reuse of other projects' sessions.
- Broader native review/resolve/export/reconciliation/source-switch/accessibility/load and toast popup/click acceptance. Account flag/history data projection tested; every native dialog/flag/history page not claimed accepted.
- Optional AI runtime/UI/key/model/accounting integration remains disconnected; adapters offline only. Multi-live sessions beyond initial1 not approved/tested. Installer/automatic updates optional; signing and enterprise multi-user identity excluded from personal gates.

## Approved QR pairing continuation —2026-11-13
D-043 authorizes real connection/owner-scanned QR only; actual send and group monitoring remain unapproved/disabled. Pre-live vendor inspection found libsignal direct console session-object output despite silent Pino. D-044 adds own-service stdout/stderr=null and LimitCORE0 before any real socket.15 Node/build tests PASS incl service privacy guard;20 offline C# regression pending completion. Added explicit private-SSH pairing/status CLI, no QR/auth export/provider discovery/send. Live gate/config/session still unchanged at this implementation checkpoint; deployment and pairing evidence follows.
