# خطة التنفيذ والتتبع —2026-11-12
Checked means verified within synthetic pilot scope only. Exact source/CI/evidence in PROJECT_STATE and TEST_RESULTS.

## P0 — القرارات
- [x] P0-001 المتطلبات والذاكرة والقرارات والتتبع.
- [x] P0-004 namespace/account/task/period/source contracts in pilot.
- [ ] P0-002 live WhatsApp choice/risk/dedicated number authorization.
- [ ] P0-003 production retention/purge/rotation/off-host escrow and real-data authorization.
- [ ] P0-005 production MFA/RBAC identity; temporary SSH sessions/reauth/recovery already VERIFIED.

## P1 — Backend
- [x] P1-001 executable API/checksum migrations/CI.
- [x] P1-002 mock sessions/group bindings/rules/priority and source isolation.
- [x] P1-003 encrypted review/concurrent dedupe/minimized ignored chat.
- [x] P1-004 account/assignment/multiple sources and scoped identity.
- [x] P1-005 conservative extraction/manual ambiguous routing.
- [x] P1-006 durable event cursor/head/read state/pages; cloud push/background Windows reception not implemented.
- [x] P1-007 versioned editable scoped templates/preview/reauth/mock quoted outbox; approved snapshot immutability.
- [x] P1-008 verified/manual versus UNVERIFIED credential flags.
- [x] P1-009 archive/restore/scoped account/task-only purge and stale/uncertain-delivery safeguards.
- [x] P1-010 redacted audit/manual encrypted backup/same-host restore. Production scheduler/off-host/escrow remain gated.

## P2 — Windows
- [x] P2-001 native Arabic RTL/dashboard/theme/self-contained x64 build.
- [ ] P2-002 session/group/task/rule forms implemented; full config/live pairing acceptance open.
- [ ] P2-003 accounts/task/paged filters/status verified partly; account details/flags/history and broad acceptance open.
- [ ] P2-004 review reveal/resolve implemented and direct C# verified; full GUI review acceptance open.
- [ ] P2-005 preview/cancel verified; sensitive GUI confirmations/reconciliation/export/signing/installer acceptance open.
- [x] P2-006 template create/edit/scope/disable/filter/reload observed on deployed0.4; server stale/snapshot tests PASS. Source-switch visual race acceptance open.
- [x] P2-007 paged notifications/unread badge/redacted audit/monitoring observed; generic silent OS receipt/storage PASS. Popup/click/closed-app delivery not claimed.
- [x] P2-008 explicit SSH recovery/no write replay/read backoff; actual own-tunnel interruption/reconnect preserved draft. Local/server expiry/revocation tests PASS.

## P3 — الاستقرار والتكاملات
- [ ] P3-001 current11 Node/19 PG/20 local C#/28 direct Windows-server tests and CI PASS; full GUI/accessibility/load remains partial.
- [x] P3-002 isolated pilot0.4 DEPLOYED; own role/restart/data/startup verified. Other-service drift I-010 returns nonzero; no continuous host-wide claim.
- [ ] P3-003 multiple mock sessions verified; multiple live sessions not approved/tested.
- [ ] P3-004 DeepSeek/OpenRouter isolated privacy adapters offline tested; runtime/UI/live keys/model/accounting not connected.
- [ ] P3-005 safe page CSV and own-app operations snapshot done; broader reports/alerts/off-host recovery remain open.
- [x] P3-006 exact-version bounded deployment readiness fixes Type=simple startup race; real rollout and regression PASS.

## Next
1. Account details/flags/tasks/source history and duplicate-name selectors with codes (I-016).
2. Synthetic native review/reconciliation/CSV/source-switch/accessibility and bounded load/recovery checks.
3. Production identity/retention/key recovery and signing/off-host/live provider decisions before real data.
No real WhatsApp or outbound messages without explicit separate permission. Completed code87f986b; latest hosted CI43100482889 backend+Windows SUCCESS.
