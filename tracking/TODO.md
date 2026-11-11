# خطة التنفيذ والتتبع — 2026-11-11
Checked means verified only within the stated synthetic pilot scope; production gates remain explicit.

## P0 — القرارات
- [x] P0-001 المتطلبات والذاكرة والقرارات والخطة والمخاطر.
- [ ] P0-002 قبول موصل واتساب الحقيقي ومخاطره وإثبات رقم مخصص.
- [ ] P0-003 اعتماد احتفاظ/محو/تدوير مفاتيح/نسخ خارجية وتفويض بيانات حقيقية.
- [x] P0-004 عقود وهوية namespace/task/period منفذة ومختبرة في pilot؛ لا ادعاء اعتماد إنتاجي شامل.
- [ ] P0-005 هوية إنتاجية Windows↔VPS؛ جلسات SSH قصيرة العمر وإعادة تحقق أحادية مثبتتان مع Windows والخادم؛ MFA/RBAC وقبول الإنتاج مفتوحة.

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
- [ ] P2-002 session/group/task-type forms and keyword/priority rule editor IMPLEMENTED; rule backend/C# acceptance VERIFIED; live pairing and full UI acceptance open.
- [ ] P2-003 accounts/search/tasks/status + pages/filters IMPLEMENTED; C# direct-server workflow19 checks PASS; native create/edit/filter/archive/restore observed. Broad task UI acceptance open.
- [ ] P2-004 inbox reveal/resolve + synthetic message form IMPLEMENTED; full manual acceptance open.
- [ ] P2-005 preview/cancel observed on deployed server; task-only and account purge VERIFIED by API/C#; sensitive confirmations/reconciliation full GUI acceptance/signing/installer still open.

## P3 — الاستقرار والتكاملات
- [ ] P3-001 backend workflow and direct Windows-pilot19-check acceptance PASS; actual native account workflow PASS; full GUI confirmations/accessibility/load remain partial.
- [x] P3-002 protected isolated New-VPS pilot DEPLOYED; actual restart/least privilege/data and scoped service-isolation checks verified; existing-service drift I-010 recorded, no continuous-host claim.
- [ ] P3-003 two mock sessions/source isolation PASS; multiple live sessions not approved/tested.
- [ ] P3-004 DeepSeek/OpenRouter adapters + privacy gates/mock tests PASS; runtime/UI/live key/model/accounting not connected.
- [ ] P3-005 dashboard + safe filtered-page CSV VERIFIED; broader reports/toasts/alerts/off-host scheduled recovery open.

## الإصدار 0.2.0 — نتائج الاستمرار
- [x] اتصال Windows بجلسة SSH مؤقتة دون تصدير مفاتيح دائمة، expiry/revoke/single-use reauth.
- [x] قواعد كلمات وأولويات مع مراجعة التعادل، تجاهل المحادثة غير المتعلقة وتقليل نصها.
- [x] صفحات وفلاتر API/Windows، تسميات حالات عربية، CSV منقح، حذف تكليف دون الحساب.
- [x] اختبارات Windows C# مع New-VPS:19 فحصًا؛ الواجهة الفعلية: إنشاء/تعديل/تصفية/أرشفة/استعادة/معاينة وإلغاء.
- [x] حماية مسودات الفلاتر وتحديد الحسابات أثناء المزامنة ومؤشر انتظار (build verification; extended GUI acceptance pending).

## التالي ضمن التفويض الحالي
1. استكمال سيناريوهات الواجهة للقواعد والمراجعة والمهام والتصدير والمصالحة؛ اختبارات accessibility/load/reconnect وانتهاء الجلسة.
2. توسيع التشغيل التجريبي للمراقبة والتقارير وسجل الواجهة مع إبقاء التنقيح؛ توقيع/installer يتطلب مواد إصدار مناسبة.
3. هوية الإنتاج واحتفاظ/تدوير مفاتيح/استعادة خارج الخادم تحتاج قرارات المالك قبل بيانات حقيقية.
4. موصل واتساب الحقيقي والرسائل وAI live تبقى خلف موافقة/تهيئة منفصلة؛ لا استنتاج قبول من synthetic tests.

المصدر المثبت للإصدار وCI والنشر والنسخ: PROJECT_STATE.md وTEST_RESULTS.md. التأشير يعني نطاق pilot فقط.

Final continuation: deployed17f846e / Windows binarybfcbbd4, CI43093897111 both jobs PASS; encrypted restore5 migrations PASS. I-010 external existing-service restart loop remains outside TaskPilot scope and must not be silently treated as fixed.

0.3 stage1: explicit reconnect/expiry/backoff and no-mutation-retry VERIFIED by simulated C# checks and native build; actual transport interruption/GUI verification pending. Activity/notifications/monitoring stage follows D-033.

0.3 stage2: notification/audit pages, read state/badge, operational snapshot and generic local toasts IMPLEMENTED; backend530-event/late-commit tests18 total PASS,20 local C# checks PASS, native OS receipt stored/generic/silent PASS. Actual-server25-check/visual activity/recovery acceptance and rollout follow; no popup/click/background delivery claim.
