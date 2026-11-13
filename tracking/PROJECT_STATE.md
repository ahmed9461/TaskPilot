# الحالة الحالية — المصدر المرجعي
2026-11-12 (Asia/Riyadh). Synthetic pilot0.4.0 IMPLEMENTED / VERIFIED / DEPLOYED. Production acceptance open.
Branch feat/mvp-foundation. API and Windows source:`87f986b8bd7ce18717f112611e3937642d1b69b1`. Final tracking-only commit does not change deployed code. All real WhatsApp/AI remains disabled.

## Deployed resources
Own taskpilot.service/taskpilot user, root-owned immutable releases/current. API127.0.0.1:8240; own PostgreSQL17/container/volume127.0.0.1:15488 with resource limits. Runtime DML-only role, DDL/migration-write denial verified; root-only migration env. Seven append-only migrations. No changes to other services, proxy/firewall/global SSH or databases.
Exact-version bounded startup wait and authenticated auth/ready/replay smoke PASS for0.4.0/mock/liveSending=false. Active/running, NRestarts0; observed memory29,720,576 bytes. Whole-host reboot/rollback not tested.

## Verified functionality
- Encrypted account/review fields, explicit namespace/account/task/period/all-source identity and concurrent replay dedupe; conservative extraction/review. Task completion and outgoing reply states remain independent.
- Snapshot approval/purge guards, mock quoted outbox, no automatic resend of UNKNOWN_DELIVERY, explicit evidence reconciliation; account archive/restore and task-only/account scoped purge.
- Group keyword/priority routing with ambiguity review; paged filters and safe reauthenticated CSV. Task/account data and secrets never enter ordinary event lists or OS notifications.
- Windows30-minute SSH-issued hashed sessions,60-second single-use reauth, explicit reconnect on expiry/revocation; transient reads back off10/20/40/60s, mutations never replay automatically. Same-workspace cursor/drafts preserved; manual mode disposes old SSH identity.
- Newest-first notification pages/read filters/unread badge, committed-head initial sync and replay-safe catch-up, redacted filtered audit, authenticated aggregate count/age monitoring. Native local toasts opt-in per process, silent count-only; actual API acceptance/storage/generic payload verified, popup/click/after-close delivery not inferred.
- Editable/versioned/enabled templates with optional group/task scopes, search/pages and source-matching UI. Preview/approval recheck scope/version/availability; edits invalidate unapproved previews including pre007 tokens. Already-approved body/target snapshots stay immutable. Scope edits acquire group FK locks before template row locks to align with approval.

## Evidence
-11 Node tests/build/format,19 isolated PostgreSQL tests including parent,20 offline C# checks, WinUI Release/publish0 warnings/errors PASS. Audit0 known vulnerabilities;114-file UTF8/known-secret scan PASS.
- Exact-source hosted CI backend and windows both SUCCESS:https://github.com/ahmed9461/TaskPilot/actions/runs/43100482889. Older0.3 queued runs are historical, not used as current proof.
-28 C# Windows→SSH→New-VPS checks PASS, namespace synthetic-acceptance-e46d229b16 scoped accounts cleaned and runner sessions revoked. Includes scoped template edit/stale approval/disabled preview, prior workflow/activity/audit/monitoring and owned-tunnel loss/fresh reconnect. No permanent key export or real send.
- Actual WinUI0.3: monitoring6 migrations; audit filter1–4/4; notifications page2(51–100/107); synthetic task COMPLETED; quoted preview then CANCEL; own SSH child interrupted, outage banner and reconnect with synthetic-draft-preserved confirmed. Account cleaned, GUI/tunnels closed.
- Actual WinUI0.4 on deployed87f986b: created synthetic-ui-template-edit-040, edited Arabic body, group=مجموعة العرض الوهمية/task=مراجعة مهمة تجريبية, disabled future previews; reloaded card showed correct text/scopes/متوقف and filter1–1/1. Test config retained disabled. Native app/owned tunnels0 after close; expiry fallback for closed native sessions remains distinct from explicit logout/revoke.
- Final encrypted backup50631 bytes; isolated fresh restore1 account/1 assignment/7 migrations/0 SENDING PASS, then readiness/auth/replay PASS. Same-host recovery only; prior tamper tests are historical separate evidence.
- Portable0.4 ZIP94138261 bytes/527 entries/testzip PASS; SHA2563ED56F6F9D770D7BBAB3D4A093A94CBA4DD2FBCB10E75E641ED0E7D8C074CC57. No runtime key/config/backup files; unsigned x64 self-contained, no installer/update channel.

## Explicit remaining gates
Final own-service verifier: runtime privilege/restart/data/startup PASS, other running-service set drift removed1, overall EXTERNAL_SERVICE_DRIFT/nonzero. Existing unrelated restart loop previously observed independently (I-010), untouched. No continuous host-wide invariance claim.
Broader GUI sensitive confirmations/review/reconciliation/export/selector-switch race, native popup/click, accessibility/load, account details/history and duplicate-name choice labels remain open. Single-owner access review/retention/key rotation/escrow/off-host schedules, live WhatsApp and live AI setup remain open. Per D-037 (2026-11-13), this is personal single-owner use: signing is not required, portable ZIP is the accepted delivery path, and installer/automatic updates are optional. Multi-user RBAC/enterprise distribution are outside personal scope. No real accounts/messages/AI calls or whole-host restart used.

Scope updated2026-11-13 from owner instruction; runtime/package/test evidence above remains from2026-11-12. No code or deployment changed for this decision.
