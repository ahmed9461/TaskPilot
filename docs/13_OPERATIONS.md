# دليل التشغيل والمراقبة — Target Runbook

**تشغيل تجريبي مثبت:** taskpilot.service + own taskpilot-db container; all data synthetic. See tracking/PROJECT_STATE.md for exact deployed commit.

## مراقبة يومية مستهدفة
- حالة API وPostgreSQL وWhatsApp connector لكل جلسة.
- آخر استلام مؤكد لكل مجموعة، آخر رسالة معالجة، وعمق inbox/outbox.
- عدد مهام NEEDS_REVIEW، وعدد ردود UNKNOWN_DELIVERY.
- أخطاء التشفير والتخزين والنسخ الاحتياطي ومساحة القرص.
- تطابق إصدار Windows والـ API وتوافق قاعدة البيانات.

## إجراءات تعافٍ نموذجية (تُعدّل بعد التنفيذ)
1. عطل استقبال: افصل هل الخلل واتساب أم الجلسة أم المجموعة أم قاعدة البيانات؛ لا تدعِ وجود رسائل فائتة.
2. عطل إرسال: أوقف Outbox عند كثرة أخطاء المزود؛ تحقق من معرف الرسالة ونتيجة التسليم قبل الإعادة.
3. إعادة تشغيل خدمة: تأكد من إكمال معالجة inbox بشكل idempotent وعدم حدوث ازدواج.
4. عطل DB: أوقف الكتابة/الإرسال بأمان؛ استرجع وفق آخر نسخة مثبتة.
5. خطأ رمز مستخدم: حوله إلى مراجعة؛ لا تحفظ قيمة كلمة المرور في تذكرة أو log.
6. حادث أمني: أوقف وصولًا متضررًا، دوّر الأسرار، راجع سجلات منقحة وتحقق من أثر الحذف.
7. فقد جلسة واتساب: إعادة اقتران بعد موافقة المالك وبشكل لا يتجاوز سياسة المزود.

## النسخ الاحتياطية
- نسخ مشفرة، وصلاحيات وصول محدودة، وفصل موقع النسخ عن ملفات التطبيق، وعدم تخزينها في Git.
- خطة احتفاظ ومحو بعد الحذف يجب أن تعتمد قبل استلام بيانات حقيقية.
- الاختبار المطلوب: restore دوري إلى بيئة معزولة مع فحص سلامة البيانات ودورات idempotency.

## تغيير الإصدار
اكتب رقم الإصدار، commit، مهاجرات DB، وخطة الرجوع، ونفذ smoke tests على بيئة اختبار قبل الإنتاج. كل نشر فعلي يثبت في tracking/PROJECT_STATE.md.

## أدوات مجربة
- `systemctl status taskpilot.service`, `/health`, authenticated `/ready`, `scripts/pilot-smoke.mjs` (run on VPS; reads external key without printing it).
- `node ops/backup.mjs backup /var/lib/taskpilot/backups/UNIQUE.tpg` uses pg_dump from own container and AES-256-GCM with a separate external backup key. Dump exists in memory only (64MiB pilot limit); file creation refuses overwrite.
- `node ops/backup.mjs restore-test /var/lib/taskpilot/backups/UNIQUE.tpg UNIQUE_restore_test` verifies authentication tag, creates a fresh isolated database and uses single-transaction pg_restore. Existing target/production restore refused. The exact tested snapshot/migration count is recorded in tracking/TEST_RESULTS.md; never infer restore coverage from backup existence.
- Key recovery/escrow and off-host backups are not established. A same-host restore drill is not proof of VPS-loss recovery. Production retention/deletion cycle and scheduled backups remain pending approval.
- No data/secret dumps or raw service logs are public deliverables. UNKNOWN_DELIVERY blocks purge/retry until the owner explicitly reconciles actual delivery in the Replies screen or authenticated reconciliation endpoint; reconciliation never requeues.

Prior baseline eb0f66b verification: protected runtime role, actual restart/data preservation/other-service invariance, HTTP auth/replay, encrypted restore/tamper rejection verified. Source tracking/PROJECT_STATE.md remains authoritative.

## Client sessions (0.2.0 pilot)
Use the Windows SSH connection flow. Sessions last 30 minutes; logout revokes immediately when reachable, expiry is the fallback after transport loss. Reconnect when expired. The root-only issue-client-session CLI returns temporary credentials through private child-process IPC; never run it in a logging terminal or print/store its output. It never reads permanent API/reauth keys. Reauthorization grants last60 seconds, are hashed and consumed once; all sensitive operations still audit their result. Production RBAC/MFA/retention for these rows remain open.

Server acceptance: on Windows with already-trusted SSH run `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release -- --server-acceptance New-VPS`. It creates explicitly synthetic namespaced data, tests mock dispatch, purges only its own account IDs, revokes its session, and prints sanitized results. Failed fixtures are identified by namespace; cleanup mode accepts only synthetic-acceptance-[10hex] or synthetic-ui-acceptance. It never uses delete-all. Session/group/task/template configuration fixtures remain as synthetic audit evidence.

0.4 operator notes: deployment waits for exact-version mock health; then run authenticated smoke. Verifier always emits own privilege/restart/data/startup results and returns nonzero on external service-set drift; never restart unrelated services to clear it. Template edits/disable affect unapproved previews only, not already-approved body snapshots; create a fresh preview after STALE_PREVIEW. Current restore tested7 migrations; source tracking remains authoritative. Latest direct Windows runner28 checks also tests template edit/disable and owned-tunnel recovery.

## Connector0.5 التشغيل المحكوم
`WHATSAPP_CONNECTION_ENABLED=false` و`WHATSAPP_SENDING_ENABLED=false` في الإعداد الافتراضي. لا تغييرهما ضمن تفويض التطوير. بعد موافقة منفصلة للربط يمكن للمالك مراجعة سياسة الاحتفاظ ومخاطر الموصل غير الرسمي ثم تفعيل الاتصال فقط، بدء جلسة من Windows وقراءةQR بنفسه واختيار مجموعة اختبار. تفعيل الإرسال خطوة موافقة مستقلة؛ لا تستخدم حسابات/جلسات مشاريع أخرى. لا تسجيل للـQR أو raw auth أو group membership.

راقب حالات الجلسة وpendingIngress/failedIngress/connectedSessions وأعمار الطوابير. ERROR الوارد يحتاج تشخيص السبب ثم retry داخلي محمي؛ لا يكشف payload في القائمة. لا تمحُ auth تلقائيًا عند logout أو key corruption؛ لا تخفِ فشل فك التشفير بإنشاء مفاتيح بديلة. خدمة API تبقى loopback ونفسهويةالخدمة؛ لا حاجة لمنافذ عامة إضافية. النسخ تشمل جداولauth المشفرة؛ فقد مفتاح التشفير لا يحله pg_dump وحده.

Windows portable gate: run publish then `scripts/check-windows-package.ps1 -Path <publish-directory>`؛ app PRI/generated XBF/icon إلزامية، لا تكفي runtime SDK PRIs. اختبر EXE من مجلد النشر نفسه وبـworking directory مختلف قبل ZIP؛ نجح bin-directory لا يثبت الحزمة. CI ينفذ publish/resource check؛ القبول الأصلي منفصل.

D-043 owner approved connection/QR pairing only. `--begin-whatsapp-pairing` and `--whatsapp-pairing-status` in ClientChecks use private temporary SSH credentials, require connection=true/sending=false, and never retrieve QR/groups or send. Owner displays/scans QR manually in TaskPilot. Before first real socket, systemd stdout/stderr=null and core limit0 are mandatory because upstream libsignal direct console calls can include key/session objects; do not re-enable raw logs to diagnose. Redacted status/error codes/health remain available.

`node ops/check-whatsapp-state.mjs --expect-connection` runs only on VPS, decrypts auth locally to verify AEAD/JSON and prints aggregate counts only; never QR/JID/group metadata. `node ops/verify-pilot.mjs` now retains paired identities privately across its own-service restart, waits bounded30 seconds for CONNECTED, compares identities in memory and prints continuity status without identifiers. `--server-acceptance New-VPS --connection-enabled` permits the expected connection flag in the synthetic C# runner; it never connects a new live session, discovers groups or sends real messages.
