# تسليم قابل للاستئناف — 2026-11-15

## D086/D087 استكمال نشط — اقرأ هذا أولًا
API087/source3919a0b منشور بعدbackup310369bytes واستعادته المعزولة13migrations/0business/0SENDING، ثم014schema. CI43752697349 Backend+Windows SUCCESS. الآنauth834 صالح ونفسالهوية،groups2/tasktypes2/sourceIGNORED1/0accounts/tasks،42خدمةأخرى unchangedعندcutover،COMMITTEDfalse/env+journalمطابقان. المالكبدأإعدادمجموعاته؛لاcleanup أوoldone-group/zero-countverifier. سببالرسالةالحاليةlabel-onlyparser مؤكد؛النصالمتجاهلأزيل ولايسترجعمنhash؛I025القديممستقل.

AFenabledtrue رسميًا عبرcurrentclient+reauth/المزودdeepseek-flash/الحدود20requests10000tokensبدونتغيير؛وصفحقول/مواضعفقطدونقيم،معreview-only.47Node/113PG PASS(الـPGقبلإضافةopaque-token الضيقة؛CIexact3919أعادالكاملSUCCESS). Windows0613cache/stagedswap/47offline/build PASS،native/Desktoppending. عملالواجهةغيرالمحفوظكانعلىنفسcheckout؛تحققgitقبلالتعديل. SandboxTaskPilot-native-087/8241 علىDBtaskpilot_student_native_087_test وهمي تمامًا،لاsocket/provider،helperخارجGit /opt/taskpilot/native-087-sandbox.mjs؛أوقف وحدته ونفقه فقط بعدnative،واحتفظبالتطبيقالشخصي النهائي.

## الحالة المعتمدة
اكتملت أولويات D-085 ضمن النطاق المختبر: أمان الإرسال، تحديث حزمة الاستعادة، ثم التحكم الحي. API0.8.6/source8909bae منشور، وWindows0.6.12/source5d6574b مثبت واختصار سطح المكتب إليه. CI43727815777 و43732126175: Backend وWindows SUCCESS. الاختبارات:38Node/103PG/35offlineC# وبناء ونشرWinUI PASS. قبول سير عمل المالك الفعلي لاحقًا؛ سيضبط المجموعات والقواعد بنفسه، فلا تعاود سؤاله الآن أو تضف fixtures إلى المساحة الشخصية.

التطبيق0612 مفتوح متصل على «المجموعات» دون حوار؛ نافذة1313598 وقت الفحص وCUA binding final0612App. احتفظ بعميله ونفقه، والجلسة المؤقتة30دقيقة بطبيعتها. نوافذ0610 و0611 ونافذة0612 الزائدة أُغلقت بعد التأكد من عدم وجود مسودات. Desktop TaskPilot.lnk بلاarguments إلىversions/0.6.12-5d6574b. ملفات التثبيت530 مطابقة للمصدر المنشور؛ ZIP97543566بايت/SHA256 e480a54f9af765d5bb93df7432e7104203d58f90991d9f8c9b8db812c485bf06؛ لاrebuild بعدnative والنسخ السابقة محفوظة.

## التشغيل والحماية
/opt/taskpilot/current→releases/8909bae7aee0ec979b0695292465d51aeac26093؛ taskpilot.service فقط/8240، وPGloopback15488. المتوقعAPI086/protocol2/COMMITTED/readytrue/sendfalse. نفس هويةWhatsApp، وauth833AEAD-valid، وجلسةrequested/connected1 ومجموعةmonitored1.0accounts/tasks/sources/replies/templates/mock، نوع عام1 ومجموعةالاختبار/work/2026-11. إعداد «رقمي73» الموقوف غير المصنف والتاريخ وforgotten tombstone وprivacyRuns2 وactualAIusage2 وaudit وingressdedupe محفوظة.

استخدم ops/prepare-personal-workspace.mjs --verify وcheck-whatsapp-state.mjs --expect-connection للقراءة فقط. لا تعاودcleanup أوprivacy080 ذي العدادات القديمة، ولا تشغلfixtures القديمة أوmock=true على المساحة الشخصية. احفظ أي عمل جديد للمالك ولا تفرغ الأعداد لإرضاء الاختبار.42خدمة أخرى لم تتغير عندcutover فقط؛ لا تمسها أو تستعد بوت الفيديو الذي حُذف بأمر المالك.

## أمان القرار
ops/sending-policy.mjs أمرroot-only بمسارات ثابتة وJSONstdin، معcurrentclient وgrantمفرد وعبارة ومعاينة60ثانية وsnapshot وقفل إداري8240008 مشترك مع التدوير. /etc/taskpilot/pilot.env وsending-state.json root:taskpilot0640 بكتابةroot فقط، وpreviews تحتroot0700/0600. FsyncPENDING قبلenv ثمauthorization audit ثمCOMMITTED مطابق؛ كلgate يقرأ الجورنال. PENDING/INVALID يمنعان الإرسال حتى بعدrestart. بعدCOMMITTED قد يضيعACK فقط؛ اقرأ الحالة ولا تكررmutation/send. UI يعرض استعادة التعطيل الصريحة؛ لاwatchdog أوschema أوrootservice جديد.

bootstrap initialize-sending-policy.mjs يرفضenv=true أوjournal سابقًا. عند استعادة خادم جديد ابدأfalse. عندdowngrade085 تحققenv=false قبلstart؛ الكود القديم لا يعرف الجورنال. لاoverwriteDB تاريخية فوق عمل المالك.

اختباراتSIGKILL عند4نقاط وmain فعلي معpending restart وفشلDB/ملف القرار PASS في العزل. Native0611 ثم0612 نفذاenable/disable فعليين بنفسPID والهوية/auth833، دونreconnect أوmessage أوbusiness/jobs. I050:0611 أبقى شريطًا قديمًا بجانب بطاقة صحيحة؛0612 أصلحه وأثبت المطابقة. أولoffclick0612 حجبته نافذة أخرى؛root false-only reset ثمإلغاء المعاينة، ودورةnative0612 جديدة كاملة نجحت. النهائيCOMMITTEDfalse وenvمطابق وpreviews0. كل رد يحتاج معاينة وإقرارًا خاصًا؛ UNKNOWN_DELIVERY لا يعاد آليًا.

## الاستعادة الحالية
الحزمة E:\TaskPilot-Backups\TaskPilot-Independent-Recovery-20261115151520802.zip:19012089bytes/5005files/SHA256 5205c377085ddef50ed6b378e3d8ac2c555be32ae79582b0e15ecf09d67840f5. Snapshot offhost-20261115151128991.tpg:306804bytes/SHA256 fbcc69cd0150a970ea5013e8d619cf9e32c7baafb70ff34881586e65947dc996. تتضمنAPI086publicapp وrootoperators، دونقرار تفعيل أورمز الاستعادة أوDPAPI/custodian/plaintextkeys. نسخةDrive باسم TaskPilot-Independent-Recovery-API086-20261115.zip في نفس المجلد الخاصowner-only/unshared؛ القديمة محفوظة وreadbackhash مطابق.

Freshlocalextract في E:\TaskPilot-Recovery-Extract086 ثمfreshcloudreadbackextract في E:\TaskPilot-Recovery-Cloud086: كلاهما --recover-independent --verify-app PASS. النتائج0accounts/tasks/13migrations/auth833/identityciphertextunchanged/DPAPI0/SSH0/originalAPIkeys0/provider0/AI0/external0/schemaWrites0؛ HTTPauth/maskedreads/fakeingress/dedupe/completion0autoReply/oneMockReply/replay0extra. مرر مسار ملف رمز المالك الخاص للأداة المعتمدة فقط؛ تقرأه داخليًا لفك التشفير، ولا تطبع أو تنسخ قيمته إلىkit/Git/المحادثة. نفس مستخدمWindows، وليسfreshmachine أوcutover فعليًا. كل حاويات التجربة أزيلت، وDockerDesktop كانSTOPPED وأعيدSTOPPED.

## المتبقي والحدود
OWNER_SETUP_LATER ثمworkflow المالك. multi-live وOpenRouterlive ومصفوفات الجلسات والشبكة والأمان الأوسع OPEN. D080 يؤجل جهازWindows جديدًا وخادمًا بديلًا؛ D076 يبقيdaily03:15/manualDrive؛ D060 يتجاوز24h وD068 يستبعدالراوي وD069 يؤجل الشكليات. سبب أول رسالة مفقودةUNCONFIRMED؛ لا تختلق سببًا أو تعاود إرسالًا مجهولًا.

راجع PROJECT_STATE وTEST_RESULTS وISSUE_REGISTER وevidence/recovery-refresh-086-20261115.json وsending-control-086-windows0612-20261115.json للأدلة الدقيقة والفشل التاريخي. لا ادعاء جاهزية شاملة.
