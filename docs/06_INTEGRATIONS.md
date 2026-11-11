# تكاملات واتساب والذكاء الاصطناعي

## واتساب — قرار واجهة مجردة
يُنشأ عقد WhatsAppTransport: connect / disconnect / listGroups / subscribeMessages / replyToMessage / getSessionHealth. يحظر استيراد مكتبة واتساب مباشرة خارج adapter.

**خيار تجريبي قيد التقييم:** Baileys، مكتبة TypeScript مبنية على WhatsApp Web WebSocket ولا تحتاج تشغيل متصفح، وتدعم مجموعات ورسائل ومعلومات جلسات. هي **غير رسمية** وقد تتغير واجهتها أو تتسبب أتمتة مخالفة لشروط WhatsApp في تعليق رقم. لا نعد بالثبات أو قبول الاستخدام لدى المزود.
- المصدر: https://github.com/WhiskeySockets/Baileys
- الوثائق: https://baileys.wiki/
- ملحوظة: إصدارات Baileys الرئيسية قد تتضمن تغييرات كاسرة. تتطلب ترقية واعتمادًا واختبارًا في بيئة اختبار.
- لا تستخدم تخزين جلسات المثال متعدد الملفات في الإنتاج دون تقييم؛ يجب تصميم حالة مصادقة مشفرة ومستقرة ودعم الانقطاع وإعادة التزامن.

**خيار رسمي:** WhatsApp Business Platform، ولكن ملاءمته لمجموعات واتساب الموجودة ليست مفترضة. يجب التحقق من صلاحيات وميزات وإتاحة Meta الحالية قبل اختياره. المصدر: https://developers.facebook.com/docs/whatsapp/

## قواعد استخدام الجلسات
- رقم واحد مبدئيًا؛ تدعم الجداول والخدمات تعدد الأرقام منذ التصميم.
- عزل session_id في الرسائل، المجموعات، التكليفات، وقائمة الانتظار.
- عند logout/ban/disconnect: تتوقف عمليات إرسال تلك الجلسة فقط؛ لا نحذف البيانات التاريخية تلقائيًا.
- إعادة اتصال تدريجية مع حد محاولات ومراقبة وتدخل المستخدم عند اللزوم.
- لا إرسال جماعي غير مرغوب فيه؛ الردود تقتصر على الرسائل المعينة ومع موافقة مالك النظام.

## مزودات AI
- OpenRouter: https://openrouter.ai/docs
- DeepSeek: https://api-docs.deepseek.com/
- مزودات النماذج المندرجة عبر OpenRouter قد تشمل نماذج OpenAI عند إتاحتها. عرض الأسعار والقدرات واسم النموذج من المزود عند الطلب وتاريخ التحقق؛ لا نثبت أرقامًا غير محدثة.
- AI Provider interface: listModels, analyzeMessageRedacted, health, estimatedCost, usageTracking.
- مخرجات الاستخراج المنظمة: fields, confidence, missing_fields, reasoning_summary_without_secrets, source_provenance.
- لا يفعل AI الإرسال أو الحذف أو تسجيل الدخول للمواقع؛ الموافقات خارج AI.

## تنفيذ adapters — 2026-11-11
`services/api/src/ai.ts` implements separate DeepSeek/OpenRouter adapters: listModels, health, structured task suggestion, usage token fields and explicitly unknown estimatedCost. It is not wired into ingest/API/UI and no production key/request was used. Activation requires both enabled and outboundApproved; main service does not instantiate it. This preserves local rules/review if AI is unavailable.

Privacy boundary: `projectTaskCodes` projects raw text into administrator-authored task codes. Only allowlisted codes cross the adapter boundary; no raw message, account name, username, password or code value is accepted by its strict input schema. Unknown/unstructured material causes abstention. The adapter always returns needsReview=true, validates that output is one of the candidates, suppresses provider free-form reasoning, limits input/output/time and forbids redirects. This intentionally supports task suggestions only; unrestricted account extraction and pricing/persistent usage accounting remain TODO.

Offline mocked-fetch tests verify default/approval gate, both exact provider endpoints, absence of sensitive canaries in payload, invalid output rejection, abstention and sanitized transport failure. These are contract tests, not live provider acceptance. Reviewed primary contracts: https://api-docs.deepseek.com/guides/json_mode/ and https://openrouter.ai/docs/api_reference/overview (2026-11-11).
