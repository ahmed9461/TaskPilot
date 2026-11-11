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
