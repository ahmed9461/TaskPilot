# المهام المفتوحة — مصدر التخطيط

## P0 — قبل البناء
- [x] P0-001 إنشاء المتطلبات والذاكرة والقرارات والخطة والمخاطر.
- [ ] P0-002 مراجعة إمكانية استخدام موصل واتساب للمجموعات وقبول المخاطر القانونية والتشغيلية؛ إثبات محدود.
- [ ] P0-003 اعتماد سياسة التشفير والمحو والاحتفاظ بالنسخ الاحتياطية وتفويض الحسابات.
- [ ] P0-004 اعتماد عقود وحدات Backend/Windows وتصميم هوية الحساب والمهام وperiod_key.
- [ ] P0-005 اختيار وإثبات آلية مصادقة اتصال Windows ↔ New-VPS.

## P1 — Backend MVP
- [x] P1-001 إنشاء خدمة API وهيكل اختبارات وآلية migrations.
- [x] P1-002 بناء session abstraction وgroup bindings مع mock provider.
- [x] P1-003 تصميم inbox وdeduplication والتعامل الآمن مع concurrency.
- [x] P1-004 إنشاء accounts وassignment_sources وassignments مستقلة.
- [x] P1-005 تطبيق قواعد استخراج ومراجعة ورسائل خطأ.
- [x] P1-006 تنفيذ إشعارات دائمة وتزامن Windows.
- [x] P1-007 تنفيذ reply templates وoutbox وإرسال الاقتباس بعد التأكيد.
- [x] P1-008 تنفيذ حالات الرمز/كلمة المرور الخاطئة مع الدليل والتأكيد.
- [x] P1-009 تنفيذ الأرشفة والحذف الفردي/المتعدد/الكلي مع اختبار التبعات.
- [x] P1-010 ضبط تسجيل audit منقح ونسخ احتياطي مشفر قابل للاستعادة.

## P2 — Windows MVP
- [x] P2-001 لوحة تحكم عربية RTL.
- [ ] P2-002 الجلسات والمجموعات والقواعد.
- [ ] P2-003 الحسابات والمهام والبحث/الفلاتر.
- [ ] P2-004 صندوق مراجعة الوارد والبيانات الناقصة.
- [ ] P2-005 المعاينة والردود الجاهزة، والتنبيهات، والحذف المحمي.

## P3 — التشغيل والتحسين
- [ ] P3-001 اختبار E2E على بيانات وهمية قبل ربط فعلي.
- [x] P3-002 خطة نشر اختبارية على New-VPS مع حماية الخدمات القائمة.
- [ ] P3-003 تعدد جلسات نشطة بعد اعتماد اختبار العزل.
- [ ] P3-004 تكامل DeepSeek/OpenRouter بعد فحص إرسال بيانات منقحة.
- [ ] P3-005 تقارير وإحصاءات ومستوى إنذار ومراقبة ونسخ احتياطي.

كل مهمة تغلق فقط مع رابط commit/PR ونتيجة اختبار منشورة في tracking/TEST_RESULTS.md. لا تحولها إلى Done عند كتابة وثيقة تصميم فحسب.

هذه البنود مثبتة فقط في النطاق الوهمي عبر اختبارات Phase 1؛ P1-010 وWindows والنشر والاستعادة ما زالت مفتوحة. production auth وlive WhatsApp لا تُغلق ضمن الإنجاز الوهمي.

## Native pilot acceptance notes
- P1-010: redacted audit + manual encrypted backup/restore VERIFIED on synthetic data. Automated retention/off-host escrow remain separate open work.
- P2-001: actual Arabic RTL native window VERIFIED. P2-002..005 IMPLEMENTED main forms; comprehensive UI acceptance, selected bulk purge and advanced rules remain open.
- P3-002: closed synthetic pilot actually DEPLOYED; no public port or change to shared services. Final restart/CI evidence to follow.
- P3-001: API workflow E2E and fixture UI PASS; direct Windows-to-pilot and full UI actions remain partial.

Stability work: delivery reconciliation and selected Windows purge IMPLEMENTED (backend reconciliation included in integration suite); final UI human acceptance remains open. P3-004 adapter/privacy contract tests PASS but live activation, UI configuration, billing and persistence remain TODO. No claim of live AI completion.
