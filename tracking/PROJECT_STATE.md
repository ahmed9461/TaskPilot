# الحالة الحالية — المصدر المرجعي
As of 2026-11-11. Phase 1: Backend + Windows pilot implemented; closed synthetic deployment on New-VPS. Live production acceptance NOT COMPLETE.

## VERIFIED
- API, PostgreSQL migrations, encrypted credentials/review, mock sessions/groups and deduplicated account/task/period/all sources.
- Separate task/outbox status, five-minute one-use preview approvals, reauth, unknown-delivery recovery, archive/restore/purge and aggregate-version stale protection.
- Local/server build + 8 unit/adapter/integrity tests PASS; isolated PostgreSQL integration 14/14 PASS (including parent). C# client checks 6/6 PASS; npm audit zero.
- WinUI 3 Arabic RTL client builds/publishes self-contained x64. Actual window observed: connected synthetic fixture, account list (no password), task list, quote source/template and final preview, cancellation. No UI send/reveal/delete confirmation performed.
- API running as taskpilot.service, independent user, loopback8240; own PostgreSQL17 taskpilot-db/volume, loopback15488; CPU/memory bounded. Initial source62fddfe. Next release exact SHA recorded after deployment.
- HTTP auth/readiness/replay smoke PASS. AES-GCM pg_dump backup + isolated pg_restore PASS:1 synthetic account,1 assignment,2 migrations,0 SENDING. Same-host restore only.

## DELIVERABLE
`apps/windows` source + lockfile; portable app published under task outputs. No installer/signature/update channel yet. CI run43059625322 PASS for f659d9b: Node/Postgres and Windows build/client checks. Final revision rerun follows.

## NOT VERIFIED / OPEN
- Direct Windows-to-pilot-server connection: automatic server-token-to-client launch rejected by auto-review (generic blocked by policy); safer Windows test used separate local API + dedicated remote synthetic UI DB via SSH. Owner token was not exported to the client.
- Live WhatsApp pairing/messages, provider selection, live AI, production identity/MFA, real-data retention/key rotation, off-host key escrow/backups, host reboot/rollback drill.
- Advanced rules, large-list paging, native toast/push, per-assignment purge remain TODO.
All data synthetic. Existing services/configs untouched; no public API, firewall/Nginx/SSH changes.

## Stability/adapters phase
- Implemented explicit owner reconciliation of UNKNOWN_DELIVERY with reauth/evidence, SENT/FAILED terminal state and no resend. Windows selected-account preview added.
- Offline DeepSeek/OpenRouter adapter tests PASS; adapters default-disabled, not connected to ingest or live keys. They accept only allowlisted task codes; account extraction/real provider acceptance remain open.
- f659d9b deployment aborted before switch due historical CRLF checksum versus new LF. Old62fddfe continued active. Byte hashes verified line endings only; migration runner now accepts LF/CRLF-equivalent checksums, rejects SQL changes; regression PASS. Exact successful release evidence follows.
