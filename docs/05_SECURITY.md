# الأمان والخصوصية — متطلبات إلزامية

**مستوى الحساسية: مرتفع**؛ التطبيق يتعامل مع بيانات دخول حسابات الغير بناء على تفويضهم. يجب الالتزام بالموافقة والصلاحيات المطلوبة، وعدم استخدام بيانات حساب دون إذن صاحبها.

## الهوية والتحكم
- هوية مالك إدارية واحدة على الأقل، كلمة مرور قوية مشتقة بطريقة حديثة، مع MFA إذا توفر، وجلسات قصيرة وتجديد آمن.
- الوصول الإداري من Windows إلى VPS عبر TLS صالح أو شبكة VPN خاصة؛ لا API إدارة بلا مصادقة.
- صلاحيات delete-all، export، reveal-secret، send-reply تحتاج إعادة تحقق أو موافقة إضافية.
- قيود معدل الاستدعاء ومراقبة الجلسات والتحقق من المدخلات وحد حجم الرسائل.

## تخزين الأسرار
- كلمات مرور الحسابات والرموز ومفاتيح واتساب تشفر باستخدام AEAD مع مفتاح محفوظ خارج قاعدة البيانات والكود والمستودع. دعم تدوير المفاتيح key_version.
- عدم حفظ كلمات المرور مكشوفة في أي trace أو stdout أو audit أو crash report.
- مفاتيح OpenRouter/DeepSeek وجلسات WhatsApp خارج Git؛ أمثلة الإعدادات بلا قيم حقيقية.
- لا يحتفظ Windows cache بالأسرار إلا لضرورة مبررة مع تشفير نظام التشغيل ومهلة إخفاء.
- لا تتضمن إشعارات سطح المكتب ولا قائمة السجل كلمات مرور أو رموز تحقق.

## الذكاء الاصطناعي
- قواعد محلية/خادمية أولًا؛ AI معطّل افتراضيًا حتى اختيار مزود واضح.
- إزالة كلمات المرور والرموز والمعرفات الحساسة قبل طلب AI، أو الامتناع عن الطلب حين لا يمكن ذلك.
- عدم نقل نصوص رسائل مجموعات إلى خدمة خارجية دون موافقة مناسبة.
- نتائج AI ليست دليلًا على صحة بيانات تسجيل الدخول ولا على وصول الرد.

## البيانات والحذف
- أقل قدر من البيانات، مدة احتفاظ معلنة، حذف منطقي مقابل محو دائم، وإيقاف نسخ البيانات المحذوفة إلى التقارير والتصدير.
- بيانات النسخ الاحتياطية مشفرة، دورات انتهاء معلنة، اختبار استعادة، وعدم تعريضها لوصول عام.
- الحذف الجماعي يتطلب معاينة أعداد وموافقة قوية وسجل حدث قابل للتدقيق دون الأسرار.
- لا يمكن ضمان محو نص أرسل إلى واتساب أو دخل نسخة احتياطية سابقة فورًا؛ يوضح للمستخدم نطاق الحذف الفعلي.

## حماية المستودع العام
ممنوع إضافة .env حقيقي أو database dump أو ملفات session أو أرقام هواتف أو payloads أو screenshots ببيانات حقيقية. استخدم Fixtures مجهولة أو مولدة. راجع Git history إذا حدث تسريب وقم بتدوير الأسرار فورًا.

## شرط الإطلاق
فحص أسرار، اختبارات حذف واستعادة، اختبار مصادقة وتفويض، اختبار منع تسرب لوجات/إشعارات، وتجربة استرجاع نسخة احتياطية.

##0.7 versioned keys and recovery domains
Legacy ciphertext1.iv.tag.data uses captured key1; new2.keyId.iv.tag.data authenticates format/key ID/context as AAD. JSON taskpilot-keyring-v1 active/keys stored in same protected external file. No keys exposed by API. Source raw, source quote, ingress, auth and account credentials all rewrap together; metadata key_version follows writes. Root-only journal/checkpoint and DB run marker support interruption without a half-encrypted DB. Old backups and their matching encrypted escrow are retained. Rotation revokes old local API/reauth credentials and existing temporary sessions, not SSH/provider credentials or WhatsApp identity.
Off-host exports add independent root-VPS RSA4096 custodian recipient beside Windows RSA3072/DPAPI recipient. --recover-profile uses copied ciphertext/manifest/custodian envelope in a new private recovery folder, never loads/creates DPAPI key blobs, and receives decrypted snapshot keys through private authenticated root SSH IPC only. Unseal helper reads only custodian private key, not original field/backup files. Surviving VPS/root access and copied snapshot are required; simultaneous VPS+Windows-profile/laptop loss is not covered. No plaintext master key/private RSA/dump is written to Windows.

##0.8 personal retention and local session forgetting
Policy defaults: review raw30days→IGNORED/raw removed, ERROR ingress raw14days→DROPPED, expired approvals/client sessions1day, read notifications90days, diagnostics7days. Explicit batch preview/reauth/phrase only, bounded1000/class with frozen IDs/versions/eligible fingerprint and transactional recheck. Pending ingress/in-flight AI/unread notifications/accounts/tasks/credentials/audit/SENT/source metadata/quotes/AI usage/auth retained until explicit applicable purge/forget. Old backups retained until explicit owner retirement, not retroactively erased. All data expirations preserve dedup tombstones.
Forgetting requires a stopped Baileys session and exclusive process lease; active/SENDING/UNKNOWN_DELIVERY rejected. Preview bound to UUID/version/fingerprint, final reauth+FORGET UUID. Deletes selected auth/quote/queued raw, cancels approved replies, disables bindings, advances auth_epoch; keeps business history and immutable forgotten_at/FORGOTTEN tombstone. Cannot reconnect/enable groups/revive late auth writes under that UUID; new identity needs new session. Local forgetting does not remove linked device from phone or erase prior backups. Current real identity never used for forget tests.


##0.8 third independent owner recipient
See [independent recovery](15_INDEPENDENT_RECOVERY.md). Owner RSA4096 encrypted with fixed bounded scrypt and AES256GCM; random256bit code kept outside backup/kit/cloud/Git. Per-snapshot envelope binds SHA256 as authenticated context. Independent mode rejects SSH/DPAPI and validates restored fields/privacy invariants in network-none ephemeral PG. Actual cloud-copy/hash/readback restore is verified; physical independent code custody/fresh-user/production cutover are not. Historical0.7 simultaneous-domain limitation is superseded only for this cryptographic scope. No automatic backup retirement.
