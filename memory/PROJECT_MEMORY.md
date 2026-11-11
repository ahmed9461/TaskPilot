# ذاكرة المشروع طويلة الأمد — TaskPilot

**آخر تحديث:** 2026-11-11. يهدف هذا الملف لتثبيت قرارات المشروع بعيدًا عن سجل المحادثات.

## الهدف الدائم
إدارة حسابات العمل والمهام الواردة من مجموعات واتساب مع سجل مستقل لكل حساب/مهمة ومصدر رسالة، وردود بعد الموافقة، وواجهة Windows، وخدمة مستمرة على New-VPS.

## قرارات متفق عليها
- خدمة الاستقبال والمعالجة تحفظ البيانات على New-VPS وتستمر حتى إغلاق اللابتوب.
- Windows أداة إدارة؛ لا تحتاج إبقاء جلسة واتساب في متصفح على Windows.
- الربط يبدأ برقم واحد مع تصميم يدعم عدة أرقام تعمل بالتوازي.
- لكل مجموعة قواعد ومهام مخصصة؛ يستخرج الاسم واليوزر والبيانات من رسائلها.
- لا يُحذف الحساب عند إكمال مهمة؛ الحساب الواحد يرتبط بعدة مهام ومصادر.
- ردود محفوظة قابلة للتعديل، وإمكانية إرسال رد على الرسالة الأصلية عند الموافقة.
- حذف حساب واحد أو عدد محدد أو الكل؛ مع حماية من الحذف غير المقصود.
- تنبيه عند خطأ رمز/بيانات دخول بعد تحقق أو بلاغ يدوي، مع رد مخصص اختياري.
- AI اختياري عبر DeepSeek أو OpenRouter لاستخراج/فهم الرسائل الصعبة.
- حفظ خطة ومخاطر ونتائج ومهام وقرارات قابلة للاستخدام من أي جلسة جديدة.

## حدود لم تعتمد بعد
- المزود التقني النهائي لواتساب وملاءمة الشروط لمجموعات المستخدم.
- سياسة الاحتفاظ/المحو وأوقات النسخ الاحتياطي ودورة المفاتيح.
- آلية الدخول والتوثيق الرسمية إلى API في الإنتاج.
- اسم النطاق أو طريقة الوصول إلى New-VPS، والمنافذ، وحساب الخدمة.
- تنفيذ إرسال الردود دون تأكيد، أو الاعتماد على ذكاء اصطناعي لتمييز الرمز الخاطئ: **غير معتمد**.

## لا تختلق حالة تنفيذ
D-018: صاحب المشروع طلب التنفيذ الفعلي والنشر التجريبي التدريجي مع حماية الخدمات، ومنع الربط والإرسال الحقيقيين. Backend MVP مثبت ببيانات وهمية وقاعدة مستقلة على New-VPS؛ تشغيل API وWindows قيد التنفيذ. راجع دائمًا tracking/PROJECT_STATE.md لأحدث حالة مثبتة.

## التحديث
غيّر هذا الملف عند حدوث اعتماد جوهري جديد فقط، مع إدخال مرجع قرار في tracking/DECISION_LOG.md؛ التفاصيل اليومية مكانها SESSION_HANDOFF وCHANGELOG.

## D-018..D-024 التنفيذ التجريبي
Native WinUI3 client built/published and observed with synthetic local API + isolated remote test PostgreSQL. New-VPS API is actually deployed independently on loopback8240/database15488; mock only. Manual encrypted backup/restore verified on same host; no production retention/escrow approval. Do not merge fixture UI evidence with direct Windows-to-pilot auth acceptance (automatic token launch blocked). Exact commits/results always in tracking files.

D-025..027: optional AI code-only privacy boundary/offline contract tests, actual runtime still disabled; explicit unknown-delivery reconciliation never resends; migration byte integrity tolerates only LF/CRLF. Old pilot remained running on failed rollout; use exact final state, not attempt, as deployment truth.

Security deployment follow-up: runtime DB role separated from root-only migration owner; grants limited to DML in own pilot DB, DDL/migration writes denied by design. ops/verify-pilot.mjs checks actual privileges, restart/data preservation and unchanged other running services. Final deployed evidence follows.
