# سجل المخاطر

| Risk ID | الوصف | الأثر | الاحتمال | الأولوية | المعالجة | الحالة |
|---|---|---|---|---|---|---|
| R-01 | موصل واتساب غير رسمي قد ينقطع أو يقيد الرقم | عالٍ | متوسط/مرتفع | حرجة | عزل provider واختبار رقم مخصص وخيار بديل | مفتوح |
| R-02 | تسريب كلمات المرور أو أسرار جلسات واتساب | حرج | متوسط | حرجة | تشفير ومفاتيح خارج Git وصلاحيات قوية | مفتوح |
| R-03 | تكرار الحسابات والمهام عند إعادة الاتصال | عالٍ | مرتفع | عالية | unique constraints وinbox idempotency | مفتوح |
| R-04 | تكرار الردود نتيجة مهلة إرسال غير مؤكدة | عالٍ | متوسط | عالية | Outbox وUNKNOWN_DELIVERY وتحقق | مفتوح |
| R-05 | حذف حسابات جماعي بالخطأ | حرج | متوسط | حرجة | معاينة وإعادة تحقق وتأكيد كتابي | مفتوح |
| R-06 | تحديد كلمة مرور خاطئة بتخمين AI | متوسط/عالٍ | متوسط | عالية | لا إعلان إلا بدليل أو إقرار | مفتوح |
| R-07 | توقف New-VPS أو قاعدة البيانات | عالٍ | متوسط | عالية | systemd ومراقبة واستعادة من نسخة مجربة | مفتوح |
| R-08 | تعارض منافذ/خدمات New-VPS الأخرى | عالٍ | متوسط | عالية | فحص قبل النشر وحساب خدمة مستقل | مفتوح |
| R-09 | إرسال بيانات سرية إلى مزود AI | حرج | متوسط | حرجة | تصفية وإلغاء افتراضي ومراجعة | مفتوح |
| R-10 | حذف/تغيير رسالة أصلية أو المجموعة | متوسط | متوسط | متوسطة | failure state ورسالة مراجعة | مفتوح |
| R-11 | وصول غير مصرح لواجهة Windows/API | حرج | متوسط | حرجة | MFA/TLS/RBAC وsession management | مفتوح |

هذه تقديرات أولية وليست نتائج اختبارات أو حوادث مثبتة؛ تحديثها يتطلب دليلًا وتاريخًا ومالك معالجة.

## Pilot mitigation evidence — 2026-11-11
R-02/R-03/R-04/R-05/R-06: synthetic encryption/dedup/outbox/evidence/purge tests PASS; residual production risk remains open. R-08: own isolated loopback resources, no existing service changes. R-07: same-host encrypted restore PASS; off-host key recovery/reboot not verified. R-11: closed SSH pilot bearer+independent reauth, not production identity/MFA. R-01/R-09: live providers disabled.
