# الحالة الحالية — 2026-11-15 (Asia/Riyadh)

## استكمال D-086/D-087 — IN_PROGRESS
تحديث النشر: API087/source3919a0b منشور وCI43752697349 Backend+Windows SUCCESS. نسخةpre087 المشفرة310369بايت استعيدت معزولة13migrations/0accounts/tasks/0SENDING قبلmigration014. بيانات المالك محفوظة: مجموعتان/نوعان/مصدرIGNORED1،auth834AEAD-valid ونفسالهوية،42خدمةأخرىunchangedعندcutover،env/journalدونتغيير وCOMMITTEDfalse. فُعّلautomaticFallback بطلبالمالك عبرجلسةSSH/reauthعادية، معdeepseek-flash وحدود20/10000نفسها؛لاbusinessfixtures أوWhatsAppmessages. Windows0613native/Desktop مازالاpending، والنصأدناهعن086checkpointتاريخي.
المالك أضاف مجموعة فعلية ثانية وأرسل حسابًا دون تسميات. فحص086 أثبت وصول ACCEPTED_TEXT/notify ثمingressDONE، لكن المحلل القديم صنفهاIGNORED وأزال النص؛0accounts/tasks. السبب الحالي مؤكد، وهو مختلف عنI025 التاريخي. **لا تشغّل cleanup أوverifier القديم ذي مجموعة واحدة/أعداد صفرية لإزالة عمل المالك.**

Candidate087: استخراجS2 وترتيبات الحقول والمواد/الاعتمادات ومراجعة الحالات الناقصة، وAI تلقائي اختياري بوصف تركيبي دون قيم سرية.46Node/113PG معزولة PASS. CandidateWindows0613: cache/تحديث هادئ وحماية المسودة وملء المراجعة؛47offline/build PASS، native/deploy/Desktop pending. المنشور أدناه086/0612 ما زال المعتمد عند هذا checkpoint؛ إعداد المالك بدأ فعلًا ولم يعد كل الإعداد مؤجلًا. النص السابق المحذوف لا يمكن استنتاجه من البصمة.

## المنشور والمثبت الآن
- API **0.8.6** على New-VPS، source `8909bae7aee0ec979b0695292465d51aeac26093`، loopback8240. CI43727815777: Backend وWindows SUCCESS.
- Windows **0.6.12**، source `5d6574b2bcf373c8b48d6f3bd7b502c2db291485`، مثبت لكل مستخدم، واختصار `D:\Desktop\TaskPilot.lnk` يشير إليه. CI43732126175: Backend وWindows SUCCESS. التطبيق مفتوح متصل على «المجموعات» دون حوار؛ احتفظ بعميله ونفقه، والجلسة المؤقتة تنتهي كالمعتاد بعد30دقيقة.
- واتساب بنفس الهوية و833 سجل مصادقة مشفر صالح؛ اتصال=true، إرسال=false، mock=false. مساحة العمل:0حسابات/0تكليفات/0مصادر/0ردود/0قوالب، ومجموعة فعلية واحدة «مجموعة الاختبار» ونوع «متابعة عامة» واحد. لم تُضف مجموعات عمل أو fixtures أو رسائل/طلباتAI في هذه الجولة.
- المالك سيضبط المجموعات والمهام والقواعد والقوالب لاحقًا بنفسه. هذا قبول محدود للوظائف المختبرة، وليس قبول سير عمله الفعلي أو إعلان اكتمال كل المشروع.

## الأولويات D-085 — مكتملة ضمن نطاق الاختبار
1. **أمان تغيير الإرسال DEPLOYED / VERIFIED:** سجل root دائم PENDING قبل تعديلenv ثم authorization audit ثم COMMITTED مطابق لبصمةenv. بوابة النقل تقرأ القرار مباشرة؛ الحالة المعلقة/غير الصالحة تمنع الإرسال حتى بعد restart. اختبارات SIGKILL عند4نقاط وmain فعلي يعاد من env=true/PENDING وفشلDB/ملف القرار PASS في العزل. بعدCOMMITTED قد يبقى القرار معتمدًا إذا ضاع الرد؛ اقرأ الحالة ولا تعاود العملية تلقائيًا.
2. **حزمة الاستعادة المحدّثة VERIFIED:** snapshot نظيف306804بايت/SHA256 `fbcc69cd0150a970ea5013e8d619cf9e32c7baafb70ff34881586e65947dc996`. حزمةAPI086 وأدواتroot العامة19012089بايت/5005ملفات/SHA256 `5205c377085ddef50ed6b378e3d8ac2c555be32ae79582b0e15ecf09d67840f5`؛ كل بصمات الملفات مطابقة، دون رمز الاستعادة أو مفاتيح صريحة. استعادة منZIP محلي مفكوك حديثًا ثم تنزيل النسخة الخاصة من نفسGoogleDrive ومطابقة بصمتها واستعادتها من مجلد مستقل PASS. كلاهما0حسابات/0مهام/13migrations/auth833صالح، وAPI086/HTTP وworkflow وهمي كامل، وDPAPI0/SSH0/provider0/AI0/externalMessages0. نفس مستخدمWindows؛ جهاز جديد وcutover فعلي ما زالا مؤجلين D-080.
3. **التحكم الحي VERIFIED_BOUNDED:** Windows0611 ثم0612 نفذا تفعيلًا وإيقافًا فعليين عبرSSH/root. نفس PID وهويةواتساب/auth833، دون reconnect أو business writes أو رسائل.0611 كشف I-050: بطاقة الإعدادات صحيحة لكن الشريط احتفظ بحالة قديمة؛0612 أصلحه وأثبت native تطابقهما بعد الحفظ. في أول محاولة إيقاف0612 اعترضت نافذة أخرى النقر، فأعيدfalse بالأداة المعتمدة وأُلغيت المعاينة؛ دورة جديدة كاملة0612 enable→disable نجحت. الحالة النهائية COMMITTED/ready/false وenv مطابق للأصل، ومعايناتroot0.

## الفجوات الثلاث D-083
| الفجوة | القرينة | الحد |
|---|---|---|
| F-083a تعديل القاعدة القائمة ذريًا بكل حقولها | API وnative069 ضدsandbox085: save/reopen/invalid draft/cancel، same rule/version guards | لم نغيّر قواعد المالك؛0612 يحمل التنفيذ، دون إعادة كل مصفوفة الكتابة |
| F-083b معاينة رد مع إرسال معطل | API يرفض الاعتماد403 دونjob، وnative069 قرأ النص والوجهة دونزيادةjobs | مصادر وmetadata وهمية، دونprovider |
| F-083c إدارة المنتظر وإعداد الإرسال | إلغاءAPPROVED فقط وسباق العامل/replay وSSH/عبارة/reauth/snapshot/lock؛ actual0612 enable/disable وقرار دائم | كل رد يحتاج إقرارًا مستقلًا؛ لا اختبار رسالة جديدة ولا workflow مالك |

## التحقق والنشر
38Node/103PG معزولة/35offlineC# PASS؛ WinUI0612 build/publish0warnings/errors وportable guard PASS. HostedCI للـAPI086 ولمصدرWindows0612 كامل SUCCESS. الأدلة والفشل التاريخي محفوظان في TEST_RESULTS وISSUE_REGISTER؛ لا تساوي الاختبارات الوهمية قبولًا حيًا.

نشر086 بعد نسخة مشفرةpre086306750بايت واستعادتها المعزولة:0حسابات/0مهام/13migrations/0SENDING.42خدمة أخرى لم تتغير PID/invocation/state **عندcutover**؛ لا ادعاء مراقبة كل المضيف باستمرار. لاmigration أو rootwatchdog أو خدمة إضافية. env والجورنالroot:taskpilot0640 بكتابةroot فقط، previewsroot0700/0600. الرجوع إلى085 يتطلب التحقق منenv=false لأن الكود القديم لا يعرف الجورنال؛ لا تستعدDB تاريخية فوق عمل المالك.

حزمةWindows0612: `TaskPilot-Windows-x64-0.6.12-personal-5d6574b.zip`،97543566بايت/530ملفًا/SHA256 `e480a54f9af765d5bb93df7432e7104203d58f90991d9f8c9b8db812c485bf06`. كل ملفات التثبيت مطابقة وProductVersion0612+5d6574b؛ لاrebuild بعدnative. الاختصار بلاarguments والقديم محفوظ، والنسخ السابقة باقية للرجوع. نافذة الاختبار الزائدة أُغلقت.

تبقى استراتيجيةD-076: نسخWindows يومي03:15 يعتمد تشغيل اللابتوب وGoogleDrive يدوي؛ لاوجهة/جدولة جديدة. آخر تشغيلطبيعي03:15:01/result0 وموعدالغد03:15، دونادعاء اختباراستعادة تلكالنسخةبالذات. حزمةDrive الجديدة خاصةowner-only وغيرمشاركة، والقديمةمحفوظة. DockerDesktop كانSTOPPED وأُعيدSTOPPED بعداستعادتي الحزمة؛ كلحاوياتالتجربةأزيلت.

## المتبقي والحدود
- OWNER_SETUP_LATER ثم قبول دورة عمل المالك على مجموعاته المختارة. الإرسال متروك معطلًا، وتفعيله للاستخدام اليومي اختيار لاحق منه.
- multi-live، OpenRouter الحي، ومصفوفات الجلسات/الشبكة/الأمان الأوسع OPEN عند الحاجة؛ ليست PASS. سبب أول رسالة مفقودة قديمًا UNCONFIRMED، ولا ينسب إصلاحالجورنال أوparseسببًالها.
- جهازWindows جديد وخادم بديل DEFERRED_BY_OWNER D-080؛24ساعة WAIVED D-060؛ الراوي مستبعدD-068 والتوسع الشكلي/OSpopupclick مؤجل. لاclosed-app push.
- وجود ملف recovery محلي لا يثبت الحيازة المستقلة للرمز؛ لا تقرأ قيمته أو تطبعها أو ترفعها. كلUNKNOWN_DELIVERY يحتاج حسمًا ولا يعاد آليًا.

دليل الاستخدام: docs/16_PERSONAL_USE.md. الأدلة: tracking/evidence/recovery-refresh-086-20261115.json وsending-control-086-windows0612-20261115.json.
