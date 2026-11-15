# خطة التنفيذ والتتبع — 2026-11-15

## أولوية العمل الحالية D-083 — تحديث نهائي
- [x] F-083a تعديل القواعد القائمة بجميع الحقول ذريًا، invalid draft/cancel/reopen: DEPLOYED؛ API معزول وnative069 ضد085 PASS.
- [x] F-083b معاينة الرد مع sending=false دون اعتماد: DEPLOYED؛ API وnative069 sandbox PASS.
- [x] F-083c إدارة المنتظر وإعداد الإرسال من Windows: DEPLOYED؛100PG وcore fake signals وmain-child HUP وnative0610 Arabic/blank refusal/cancel وWindows→SSH/root false→false PASS. **live false→true مع الهوية الفعلية NOT_RUN**؛ لا نفعله نيابة عن المالك.
- [x] I-048 ترميز SSH العربي: UTF-8 fix/c7effe5/Windows0610، actual-child regression وnative PASS.069 ليست المعتمدة؛ Desktop0610 والتطبيق متصل مفتوح على المجموعات دون حوار.
- [ ] OWNER_SETUP_LATER: المجموعات والقواعد والقوالب يضبطها المالك عند تفرغه؛ ثم قبول workflow الفعلي.
- [ ] متابعة خطر قتل أمرroot قسريًا بينenv/ACK والقبول الوظيفي الموسع عند الحاجة؛ لا تخلط إثبات sandbox بالقبول الحي.

## Prior checkpoints (historical; current API085/Windows0610 above)
- [x] D-082 clean personal handoff: reviewed/rehearsed cleanup applied, mock=false, API08417baf55/Windows068544748e published/native verified/Desktop updated;35Node/86PG/two hosted CI runs SUCCESS. Owner app left connected on Groups page.

- [x] Personal desktop placement D-081: exact067 package installed per-user, shortcut verified, installed native app connected and left open for owner.
Checked means verified within stated scope. Current API0.8.3/Windows0.6.7 personal pilot; unsigned portable accepted D-037. D-051/D-057 authorize scoped tests without repeated permission; per-job confirmation remains. Historical incremental checkpoints below are superseded by this current checklist and final results.

## P0 — القرارات والأمان
- [x] P0-001 requirements/memory/decisions/tracking.
- [x] P0-002 personal provider/QR/selected-group receive/quoted-send/restart; unofficial sustained risk remains.
- [x] P0-003 reviewed retention/local auth forgetting/immutable historical identity/new-UUID replacement policy and independent owner recovery; native synthetic+isolated proof.
- [x] P0-003c owner-encrypted third recipient/old+new+cloud-readback+scheduled restore DPAPI0/SSH0; wrong-code/tamper reject.
- [ ] P0-003d physical custody of owner recovery code remains owner-held evidence, not inferred from a local file.
- [ ] P0-003e DEFERRED_BY_OWNER D-080: fresh Windows machine recovery and real alternate-server cutover; outside current personal-use acceptance gates, not PASS. Resume only when owner asks.
- [x] P0-003a actual project field/backup/API/reauth/Windows-protector rotation; old clients revoked,839 fields/same identity preserved; crash/mixed-key resume verified.
- [x] P0-003b per-snapshot old/new encrypted recovery and profile-mode DPAPI0 verified WITH surviving VPS custodian/root SSH. Third recipient now covers simultaneous cryptographic-domain loss when kit+code survive; fresh-user/total-physical-laptop-loss still unverified.
- [x] P0-004 namespace/account/task/period/source contracts.
- [x] P0-005a54 bounded Windows→SSH→API0.8 auth/reauth/headers/query/body/masking/revocation checks; no business mutation.
- [ ] P0-005 broader personal security review; SSH sessions/reauth/recovery verified, enterprise identity outside scope.

## P1 — Backend
- [x] P1-001 API/13 immutable checksum migrations/CI.
- [x] P1-002 mock rules/priority/source isolation/selected live group binding+receive.
- [x] P1-003 encrypted review/dedupe/minimization/actual live+native path.
- [x] P1-004 independent accounts/tasks/multiple sources/live identity merge.
- [x] P1-005 conservative parsing/manual routing/review.
- [x] P1-006 durable cursor/head/pages; no closed-app/cloud push.
- [x] P1-007 scoped versioned templates/preview/reauth/outbox/live quoted reply/idempotent approval; sending restoredfalse.
- [x] P1-008 recorded verified/manual vs unverified flags/API+native fictitious acceptance.
- [x] P1-009 archive/restore/scoped purge/stale+uncertainty guards; native task/pair deletion/global cancel, no real-source purge.
- [x] P1-010 redacted audit/same-host+Windows encrypted restore incl real auth/source/SENT/replay; daily natural03:15 trigger and restored output verified. Profile mode as P0-003b; owner-only mode as P0-003c.
- [x] Baileys encrypted auth/ingress/lease/epoch/filters/quarantine/provider isolation/same-identity restart.
- [x] Selected-group sanitized diagnostic ledger/SDK metadata fix/offline append recovery; first lost-packet cause remains unknown I-025.

## P2 — Windows
- [x] P2-001 portable resources/startup/ArabicRTL/SSH/unsigned packaging.
- [ ] P2-002 full native session/group configuration matrix; actual QR/binding observed partly.
- [x] P2-003 bounded functional account/task filters, inline/atomic rules, cancel/reopen, task completion/restart; source/history/flags/53-account pagination verified. No full combinatorial UI-matrix claim.
- [x] P2-004 review reveal/30-second hide/reauth/resolve/raw clear.
- [x] P2-005 synthetic CSV/reconciliation/source-B mock approval/task deletion/selected pair/global cancel native acceptance; actual quoted live reply retained. Uncertain delivery never auto-retried.
- [x] P2-006 scoped template editing/disable/filter/multiline save+reopen; source A→B selects B-only preview/mock reply verified, sent snapshot immutable.
- [x] P2-007 in-app notifications/unread/activity/monitoring/OS API receipt. Visible popup/click remains OPEN, closed-app delivery unimplemented.
- [x] P2-008 explicit SSH recovery/backoff/no mutation replay/native draft+interruption; fresh connection after real key rotation.
- [x] Same-page automatic scroll retention; Arabic flag/evidence labels and explanatory refusal.

## P3 — الاستقرار والتكاملات
- [ ] P3-001 functional provider/network/late-delivery/restart acceptance.
- [x] P3-001a quiet live3600s/239samples/0failure-disconnection-PIDchanges-errors-pending-gaps.
- [x] P3-001b isolated1800s/874unique+874replay/8accounts/16tasks/8valid encrypted credentials/0errors-provider-outbound. Original070 harness FAIL retained; fresh071 PASS.
- [x] P3-001c29Node/66isolatedPG incl7parents/34offlineC#/fresh34Windows→SSH→API0.8.1/exact-code hosted CI PASS.
- [x] P3-002 API0.8.1/source05283e1 deployed; own privilege/restart/data/startup/identity PASS. Overall verifier EXTERNAL_SERVICE_DRIFT1added/0removed from another auto-restarting service, untouched; no global host invariance claim.
- [ ] P3-003 multi-live beyond initial1 (multi-mock verified).
- [x] P3-004 manual AI runtime/API/native catalog/usage/reservations; DeepSeek live+replay verified previously, no inference this increment. OpenRouter live acceptance OPEN.
- [ ] P3-005 optional broader reports/alerts; new always-on independent target DEFERRED_BY_OWNER D-076; safe CSV/ops/offhost/daily trigger/profile+owner+private-cloud copy done, cloud refresh manual.
- [x] P3-006 bounded exact-version readiness/authenticated smoke.

- [x] P3-001d24h test WAIVED_BY_OWNER D-060; not a measured PASS or remaining release gate.

- [x] P3-001e90s own-cgroup network block/automatic reconnect2s/same PID+identity/0 API failures/unchanged live data; no live queued-message claim.
- [x] Native mock session/type/group creation+scoped disable/Tab-Return/End-Return/Escape and server proof. Remaining functional configuration cases are tracked separately; no cosmetic/accessibility gate D-068/069.
- [x] I-032 corrected stale native logout banner and revision-bound obsolete polling;21 offline C# and exact portable0.6.3 native acceptance PASS.
- [x] I-033 correct dashboard title/sidebar after programmatic connection; final native0.6.3 SSH-from-Settings/navigation/logout PASS.

- [x] Native0.6.4 retention save/preview/phrase/SSHreauth/history; stopped synthetic forgetting/history preservation/read-only tombstone/server proof; actual identity untouched.
- [x] Repeatable encrypted recovery kit builder/entry hashes/private cloud copy+download hash+fresh-dir isolated restore. Installed daily runner manual trigger and its owner-envelope restore PASS.

- [x] Windows0.6.5 candidate: notification lifecycle/fault/stale callbacks/normal shutdown and adaptive controls;34offlineC#/28geometry+12attachedWinUI component/nativeSDK receipt PASS.
- [x] Native0.6.5 exact dfebeb1: SSH/dashboard, actual Tab/Shift+Tab/Enter/Escape, expanded/compact/minimal navigation and narrow598px two-row actions, canceled mock draft/server count0, logout/revoked-client/closed-window+own-tunnel proof. I-037 tooling recovered2026-11-15.
- [x] Native0.6.6 source69f6757 bounded225%/344x244/keyboard/filter/mock-cancel/logout proof; prior failures retained. Narrator test removed by owner D-068; no further cosmetic acceptance work D-069. OS popup/click unverified and low-priority, not a release gate.

## Next
1. Remaining functional Windows session/group/rule/filter workflows; no cosmetic gates. API0.8.1 recovery/deploy/34client checks completed.
2. Outbox/restart/idempotency/recovery functional acceptance with unrelated services protected.24h stays waived.
3. Existing-backup restore/fresh-environment acceptance; keep current backup strategy D-076, no always-on destination task. External recovery-code custody remains owner-managed.

Previous privacy/native acceptance0.6.4 source1bd7344 (currentAPI0.8.1/Windows0.6.6 above); candidate0.6.5 sourcedfebeb1(code CI43633370508 SUCCESS),security8585562 CI43633806414 SUCCESS; installed recovery runner b876096. One actual group/connectiontrue/sendingfalse. Installer/updater optional/signing not a gate. Never reset CONNECTED identity or auto-retry UNKNOWN_DELIVERY.

## Historical checkpoints (superseded by current checklist)

##2026-11-14 endurance/security continuation — IN_PROGRESS
Owner authorized long endurance/native Windows tests, then project key rotation and Windows-profile-loss recovery. Initial live check:1 CONNECTED identity/833 valid auth rows/5 live sources/1 SENT/sendingfalse. Added read-only1-hour observer with private aggregate checkpoints; no restart during observation. Native synthetic fixture tests and isolated crypto/rotation/recovery preparation follow. No new completion claimed.

##2026-11-14 native matrix checkpoint
Native Windows0.6.1→API0.6.0: namespace filter,53-account pagination1–50/51–53 with correct disabled bounds, Alpha account two tasks and three distinct sources, switch A→B loads only scoped B template, preview body/group/original source B, explicit SSH-reauth mock approval and server-confirmed SENT matching B. One unverified flag saved and both Alpha tasks became NEEDS_REVIEW; no verified-error claim made. Live source5/reply1 unchanged/sendingfalse. Temporary fixture53 accounts/54 tasks/55 sources, mock only. Test app closed cleanly; no owner window existed in this inventory. Windows0.6.2 labels flag kind/evidence in Arabic and adds an explanatory rejection message; native acceptance pending. Hour observer remains running, no restart.

##2026-11-14 rotation/recovery candidate — IMPLEMENTED, not live rotated
21 Node/portable-crypto and49 isolated PG including5 parent tests PASS. Fault after all rewraps rolled back every field; corrupt auth aborted without partial commit; committed test preserved all five AAD domains, credential/auth key_version2 and subsequent credential writes. Legacy snapshots remain readable with their captured keys; altered context/key-ID/format rejected. API0.7.0 adds versioned keyring/core root operator, migration012 per-run marker, serialized maintenance/journal/resume, and old API/reauth/session revocation. Existing migration files unchanged. Root custodian and dual-recipient export/profile recovery implemented but live verification pending after hour observation.
Native Windows0.6.2 Arabic choices/rejection verified: unproven password error refused, manual verified fictitious error accepted. Wrong task-delete phrase refused; exact phrase deleted only Alpha task B, left account/task A/source-B mock SENT. Selected pair preview named only Beta+deletion fixture; DELETE2 removed exactly those accounts. Global preview DELETE55 was CANCELLED, no global deletion. Server before cleanup:51 synthetic accounts/tasks,Alpha1task,1verified+1unverified flags,matching mock sourceB SENT1, live sources5/live SENT1 unchanged/sendingfalse. Windows accepted count-only toast; visible popup/click not observed in exposed surfaces, system settings untouched. Test app closed, no remaining TaskPilot window in inventory.

##2026-11-14 hour/live and resume-hardening checkpoint
Live observer completed3600seconds/239samples,0 failed/disconnected/PID changes/pending/errors/unsettled/gaps, memory70922240..76046336 bytes, exit0. Quiet connected personal socket plus separately recorded synthetic native/API work; not24-hour/capacity/provider-loss/reboot proof. First isolated30-minute load ended FAIL from unquoted camel-case final count alias; business counts independently8accounts/16tasks/871PROCESSED sources/0replies/8version2credentials. Old070 DB/report preserved, corrected driver retries in fresh071 DB (pending).50 isolated PG tests now PASS including mixed old/new writes after a precommit failure; resume reads the authenticated bridge, blocks stale rotations, and safely rewrites interrupted temporary files. Restore selects its snapshot key without needing current active DPAPI registry. No live key rotation yet.

##2026-11-14 live rotation/recovery VERIFIED checkpoint
API0.7.0 deployed9bf0130509fb505ecdd0227097d8698a7714357a; CI43531219188 backend/windows SUCCESS (c116ccb CI43529951361 and Windows99916b1 CI43526236498 also SUCCESS).12 migrations. Actual rotation rotation-20261114000557762 -> keyVersion2:1 credential/1 raw review/4 source quotes/0 pending encrypted ingress/833 auth rows =839 fields rewrapped. Old API/reauth rejected, prior temporary sessions revoked, same paired identity CONNECTED/noQR, sendingfalse. Explicit completed-run resume reused same marker/counts (resumedtrue), no second key version. Audit: active key2 only, no key1 in runtime,0 legacy ciphertext, credential/auth key_version2,1 marker,0 pre-rotation sessions valid. Protected root journal/old backups retained. Provider-issued/SSH/DB credentials and WhatsApp identity not rotated.
Windows protector rotation PASS, previous DPAPI files retained. New snapshot315177 bytes SHA256d54d2486eb499bba8727a69a9c50b808f3ca7e7e625c774db7626ee0f80e0723 restored4accounts/4tasks/12migrations/5live sources/SENT1/SENDING0/AI2/auth833/credential1, all839 encrypted fields AEAD-valid,duplicate0/no provider/outbound. Old snapshot305675 bytes SHA256bfe8a2a0de3ce5dd50038db4683283387b1b2c28fc5b15d2598fd8e16e6e3e1f still restores11migrations/auth833 with old snapshot key after protector/project rotation.
Profile-loss crypto drills on NEW E:\TaskPilot-Recovery-Drill-20261114 copied only ciphertext/manifest/custodian envelope (no DPAPI/private keys): new and oldest snapshots restored successfully, dpapiCalls0, no original field/backup key files read by unseal helper, no provider/outbound. Surviving VPS/root SSH access required; no real Windows profile was deleted, no simultaneous VPS+profile/laptop-loss/fresh-user-login proof. Added --upgrade-escrows to rewrap4 legacy captured-key packets for alternate custodian,3 already dual; old encrypted dump hashes unchanged. Windows master/private keys never written plaintext.
Natural TaskPilot-Offhost-Daily trigger observed03:15 Asia/Riyadh, LastTaskResult0/next day03:15. Its317115-byte snapshot SHA25614279e9e337fe8599961020fcab3cb6bb2e46e353ae6ccab8064467156ec2546 restored via profile recovery:12migrations/4accounts/4tasks/auth833/839 encrypted fields/DPAPI0/duplicate0/provider0/outbound0. Daily job still requires laptop on/current interactive owner/trusted SSH/network.
Postrotation34 direct Windows→SSH→VPS checks PASS, fixture synthetic-acceptance-eee5ed3fc6 cleaned/revoked. Actual native Windows0.6.2 (ProductVersion0.6.2+99916b1691684598e4b9755053939422da668dad) fresh SSH→API0.7.0 shows4accounts/4tasks, receive allowed/sendfalse, closed cleanly. Own privilege/DDL/migration denial/restart/data/startup/same identity PASS; overall verifier remains EXTERNAL_SERVICE_DRIFT0added/1removed unrelated service, untouched. First load070 remains failed harness assertion; fresh07130-minute retry still pending at checkpoint.

Queued native activation now carries its opt-in generation into DispatcherQueue; dispatch rechecks current generation/enabled state. Deferred old click cannot navigate after opt-out/re-enable(10notification checks,34offlineC# PASS). Final candidate source/evidence recorded in latest TEST_RESULTS; actual OS click still unobserved.

- [x] I-038 source69f6757 actual225%/344x244/body scroll/nav icons/keyboard/filter/mock-cancel verified; prior failed candidates retained.

- [x] D-068 Narrator/screen-reader test WAIVED_BY_OWNER, stopped; not PASS.
- [x] D-069 font-scaling test finished; further cosmetic tests removed from active priority/release gates.
- [x] I-039 isolated PostgreSQL precommit/postcommit-ACK regressions RED→GREEN, durable queue preserved/no duplicate work.
- [x] I-040 isolated owned idle DB connection termination RED→GREEN; same child survives and uses new backend.
- [x] API0.8.1/source05283e1 CI43652374112 bothSUCCESS/scoped deploy/34Windows→server/pre-backup isolated restore/new offhost snapshot.
- [x] I-041 source+built exact health version RED→GREEN; actual rejected-version guarded rollback PASS.

- [x] I-042 isolated082 outbox DB-result/ACK/claim/restart recovery;29Node/76PG PASS.
- [x] API082 exact-code CI43658630409 Backend+Windows SUCCESS and guarded deployment7082fcf.
- [x] D-076 owner keeps current backups; new always-on destination removed from active work.

- [x] I-043 native066 partial-save reproduced; atomic editor/dialog validation implemented;84PG/29Node/WinUI067 build PASS.
- [x] Atomic rule sourceCI/deployAPI082; native067 invalid/valid/cancel/reopen/mock group enable workflows.
- [x] API0834477d34 CI43661156807/deploy + same-input native routing/account and task filters/status/app restart, scoped067 cleanup and exact tested ZIP.
- [x] Existing latest encrypted packet independent DB+API/business workflow; direct and fresh full-kit extract PASS, DPAPI0/SSH0/no real provider. No new backup destination D-076.
- [x] Recovery source53a971e hosted CI43664456529 Backend+Windows SUCCESS; live API stays4477d34 and accepted Windows0677082fcf, daily runner staysb876096.
