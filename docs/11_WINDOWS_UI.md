# مواصفات واجهة Windows المبدئية

**اللغة:** عربية RTL افتراضيًا؛ تصميم WinUI 3، الوضع الداكن والفاتح، دعم تكبير النص وتباين الوصول.

## التنقل
- لوحة التحكم: حسابات جديدة، مهام مفتوحة، مكتملة، مراجعة، حالة الخدمة والجلسات، آخر النشاط.
- صندوق الوارد: بطاقات رسائل مرشحة، حالات استخراج مؤكدة/غير واضحة، معاينة بيانات، ربط بحساب موجود.
- الحسابات: بحث بالاسم/اليوزر، عرض كلمة المرور بتحقق وإخفاء تلقائي، مهام الحساب عبر الفترات، تعديل/أرشفة/حذف.
- المهام: فلاتر الجلسة والمجموعة والمهمة والحالة والأولوية والفترة، بدء/إكمال/إعادة فتح.
- الردود: قوالب حسب المهمة والمجموعة، معاينة quote message، قائمة الإرسال المعلق والمرسل والفاشل والمجهول.
- المجموعات: تحديد مجموعة من جلسة، المهمة الافتراضية، تفعيل/تعطيل المراقبة، قواعد التعرف.
- الجلسات: رقم مقنع، حالة اتصال، QR/Pairing، آخر اتصال، فصل/إعادة اتصال، إدارة عدة جلسات.
- الإشعارات والمراجعة: حساب جديد، نقص بيانات، رمز خاطئ مؤكد، خطأ ربط، رد تعذر، فشل نسخة احتياطية.
- الإعدادات: حساب المالك، الأمان، AI، قواعد الرد، لغة/مظهر، النسخ الاحتياطية.

## شاشة الحساب
بطاقة الاسم/اليوزر والنظام، مصدر الاستلام وتاريخه، بيانات دخول مخفية افتراضيًا، جدول مهام مستقل، سجل النشاط، Flags (مثلاً رمز غير صحيح مؤكد)، أزرار حفظ/أرشفة/حذف. لا يعرض سطر كلمة المرور في قائمة عامة.

## اختيار الحذف
- حذف تكليف منفرد: يؤثر على المهمة فقط ولا يزيل الحساب.
- أرشفة حساب: يمكن استرجاعه.
- حذف حساب نهائي: معاينة عدد مهامه وتبعات الحذف وخيار الإلغاء.
- حذف المحدد: قائمة واضحة بالعدد.
- حذف الكل: خطوة منفصلة مع إدخال عبارة تأكيد وإعادة تحقق، وعرض هل سيزيل السجلات المرتبطة حسب سياسة البيانات.
- لا يُفهم «حذف حساب» أنه حذف رسالة من واتساب.

## أخطاء الرموز
حقل نوع الخطأ (كلمة المرور/رمز حساب/ربط واتساب)، مصدر التحقق (ملاحظة يدوية/تجربة مصرح بها)، درجة الثقة، وتنبيه قابل للتخصيص. زر اقتراح رد لا يرسل حتى الموافقة.

## Actual pilot implementation
WinUI3/.NET10 self-contained x64 source under apps/windows. Main navigation/forms, timed protected reveal, preview, selected/all purge, unknown reconciliation, theme and polling implemented. Actual fixture account/task/reply preview/cancel observed; sensitive confirmations and broad accessibility/paging/rules acceptance remain open. No installer/signature/update channel. See TEST_RESULTS for boundaries.

Continuation: integrated SSH session/tunnel,50-row pages preserving active filters, task state/session/group/type/period/priority filters, Arabic task statuses, keyword rule editor, filtered-page CSV save picker and assignment-only purge preview. Direct C# client/server acceptance is separate from visual WinUI acceptance; final evidence is in TEST_RESULTS.
