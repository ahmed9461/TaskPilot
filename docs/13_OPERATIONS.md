# دليل التشغيل والمراقبة — Target Runbook

**تشغيل تجريبي مثبت:** taskpilot.service + own taskpilot-db container; business text deliberately fictitious; WhatsApp auth and selected-group transport are real/encrypted. One scoped quoted send verified; sending restored false. See tracking/PROJECT_STATE.md for exact deployed commit.

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
`WHATSAPP_CONNECTION_ENABLED=false` و`WHATSAPP_SENDING_ENABLED=false` في الإعداد الافتراضي. لا تغييرهما دون تفويض مناسب؛ D-043 أجاز الاتصال فقط في pilot الحالي، مع بقاء الإرسال=false. بعد موافقة منفصلة للربط يمكن للمالك مراجعة سياسة الاحتفاظ ومخاطر الموصل غير الرسمي ثم تفعيل الاتصال فقط، بدء جلسة من Windows وقراءةQR بنفسه واختيار مجموعة اختبار. تفعيل الإرسال خطوة موافقة مستقلة؛ لا تستخدم حسابات/جلسات مشاريع أخرى. لا تسجيل للـQR أو raw auth أو group membership.

راقب حالات الجلسة وpendingIngress/failedIngress/connectedSessions وأعمار الطوابير. ERROR الوارد يحتاج تشخيص السبب ثم retry داخلي محمي؛ لا يكشف payload في القائمة. لا تمحُ auth تلقائيًا عند logout أو key corruption؛ لا تخفِ فشل فك التشفير بإنشاء مفاتيح بديلة. خدمة API تبقى loopback ونفسهويةالخدمة؛ لا حاجة لمنافذ عامة إضافية. النسخ تشمل جداولauth المشفرة؛ فقد مفتاح التشفير لا يحله pg_dump وحده.

Windows portable gate: run publish then `scripts/check-windows-package.ps1 -Path <publish-directory>`؛ app PRI/generated XBF/icon إلزامية، لا تكفي runtime SDK PRIs. اختبر EXE من مجلد النشر نفسه وبـworking directory مختلف قبل ZIP؛ نجح bin-directory لا يثبت الحزمة. CI ينفذ publish/resource check؛ القبول الأصلي منفصل.

D-043 owner approved connection/QR pairing only. `--begin-whatsapp-pairing` and `--whatsapp-pairing-status` in ClientChecks use private temporary SSH credentials, require connection=true/sending=false, and never retrieve QR/groups or send. Owner displays/scans QR manually in TaskPilot. Before first real socket, systemd stdout/stderr=null and core limit0 are mandatory because upstream libsignal direct console calls can include key/session objects; do not re-enable raw logs to diagnose. Redacted status/error codes/health remain available.

`node ops/check-whatsapp-state.mjs --expect-connection` runs only on VPS, decrypts auth locally to verify AEAD/JSON and prints aggregate counts only; never QR/JID/group metadata. `node ops/verify-pilot.mjs` now retains paired identities privately across its own-service restart, waits bounded30 seconds for CONNECTED, compares identities in memory and prints continuity status without identifiers. `--server-acceptance New-VPS --connection-enabled` permits the expected connection flag in the synthetic C# runner; it never connects a new live session, discovers groups or sends real messages.

Native fixtures: ClientChecks `--seed-native-ui-extended` creates only namespace synthetic-ui-acceptance/mock sources and an unverified flag; `--native-ui-change` emits a harmless synthetic account update for scroll testing. Stage-only `ops/seed-native-reconciliation.mjs --synthetic-ui-only` refuses sending=true or monitored live groups, injects UNKNOWN_DELIVERY for a strictly mock fixture and reports idempotent readback; it does not model a real provider timeout. Cleanup uses existing scoped C# mode. Restored auth check accepts only `--restore-db=taskpilot_*_restore_test`, reads own root-only migration connection locally and never connects the restored session to WhatsApp.

Current0.5.1 checkpoint: owner QR pairing CONNECTED and same-identity restart verified; connection=true/sending=false, monitored live groups/source/reply jobs0. No need to rerun pairing. Owner must select/authorize a test group before discovery/binding/receive. Final same-host restore includes actual encrypted auth and runs no provider socket. Never start API/connector against a restored database as part of restore validation.

## Actual0.5.2 selected-group checkpoint —2026-11-14
D-048/051 supersede historical QR-only restrictions for the dedicated test group. Owner explicitly authorizes scoped tests without repeated approval. Connection=true, sending=false; one group/four live sources/one SENT job retained. No additional group/real business-data scope inferred.
Private C# modes --bind-whatsapp-test-group / --whatsapp-test-group-status require exact owner-provided title and emit aggregates only. Do not print all discovered memberships or source identifiers. The status mode includes best-effort process-local receive diagnostics, not a complete traffic ledger.
Quoted test: use scripts/whatsapp-quoted-acceptance.ps1 with TestGroupTitle and DotnetPath. It invokes root-only ops/whatsapp-test-sending.py via SSH stdin, refuses multiple/wrong scoped groups or pending/unrelated live jobs, preserves a root-only env snapshot, atomically toggles only sending and restarts only TaskPilot. Finally calls off even after failed enable/preview/relay; unknown delivery never retries. Abrupt termination/network loss still requires checking actual gate state, so do not invoke on standalone. Current off was verified after success and deliberate invalid-title failure.
The C# quoted harness requires the initial one-source synthetic test account, scopes body/template/target, previews/reauthenticates and replays the same logical approval key. Current fixture has two sources after merge testing; the safety guard rejects arbitrary new target selection. Recipient visibility must be checked independently of SENT/provider ID.
Latest native actual review, source/history and two-line template save/reopen/restore passed; sent body unchanged/version3. Same-host restore includes live encrypted auth, private group metadata, test sources and SENT state. Never start any provider socket/API against restored snapshots. Internal duplicate replay was verified without network/outbound calls. Exact counts/backup evidence in tracking.

## Off-host pilot backup/recovery0.6.0
Windows Node24 with trusted SSH New-VPS: `node scripts/offhost-backup.mjs` creates encrypted snapshot/escrow and runs an independent local Docker restore. `--backup-only` omits Docker/drill. `--restore offhost-<timestamp>.tpg` uses only E:\TaskPilot-Backups local encrypted files and DPAPI current user; no SSH request. Docker pinned PG17 image must already exist for offline recovery. Own ephemeral container network=none/no ports is stopped in finally; all other containers untouched. Files include .tpg, .escrow.json, .manifest.json, current-user DPAPI private-key blob and redacted drill receipt; never put these in Git/outputs.
Key escrow includes TaskPilot backup/encryption/API/reauth/DeepSeek keys, encrypted to owner public key before leaving VPS. Folder ACL owner+SYSTEM. Profile loss, Windows account loss and whole-laptop loss are not covered by CurrentUser escrow; another independently held recovery method remains a separate decision. No retention deletion of existing snapshots. Manual drill is not continuous backup proof.

`powershell -File scripts/install-offhost-task.ps1` installs only TaskPilot-Offhost-Daily after successful private recovery setup, refuses an existing task/runner and never overwrites other tasks. Copies the runner to private backup folder, uses Node24/trusted SSH, daily03:15 local, interactive current user/StartWhenAvailable/no stored password. Explicit run tested LastTaskResult0 and a new encrypted manifest; wall-clock trigger not yet observed. It creates snapshots without Docker/provider calls or deleting earlier snapshots. Requires laptop on, same user logged in, SSH/network available. To disable this own task: `Disable-ScheduledTask -TaskName TaskPilot-Offhost-Daily`; keep encrypted backup and protected recovery files together. A continuously available independent target and profile-loss recovery remain open.

##0.7 key rotation and profile recovery
After isolated tests/pre-rotation off-host snapshot and no live pending/uncertain reply, deploy0.7.0, run root `node ops/init-recovery-custodian.mjs`, then root `node ops/rotate-project-keys.mjs --apply`. Stop/restart affects only taskpilot.service, keeps sendingfalse. Protected /var/lib/taskpilot/key-rotations/rotation-<UTCdigits>.json contains old/next keys and metadata; never print/copy into Git/outputs. Pre-rotation encrypted DB snapshot retained. Dual reader published before transactional rewrap, key_rotation_runs marker commits with all fields/session revocation. Atomic/fsynced secret-file publication follows. Tool verifies new API ready, old API/reauth rejected, selected personal session CONNECTED again. If interrupted, use same release/operator `--resume rotation-<digits>`; do not regenerate keys or restore DB blindly. Resume uses marker, can recover while own service is stopped. Backups from before rotation need their captured escrow/key; current backup-key alone cannot open older snapshots.
Update only the installed TaskPilot private runner plus recovery-crypto.mjs after verifying own task/runner identity. `--rotate-protector` generates a new CurrentUser-protected RSA key, atomically advances recovery-active.json and retains all previous protected files. New envelopes carry recipient key ID, old envelopes still resolve the legacy key file. Test both old and new snapshots before considering retirement; no deletion policy is enacted.
Profile-loss drill: copy only .tpg/.manifest.json/.custodian.json to a NEW E:\TaskPilot-Recovery-<label> folder (no DPAPI/private-key files), set TASKPILOT_RECOVERY_ROOT to that folder and run `node scripts/offhost-backup.mjs --recover-profile <snapshot.tpg>`. Requires Docker Desktop/pinned image and surviving root SSH New-VPS. The unseal helper outputs secret IPC only to its private caller; never run it in a logging terminal. Reports must show profileRecovery=true/dpapiCalls0/no provider/socket/outbound and decrypt restored fields. This is simulated profile-crypto loss, not destructive deletion of the real Windows profile or a full fresh-user login/host-loss exercise.
`ops/soak-observe.mjs 3600 /var/lib/taskpilot/soaks/UNIQUE.json` saves private aggregate1-minute checkpoints without mutating service. `ops/soak-load.mjs` accepts only fresh taskpilot_endurance_070_test, two connections, duplicate+new fictitious business ingestion every2seconds; no provider/API/AI. Report exact wall-clock duration and counts, not production capacity.
