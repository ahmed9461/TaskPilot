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

0.2.0 continuation: R-11 mitigated for closed pilot with30-minute hashed SSH-issued sessions,60-second one-use reauth, revoke/expiry regression and actual Windows-server workflow. Root SSH dependency and production MFA/RBAC remain residual risks. R-05 task-only purge preserves account/other tasks in regression; broad human GUI acceptance remains open. No live-provider or production-data risk is closed by these tests.

0.3 desktop notification boundary: opt-in/session-only, explicit attention event allowlist, count-only silent payload; no names/UUIDs/messages/credentials in OS notification storage. In-app durable notifications remain authoritative. Native API receipt, visible popup, click activation and closed-app delivery must be recorded separately. No cloud push/background receiver implemented.

0.4: template version/scope/enabled rechecks and immutable approved body verified under concurrent scope edit/approval (19 PG suite). Global running-service drift still reports nonzero and is outside TaskPilot repair scope. Duplicate display names in retained synthetic choices (I-016) remain a human-selection usability risk; UUID checks/quoted target preview and explicit approval remain required. No production or live-provider risk is closed by this release.

0.5 isolated mitigations: auth/key identifiers hashed, encrypted with session-bound AAD/epoch/process lease; QR transient/reauthed; ingress text/group allowlist, minimized after durable processing,3-failure quarantine. Provider-scoped worker and independent approval/send gates prevent mock/live crossover. Purge pending/quarantine guards tested. Baileys prerelease/network/ban/history-loss risks remain open until explicitly approved live acceptance; no guarantee from fake sockets. Manual encrypted auth removal/retention and recovery of a corrupt encrypted backlog remain operational gates.

## Actual paired pilot0.5.1 —2026-11-13
R-01 now has owner-approved actual QR and same-identity restart proof, not selected-group receive/send/long-running proof. R-02 upstream direct console session dumps mitigated before real connection via own-service /dev/null/core0; encrypted auth and restored816 rows verified. No leak incident inferred, no raw logs collected. R-07 final same-host encrypted backup/restore includes real auth; off-host/key-loss/reboot remain unverified. R-08 latest own-service verification0 external-service set delta in bounded sample; unrelated services unchanged by us. Sending stays false/groups0; production risks are not closed by synthetic workflow tests.

Receive continuation: one selected live test group authorized/bound; no broad chat-data permission. First approved desktop submission produced no durable receive evidence (I-025), so provider reliability risk remains open. Candidate diagnostics expose fixed aggregate reason codes only; no SDK raw logging, identifiers, bodies or auth. Bounded sampling is explicitly not a complete traffic ledger.

## Scoped live acceptance —2026-11-14
R-01/R-03/R-04 now have limited actual selected-group receive/identity merge/quoted approval idempotency/recipient visibility/restart evidence; sending gate false after normal and failed test wrapper. First missing event cause unknown, sustained/network-loss/history/late delivery remain unproved. R-02 real auth833 rows and encrypted backup restore validated; SDK key metadata is excluded from business payload and diagnostic counters expose no identifiers/content. R-07 same-host restore includes live sources/SENT and duplicate replay, not off-host/key loss. R-08 own-service checks passed; external set drift0 added/1 removed reported nonzero, no other service changed by us. Native live review/source/history/template acceptance reduces GUI risk but does not complete every destructive/accessibility path. No production risk automatically closed.
