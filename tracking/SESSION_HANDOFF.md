# تسليم قابل للاستئناف — 2026-11-15

## D-085 phase 1 — VERIFIED_ISOLATED / NOT_DEPLOYED
API086/Windows0611 candidate: root durable PENDING→authorization→COMMITTED journal and per-send guard implemented.38Node/103isolatedPG PASS; real SIGKILL at4durable checkpoints, audit-write rollback, journal-commit filesystem failure, and actual main restart from pending env=true with immutable connection=true/no requested sessions PASS. Pre-commit sends remainfalse; post-commit decision is traceable, not automatically replayed. WinUI0611 build0warnings/errors; native/deploy pending. Current live remains085/acb6273 and Windows0610/c7effe5/sendfalse/auth833. Next: guarded deployment/bootstrap, fresh clean recovery kit+extracted independent app restore, then actual live control and returnfalse. D076 backup destination and D080 deferred cutover scope unchanged.

المصدر التشغيلي الحالي PROJECT_STATE.md، والقرارات D-083/D-084. المالك مشغول وسيضبط مجموعاته وقواعده لاحقًا بنفسه. لا تكرر السؤال ولا تضف fixtures في المساحة الشخصية.

## ما تم
- API085/acb6273 منشور، CI43720147122 SUCCESS. Windows0610/c7effe5 مثبت والاختصار إليه، CI43721389866 SUCCESS. التطبيق مفتوح متصل على المجموعات دون حوار؛ احتفظ بعميله ونفقه.
- الفجوات F-083a/b/c منفذة بقبول محدود موثق. Native069 ضد sandbox085 أثبت تحرير القاعدة/invalid draft/cancel/reopen، ومعاينة الرد مع إرسالfalse وإلغاء المنتظر.0610 أصلح ترميز SSH الذي كشفه هذا الفحص، وقُبل أصليًا للعربية ورفض التأكيد الفارغ وإلغاء الحوار.
-38Node/100PG/35offlineC# PASS، WinUI0warnings/errors. Windows→SSH→root false→false apply مع grant مفرد PASS؛ لم يحدث live enable. المساحة الشخصية0حساب/0تكليف/1binding/1neutraltype/0templates،mockfalse/sendfalse،auth833 ونفس الهوية.42خدمة أخرى لم تتغير عند النشر. لا WhatsApp/AI outbound جديد.

## مواضع التنفيذ
- group-rules.ts وWorkspaceFeatures.cs: تعديل كامل ذري/no-op/forgotten/version guards.
- service.ts/app.ts/MainPage/TemplateFeatures: وجهات مقروءة، معاينة مع إرسال معطل، إلغاء APPROVED فقط.
- sending-policy.ts/main.ts: إعادة تحميل بوابة الإرسال فقط عبر HUP، fail-closed، موافقة الاتصال ثابتة عند startup.
- ops/sending-policy.mjs: نقطة SSH ثابتة root-only وJSON stdin؛ core قابل للعزل. معاينات root تحت `/etc/taskpilot/sending-previews`،env root:taskpilot0640.
- SshConnection.cs/SendingFeatures.cs: UTF-8 stdio، إعادة تحقق وعبارة صريحة، HTTP للقراءة فقط.
- اختبارات reply-management/sending-control/rule-editor/sending-policy/SshEncodingChecks. Probe `--verify-disabled-sending-control` يفحص false قبل المعاينة وبعدها ويرفض الحالةtrue، ويختبر false→false فقط ثم يغلق عميله الخاص. لا تشغل ServerAcceptance أو seed-native القديم على المساحة الشخصية mock=false.

## التشغيل والحماية
`/opt/taskpilot/current`→`releases/acb62734b3cba58c2996af648cbea6c10321f403`؛ وحدةtaskpilot فقط/8240،PG loopback15488. health المتوقع085/livePolicyControltrue/sendingPolicyReadytrue/liveSendingEnabledfalse. استخدم prepare-personal-workspace --verify وcheck-whatsapp-state --expect-connection للقراءة. لا تستخدم عدادات privacy080 القديمة لمصادر وردود الاختبار المحذوفة، ولا تعد cleanup084 المطبق.

وحدةsandbox085/8241 والنفق18241 أوقفا؛ DB الوهمية محفوظة. DockerDesktop لم يشغل. نسخةpre085305915بايت استعيدت إلى DB مستقلة13migrations/0accounts/tasks/SENDING دونprovider. كود الرجوع08417baf55 موجود؛ لا تستعد DB تاريخية فوق أعمال المالك. لا تقرأ أو تطبع أو ترفع رمز recovery. استراتيجية النسخD076 والتأجيلاتD080 باقية.

## التالي والحدود
إعداد المالك وقبول عمله لاحقًا. لا تفعّل sending أو تربط مجموعة نيابة عنه الآن. كل رد يحتاج معاينة وإقرارًا منفصلين؛ UNKNOWN لا يعاد آليًا. لا توسع شكلي/راوي/24h أو وجهة نسخ جديدة. التفعيل الحي true/HUP مع الهوية الحقيقية وقبول workflow المالك NOT_RUN. قتل root قسريًا بين كتابةenv والإقرار لم يُحقن؛ افحص الحالة بعد نتيجة مجهولة ولا تعاود mutation آليًا.

الحزمة0610:530ملف/97543367بايت/SHA76c81808f3960df591d4243d0ba00f5030103ff67e1cd7a0c4ee4f9ffcfc3a4d؛ ProductVersion0610+c7effe5؛ لا rebuild بعد native. النسخة069 التي كشفت خلل الترميز محفوظة كتاريخ وليست المعتمدة.
