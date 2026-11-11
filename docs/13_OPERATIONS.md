# دليل التشغيل والمراقبة — Target Runbook

**تشغيل تجريبي مثبت:** taskpilot.service + own taskpilot-db container; all data synthetic. See tracking/PROJECT_STATE.md for exact deployed commit.

## مراقبة يومية مستهدفة
- حالة API وPostgreSQL وWhatsApp connector لكل جلسة.
- آخر استلام مؤكد لكل مجموعة، آخر رسالة معالجة، وعمق inbox/outbox.
- عدد مهام NEEDS_REVIEW، وعدد ردود UNKNOWN_DELIVERY.
- أخطاء التشفير والتخزين والنسخ الاحتياطي ومساحة القرص.
- تطابق إصدار Windows والـ API وتوافق قاعدة البيانات.

## إجراءات تعافٍ نموذجية (تُعدّل بعد التنفيذ)
1. عطل استقبال: افصل هل الخلل واتساب أم الجلسة أم المجموعة أم قاعدة البيانات؛ لا تدعِ وجود رسائل فائتة.
2. عطل إرسال: أوقف Outbox عند كثرة أخطاء المزود؛ تحقق من معرف الرسالة ونتيجة التسليم قبل الإعادة.
3. إعادة تشغيل خدمة: تأكد من إكمال معالجة inbox بشكل idempotent وعدم حدوث ازدواج.
4. عطل DB: أوقف الكتابة/الإرسال بأمان؛ استرجع وفق آخر نسخة مثبتة.
5. خطأ رمز مستخدم: حوله إلى مراجعة؛ لا تحفظ قيمة كلمة المرور في تذكرة أو log.
6. حادث أمني: أوقف وصولًا متضررًا، دوّر الأسرار، راجع سجلات منقحة وتحقق من أثر الحذف.
7. فقد جلسة واتساب: إعادة اقتران بعد موافقة المالك وبشكل لا يتجاوز سياسة المزود.

## النسخ الاحتياطية
- نسخ مشفرة، وصلاحيات وصول محدودة، وفصل موقع النسخ عن ملفات التطبيق، وعدم تخزينها في Git.
- خطة احتفاظ ومحو بعد الحذف يجب أن تعتمد قبل استلام بيانات حقيقية.
- الاختبار المطلوب: restore دوري إلى بيئة معزولة مع فحص سلامة البيانات ودورات idempotency.

## تغيير الإصدار
اكتب رقم الإصدار، commit، مهاجرات DB، وخطة الرجوع، ونفذ smoke tests على بيئة اختبار قبل الإنتاج. كل نشر فعلي يثبت في tracking/PROJECT_STATE.md.

## أدوات مجربة
- `systemctl status taskpilot.service`, `/health`, authenticated `/ready`, `scripts/pilot-smoke.mjs` (run on VPS; reads external key without printing it).
- `node ops/backup.mjs backup /var/lib/taskpilot/backups/UNIQUE.tpg` uses pg_dump from own container and AES-256-GCM with a separate external backup key. Dump exists in memory only (64MiB pilot limit); file creation refuses overwrite.
- `node ops/backup.mjs restore-test /var/lib/taskpilot/backups/UNIQUE.tpg UNIQUE_restore_test` verifies authentication tag, creates a fresh isolated database and uses single-transaction pg_restore. Existing target/production restore refused. Tested snapshot: 1 synthetic account,1 assignment,2 migrations,0 SENDING jobs.
- Key recovery/escrow and off-host backups are not established. A same-host restore drill is not proof of VPS-loss recovery. Production retention/deletion cycle and scheduled backups remain pending approval.
- No data/secret dumps or raw service logs are public deliverables. UNKNOWN_DELIVERY blocks purge/retry until the owner explicitly reconciles actual delivery in the Replies screen or authenticated reconciliation endpoint; reconciliation never requeues.

Final deployed code eb0f66bbc35ff008767501526612bdf0e9a94999: protected runtime role, actual restart/data preservation/other-service invariance, HTTP auth/replay, encrypted restore/tamper rejection verified. Source tracking/PROJECT_STATE.md remains authoritative.
