# نموذج البيانات الأولي

تنفيذ MVP موجود في services/api/migrations؛ الجداول أدناه نموذج النطاق المستهدف، والمهاجرات هي مرجع التنفيذ الفعلي.

| الكيان | حقول أساسية | قيد/ملاحظة |
|---|---|---|
| whatsapp_sessions | id, label, phone_masked, provider, status, last_seen, auth_secret_ref | هوية جلسة مستقلة؛ مواد الاقتران مشفرة خارج السجلات |
| groups | id, session_id, external_group_id, title, enabled | unique(session_id, external_group_id) |
| task_types | id, code, name, default_reply_template_id, enabled | معرف داخلي ثابت |
| group_rules | id, group_id, task_type_id, priority, match_definition, enabled | أكثر من قاعدة عند الحاجة |
| accounts | id, namespace, username_normalized, display_name, created_at, archived_at | unique(namespace, username_normalized) بعد التحقق من namespace |
| account_credentials | id, account_id, ciphertext, key_version, updated_at | تشفير authenticated / منع قراءة API بلا صلاحية |
| source_messages | id, session_id, group_id, external_message_id, sender_ref, received_at, minimized_payload_ref | unique(session_id, group_id, external_message_id) |
| assignments | id, account_id, task_type_id, period_key, status, priority, source_message_id, group_id, session_id, completed_at | مؤشر تفرد مدروس بحسب فترة المهمة؛ الاحتفاظ بمصادر إضافية |
| assignment_sources | assignment_id, source_message_id | للحساب/المهمة المستلمة من عدة رسائل |
| issue_flags | id, account_id, assignment_id?, kind, verification_status, evidence_ref, created_at | خطأ رمز أو كلمة مرور موثق |
| reply_templates | id, code, body, scope, enabled | متغيرات آمنة فقط؛ لا كلمات مرور |
| reply_jobs | id, assignment_id, source_message_id, session_id, template_id, status, idempotency_key, approved_at, provider_message_id | unique(idempotency_key)، لا إعادة إرسال عمياء |
| notifications | id, type, subject_id, severity, read_at | لا معلومات سرية في نص التنبيه |
| audit_events | id, actor_id, action, target_type, target_id, timestamp, metadata_redacted | لا كلمات مرور/رسائل خام |
| deletion_requests | id, scope, item_count, requested_by, confirmed_at, state, purge_at | حماية الحذف الجماعي |

## قواعد الهوية
- اسم المستخدم وحده قد يتكرر بين منصتين؛ يجب تعريف namespace (الجهة/النظام) وعدم جمع حسابين مختلفين.
- لا تُدمج سجلات حسابات على أساس التشابه التقريبي للاسم وحده.
- لا يُحذف Account عند اكتمال Assignment؛ المهام التاريخية مستقلة.
- تكرار نفس المهمة لنفس الحساب في فصل أو فترة جديدة يجب أن يكون مدعومًا عبر period_key.
- يظل مصدر كل تكليف قابلاً للتتبع حتى لو وصلت رسائل متعددة من مجموعات/جلسات مختلفة.
- إذا تغيرت كلمة المرور، يضاف سجل تحديث مسجل ولا ينسخ النص الخام داخل audit.

## سياسات الحذف
- **Archive:** إخفاء منطقي قابل للاسترجاع دون إنهاء التوثيق.
- **Delete / purge:** حذف المعلومات الشخصية والاعتمادات وربط المصادر وفق سياسة احتفاظ محددة؛ إلغاء الردود المعلقة؛ منع بقايا في cache.
- **Delete all:** عملية ذات صلاحية أعلى وإقرار خطوة ثانية ومعاينة عدد السجلات ونسخة احتياطية معتمدة إذا كانت سياسة الاحتفاظ تسمح.
- سجلات التدقيق تحفظ حدًا أدنى غير سري بدل الاحتفاظ باسم المستخدم وكلمات المرور بعد محو البيانات؛ النسخ الاحتياطية تنقضي وفق دورة احتفاظ معلنة.

## Implemented schema additions
Migration003 adds reply_jobs.reconciled_at/reconciliation_evidence for owner-confirmed unknown delivery. The account aggregate version advances when task/source/reply state changes, invalidating destructive previews. Migration checksum comparison normalizes only historical LF/CRLF variants; SQL text changes remain rejected.

Migration004: hashed short-lived client sessions and one-use SSH reauth grants. Migration005: group_rules, assignment priority0..100, durable per-source routing/ambiguity. Runtime permissions remain DML-only and grants are applied after migrations.

Migration006 adds notification unread-ID and audit action/target/time indexes. No additional account fields, raw logs or retention policy introduced.

Migration007: reply_templates version/enabled plus optional group_id/task_type_id FKs and enabled-scope index. Global rows remain compatible. Approval payload stores templateVersion; approved job body stays an immutable independent snapshot.

## Migration008 — WhatsApp connector
Append-only new schema: session provider baileys/status/version/requested/consent timestamp/connected/error/auth_epoch؛ unique requested-live-session index(max1). `whatsapp_auth` يخزن session/category/hashed key ID/ciphertext/key version فقط. `source_messages.encrypted_transport_key` سياقه source UUID؛ لا يظهر في public lists. `whatsapp_ingress` يحفظ unique session/group/external ID، ciphertext مؤقتًا، PENDING/DONE/DROPPED/ERROR ومحاولات/error code. DONE/DROPPED يحتفظان tombstone دونraw. ERROR مشفر إلى المعالجة أو الحذف المقصود. Auth لا تمحى بمجرد قطع الاتصال.

Migration011 adds singleton versioned ai_settings and ai_requests reservation/result ledger (hashed idempotency, candidate task codes, source/settings version, safe errors/tokens/nullable estimated and reported costs). Source deletion nulls source_id, retains usage without account data. No plaintext key/provider body storage. Existing migrations immutable.

Migration012 adds key_rotation_runs (run ID, field-key version, aggregate counts, completed_at) to disambiguate DB commit from interrupted file publication. No secrets in this table; protected journal outside DB holds key material. Existing migrations remain immutable.
