# الحالة الحالية — المصدر المرجعي
As of: 2026-11-11. Synthetic pilot IMPLEMENTED / VERIFIED / DEPLOYED. Production acceptance remains open.
Runtime code commit: `eb0f66bbc35ff008767501526612bdf0e9a94999`. Branch: `feat/mvp-foundation`. Final documentation-only commit does not change deployed code.

## DEPLOYED — New-VPS
- taskpilot.service active/enabled, own taskpilot system user, root-owned immutable release symlink `/opt/taskpilot/current`.
- API only127.0.0.1:8240. Own PostgreSQL17 taskpilot-db container/volume only127.0.0.1:15488, memory/CPU bounded; no shared DB/proxy/firewall/SSH changes.
- Runtime role taskpilot_runtime: NOSUPERUSER/NOCREATEDB/NOCREATEROLE, DML only. Tested DDL and migration-write denial. Root-only migration.env separate from service env.
- Actual restart changed PID, retained account/assignment/message counts, other running service list unchanged, startup enabled. Automatic NRestarts0; observed memory28,762,112 bytes after checks. Host reboot not tested.

## VERIFIED functionality
- Auth/independent reauth, input limits, encrypted AEAD credentials/review, conservative parser, explicit namespace/task/period/all-source identities and concurrent replay deduplication.
- Separate task/outbox states, source-scoped five-minute approval, mock quoted dispatch, UNKNOWN_DELIVERY recovery and explicit owner reconciliation without resend.
- Evidence flags, archive/restore, fixed-snapshot single/selected/all account purge with aggregate-version staleness protection; redacted audit, durable reconnect notifications.
- Native WinUI3 Arabic RTL client built/published self-contained x64; account/task display and reply source/text preview/cancel actually observed using fixture API + isolated test DB. New selected purge/reconciliation forms build; full human confirmation acceptance remains open.
-8 Node tests,14 PostgreSQL integration tests including parent,6 C# client checks PASS. npm audit zero; repository known-pattern/forbidden-file scan PASS. CI PASS: https://github.com/ahmed9461/TaskPilot/actions/runs/43061180349.
- HTTP deployed auth/readiness/replay smoke PASS; liveSending=false. Backup32635 bytes AES-256-GCM; isolated restore1 account/1 assignment/3 migrations/0 sending. Corrupted backup rejected before any restore DB created. Same-host recovery only.
- DeepSeek/OpenRouter adapters have4 offline mock/privacy tests; not wired into runtime, no live keys/requests. Only trusted task codes are accepted, always review; freeform account extraction/prices/persistent usage accounting absent.

## Outputs
Portable `TaskPilot-Windows-x64-0.1.0-pilot.zip` (96,852,413 bytes,527 entries), integrity checked, no runtime key/config/backups. SHA256 in task outputs. No signed installer/update channel.

## OPEN / NOT VERIFIED
- Direct Windows-to-pilot authenticated connection: auto-review blocked automatic launch carrying server token (generic blocked by policy). Owner must enter token locally; fixture UI evidence is separate.
- Live WhatsApp connector choice/risk approval, pairing/receiving/sending; no real messages or accounts used.
- Production short sessions/MFA, real-data retention, key rotation/escrow/off-host scheduled backups, full host reboot/rollback, broad UI/accessibility/load acceptance.
- Advanced rules/editor, large-list paging/filters, native toast/push, per-assignment purge, live AI UI/runtime/billing integration.

## Resolved rollout issue
f659d9b deployment safely stopped on CRLF/LF checksum mismatch; old62fddfe stayed active. Verified byte-equivalent SQL, added normalization-only compatibility and SQL-change rejection test; final eb0f66b deployed successfully without DB reset.

## Continuation stage1 � SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.

Stage1 predeployment evidence:8 Node tests/build PASS, dedicated New-VPS PostgreSQL suite15/15 PASS including session lifecycle, WinUI Release0 warnings/errors and6 offline C# checks PASS. Direct server acceptance is next, not yet claimed.
