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

0.3 continuation: explicit reconnect banner, local expiry/401 distinction and read-only backoff. Same-workspace drafts/filters remain until explicit refresh; no mutation replay or perpetual automatic session renewal. Implemented/build tested; see TEST_RESULTS for observed GUI evidence.

0.3 activity: newest-first50-row notifications with unread/read filter and bounded read-page action; unread navigation badge; filtered redacted audit; authenticated count/age monitoring. Initial cursor uses committed head, same-workspace reconnect retains it, duplicates cannot produce new desktop alerts. Native local Windows notifications are opt-in per process, silent and grouped, counts only, while running; unsupported/elevated/system-disabled environments fall back to in-app notifications without changing Windows settings. Startup registration occurs only after opt-in; unregister on shutdown. Local receipt tests do not prove popup visibility or activation after close. SDK pattern reference: https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-dotnet .

0.4: paged/searchable template administration, edit/enable/disable and optional task/group scopes. Reply dialog filters enabled templates as the selected source changes, prioritizing specific scope. Editing warning explains stale previews and preservation of already-approved reply bodies. Sensitive outgoing approval remains a separate step.

D-037 (2026-11-13): personal single-owner Windows app; signing is not required. Existing portable self-contained ZIP is accepted; installer/automatic updates are optional. This changes release scope only, not UI or Windows security settings.

## Connector0.5
جلسات واتساب تعرض حالات مترجمة وبوابة الخادم؛ إنشاء إعداد مستقل عن الاتصال. Connect يتطلب تحذير الموصل غير الرسمي، checkbox، عبارة CONNECT WHATSAPP وreauth. QR نافذة مؤقتة من الذاكرة45 ثانية كحدأقصى دون نسخ/حفظ. Discovery/bind لمجموعة واحدة بعد إعادة تحقق؛ ربطها يشرح استمرار المعالجة على الخادم عند إغلاقWindows. Stop يبقي auth مشفرة. Reply يعرض provider وعبارة إرسال حقيقي مستقلة؛ مع الإرسال معطّل لايمكنالإقرار. بطاقات الطوابير تشمل الأخطاء المعزولة وإعادةالمعالجةالداخلية. خيارات المهام تعرض code، والمجموعات/الجلسات تعرض معرفًا ثابتًا لتمييز الأسماء المتكررة. قبول الربط الحقيقي غير منفذ.

تفاصيل الحساب0.5: زر مستقل من بطاقة الحساب، أقسام المهام/مصادر الرسائل/بلاغات الاعتماد/نشاط السجلات الحالية،50 سجلًا للصفحة مع السابق/التالي. لا يكشف الاعتماد أو النص الخام. تتضح صلة كل مصدر بالمجموعة والجلسة، والبلاغ واقعة مسجلة لا فحص جديد. الرجوع يبقي فلاتر قائمة الحسابات.

0.5.1 native fixes: automatic same-page change refresh restores scroll after layout; explicit navigation/filter/mutation refresh remains explicit. Review/template multiline controls set AcceptsReturn before Text to avoid WinUI coercion of saved line breaks. Review still hides raw text after30 seconds. Native mock-only reconciliation FAILED, multiline reveal/resolve and scoped2-row CSV Save As/reauth verified; broader accessibility/source-switch/live-send matrix remains open.

## Windows0.6.3 session presentation
بعد اكتمال تسجيل الخروج يظهر «غير متصل بالخادم»، وتختفي مدة الجلسة وإجراء الخروج. كل اتصال صريح لهrevision؛ نتائج أو أخطاء قراءة بدأت قبل الخروج/تبديل الاتصال لا تحدّث الشريط أو الشارة أو سجل التغييرات. لا تعاد عمليات التعديل تلقائيًا. الاتصال من الإعدادات يحدد لوحة التحكم وعنوانها وشريط التنقل معًا. القبول الأصلي بالـSSH مثبت في التتبع؛ سباق القراءة المتأخرة مثبت بنقل وهمي متحكم به.
