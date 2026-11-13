# خطة التنفيذ والتتبع —2026-11-13
Checked means verified within synthetic pilot scope only. Exact source/CI/evidence in PROJECT_STATE and TEST_RESULTS. D-037: personal single-owner use; signing not required, portable ZIP accepted. Installer/automatic updates optional.

## P0 — القرارات
- [x] P0-001 المتطلبات والذاكرة والقرارات والتتبع.
- [x] P0-004 namespace/account/task/period/source contracts in pilot.
- [ ] P0-002 live WhatsApp choice/risk/dedicated number authorization.
- [ ] P0-003 production retention/purge/rotation/off-host escrow and real-data authorization.
- [ ] P0-005 single-owner access/security review for real use; temporary SSH sessions/reauth/recovery already VERIFIED. Multi-user RBAC/enterprise identity are not personal-release requirements.

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
- [ ] P2-003 accounts/task/paged filters/status verified partly; account details/flags/history implemented and API/direct checks PASS; native task/source views observed, broad acceptance open.
- [ ] P2-004 review reveal/resolve implemented and direct C# verified; full GUI review acceptance open.
- [ ] P2-005 preview/cancel verified; sensitive GUI confirmations/reconciliation/export acceptance open. Signing is not required; installer is optional (D-037).
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
1. Continue broader synthetic native review/reconciliation/CSV/history/flags/source-switch/accessibility/load checks. Account details and code/identity labels are implemented.
2. Synthetic native review/reconciliation/CSV/source-switch/accessibility and bounded load/recovery checks.
3. Single-owner access review, retention/key recovery/off-host backup and live-provider decisions before real data. Signing is excluded; installer/update channel optional.
No real WhatsApp or outbound messages without explicit separate permission. Completed code87f986b; latest hosted CI43100482889 backend+Windows SUCCESS.

## 0.5 progress override —2026-11-13
- [x] Real connector implementation + encrypted auth/ingress/provider isolation and fake-socket PostgreSQL acceptance (32 total),14 Node checks. This is not live provider acceptance.
- [x] Windows gated session/QR/discovery/bind/stop and disambiguated choices implemented; final/native acceptance pending.
- [x] Account details/flags/tasks/source history API and Windows implemented; privacy/isolation/pages and34 direct-server checks PASS; native task/source views observed.
- [x] Dormant0.5 rollout/34 Windows-server checks; native portable task/source/session gates;8-migration restore and corrected ZIP verified. CI43486994434 both jobs SUCCESS. Broad native acceptance remains open.
- [ ] Real pairing, receive and send acceptance: separate owner authorization remains required; both runtime flags false.

## Final0.5 checkpoint
API5265c5b deployed; Windows6157855 package.14 Node/33 PG/20 offline C#/34 direct-server PASS; CI43486994434 backend+Windows/publish check SUCCESS. I-020 corrected portable resources/native startup; use0.5 ZIP. Both live gates false; auth/requested0. Account details/code labels implemented, native task/source/session metadata/disabled controls observed. Live provider, wider GUI and optional AI runtime/policy gates above remain open.
