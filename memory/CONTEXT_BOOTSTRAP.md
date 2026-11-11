# كيف تستأنف العمل من أي محادثة أو Agent

## صيغة البداية
«نعمل على مستودع TaskPilot. اقرأ AGENTS.md وtracking/PROJECT_STATE.md وtracking/SESSION_HANDOFF.md وtracking/DECISION_LOG.md وmemory/PROJECT_MEMORY.md. افحص الملفات والشيفرة الحالية أولًا، ثم نفّذ أعلى مهمة مفتوحة من tracking/TODO.md وفق معايير قبولها. لا تغيّر New-VPS أو ترسل رسائل واتساب حقيقية أو تحذف بيانات حقيقية دون موافقة صريحة. بعد كل خطوة حدّث حالة المشروع والأدلة والتقدم والاختبارات.»

## ترتيب استعادة السياق
1. حقيقة التنفيذ: PROJECT_STATE مع commit/tests وبيئة النشر.
2. ما قُرر ولم يُقرر: DECISION_LOG + PROJECT_MEMORY.
3. الخطوة التالية والعوائق: SESSION_HANDOFF + TODO.
4. تفاصيل المنتج والبنية: docs/01_REQUIREMENTS وdocs/02_ARCHITECTURE.
5. المخاطر والخلل: RISK_REGISTER وISSUE_REGISTER.
6. التطور والتأكد: CHANGELOG وTEST_RESULTS.

## كيف نمنع ضياع السياق
لا تعتمد على ذاكرة المحادثة أو وصف شفهي لتقرير الحالة. كل جلسة برمجية تنتهي بتحديث ملفات التتبع ضمن commit نفسه. أي قرار جديد يضاف بعلامة حالته وتاريخه. لا تضع محادثات خام في الوثائق.
