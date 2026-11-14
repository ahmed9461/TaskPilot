# استراتيجية الاختبارات وقبول المنتج

هذا الملف استراتيجية قبول؛ بعض الاختبارات نفذت ضمن النطاق الوهمي، وحالة كل دليل في tracking/TEST_RESULTS.md. النتائج الفعلية تحفظ في tracking/TEST_RESULTS.md مع التاريخ والبيئة والدليل.

## Unit
- تطبيع اسم المستخدم والتمييز بين namespace المختلفة.
- استخراج رسالة منظمة أو متغيرة أو ناقصة، وعدم اختلاق كلمات مرور.
- قواعد تعيين المهام وأولوية الرسالة.
- حالات تكليفات الحساب المتعددة وperiod_key.
- تحولات حالة المهمة والرد/الحذف المسموح بها.

## Integration
- Webhook/message event متكرر بنفس external_message_id → تكليف واحد.
- رسالتان متزامنتان لنفس الحساب والمهمة → لا duplicate.
- حساب في مجموعة «الذاتي» ثم «الدوري» → Account واحد وAssignment اثنتان.
- جلسة 1/مجموعة أ، وجلسة 2/مجموعة ب → عزل المصدر والرد.
- فشل DB بين حفظ الرسالة وإنشاء التكليف → استئناف آمن.
- انقطاع واتساب قبل إرسال الرد وبعد الإرسال وقبل تأكيد النتيجة → عدم إعادة إرسال عمياء.
- إعادة تشغيل service والعميل مغلق → تراكم التنبيهات والمزامنة.
- فشل AI → قواعد محلية ومراجعة، لا توقف الاستلام.
- صلاحيات API: رفض تصفح أسرار مستخدم غير مصرح.

## أخطاء الرموز والاعتمادات
- خطأ اقتران واتساب → تنبيه في صفحة الجلسات وحدها.
- كلمة مرور حساب خاطئة مؤكدة يدويًا → flag + تنبيه + قالب رد اختياري بعد موافقة.
- رمز حساب خاطئ بدليل تحقق → حالة واضحة وعدم وضع الرمز في الإشعار.
- تخمين AI غير واثق → NEEDS_REVIEW وليس INVALID_* مثبتًا.
- تحديث كلمة مرور الحساب → تبقى روابط المهام ولا يظهر السر القديم بالسجلات.

## حذف واستعادة
- أرشفة حساب مع عدة مهام → يبقى السجل التاريخي وفق سياسة الاحتفاظ.
- حذف تكليف واحد لا يحذف الحساب وبقية تكليفاته.
- حذف حساب مع reply pending → إلغاء طلب الإرسال المرتبط.
- حذف مجموعة حسابات بمعاينة العدد، رفض تأكيد غير صحيح.
- DELETE ALL: إعادة تحقق، نص تأكيد، اختبار تفويض، اختبار فشل جزئي ونتيجة آمنة.
- منع وصول بيانات محذوفة من cache أو export؛ اختبار سياسة النسخ الاحتياطية.
- استعادة DB مع نسخة مشفرة وتجربة القراءة وعدم ازدواج Outbox.

## قبول مبدئي لكل مرحلة
لا توصف feature بـ VERIFIED حتى يوجد اختبار آلي أو يدوي موثق نتيجته ودليل يمكن مراجعته. لا يوصف New-VPS بـ DEPLOYED حتى تثبت الخدمة على المضيف المستهدف وتمر اختبارات الدخان وتسجيل التشغيل.

2026-11-14:24h test WAIVED_BY_OWNER(D-060), not PASS.90s own-service network fault plus native configuration/keyboard/explicit logout/navigation and obsolete async read regression covered as bounded evidence in TEST_RESULTS. Keep visible toast/click/full accessibility/provider late-delivery and host-reboot gates separate.

0.8 privacy cases: auth/reauth/bounds/version; frozen selected cleanup/count/secret minimization; stale row/policy/token; in-flight AI/new eligible protection;1000-row batch; active process lease/requested session; uncertain delivery; selected forget/history/other identity/late auth/reconnect+group-enable rejection; changed auth/new approval; injected final INSERT failure rolls back all prior cleanup/forget writes. Fixtures only/no provider socket. Initial test fixture reused uuid SQL parameter in text column and failed3cases before business execution; corrected separate parameter, privacy12 including parent PASS; final whole-suite result tracked separately.


0.8 final:62PG incl6parents/24Node/21offlineC#/exact backend+Windows CI PASS; native privacy save/cleanup/history/selected synthetic forgetting/server readback verified. Independent old11/new13/cloud-readback/scheduled13 restore DPAPI0/SSH0, wrong-code/tamper rejected before container. Initial negative ACL launcher failure fixed/repeated, original retained in TEST_RESULTS. Physical secret custody/new user/device/cutover and OS toast activation remain separate acceptance.
