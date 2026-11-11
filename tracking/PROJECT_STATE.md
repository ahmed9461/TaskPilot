# الحالة الحالية — المصدر المرجعي
As of: 2026-11-11. Phase 1 backend: VERIFIED on isolated synthetic PostgreSQL; API not yet running as a service. Windows: IN_PROGRESS.

## مثبت
- TypeScript/Fastify authenticated API, versioned PostgreSQL migrations with checksums/advisory locking.
- Session/group mock adapter only; durable encrypted review inbox, namespace identity, task/period/source deduplication.
- Account/assignment management, notifications and reconnect cursor, AEAD credential storage and reauthentication for reveal.
- Reply preview/one-use approval/outbox, source/session checks; uncertain sends and crash recovery become UNKNOWN_DELIVERY.
- Evidence-based flags, archive/restore and snapshot/reauth protected purge.
- `npm run check`: build + 3 unit tests PASS. `npm run test:integration` on New-VPS dedicated synthetic database: 13/13 PASS (including parent suite), 2026-11-11. `npm audit`: zero known vulnerabilities.

## البيئة
- Own PostgreSQL 17 container taskpilot-db, loopback port 15488, independent Docker volume; limits 384 MiB/0.5 CPU.
- Own service user taskpilot, separate /etc/taskpilot secret files. Existing services/configuration not modified.
- SSH transport; no public API binding, WhatsApp dependency, real pairing, real messages, or AI requests.

## لم يثبت/متبقٍ
Windows UI/build, persistent API deployment/restart/backup recovery, live WhatsApp, production identity/MFA, real-data retention policy, AI integration. No production readiness claim.
See TEST_RESULTS.md and SESSION_HANDOFF.md for reproducible commands and next steps.
