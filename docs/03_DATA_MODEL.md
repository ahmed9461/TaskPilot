# نموذج البيانات الأولي

يُنفذ بمهاجرات PostgreSQL بعد اعتماد هذه المواصفات، ولا توجد جداول مطبقة حاليًا.

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
