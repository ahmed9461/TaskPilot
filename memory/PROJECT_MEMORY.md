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

## التنفيذ التجريبي المثبت
D-018 يجيز التنفيذ والنشر التجريبي التدريجي على موارد TaskPilot المعزولة، مع حماية خدمات New-VPS. لا يجيز ربط واتساب أو إرسالًا حقيقيًا. TypeScript/PostgreSQL وWinUI3 native منفذة ومنشورة ومختبرة ببيانات وهمية. الحالة الدقيقة والـSHA والنتائج في tracking/PROJECT_STATE.md؛ لا تعتمد على نتيجة قديمة كدليل للإصدار الحالي.

D-019..028: حساب مستقل namespace/username وتكليف account/task/period مع كل المصادر؛ حالات المهمة والرد منفصلة؛ encrypted review/credentials؛ preview/reauth/stale guards؛ UNKNOWN_DELIVERY لا يعاد إرساله تلقائيًا؛ DB runtime DML محدود مستقل عن migration owner. النسخ مشفرة ومجربة على نفس الخادم فقط؛ لا احتفاظ أو escrow/off-host معتمد. AI task-code-only adapters مع mock privacy tests، غير موصولة بالـruntime ولا مفاتيح حية.

D-029 (0.2.0): اتصال Windows عبر SSH موثوق سابقًا ونفق يملكه التطبيق، جلسة مؤقتة30 دقيقة مخزنة hash فقط، وإعادة تحقق60 ثانية أحادية لكل عملية حساسة، مع revoke/expiry. لا تصدير لمفتاح API الدائم؛ الطريقة القديمة رُفضت آليًا وتبقى غير مستخدمة. هذا ليس هوية إنتاج/MFA. Direct C# server acceptance19 checks PASS؛ الواجهة الفعلية على New-VPS أنشأت وعدلت وصفّت وأرشفت واستعادت سجلًا وهميًا، ومعاينة الحذف أُلغيت. نُظفت حسابات الاختبار المحددة. لا تدمج API tests مع قبول كل الحوارات الحساسة يدويًا.

D-030..031: قواعد كلمات وأولويات محددة؛ تعادل مهمتين يحتاج مراجعة؛ حذف raw text للمحادثة غير المتعلقة؛ page/filters محفوظة في الواجهة؛ CSV allowlist دون أسرار مع إعادة تحقق؛ حذف تكليف مستقل يبقي الحساب والمهام الأخرى. اختبار16 PostgreSQL و10 Node و6 offline C# PASS. التحقق النهائي لكل إصدار في ملفات التتبع.

## الاستمرار
أكمل خطة TODO بالبيانات الوهمية ضمن التفويض الحالي. الإنتاج وموصل واتساب وAI الحي وMFA والاحتفاظ والتدوير/off-host والتوقيع وقبول الواجهة الكامل تبقى بوابات واضحة. لا تعِد كتابة المتطلبات بدل التنفيذ، ولا تدّعِ قبولًا حيًا من المحاكاة. حدّث هذه الذاكرة عند قرار جوهري جديد؛ التفاصيل اليومية في CHANGELOG وSESSION_HANDOFF.

## Final0.2.0 pointer
Runtime17f846e5051eebe64bdeb6659c8bb949304fff72, Windows binarybfcbbd4; CI43093897111 both jobs PASS. Backup5-migration restore/portable ZIP verified. Strict global running-service comparison can fail because an existing unrelated service independently auto-restarts; read-only observation confirmed TaskPilot stable while it cycled. Leave it untouched and report the distinction (I-010), never repair other projects opportunistically or claim full host stability. Final single-sample full diagnostic verification PASS; details remain in tracking.

D-032: never auto-renew an expired/revoked session or replay a mutation. Only transient reads back off; owner explicitly reconnects using existing SSH trust. Client distinguishes expired authentication from network loss. Exact acceptance/deployment remains in tracking.

D-033: committed-head initial cursor prevents old alert replay; same workspace explicit reconnect keeps cursor. Desktop notifications opt-in for current process, generic count/silent only and no cloud/background receiver. Notification/audit pages and own-application aggregate monitoring contain no raw messages/credentials. API receipt/storage and visible popup/click acceptance must remain distinct.

0.3 checkpoint: dc76227 deployed, Windows96e4cbe.11 Node/18 PG/20 local C#/25 direct-server checks and actual native recovery/draft/page2/audit/monitoring/status/preview cancel verified; six-migration encrypted restore PASS. Hosted0.3 CI queued, not PASS. Other service drift still reports nonzero and remains untouched. Editable/scoped templates are the next accepted core gap; edits must invalidate stale approvals rather than silently alter approved outgoing text.

D-036: templates can be scoped to group/task, version-edited and disabled for future use. Changed/unavailable template invalidates unapproved preview; no edit changes or resends an already-approved job body. Global templates stay valid; old approval tokens without template version require fresh preview.

## Current verified pointer —2026-11-12
API+Windows0.4 source87f986b8bd7ce18717f112611e3937642d1b69b1 deployed; CI43100482889 both jobs SUCCESS.11 Node/19 PG/20 offline C#/28 direct-server checks PASS; actual native template create/edit/group-task scopes/disable/reload verified, plus0.3 native recovery/draft/page2/status/activity. Seven-migration same-host encrypted restore and ZIP verified. Own verifier checks PASS but external-service drift remains nonzero/untouched, never a full host stability claim. All data and transport remain synthetic/mock; production/live/provider/identity/retention/signing gates and wider GUI acceptance remain open. Next useful implementation is account details/history and code-disambiguated UI choices.

## D-037 — قرار المالك2026-11-13
TaskPilot للاستخدام الشخصي ولمالك واحد، ولا يحتاج توقيعًا رقميًا. النسخة المحمولة غير الموقعة هي مسار التسليم المعتمد؛ التوقيع ليس شرط اكتمال. المثبت والتحديث الآلي تحسينات اختيارية، ونظام صلاحيات متعدد المستخدمين خارج النطاق الشخصي. يتقدم هذا القرار على إشارات التوقيع القديمة كعائق في الذاكرة والخطة. لا يخفف حماية SSH/الجلسات/الأسرار/الحذف، ولا يجيز ربط واتساب أو الإرسال الفعلي دون الموافقة المنفصلة.

## D-038..041 —2026-11-13 connector implementation
Owner authorized implementing real connector, not live linking/sending. Baileys7.0.0-rc14 pinned/unofficial/prerelease, custom encrypted PG auth, no auth files; process lease/epoch fencing. Independent connection/send=false gates, reauth/explicit unofficial consent,45-second memory QR. Selected notify text only; encrypted inbox/minimized tombstones/quarantine after3 failures. Purge snapshot includes pending+quarantined identities; exact task/account deletion cannot later process matching durable queued rows. Separate provider workers; SDK ambiguity never auto-retries; startup live SENDING recovery even when disabled. Live approve blocked if sending disabled. Native controls implemented; actual live acceptance/retention/auth cleanup still open. Latest precise proof/source/deployment pointer remains in tracking; do not assume0.5 deployed from implementation.

D-042: account details sections are paged/read-only/allowlisted; history is current related records, not deleted identity reconstruction. Recorded credential flags are evidence history rather than new verification. API/Windows implemented; exact tests/native/pilot checkpoint in tracking.

I-020 packaging lesson: WinUI unpackaged dotnet publish omitted app PRI/generated XBF despite successful build. Native verification must run the actual portable folder, from arbitrary cwd, rather than infer startup from ZIP CRC or bin-directory UI. csproj explicit resource publish + CI artifact checks; icon uses AppContext.BaseDirectory. Historical0.4 package startup unproven. Corrected0.5 native startup observed; final pointer in tracking.

## Final0.5 checkpoint —2026-11-13
API5265c5b DEPLOYED; Windows package fix6157855.14 Node/build/format/33 isolated PG incl two parents/20 offline C#/34 Windows-server checks PASS. CI43486994434 backend+Windows/publish-resource guard SUCCESS;5265c5b CI43485552696 also SUCCESS. Native corrected portable EXE from other cwd: SSH dashboard/task+code/source counts/source group-session-message metadata, synthetic Baileys metadata STOPPED and disabled connect/QR/discovery buttons observed. No real QR or socket; app/tunnels closed, UI account deleted1, runner namespace synthetic-acceptance-01752dcd59 cleaned/revoked. Auth/requested/pending0. Final own role/denial/restart/data/startup PASS; other running-service set unchanged in bounded sample (not continuous invariance). Active/running/NRestarts0/memory38563840.
AES-GCM backup60499 bytes restored fresh1 account/1 assignment/8 migrations/0 SENDING, smoke afterward PASS. ZIP94748334 bytes/530 files/CRC+resources/no-runtime-data PASS/SHA256648D7244980DADF5F57AD0135E83C1CB9DB876E1DCEFC0F1290C73FE049472F6. I-020 fixed actual portable startup; historical0.4 package startup not established by build-native/CRC. Live provider/broad GUI/retention/off-host/optional AI runtime remain open; signing excluded from personal gates.
