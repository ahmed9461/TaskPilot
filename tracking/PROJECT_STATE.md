# الحالة الحالية — 2026-11-15 (Asia/Riyadh)

## API0.8.1 — VERIFIED_ISOLATED / نشر تجريبي قيد التنفيذ
أُصلح I-039: خطأ DB مؤقت قبل حفظ العمل أو بعده لا يستهلك محاولات الرسالة التالفة؛تبقى PENDING مشفرة ثم تستكمل مرة واحدة. وأُصلح I-040: انقطاع اتصال DB خامل لا يسقط عملية الخادم؛العميل التالف يُزال ويُنشأ اتصال جديد. ثُبت فشل الحالتين قبل الإصلاح ثم نجاحهما. 29Node(24TS+5JS)/66PostgreSQL بما فيها7parents/build/format/secrets/audit0 PASS؛قاعدة081_test مستقلة،لا provider أو إرسال.13مهاجرة دون تغيير. CI43651611399/sourcef0af940 نجح لكن فحص النشر رفض health0.8.0 الثابت وأعاد1bd7344/0.8.0 تلقائيًا. I-041 عولج بقراءة إصدار الحزمة واختبار source+built RED→GREEN؛CI والنشر المصحح قيد التنفيذ. API0.8.0 هو المنشور حتى دليل لاحق.
D-068/069 نافذان: لا اختبار راوي أو توسع شكلي؛التكبير مكتمل سابقًا. الأولوية لوصول الرسائل وسلامة المهام والردود والتعافي.


## Windows0.6.6 — VERIFIED ضمن النطاق الوظيفي المختبر
Source69f6757/CI43648017438 backend+Windows SUCCESS. اكتمل اختبار225% وإصلاح التفاف التنقل/البحث والتمرير في344x244 وحوار الإلغاء والخروج؛لا rebuild بعد القبول. ZIP94769232bytes/530files/SHA256b87aeb3c58ad7f1ada923f6b81bd682fd3128247f96e0856ee2e6b9bfe7d0dea؛النسخ السابقة محفوظة. تفاصيل الإخفاقات والقبول في أحدثTEST_RESULTS/evidence066.
D-068: أُلغي اختبار الراوي بطلب المالك وأُوقف،لا PASS. D-069: أولوية التشغيل السليم،لا اختبارات شكلية إضافية؛اختبار الخط منتهٍ وإعداد100% مستعاد. Popup/click غير مثبت ومنخفض الأولوية،ليس بوابة إصدار. التركيز التالي الاستقبال/الطوابير/التعافي/منع التكرار. نفس هويةWhatsApp/auth833/source5/SENT1/sendfalse/accounts4/tasks4/activeClients0/privacyRuns2. لا إرسال أو نشر جديد.

API **0.8.0 DEPLOYED / VERIFIED**؛ Windows portable **0.6.4 VERIFIED** في حالات القبول الموصوفة أدناه. مشروع شخصي لمالك واحد، ZIP غير موقع مقبول D-037. سياسة الاحتفاظ والنسيان المحلي والاستعادة المستقلة منفذة ومختبرة. **24h WAIVED_BY_OWNER D-060**؛ لا تُشغّل أو تُصنّف PASS. ملفات TEST_RESULTS/CHANGELOG/ذاكرة المشروع تحتفظ بالأدلة والأخطاء التاريخية؛ هذا الملف هو الحالة الحالية.

## متابعة Windows0.6.5 — candidate مع قبول تفاعلي جزئي
تفعيل التنبيه يحدد عنصر الإشعارات والعنوان والمحتوى معًا،ودورة التسجيل مفصولة عن OS باختبارات فشل/تفعيل متأخر. تعطيل آمن عند unsupported/elevated/رفض Windows؛normal Unregister،عدّاد فقط وصمت ومدةدقيقتين. NavigationView Auto وأزرار/عناوين ملتفة وصفوف إجراءات متدفقة وحقول قابلة للتصغير.34 offlineC# PASS (10notification+3geometry groups جديدة،28سيناريوهندسي)،WinUI build/publish0warnings/errors. Native API قبول/حفظ/محتوىعامPASS،وقياسWinUI مرتبط بالنافذة12حالةPASS؛لا تعني actualpopup/click/keyboard/OSscale. فحص مكونات منفصلة أولًا فشل وحُفظ،ثم صُحح إعداد الفحص وأعيد بنجاح.
عاد التحكم Windows للعمل2026-11-15؛ I-037 RESOLVED_TOOLING بعد فشل kernel التاريخي. على نفس candidate dfebeb1: اتصال SSH ولوحة4حسابات/4مهام،Tab/Shift+Tab/Enter/Escape فعليًا،تغيير النافذة من1233 إلى1032/822/598px ثم maximized1659px،والتنقل expanded/compact/minimal ملتفًا. أزرار الجلسات في598px ظهرت على صفين بلا قص،وحوار mock أُلغي دون حفظ. تسجيل الخروج أظهر «غير متصل» وأزال المدة/الإجراء؛client revoked1/active0،لا عملية أو نفق اختبار باقٍ. لا تغييرات إعدادات OS أو ربط/إرسال/AI.
قبل Windows إشعارًا عامًا من الواجهة،لكن popup/click NOT_OBSERVED. فحص Shell للقراءة فقط أعطى HRESULT0/state2 BUSY؛قرينة حالية محتملة لحجب العرض،وليست سببًا مثبتًا للفشل التاريخي أو تشخيصًا كاملاً لسياسة Windows App SDK. لا تعطيل صريح في قيم banner التي فُحصت للتطبيق؛لم تُغيّر إعدادات النظام. core session/group/filter ما زالت جزئية. التفاصيل والأدلة المنقحة في TEST_RESULTS وtracking/evidence/windows-0.6.5-native-20261115.json.

Candidate0.6.5 exact source `dfebeb1c03955adb36ef3b5f032d147ed039972c`،34offlineC#/12attachedWinUI/nativeSDK generic receipt PASS تاريخيًا،وقبول تفاعلي جزئي كما أعلاه. ZIPcandidate 94770110bytes/532files/SHA256`17b3363a7fb8ebefd6f4279a2ff857acee02d83f55b4f827528226c2d0e3fae8` أُعيد التحقق منه الآن؛لا rebuild بعد القبول.0.6.4native-testedمحفوظ ولا ترقية شاملة قبل إغلاق الحدود الباقية. CI للشيفرة: dfebeb1/43633370508 و8585562/43633806414 كلاهما backend+Windows SUCCESS؛9c/43632489470 SUCCESS أيضًا.

## المصادر والتشغيل المحمي
- Branch feat/mvp-foundation. API ونواة Windows المنشورة/المختبرة: `1bd734426b18d6cebc80b56618a6afaf8afd4623`. قبول الخصوصية: `5d9444032d0acee75b45b71d537214c7970ca557`. أداة النسخ والاستعادة المثبتة: `b876096a5364c254c6198a0b190a138b78fc8c6a`. CI43546799203/43549621045/43549978803 backend+windows SUCCESS. commits التتبع لا تغيّر هوية البنية المنشورة.
- taskpilot.service/user فقط، API127.0.0.1:8240، PostgreSQL17 taskpilot-db/loopback15488، مستخدم runtime محدود DML. **13 immutable checksum migrations001..013** في الإنتاج وDB الاختبارات؛ ممنوع تعديلها/تجاوز checksums أو إعادة ضبط DB قديمة.
- connection=true/sending=false؛ نفس الهوية الشخصية CONNECTED/noQR،833auth AEAD-valid/key2،مجموعة حقيقية محددة واحدة/5مصادر(4processed/1ignored)/3حسابات ومهام فعلية/SENT1/0unsettled. إجمالي4حسابات/4مهام مع بيانات العرض بعد تنظيف الحساب الوهمي. لم تُرسل رسائل WhatsApp أو طلبات AI جديدة بهذه المرحلة.
- provider stdout/stderr=/dev/null/core0. لا QR/JID/هاتف/مفاتيح/auth/raw logs/صور شخصية/نسخ احتياطية في Git أو outputs. خدمات VPS الأخرى لم تُعدّل. فاحص التشغيل الحالي PASS في عينة محدودة، external set delta0added/0removed؛ انحراف I-010 التاريخي محفوظ وليس إثبات استمرارية كل المضيف.

## سياسة الاحتفاظ ونسيان الجلسة — منشور ومختبر
الاحتفاظ يدوي: معاينة ثابتة1000/فئة، موافقة5دقائق لمرة واحدة، SSH reauth، عبارة CLEAN RETENTION، إعادة تحقق ذري وسياسة versioned. القيم30يومًا للمراجعة الخام→IGNORED/rawNULL،14للوارد ERROR→DROPPED/rawNULL،1للوصول المنتهي،90للإشعارات المقروءة،7لتشخيص الاستقبال. لا حذف تلقائي للحسابات/المهام/الاعتماد/التاريخ/التدقيق/unread/SENT/usage/auth/backups. النسخ الأقدم تبقى حتى تقاعد صريح من المالك.
النسيان لجلسة Baileys متوقفة فقط مع process lease؛ يرفض active/requested/SENDING/UNKNOWN_DELIVERY. معاينة+FORGET UUID+reauth تزيل auth/quote/queued raw، تلغي APPROVED، توقف المجموعات وتغيّر epoch؛ تحفظ تاريخ العمل وسجل FORGOTTEN دائم يمنع reconnect/group-enable/late auth. الربط الجديد يحتاج UUID جديدًا؛ لا فصل تلقائي من الهاتف ولا محو للنسخ السابقة.
Native0.6.4→API0.8: حفظ القيم، معاينة وتنفيذ تنظيف review1/failedIngress1/expiredClients15 وسجل العملية؛ ثم نسيان جلسة وهمية متوقفة auth1/quote1/ingress1/approved1. بطاقة منسية للقراءة فقط بلا reconnect، وتحقق الخادم من حفظ حسابها/مهمتها/مصدرين وإزالة الحقول الحساسة وإلغاء الرد. الحساب الوهمي نُظف بعد التحقق عبر API المحدود؛ الجلسة المنسية/سجل العملية دليل تدقيق. زر نسيان الهوية الحقيقية المتصلة معطّل ولم يُستخدم. التطبيق أُغلق ولا نافذة اختبار باقية.

## الاستعادة والتدوير والنسخ
تدوير0.7 السابق ما زال key2:839حقلاً(اعتماد1/مراجعة1/اقتباس4/auth833 وقت التدوير)،رفض API/reauth/عملاء قدامى،resume دون تدوير جديد،نفس هوية WhatsApp. مفاتيح مزود AI/SSH/DB والهوية لم تُدوّر. journal/root600 والنسخ/المفاتيح السابقة محفوظة؛ لا تشغّل apply لمجرد الفحص.
E:\TaskPilot-Backups خاص بالمالك+SYSTEM وخارج Git/outputs. ثلاثة مستلمين: Windows RSA3072/DPAPI،root-VPS RSA4096،ومالك RSA4096 مشفرscrypt+AESGCM برمز256bit منفصل في D:\TaskPilot-Recovery-Key. لا يُطبع الرمز أو يدخل حزمة/cloud/Git.8نسخ قديمة أضيفت لها owner envelopes دون تغيير dump. المهمة اليومية تستخدم public key ولا تحتاج الرمز.
استعادة قديمة11مهاجرة305675bytes وجديدة13مهاجرة323493bytes PASS **DPAPI0/SSH0**؛ كل حقول AEAD سليمة/auth833/replay0/provider0/outbound0. الجديدة4حسابات/4مهام/5مصادر/SENT1/AI2/policy1/privacyRuns2/forgottenSynthetic1/forgottenAuth0. نفس الجديدة normal DPAPI restore PASS. رفض actual wrong-code/tamper عند decrypt قبل الحاوية؛ خطأ launcher الأول عند acl حُفظ وصُحح I-034.
الحزمة المشفرة فقط648509bytes/13ملفًا رُفعت إلى مخزن Drive خاص sharedfalse/مالك واحد؛ تنزيلها أعطى SHA256 `410c0f257a31f0fb8b2ebd82fe62d50f09211b51acbba535872eaa47f359a949` مطابقًا، ثم استعيدت بأدواتها المستخرجة في مجلد جديد دون DPAPI/SSH. أداة build-independent-kit قابلة للتكرار وتتحقق من بصمة كل إدخال؛ upload يبقى صريحًا، ليست هناك مزامنة cloud يومية تلقائية.
الأداة المثبتة b876096 hash-matched/dependencies before main/previous runner retained. تشغيل TaskPilot-Offhost-Daily يدويًا06:08 Asia/Riyadh LastTaskResult0؛ أحدث323679byte snapshot SHA256 `d9fb8737c8a032888e0e68f7dc6c0575954d974904f03a61d6e411d43d9d8ce4` بغلاف المالك استعيد مستقلًا أيضًا PASS13مهاجرة/auth833/privacy invariants/DPAPI0/SSH0. التشغيل الطبيعي السابق03:15 مثبت تاريخيًا؛ التحديث اختُبر يدويًا والموعد التالي03:15 اليوم التالي. يلزم لابتوب يعمل/دخول المالك/SSH موثوق/شبكة؛ ليس هدفًا دائمًا مستقلاً عن اللابتوب.
كل حاويات الاستعادة network=none/noports/موارد محدودة وتمت إزالتها؛Docker Desktop أعيد إلى وضعه المتوقف ولا عمليات التطبيق/محركه باقية. **الاستقلال المثبت تشفيري** عند بقاء الحزمة والرمز؛ حيازة رمز خارج الجهاز/مستخدم أو جهاز جديد/فقد مادي كامل/تحويل إنتاج بعد كارثة NOT_TESTED. يلزم أن يحفظ المالك نسخة رمز خارج اللابتوب؛ لا نستنتج ذلك من وجود الملف المحلي. راجع docs/15_INDEPENDENT_RECOVERY.md.

## فحص أمني محدود على API0.8 — VERIFIED
54طلبًا من Windows عبرSSH: رفض anonymous/invalid token/cookie-only،و8واجهات حساسة دون reauth أوبمنحة مزورة؛حدود query/body413،عدم تفسيرSQL/wildcards،وحقول عرض منقحة وno-store/nosniff/noCookie/noCORS. حالة العمل والطوابير والجلسة الحقيقية ثابتة؛العميل المؤقت أُلغي ثم رُفض وتوقفنفقه. لم تُنشأمنحreauth أومعاينات أوبيانات عمل؛فقطauditبدء/إلغاءعميل الاختبار. هذا فحص bounded وليسpenetrationكاملًا أوMFA/enterprise/DoS.

## الأدلة السابقة وحدود القبول
- فقد append أثناء offline عولج0.5.3 وتم إثبات التعافي بعد45s outage. سبب أول رسالة مفقودة pre0.5.2 ما زال UNCONFIRMED؛ لا يمكن استنتاجه من الإصلاح اللاحق.
- Live observer3600s/239عينات/0فشل أو فصل أو تغيرPID أو gaps؛ هدوء socket، وليس24h/capacity/ban/reboot. Isolated1800s/874unique+874replay/8accounts/16tasks/8valid credentials/0errors-provider-outbound. أول070 harness FAIL محفوظ؛071 retry PASS.
- Own90s cgroup network fault:19عينات/0API failure/PID change،فصل عند65s/reconnect2s بعد الإزالة/نفس الهوية والبيانات. لا رسالة مؤجلة جديدة في ذلك الاختبار؛ watchdog125s configured/operator-kill path NOT_EXERCISED. لا reboot أو global firewall.
- قبول Windows السابق: صفحات53حسابًا،source A→B/قالب B/معاينة ورد mock،flags وأدلة عربية،رفض عبارة حذف خاطئة/حذف مهمة محددة/زوج محدد/إلغاء global preview،مراجعة وإخفاء30s/قالب multiline،انقطاع SSH/مسودة/logout/navigation. Toast API accepted؛ ظهور popup/click NOT_OBSERVED. مصفوفة الوصول/التكبير/config كاملة ما زالت جزئية.
- DeepSeek يدوي/task-codes فقط/reauth/caps/idempotency،2طلبات ناجحة سابقة دون طلب جديد. التقدير/الحجز لا يساويان فاتورة فعلية،null آمن لا يثبت دقة تصنيف. OpenRouter live اختياري غير مختبر.

## الاختبارات والتسليم
**24 Node(19TS+5JS)/build/format/secrets،62 isolatedPG incl6parents،34offlineC# PASS** وCI exact-code أعلاه SUCCESS. أُعيدت34 Windows→SSH→API0.8 checks الآن PASS: ready/auth/قواعد العمل/مراجعة/رد mock/أرشفة/flags/export/حذف محدد/إلغاء token/قطع tunnel/reconnect؛نُظف fixture المستقل ولا إرسال حقيقي. قبول الواجهة native منفصل وموضح أعلاه. WinUI0.6.4 build/publish0warnings/errors ثم native؛ لم يُعَد بناؤه بعد القبول.
ZIP0.6.4 في task outputs:94761294bytes/532files/CRC+resources+runtime-data guard PASS/SHA256 `0b6a78695c15c5bcadd7e4be4785052dcd4fc60195086f91be893383923eab4b`. ProductVersion0.6.4+1bd7344. النسخ السابقة محفوظة؛ لا مفاتيح/نسخ DB/صور في ZIP. Installer/updater اختياريان والتوقيع ليس شرطًا شخصيًا.

## المتبقي حسب الأولوية
1. الاستقبال المتين: أخطاء DB المؤقتة، استكمال الوارد بعد الانقطاع، منع التكرار وحماية الطوابير(I-039 جارٍ).
2. استقرار الردود والاستعادة والنسخ الاحتياطي؛ اختبارات restart محددة لخدمةTaskPilot فقط،لا reboot مشترك ولا24h.
3. سير عمل Windows الوظيفي مع الخادم،ثم وجهة نسخ دائمة وحيازة رمز الاستعادة خارج اللابتوب.
اختبار الراوي مستبعد D-068؛اختبار الخط مكتمل ولا توسع شكلي D-069. إشعار OS غير مثبت ومنخفض الأولوية؛التنبيهات داخل التطبيق وعقود المزامنة تبقى وظيفية.


Queued native activation now carries its opt-in generation into DispatcherQueue; dispatch rechecks current generation/enabled state. Deferred old click cannot navigate after opt-out/re-enable(10notification checks,34offlineC# PASS). Final candidate source/evidence recorded in latest TEST_RESULTS; actual OS click still unobserved.
