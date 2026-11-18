# الحالة الحالية — 2026-11-18 (Asia/Riyadh)

## D-092 — 0.9.0 deployed and verified on Windows

- API `7466881` is active on New-VPS with schema 15. The desktop shortcut launches Windows `cd557b4`. Verified the dashboard's persistent Tailscale connection and the new chat workspace against the live service. [Deployment evidence](evidence/workspace-090-deployment-20261118.json)
- Windows has immediate section selection, a wider personal-assistant chat with compact history, bottom composer and no routine connection strip, a clearer account data view, and one-group Markdown export. Model choice, account reference and archive/restore proposal use existing authorization and AI limits.
- API feature exact hosted run 44327965985 passed Windows and Backend, with 54 unit and 139 isolated PostgreSQL tests. Final WinUI package verified at 1233×696; earlier candidate exercised timed reveal, export file and fake OpenRouter selection. See TEST_RESULTS for verification boundaries.

## User handbook delivered — 2026-11-17 (documentation only)
Added docs/18_USER_HANDBOOK_AR.md: standalone Arabic handbook for Windows0.8.0/API0.8.9,21numbered sections, clickable contents and return links. Covers setup/Tailscale/WhatsApp/groups/rules/message formats/review/accounts/tasks/replies/sending/secretary/AI/notifications/export/privacy/recovery/troubleshooting/daily use, with synthetic examples and explicit current limits. Matched current UI labels and code paths; no app/server behavior changed. Desktop copy TaskPilot-دليل-الاستخدام.md is hash-identical. Structure check:22unique anchors/42internal links/0missing targets/14balanced fence markers/703lines/57134bytes. Runtime tests not rerun for prose-only changes; no provider request, WhatsApp action, live-data mutation, deployment or profile change. Current code/artifact acceptance remains D091 below.

## D-091 CURRENT / DEPLOYED / VERIFIED_BOUNDED — 2026-11-17
API0.8.9/source d740d03f8a50e71f2f4073262c98126cb0210f8c is current on New-VPS, schema15. Windows0.8.0/source6beb13af4b8232cab4c1904f533de3b0cce6d60a is installed at per-user versions/0.8.0-6beb13a and Desktop updated. Exact API CI43961376805 and Windows CI43956269591: Backend+Windows SUCCESS;53Node/136isolatedPG/52offlineC# checks-groups/build/publish/portable PASS.

Secretary supports account lookup/ambiguity selection, source groups/tasks/flags, Riyadh intake separating received/repeated vs newly created accounts, briefing/priorities/old-open work, reviews/replies and shared AI usage. Model receives fixed vocabulary/enums/opaque refs/aggregate counts only; no names/usernames/passwords/group titles/raw bodies/SQL. Factual reports reread current DB rows and link records. Persist safe plans/UUID refs/hashes90days, not raw questions or duplicated personal answers. Confirmed actions only SET_STATUS/SET_PRIORITY, max20rows,120s frozen account/task versions, typed phrase, existing reauth, atomic receipt/readback; no reply job or autonomous send/delete/reveal. Same request never automatically repeats the provider/write.

Native final6beb: question/button fit default1233x696 after initial below-fold defect; Gregorian Riyadh dates corrected. Synthetic ambiguity lookup then account/groups/tasks/context command:2previews/1cancel/blank-phrase refusal/1apply/1receipt;3accounts/tasks, completed1->2,3turns/2fakeAI,0real provider/socket/auth/reply jobs. Current reread shows completed and0remaining targets. Own sandbox/tunnel stopped; fixtures retained. Installed personal app resumed unchanged DPAPI profile without bootstrap/new issuance and opened saved real AI briefing through Tailscale. One real DeepSeek ASSISTANT request321prompt/35completion tokens succeeded; estimated0.0001383USD, billed/report value unknown. History/replays started no extra provider call. CUA part complete; personal window19204214/installedSecretary080 left open on Assistant briefing/no modal.

Final owner snapshot:3accounts/credentials/tasks/groups,2types/0rules/1template,9sources(3PROCESSED/5IGNORED/1encrypted REVIEW),1existing SENT reply/0unsettled,5AIledger rows/1safe assistant turn/0assistant action receipts,845AEAD-valid auth/same connected identity. Sending=true/COMMITTED/mockfalse; no owner assignment writes, message sends, missing baseline rows or credential changes. Device infinity1/issue event1/profile hash unchanged. Env/journal/Serve/unit preserved.42other services unchanged at initial/pool cutovers. Later one other app service had already restarted and remained active before the period-patch guard; guard refused before any TaskPilot stop. Read-only diagnosis/cause unattributed/no intervention; retained original marker and fresh42service baseline, then period patch preserved all42current states. Do not claim whole-turn global invariance.

Encrypted pre326440bytes/schema14 restore and post332317bytes/schema15 restore PASS; post restored1safe turn/1assistantAI row/3credentials/845auth/1SENT/0SENDING, no provider/connector. Both packets copied to existing offhost destination with matching SHA256. Daily/manual cloud strategy unchanged; full086kit remains historical, no new-machine/server-cutover drill. ZIP97575366bytes/SHA2564584ad54cc103f9ebd174ce19212cc453f4dbf58bfda2d341fd7ca27d4c2a406,530matching installed files/no rebuild after native acceptance; rollback versions/ZIP/shortcut retained. Evidence: evidence/project-secretary-089-080-20261117.json; guide: docs/17_PROJECT_SECRETARY.md. Pool max1 and yesterday-window RED->GREEN regressions resolved. Tailscale node-key expiry remains external/not disabled; D080/D060/D068/D069 deferrals/exclusions and historical unrecoverable raw/media limits unchanged. No all-project-ready claim; writes were accepted on isolated fixtures, live secretary acceptance read business data only.

## Prior D-091 implementation checkpoint — superseded above
Backend0.8.9/migration015 implemented: private safe tool plans, account/group/task/intake/briefing/review/reply/usage reads, current-record history and bounded atomic status/priority actions with reauth/version/receipt guards. Shared configured AI provider/budgets, no raw chat/identities/credentials forwarded or duplicated in history. Local fallback is explicit. New secretary14isolatedPG and4Node tests PASS; existing local total53Node/build PASS, WinUI build/52offlineC# PASS at intermediate source. Full isolated sweep134:131PASS, AI cleanup hook failed due new FK (test cleanup corrected), diagnostic10001-row fixture hit15s statement timeout; focused follow-up pending. No production deployment, live AI call or native secretary acceptance yet. Current delivered API088/Windows070 and owner data/sending=true remain unchanged. Windows080 source exists but is not delivered. Continue functional/native acceptance, then guarded deployment/Desktop/evidence. See docs/17_PROJECT_SECRETARY.md and D-091; no all-project-ready claim.

## D-089/D-090 — CURRENT / DEPLOYED / VERIFIED_BOUNDED
API **0.8.8/source1075953991c7dd528562fbd26470f155558d51ba** on New-VPS, schema14 unchanged. Windows **0.7.0/source43513350d52f96333baf0c99915b44a48a17ebd6** installed and Desktop updated. CI43939578667 and43942980111 both Backend+Windows SUCCESS. Build/publish/portable,49Node,121unique isolatedPG,52offlineC# checks/groups PASS.

Tailscale HTTPS9443 forwards only within the tailnet to loopback8240. Its Funnel is off; prior Serve/Funnel handlers remain unchanged. Certificate validation and trusted SSH over Tailscale PASS. The desktop uses a revocable device credential with infinity expiry and a current-user DPAPI profile, not an exported owner key. Closing/reopening without bootstrap/config environment resumed the same device:1active/1issue event, protected-file hash unchanged. Actual protected probe: nonexistent reply preview409, same reauth replay403, no job or message. Existing short per-action approvals remain. Tailscale node-key expiry is a separate external setting, NOT disabled; no claim that all infrastructure authorization can never expire.

Actual owner snapshot:3accounts/credentials/assignments/groups,2task types,0rules,4sources(3PROCESSED+1oldIGNORED/rawNULL),1template,1previous SENT reply,0unsettled,3actual AI usage rows,845valid encrypted auth rows and same paired connected identity. Sending=true/COMMITTED, mock=false; env/journal unchanged. No owner row removed, credential ciphertexts unchanged,42other services unchanged at cutover and final readback. Do not run historical zero-business/false-policy cleanup verifiers.

Native final435 source: six responsive cards fit the default1233x696 view. Isolated notification count4 ignored a technical event and listGET remained1; real synthetic review event gave5/listGET2. Opening its action reached Inbox(2reviews) and marked it read, badge4. Audit retained13technical events. Settings showed persistent connection without ordinary session countdown. No connector/provider socket,0jobs/auth in isolated fixtures. Root sandbox089 and test tunnel18241 stopped; DB fixtures retained. Old615 and candidate windows closed; final installed window9767146/binding resumedOwner070 is LEFT OPEN on Dashboard connected via Tailscale/no modal. Keep its device/profile authorized.

All530installed files match accepted publication; ProductVersion0.7.0+43513350d52f96333baf0c99915b44a48a17ebd6. ZIP97562543bytes/SHA256dd9fbf4bb3a36701874005cbf14b3fd26e797b477676a92210ee10b79bb6c988, no rebuild after acceptance; old artifacts/shortcut retained. Prebackup324550encrypted bytes restored into separate DB:3accounts/tasks,14migrations,0SENDING/provider0. Same packet copied to existing offhost destination, SHA256a37683220d31f3573daaf43124c2010d71e9944918eaa62bf1e9bf67071fa2b2. Full086kit remains historical; no full-kit refresh/new-machine drill. Backup strategy/deferred/waived scope unchanged.

Evidence: evidence/tailscale-dashboard-notifications-088-070-20261116.json. NEXT AUTHORIZED STAGE: project-grounded AI secretary, after this delivered phase. It is not implemented by this checkpoint. No all-project-ready claim.

## Prior checkpoints — superseded where stated above

## D-088 — الحالة الأحدث المثبتة
API0.8.7/source3919 كما هو؛ **الإرسال الحقيقي مفعّل** بطلب المالك عبر preview وعميل مؤقت وreauth لمرة واحدة وقرار COMMITTED. قراءة نهائية: ready=true/enabled=true، دون إعادة تشغيل API أو تغيير الهوية. لا ترجع إلى sending=false التاريخي أدناه. كل رد يحتاج معاينة واعتمادًا مستقلًا؛ إكمال المهمة لا يرسل.

Windows **0.6.15/source6dab572dc26eaea835989267c4e5db8cda6ca9ee** مثبت، واختصار سطح المكتب إليه. التطبيق مفتوح متصل بلوحة التحكم ويعرض «الإرسال الحقيقي مسموح بعد الإقرار»، دون حوار. نوافذ614 والاختبار أغلقت؛ احتفظ بعميل/نفق615 المفتوح. الجلسة مؤقتة30دقيقة.

الاستقبال الفعلي بعد087 رُصد: رسالتان جديدتان ACCEPTED_TEXT/notify→DONE→PROCESSED، مع حسابين واعتمادين وتكليفين. مصدرIGNORED القديم بلاraw بقي محفوظًا؛ لا يُدّعى استرجاعه. المجموعتان و0rules و834auth صالح ونفس الهوية محفوظة. لاmissing baseline rows، والاعتمادات المشفرة لم تتغير.0replyJobs/0unsettled قبل وبعد التفعيل والتسليم. لم يرسل الوكيل أي رسالة أو ينشئ fixtures شخصية. mock=false وAI كما هو، دون طلب مزود جديد. API PID/invocation ثابت، وكل42خدمة أخرى بقيت دون تغيير أثناء هذه العملية. محتوى env الآخر ثابت؛ التغيير المقصود للسياسة والسجل فقط.

## اختبار وتسليم615
Build0warnings/errors و47offlineC# checks/groups وpublish/portable PASS. CI43772342807 لمصدر6dab572: Backend+Windows SUCCESS. Native ضدDB اصطناعية منفصلة: معاينةdisabled بها Close واحد بلاPrimary/Cancel، وإغلاقها لم ينشئ job؛ بعد policy اصطناعيةtrue ظهر «إرسال الرد الحقيقي» و«إلغاء»، ثم أُلغي.2preview/0approve/0jobs/auth0/provider0/socket0. لا تجربة إرسال لرد عمل فعلي في هذه الجولة.

530ملف تثبيت تطابق المنشور المختبر، ProductVersion0.6.15+6dab572dc26eaea835989267c4e5db8cda6ca9ee. ZIP97550750بايت/SHA256 3c3d547fe34782ec674a770cda6cf4a300c88804dd3949e058a64ba06efacc1a. لاrebuild بعدnative، والـZIPs والإصدارات والاختصار السابق محفوظة. sandbox088 ونفق18241 أوقفا؛ DB الاختبار السابقة محفوظة. لا تستخدم verifier التنظيف القديم ضد بيانات المالك.

الأدلة: evidence/owner-sending-single-close-088-0615-20261116.json وTEST_RESULTS. حزم الاستعادة086 والـoffhost087 تظل نقاطًا تاريخية؛ لم تُحدّث أو تُختبر استعادتها في هذه الجولة. D076/D080/D060/D068/D069 كما هي. يبقى قبول رد عمل فعلي وبقية مصفوفاتmulti-live/OpenRouter مفتوحًا؛ لا ادعاء اكتمال المشروع كله.

## نقطة تحقق سابقة — 2026-11-15 (تتجاوزها الحالة أعلاه)

## المنشور والمثبت
- API **0.8.7** على New-VPS، source `3919a0b3c4ee07d356fbd9aead6b623626100f1a`، schema014، loopback8240. CI43752697349: Backend وWindows SUCCESS.
- Windows **0.6.14**، source `8b3d7f473af2e9ae76ecbd4e2366ac6d5639adba`، مثبت لكل مستخدم واختصار سطح المكتب إليه. CI43755691954: Backend وWindows SUCCESS. التطبيق مفتوح متصل على «المجموعات» دون حوار أو مؤشر تحميل؛ احتفظ بعميله ونفقه، والجلسة المؤقتة30دقيقة بطبيعتها.
- آخر تحقق شخصي: مجموعتان فعليتان ونوعا مهمة،0حسابات/تكليفات/ردود/قوالب، مصدرIGNORED واحد بلاraw، و834 سجلauth مشفر صالح ونفس الهوية المتصلة. mock=false وsending=false والقرارCOMMITTED؛ env/journal لم يتغيرا. المالك بدأ إعداد مجموعاته؛ لا تستخدم cleanup أوverifier القديم ذي مجموعة واحدة/أعداد صفرية لفرض baseline تاريخي.

## إصلاح الرسالة الحالية D-086 / I-051
فحص الخادم أثبت ACCEPTED_TEXT/notify→ingressDONE، ثمIGNORED بسبب المحلل السابق الذي لا يفهم إلا الحقول ذات التسميات. هذه قرينة للرسالة الحالية، وليست تفسيرًا لأول رسالة تاريخية I025.

المحلل الحالي يقبلS2 كاملًا وكلمة مرور بترتيبات مختلفة، مع اسم اختياري وأسطر مواد، دون اشتراط «اليوزر:» أو «الباسورد:». عند غياب الاسم يستخدم اليوزر عنوانًا، ولا يخترع اسم شخص. رموز المواد لا تصبح كلمات مرور، وقيم الاسم والاعتماد لا تختار المهمة. تبقى القواعد والمهمة الافتراضية للمجموعة مرجع التصنيف. التكرار لا يكرر الحساب/التكليف، وتغير الاعتماد لا يستبدله صامتًا.

الناقص/المتعدد/الملتبس ذو دلالة حساب يبقىREVIEW مشفرًا. AI التلقائي مفعّل بطلب المالك علىdeepseek-flash وحدود20طلب/10000توكن يوميًا، دون تغيير المزود/الحدود. يرسل رموز المهام ووصف أنواع الحقول ومواضعها فقط، دون النص أو الاسم أو اليوزر أو كلمة المرور. يعيدindices محلية متحققة؛ النتيجة للمراجعة ولا تحفظ حسابًا أو ترسل/تحذف تلقائيًا. طلب واحد لكلsource/settings version، مع حدود وتسجيل الاستخدام وبدون إعادة طلب المزود آليًا.

**النص القديم المتجاهل أزيل منsource/ingress؛ لا يمكن استعادته من البصمة. يجب إرساله كرسالة جديدة ليُعالج بالإصلاح. قبول رسالة عمل جديدة بعد النشر لم يُرصد بعد؛ لا تدّعِ اكتمال دورة عمل المالك.**

## Windows D-087 / I-052 وI-053
- ذاكرة عرض مؤقتة30ثانية للأقسام العادية، مرتبطة بجلسة الاتصال، مع حفظ التصفية/المسودة/التمرير. الإعدادات والتفاصيل الحساسة لا تدخل هذه الذاكرة.
- التحديث يقتصر على الأقسام المتأثرة؛ أحداث جلسة العميل/الكشف/التصدير لا تعيد تحميل الحسابات والمجموعات. المحتوى يُبنى خارج العرض ثم يستبدل عند النجاح، والتحديث الخلفي بلاspinner. قراءة أولية أو تحديث صريح بطيء قد يعرض تقدمًا بعد200ms.
- النتيجة القديمة لا تستبدل جلسة/صفحة أحدث، وبدء التحرير أثناء القراءة يمنع مسح المسودة. فشل القراءة يبقي المحتوى السابق.
- مراجعة الوارد تعبئ الاسم واليوزر وكلمة المرور محليًا بعدreauth.0613 كشف مشكلة مهلة الاعتماد عند مراجعة الكود؛0614 يخفي النص بعد30ثانية ويبقي محرر كلمة المرور مخفيًا حتى الحفظ/الإغلاق، ثم يمحو عناصره ومرجعraw فيfinally.

## القرائن
47Node/113PG معزولة/47offlineC# checks-groups PASS؛ بناء ونشرWinUI وportable guard PASS. CI لمصدرAPI3919 ولـWindows e4/8b كامل SUCCESS.

Native0613/e4 ضدsandbox منفصل دونsocket: العودة بينAccounts/Groups أبقتGETaccounts=1 وGETgroups=1؛ حدثCLIENT لم يزدGETgroups، بينما حدثbusiness زادGETaccounts2→3 وأظهر الحساب الجديد دونspinner في حالة القراءة المرصودة. قراءة مؤخرة3.5ثانية أبقت البطاقات ومسودة بدأت أثناءها؛ الرجوع للقسم حفظ المسودة دونGETaccounts إضافي(4 ثابت). مراجعةAI وحفظها أثبتا الاعتماد المشفر الصحيح:4accounts/4tasks/0review/0replies/auth0.

Native0614/8b: بعد انتظار32ثانية اختفىraw وبقي الاعتماد مخفيًا؛ الحفظ أثبت نفس الاعتماد بعد التشفير:5accounts/5tasks/0review/0replies/auth0 فيsandbox فقط. كودcache نفسه لم يتغير بينe4 و8b. التطبيق الشخصي النهائي قبل الاتصال عبرSSH وعرض المجموعتين؛ لم تنشأ فيه fixtures أو رسائل واتساب.

تجربةDeepSeek حية واحدة بوصف اصطناعي فقط PASS: اختيار الحقول صحيح،182prompt/26completion tokens؛ تقدير0.0000858USD وفق جدول التقدير المؤرخ14نوفمبر، دون مبلغ أبلغ به المزود. سُجلت فيusage الفعلي(sourceNULL)؛ إجمالي السجل3 صفوف فعلية تاريخية. لا قيم اعتماد خرجت ولاbusiness rows أُنشئت بهذه التجربة.

## النشر والحماية والنسخ
pre087 مشفر310369بايت واستعادته إلىDB منفصلة PASS:13migrations/0accounts/tasks/0SENDING، دونprovider. ثم014 طبّقت دون تغيير migrations قديمة. كل صفوفbaseline للمالك والهوية وenv/journal محفوظة.42خدمة أخرى لم تتغير عندcutover. رُصد لاحقًا تغير عملية خدمة أخرى بقيتactive؛ لم تُمس وسبب التغير غير منسوب للمشروع، فلا تجعل قرينةcutover ادعاء ثبات المضيف طوال الوقت.

وحدةsandbox ونفق18241 أوقفا؛ DB الاصطناعية محفوظة، ونافذة الاختبار أغلقت. نوافذ612/613 الشخصية السابقة أغلقت بعد تحقق أنها صفحات قراءة بلا حوار/مسودة. لا تغيّر عميل/نفق614 المفتوح للمالك.

ZIP614:97550667بايت/530ملفًا/SHA256 `14cac4e2f98abfb4670c714cb4a52612595fe6e48f89aa7074c464f7d26ded80`. كل ملفات التثبيت مطابقة، ProductVersion0614+8b؛ لاrebuild بعدnative. الاختصار بلاarguments والقديم والـZIPs السابقة محفوظة.

نسخةoffhost جديدة في الوجهة نفسها:offhost-20261115195706946.tpg،311741بايت/SHA256 `649e000c1dbca379c063812133c213b1fbce6f06dffa3d20619411e304a18204`، استعادتهاNOT_RUN. حزمةDrive086 التاريخية التي استُعيدت محليًا ومنreadback ما زالت محفوظة؛ لا تعتبرها snapshot البيانات الحالية أو087. D076: يومي03:15 يعتمد اللابتوب وDrive يدوي دون وجهة أو جدول جديد.

## المتبقي والحدود
رسالة عمل جديدة من المالك لقبول المسار الفعلي، وإكمال إعداد القواعد/المجموعات عند الحاجة. multi-live وOpenRouter الحي ومصفوفات أوسعOPEN؛ لا ادعاء كل الصيغ أو كل ظروف المزود. D080: جهاز جديد/خادم بديل مؤجلان،24h متجاوزةD060، والراوي مستبعد/الشكليات مؤجلةD068/069. الإرسال يظل معطلًا، وكل رد يحتاج إقرارًا مستقلًا وUNKNOWN لا يعاد آليًا.

التفاصيل والأدلة: TEST_RESULTS وISSUE_REGISTER وevidence/student-reception-ai-navigation-087-0614-20261115.json. الفجوات F083a/b/c السابقة منفذة بقبولها المحدود؛ تاريخها محفوظ، ولا تساوي هذه الجولة قبول عمل المالك الكامل.
