# تسليم قابل للاستئناف — 2026-11-14

اقرأ AGENTS/README/PROJECT_STATE/TODO/DECISION_LOG/project memory أولًا. الحالة الحالية في PROJECT_STATE؛ الأدلة القديمة تاريخية. D-051/057/063 تصريح الاختبارات الوهمية دون العودة المتكررة؛ لا يشمل خدمات أخرى أو مجموعات حقيقية إضافية.24h WAIVED_BY_OWNER D-060، لا تعاود تشغيله أو تسجله PASS.

## Baseline
API0.8.0 ونواة Windows0.6.4 source1bd734426b18d6cebc80b56618a6afaf8afd4623؛ مصدر native fixture5d9444032d0acee75b45b71d537214c7970ca557؛ recovery runner المثبتb876096a5364c254c6198a0b190a138b78fc8c6a. CI43546799203/43549621045/43549978803 backend/windows SUCCESS.13 immutable migrations001..013؛ لا checksums bypass أو reset. taskpilot.service/API127.0.0.1:8240/PG17loopback15488 فقط.
connectiontrue/sendingfalse،نفس CONNECTED identity/noQR/auth833 AEADvalid/key2/livegroup1/liveSources5/SENT1/unsettled0،إجمالي4accounts/4assignments بعد cleanup. لم تُرسل رسالة WhatsApp أو AI جديدة. provider output=/dev/null/core0. لا تقرأ أو تسجل QR/phones/JIDs/secrets/auth/raw logs.

## آخر مرحلتين مكتملتين
- سياسة يدوية30/14/1/90 وdiagnostics7: preview→phrase→reauth→atomic stale recheck،1000/class. Native0.6.4 سجل run تنظيف1review/1ERRORingress/15expiredclients. نسيان stopped synthetic auth1/quote1/raw1/approved1؛ read-only FORGOTTEN/history retained/server proof PASS،الهوية الفعلية لم تتغير. الحساب الوهمي نُظف بعد تحقق حفظ التاريخ؛ tombstone+privacyRuns2 محفوظان. لا تعاود seed ops/privacy-native-fixture.mjs: marker موجود ومحمّي/root-only؛ verify قبل cleanup كان PASS؛بعد cleanup استخدم --verify-cleaned-synthetic للتحقق من tombstone/صفوف الحساب الصفرية/نفس هوية المالك دون طباعتها،ولا تستخدم فحص account-preserved القديم.
- مالك RSA4096/scrypt+AESGCM ورمز256bit منفصل.8قديمة upgraded دون تغيير dump. old11/new13/scheduled13 independent restore DPAPI0/SSH0/all AEAD/replay0/provider0/outbound0. actualwrong-code/tamper rejected beforecontainer؛ initial Python uppercase PSMODULEPATH acl failure fixed I-034, not counted as intended negative PASS.
- الحزمة المشفرة648509bytes في Drive owner-only sharedfalse؛ downloaded SHA410c0f257a31f0fb8b2ebd82fe62d50f09211b51acbba535872eaa47f359a949 matching،then EXTRACTED helper fresh-directory restore PASS. لا رمز/DPAPI/custodian/originalescrow في الحزمة. Cloud URI الخاص في تسليم المالك/أدوات التطبيق،لا تنشره في public Git. build-independent-kit repeatable entry-hash verification PASS؛ cloud upload explicit not daily.

## الأسرار والاستعادة
E:\TaskPilot-Backups خارج workspace/outputs،owner+SYSTEM. الرمز فقط في D:\TaskPilot-Recovery-Key خارج backup؛ لا تطبع قيمته/ترفعه/تنسخه إلى output أو kit. على المالك الاحتفاظ به خارج اللابتوب؛ ذلك غير مثبت. private owner key encrypted؛ custodian root-only علىVPS ولم يُصدّر؛ DPAPIوالنسخ القديمة محفوظة. rotation-20261114000557762/key2/run marker1،لا apply من أجل status.
ركّبت helpers قبلmain/hash-match واحتفظت بالrunner السابق. TaskPilot-Offhost-Daily manual06:08 LastTaskResult0،next03:15 tomorrow. scheduled323679byte SHA d9fb8737c8a032888e0e68f7dc6c0575954d974904f03a61d6e411d43d9d8ce4 restored13/auth833/privacy policy1/runs2/forgotten1/auth0/DPAPI0/SSH0. أقدم305675byte11مهاجرة bfe8a2a0...،new323493byte13مهاجرة dad09564... محفوظتان؛ doc15 يعطي runbook. no plaintext dump/masterkey disk.
لا realprofile deletion أو fresh-user/physical laptop loss/full production-cutover proof؛ independent mode cryptographic survival needs kit+code. daily needs logged-in owner/on laptop/trustedSSH/network. لا automatic retirement أو auto cloud sync.

## التحقق والتسليم
24Node/62isolatedPG incl6parents/21offlineC# PASS؛ current WinUI0.6.4 build0warnings/errors/native privacy PASS.أُعيدت34Windows→SSH→API0.8 الآن PASS؛fixture synthetic-acceptance-fcb566a76a نُظف/العميل الأول revoked/owned tunnel stop+reconnect verified/لا actualsend. ZIP0.6.4 exact tested binary94761294bytes/532files/CRC/resources/runtimeguardPASS/SHA0b6a78695c15c5bcadd7e4be4785052dcd4fc60195086f91be893383923eab4b؛report+JSON taskoutputs. لا rebuild بعد native.
Current bounded ops verifier PASS/other services0added/0removed؛I-010 historical drift محفوظ،لا continuous global-host PASS. أولlostpacket UNCONFIRMED؛laterappend recovery proof separate. Livehour/isolated30min/network90s details فيState/tests؛لا24h أوcapacity/ban/hostreboot claim. Test app/tunnel/restorecontainers أُغلقت؛Docker Desktop أعيدinitialstopped،والجرد الأخير بلاعمليات التطبيق أو محركDocker.

## العمل التالي
Windows remaining accessibility/scaling/fullconfig/filter and actualtoastpopup/click؛then wider provider late-delivery/isolated reboot scope with protected other services. لا sharedVPS reboot تلقائيًا. Owner external code custody/newdevice/cutover acceptance وalways-on backup destination remain limitations. OptionalOpenRouter/reporting/multi-live خارج currenttestfixture. لا UNKNOWN_DELIVERY auto retry ولاforget/resetpersonalidentity.
SDK work/dotnet/dotnet.exe10.0.404؛PowerShellnewline لا يوقف بعدfailure،افحصexitcodes؛استخدمUTF8/Python-Xutf8. حدّث tracking/tests/projectmemory/commits كل مرحلة.
