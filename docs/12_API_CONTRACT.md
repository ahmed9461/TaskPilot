# عقود API مقترحة — Draft

**النسخة:** v1 غير منفذة. تخضع للتصميم والاختبارات. المصادقة مطلوبة على جميع المسارات عدا health المقيد.

## Resources
- GET /v1/me — هوية المالك والصلاحيات.
- GET /v1/dashboard — أرقام عامة دون أسرار.
- GET /v1/sessions ؛ POST /v1/sessions/pairing-request ؛ POST /v1/sessions/{id}/disconnect.
- GET /v1/groups ؛ PATCH /v1/groups/{id} — إعدادات المراقبة والقواعد.
- GET /v1/accounts ؛ POST /v1/accounts ؛ GET /v1/accounts/{id} ؛ PATCH /v1/accounts/{id}.
- POST /v1/accounts/{id}/archive ؛ POST /v1/accounts/{id}/restore.
- POST /v1/deletions/preview ؛ POST /v1/deletions/confirm — حذف فردي/محدد/كلي وفق تأكيد وخطوة تحقق.
- GET /v1/assignments ؛ PATCH /v1/assignments/{id}/status.
- GET /v1/reply-templates ؛ POST /v1/reply-jobs/preview ؛ POST /v1/reply-jobs/approve ؛ GET /v1/reply-jobs.
- POST /v1/issue-flags — رمز خاطئ/مراجعة؛ مصدر دليل مطلوب.
- GET /v1/notifications ؛ POST /v1/notifications/{id}/read.
- GET /v1/audit — سجل أحداث منقح.
- GET /v1/changes?cursor=... — مزامنة الأحداث أثناء انقطاع Windows.

## ضوابط
- كل تعديل يحتاج validation وpermission checks وaudit trail.
- optimistic concurrency / version مطلوب في تحديث حساب أو تكليف.
- endpoint الإرسال/الحذف يدعم idempotency key.
- تحدد عمليات التغيير target session/group/message بشكل صريح؛ لا default session مستتر.
- reveal credential يتطلب إعادة تحقق وصلاحية ووقت وصول محدود، ولا يعاد ضمن GET العادي.
- أخطاء API تنتمي إلى أكواد مستقرة: VALIDATION_ERROR، CONFLICT، UNVERIFIED_CREDENTIALS، PAIRING_CODE_INVALID، REPLY_DELIVERY_UNKNOWN، PERMISSION_DENIED، DELETION_REQUIRES_CONFIRMATION.
- تفعيل وتوفير API خارجي لا يتم قبل اعتماد سياسة الوصول وTLS.
