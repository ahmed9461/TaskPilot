# سجل القرارات — ADR المختصر

## المتفق عليه
| ID | القرار | الحالة | التاريخ |
|---|---|---|---|
| D-001 | Windows واجهة المستخدم وNew-VPS الخدمة المركزية المستمرة | APPROVED | 2026-11-11 |
| D-002 | رقم واتساب واحد كبداية مع بنية تدعم عدة أرقام متزامنة | APPROVED | 2026-11-11 |
| D-003 | كل مجموعة تربط بنوع مهمة أو قواعد مخصصة | APPROVED | 2026-11-11 |
| D-004 | الحساب مستقل عن المهمة ويتعامل مع مهام متعددة | APPROVED | 2026-11-11 |
| D-005 | الردود الجاهزة مخصصة، وتكون مرتبطة بالرسالة الأصلية | APPROVED | 2026-11-11 |
| D-006 | الحذف الفردي والجماعي والكلي مدعوم مع تأكيدات أمان | APPROVED | 2026-11-11 |
| D-007 | خطأ الرمز/الاعتماد يتيح تنبيهًا وردًا، مع عدم الادعاء بخطأ غير متحقق | APPROVED | 2026-11-11 |
| D-008 | DeepSeek وOpenRouter مع دعم نماذج OpenAI المتاحة | APPROVED | 2026-11-11 |
| D-009 | إنشاء ملفات متطلبات وذاكرة وتتبع واختبارات قابلة للاستئناف | APPROVED | 2026-11-11 |

## مقترحات تحتاج تحقق أو اعتماد
| ID | القرار المحتمل | الحالة | السبب |
|---|---|---|---|
| D-010 | استخدام Baileys للربط بلا متصفح | PROPOSED | موصل غير رسمي، يحتاج مراجعة توافق/شروط |
| D-011 | Backend TypeScript + PostgreSQL | PROPOSED | يلائم الخدمة المستمرة ونمو الحسابات |
| D-012 | Windows WinUI 3 / C# | PROPOSED | واجهة Windows أصلية |
| D-013 | إرسال رد خارجي فقط بعد معاينة وإقرار | PROPOSED_DEFAULT | يمنع الرد الخاطئ |
| D-014 | تخزين inbox/outbox داخل PostgreSQL أولًا | PROPOSED | تقليل تعقيد المكونات |
| D-015 | عدم إرسال أسرار إلى AI | SECURITY_BASELINE | حد أدنى للأمان |
| D-016 | سياسة أرشفة ثم حذف نهائي مشروط واستثناءات تدقيق منقحة | PROPOSED | يلزم سياسة احتفاظ محددة |
| D-017 | الوصول إلى API عبر شبكة خاصة أو TLS موثق | SECURITY_BASELINE | حماية بيانات الحسابات |

**تحديث القرارات:** اذكر التاريخ والبدائل والأثر وكيف تم الاعتماد. لا ترفع «PROPOSED» إلى APPROVED بسبب تنفيذ مساعد دون موافقة مالك المشروع.

## التنفيذ التجريبي — 2026-11-11
- D-018 — APPROVED BY OWNER REQUEST: تنفيذ Backend وقاعدة البيانات وWindows ثم نشر تجريبي تدريجي على New-VPS مع حماية الخدمات. لا ربط واتساب حقيقي أو إرسال فعلي. هذا يحدّث قيد النشر السابق، ولا يجيز فتح منفذ عام أو تغيير خدمات أخرى.
- D-019 — IMPLEMENTATION CHOICE, REVIEWABLE: TypeScript/Fastify + PostgreSQL inbox/outbox؛ البديل Redis وخدمات إضافية مؤجلة لتقليل التشغيل. تفرد الحساب `(namespace, normalized username)` والتكليف `(account, task type, period)`؛ يحتفظ بجدول كل المصادر. يطابق الاتجاه المقترح D-011/D-014 دون ادعاء اعتماد إنتاجي.
- D-020 — EXPERIMENT ONLY: API على loopback عبر SSH tunnel، bearer token عشوائي طويل + secret مستقل لإعادة التحقق عند الرد/الحذف/إظهار الاعتماد. لا كلمات مرور مالك أو جلسات ويب في هذه النسخة؛ بديل الإنتاج هو هوية قصيرة العمر/MFA. AEAD AES-256-GCM مع AAD ومعرف مفتاح؛ المفاتيح خارج Git/DB. البيانات وهمية فقط إلى اعتماد سياسة الاحتفاظ والهوية الإنتاجية.
- D-021 — IMPLEMENTATION CHOICE: حذف نهائي يعاين قائمة ثابتة وإصداراتها ويستخدم token أحادي الاستعمال قصير العمر، ويلغي الردود ويزيل المصادر غير المشتركة في معاملة. لا تنفيذ حين SENDING/UNKNOWN_DELIVERY يحتاج حسمًا. لا اعتماد لاحتفاظ بيانات حقيقية حتى الآن.

- D-022 — IMPLEMENTATION CHOICE: .NET10 + Windows App SDK2.6.5 WinUI3, exact package versions/lock, unpackaged self-contained x64 for pilot; alternative signed MSIX/update channel deferred. No change to approved native Windows direction.
- D-023 — PILOT ONLY: independent PostgreSQL17 Docker container/volume with loopback15488 and limited resources; API8240 over SSH. Existing installed upstream image digest pinned, no daemon/global package/proxy changes. Alternative shared PostgreSQL rejected to protect existing projects.
- D-024 — VERIFIED EXPERIMENT: AES-256-GCM separate backup key, pg_dump in bounded memory (64MiB cap), restore only into fresh *_restore_test. No approved production retention, scheduler or off-host key escrow inferred.

- D-025 — SECURITY IMPLEMENTATION CHOICE: AI adapters accept only trusted configured task codes derived locally, never raw account text; disabled and disconnected from runtime until explicit outbound scope/key/model setup. Alternative freeform redaction/extraction deferred because incomplete redaction could leak credentials. All results require review; live pricing/accounting not inferred.
- D-026 — INTEGRITY FIX: accept only LF/CRLF-equivalent migration hashes after verifying original deployed file bytes; all other SQL edits still fail. No migration/schema/data reset to bypass mismatch.
- D-027 — IMPLEMENTATION CHOICE: UNKNOWN_DELIVERY reconciliation requires owner reauth and manual/provider evidence; transitions terminal SENT/FAILED without automatic resend, with separate timestamp/audit. A subsequent deliberate new preview/approval is required for another send.

- D-028 — SECURITY IMPLEMENTATION CHOICE: separate taskpilot_runtime NOSUPERUSER/NOCREATEDB/NOCREATEROLE for API DML, with no schema creation or migration writes. Migration credentials root-only in /etc/taskpilot/migration.env; grants confined to own pilot DB. Alternative running API as initial PostgreSQL bootstrap owner rejected.

- D-029 — IMPLEMENTATION CHOICE (2026-11-11 continuation): Windows uses existing SSH host alias/key trust to obtain an owner session lasting30 minutes. Only token hash is stored server-side; permanent API keys stay server-local. Sensitive actions request a fresh60-second single-use reauth grant via authenticated SSH; HTTP cannot mint grants. Explicit revoke/logout supported. This is a closed pilot convenience, not MFA or permission to use real WhatsApp/AI. Alternatives: manual permanent token entry retained; production OIDC/MFA remains open.

- D-030 — IMPLEMENTATION CHOICE: keyword-only group rules with deterministic precedence; equal highest priority targeting different tasks requires human routing. Identity/credential lines are excluded; unrelated messages keep only dedupe metadata (IGNORED). Classified routing survives later rule edits in review. No arbitrary regex/AI decisions.
- D-031 — IMPLEMENTATION CHOICE: backward-compatible lists optionally return page=true envelope with total/limit/offset, read from one repeatable-read snapshot. Filtered-page CSV export uses an explicit field allowlist, reauth and spreadsheet-formula escaping. Assignment-only purge has its own short-lived preview/confirmation and preserves account/other tasks; uncertain delivery still blocks purge.

- D-032 — IMPLEMENTATION CHOICE (0.3 continuation): client distinguishes transient read failures, local expiry and401/revocation. Reads back off10/20/40/60s; no mutation/reply approval is retried automatically. Expired/revoked sessions require an explicit reconnect through existing trusted SSH. Filters/cursor remain in memory for same workspace; manual token mode must dispose previous SSH identity. Alternative transparent perpetual session renewal rejected to preserve session boundary.
- D-033 — IMPLEMENTATION CHOICE: notifications/audit get optional snapshot pages and safe filters; notification state gives committed head/unread count to seed sync without replaying old toasts. Desktop notifications are opt-in per process, generic counts only, silent and grouped, based on an explicit event allowlist. No names/message text/secrets/UUIDs enter OS toast payloads; no cloud push/background daemon or persisted token/cursor. Operational snapshot exposes counts/ages only behind auth. Production monitoring/retention remains separate.
