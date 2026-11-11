# خطة التنفيذ والتتبع — 2026-11-11
Checked means verified only within the stated synthetic pilot scope; production gates remain explicit.

## P0 — القرارات
- [x] P0-001 المتطلبات والذاكرة والقرارات والخطة والمخاطر.
- [ ] P0-002 قبول موصل واتساب الحقيقي ومخاطره وإثبات رقم مخصص.
- [ ] P0-003 اعتماد احتفاظ/محو/تدوير مفاتيح/نسخ خارجية وتفويض بيانات حقيقية.
- [x] P0-004 عقود وهوية namespace/task/period منفذة ومختبرة في pilot؛ لا ادعاء اعتماد إنتاجي شامل.
- [ ] P0-005 هوية إنتاجية Windows↔VPS؛ SSH + bearer/reauth التجريبي مثبتان، اتصال Windows المباشر يحتاج قبولًا يدويًا.

## P1 — Backend
- [x] P1-001 API/tests/checksum migrations.
- [x] P1-002 mock session adapter + explicit group bindings.
- [x] P1-003 encrypted review inbox + concurrent replay dedupe.
- [x] P1-004 accounts/assignments/all sources + namespace/period identities.
- [x] P1-005 conservative Arabic/English explicit-field parsing/review/errors.
- [x] P1-006 durable notifications/cursor + client polling (native push/toast pending).
- [x] P1-007 templates/preview/reauth/outbox/quoted mock transport; real send absent.
- [x] P1-008 verified/unverified credential flags/evidence, no AI proof.
- [x] P1-009 account archive/restore/single/selected/all purge, stale and unknown-delivery safeguards.
- [x] P1-010 redacted audit + manual encrypted backup/isolated restore/tamper rejection. Production scheduler/escrow/retention open under P0/P3.

## P2 — Windows
- [x] P2-001 actual native Arabic RTL dashboard/navigation, dark/system/light theme.
- [ ] P2-002 session/group/task-type forms IMPLEMENTED; advanced rule editor/live pairing and full UI acceptance open.
- [ ] P2-003 accounts/search/tasks/status IMPLEMENTED, read views observed; deep filters/paging and mutation acceptance open.
- [ ] P2-004 inbox reveal/resolve + synthetic message form IMPLEMENTED; full manual acceptance open.
- [ ] P2-005 preview/cancel observed; sensitive confirmations/selected purge/reconciliation forms IMPLEMENTED, full UI acceptance/signing/installer still open.

## P3 — الاستقرار والتكاملات
- [ ] P3-001 backend workflow and HTTP smoke PASS; fixture UI PASS; direct Windows-pilot/full UI end-to-end remains partial.
- [x] P3-002 protected isolated New-VPS pilot DEPLOYED; actual restart/least privilege/data/service isolation verified.
- [ ] P3-003 two mock sessions/source isolation PASS; multiple live sessions not approved/tested.
- [ ] P3-004 DeepSeek/OpenRouter adapters + privacy gates/mock tests PASS; runtime/UI/live key/model/accounting not connected.
- [ ] P3-005 dashboard counts implemented; advanced export/reports/alerts/off-host scheduled recovery not complete.

## الأدلة
Implementation:62fddfe, f659d9b,60bd2b6,eb0f66b. TEST_RESULTS and PROJECT_STATE describe exact environments; do not equate synthetic tests with live WhatsApp/provider/human production acceptance.

## Continuation stage1 — SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.
