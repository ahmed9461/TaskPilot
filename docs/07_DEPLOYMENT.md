# خطة نشر TaskPilot على New-VPS

**حالة التنفيذ:** DEPLOYED — synthetic pilot only on New-VPS, loopback 8240, PostgreSQL loopback 15488. Initial deployed source 62fddfe; later exact release in tracking/PROJECT_STATE.md. Remaining sections describe the target rollout.

## الشروط المسبقة
1. فحص نظام New-VPS والمساحة والذاكرة واستهلاك الخدمات القائمة ومنافذها ووجود PostgreSQL أو إمكانية تثبيته.
2. التأكد من وصول إداري مشروع، وحجز منفذ داخلي غير مستخدم؛ المنفذ 8240 في .env.example **اقتراح** غير معتمد.
3. تحديد اسم نطاق أو عنوان اتصال خاص (VPN/Tailscale) من دون افتراض توفر نطاق أو شهادة.
4. تحديد حساب نظام محدود الصلاحيات مستقل عن مشاريع VPS الأخرى.
5. مراجعة مخاطر موصل واتساب غير الرسمي قبل ربط رقم إنتاجي.

## التوزيع المقترح
- /opt/taskpilot/app : ملفات الخدمة/الإصدارات
- /etc/taskpilot/ : إعدادات التشغيل والأسرار بصلاحيات مقيدة (لا تُرفع إلى Git)
- /var/lib/taskpilot/ : حالة التشغيل الدائمة والمفاتيح المشفرة (تحت حساب الخدمة)
- /var/log/taskpilot/ : سجلات منقحة أو Journal محدود التدوير
- خدمة systemd باسم taskpilot.service للتشغيل التلقائي وإعادة المحاولة
- PostgreSQL في مسار/خدمة مستقلين، ومستخدم DB محدود الصلاحيات
- HTTPS عبر reverse proxy أو VPN خاصة فقط للوصول من Windows

## مراحل النشر
1. جرد البيئة دون تعديل خدمات أخرى؛ توثيق النتائج والمخاطر.
2. إنشاء مستخدم خدمة وملفات env آمنة ومخزن أسرار ومفاتيح تشفير منفصلة.
3. إعداد قاعدة البيانات ومهاجرات قابلة للعودة، مع نسخة احتياطية مشفرة.
4. نشر نسخة اختبار من Backend؛ فحص /health و/ready ومصادقة API وقيود الشبكة.
5. اختبار استقبال محاكٍ قبل ربط واتساب فعليًا؛ ثم تجربة محدودة بعد الموافقة.
6. تفعيل systemd، مراقبة restart، حالات خطأ API، إرسال outbox وتجربة قطع الاتصال.
7. إعداد Windows عميل وربطه بأمان؛ تجربة إغلاق اللابتوب واستمرار عمل الخدمة.
8. توثيق الإصدار والتكوين العام (دون أسرار) ونتيجة اختبارات القبول.

## الرجوع
احفظ إصدارًا سابقًا متوافقًا مع قاعدة البيانات، نفّذ rollback مدروسًا للهجرة عند الإمكان، وأوقف الإرسال قبل تراجع مؤثر على outbox. اختبر الاستعادة بدل الاعتماد على وجود نسخة احتياطية فقط.

## قيود مهمة
لا تشارك إعدادات أو قواعد بيانات المشاريع الأخرى الموجودة على New-VPS، ولا تغيّر Nginx أو Firewall أو SSH العام قبل مراجعة أثر التغيير والموافقة.

## التنفيذ الفعلي
`ops/provision-pilot.sh` first-deployment preflight refuses existing TaskPilot env/container/occupied ports. Own PostgreSQL 17 image pinned to installed digest, own volume, 384MiB/0.5CPU; no other DB reuse. `ops/deploy-pilot.sh FULL_SHA` installs a prepared immutable release, runs checksum migrations, prunes dev dependencies, changes only taskpilot.service and its symlink. Existing Nginx/firewall/SSH untouched. Service user taskpilot, ProtectSystem/ProtectHome, no capabilities, memory/CPU limits, startup enabled.

Access (0.2.0): Windows settings → اتصال عبر SSH → existing trusted host alias New-VPS. The app starts an owned loopback forward on a free port, invokes a root-only local CLI through authenticated SSH, and holds a 30-minute client session token only in memory. Server stores only its hash. Sensitive actions obtain a fresh single-use 60-second grant through SSH; HTTP cannot issue it. StrictHostKeyChecking and BatchMode are mandatory; no host-trust bypass or password prompt. Logout revokes the session and closes only its owned tunnel; window close stops the tunnel, with server-side expiry as fallback. After expiry reconnect from settings. This is a synthetic closed pilot, not production identity/MFA.

Historical automatic export of the permanent server token was blocked by auto-review. That method remains unused. D-029 implements a separate temporary-session protocol without reading/exporting those keys. Direct C# Windows-to-VPS 19-check acceptance and native account create/edit/filter/archive/restore were verified using that protocol. Full GUI sensitive-confirmation acceptance remains open.

Manual token access remains an owner-operated fallback: `ssh -N -L 18240:127.0.0.1:8240 New-VPS`, then local address `http://127.0.0.1:18240`. Never place permanent keys in output ZIPs, documentation, shell arguments/history or logs.

Rollback: inspect/readlink current and retain previous release. Stop only taskpilot, point current to a schema-compatible prior release, start taskpilot and run authenticated smoke. Never roll back DB by deleting the volume or run an older binary against incompatible migrations. Full rollback execution has not been tested yet.

Deployment now separates taskpilot_runtime DML role from bootstrap/migration owner. /etc/taskpilot/migration.env is root-only; API environment uses only the restricted role. Grants are scoped to TaskPilot DB and reapplied before/after migrations. Verify actual permissions with ops/verify-pilot.mjs.

Prior baseline eb0f66b verification: protected runtime role, actual restart/data preservation/other-service invariance, HTTP auth/replay, encrypted restore/tamper rejection verified. Source tracking/PROJECT_STATE.md remains authoritative.

0.3 deployment readiness: after restarting only taskpilot.service, ops/wait-pilot.mjs polls loopback /health for at most30s and requires status ok, exact package version and provider mock. Start/restart success alone is insufficient for Type=simple. Timeout reports a sanitized failure; authenticated /ready and smoke are checked separately. No automatic destructive schema rollback or changes to other services.
