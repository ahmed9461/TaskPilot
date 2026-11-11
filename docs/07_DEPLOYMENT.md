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

Access: `ssh -N -L 18240:127.0.0.1:8240 New-VPS`; Windows address `http://127.0.0.1:18240`. The owner must enter the API token locally. Do not copy keys into documentation, output ZIPs, shell history or logs. Auto-review blocked automatic server-token-to-client launch during this session; direct Windows-to-pilot acceptance remains open. UI was instead observed against a separate synthetic test API/DB.

Rollback: inspect/readlink current and retain previous release. Stop only taskpilot, point current to a schema-compatible prior release, start taskpilot and run authenticated smoke. Never roll back DB by deleting the volume or run an older binary against incompatible migrations. Full rollback execution has not been tested yet.

Deployment now separates taskpilot_runtime DML role from bootstrap/migration owner. /etc/taskpilot/migration.env is root-only; API environment uses only the restricted role. Grants are scoped to TaskPilot DB and reapplied before/after migrations. Verify actual permissions with ops/verify-pilot.mjs.
