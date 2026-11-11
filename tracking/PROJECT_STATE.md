# الحالة الحالية — المصدر المرجعي
2026-11-11. Synthetic pilot0.3.0 IMPLEMENTED/VERIFIED/DEPLOYED; production acceptance open.
Branch feat/mvp-foundation. Runtime `dc762279879392daa02e80fe5d7a95a4269d618f`; Windows binary96e4cbeed6b0ff796240fde83a01cf5cc6fc7b19 (later changes are deployment tooling/tests/docs only).

## Runtime
Own taskpilot.service/taskpilot user, root-owned immutable releases/current. API127.0.0.1:8240; own PostgreSQL17/container/volume127.0.0.1:15488, restricted runtime DML role and root-only migrations. Six migrations. Existing services/proxy/firewall/SSH unchanged. Exact-version bounded readiness and authenticated smoke PASS, liveSending=false/provider mock.

## Verified0.3
- Expiry/401 versus network interruption,10/20/40/60s read backoff, explicit SSH reconnect; no mutation replay/perpetual renewal.30-minute sessions and60-second one-use reauth remain pilot-only.
- Latest-first notification pages/read filter/bounded read IDs/unread badge, committed-head initial sync and replay-safe preserved cursor. Filtered safe audit and own-app count/age monitoring.
- Optional session-only silent count-only native Windows notifications. Actual local API probe supported/enabled/accepted/stored/generic=true; popup/click/after-close delivery not inferred. No cloud push or background receiver.
-11 Node tests/build/format/known-secret+UTF8 scan,18 isolated PostgreSQL tests including parent,20 offline C# checks, WinUI Release/publish0 errors/warnings PASS. npm audit0.
-25 C# Windows→SSH→New-VPS checks PASS, namespace synthetic-acceptance-9da8ad78d8 account fixtures removed/sessions revoked; includes owned-tunnel loss/fresh reconnect/activity/audit/monitoring.
- Actual WinUI on VPS: monitoring6 migrations; filtered audit1–4/4; notifications page2 results51–100/107; synthetic task saved COMPLETED; reply text/quoted source preview then CANCEL; owned SSH child stopped, outage banner observed, reconnect succeeded with synthetic-draft-preserved still in filter. GUI closed; owned tunnels0; synthetic-ui-acceptance account cleaned (deleted1).
- Encrypted backup46916 bytes; fresh isolated restore1 account/1 assignment/6 migrations/0 SENDING PASS. Same-host only. Portable ZIP94133913 bytes/527 entries testzip PASS; SHA256DE14479211F94E12538F9A8DE2C2935D421F5AB20E281B90C8216C775F94C71B. No runtime keys/backups/config in ZIP, unsigned.

## Explicit caveats
Final ops verifier: own privileges/restart/data/startup PASS; other-service set changed (removed1), overall EXTERNAL_SERVICE_DRIFT/nonzero. Prior independent existing-service restart loop I-010 is untouched. No continuous host-wide invariance claim.
Hosted CI5833c73/96e4cbe/dc76227 remains QUEUED, latest43097850475 jobs=[] at inspection. Current local/server tests PASS are not hosted CI PASS. Prior0.2 CI is historical only.

## Open
Editable/scoped reply templates and wider native workflow acceptance; load/accessibility; full GUI sensitive confirmations; native popup/click activation; production MFA/RBAC/retention/key rotation/escrow/off-host schedules; signed installer/update channel. Live WhatsApp and AI disconnected and require separate approval/config. No real accounts/messages/AI calls/host reboot/rollback used. Historical0.1/0.2 evidence in TEST_RESULTS remains distinct.

## 0.4 template stage — IN_PROGRESS / local verification
Implemented editable/versioned/scoped/available templates with migration007, paged administration and source-matching choice UI. Preview/approval scope checks and template version rejection protect old unapproved snapshots; approved body remains unchanged. Group FK locks acquired before template locks to align with approval.11 Node tests and first19 PostgreSQL tests PASS; final race extension/WinUI build/direct28-check acceptance and deployment are being verified. Server remains0.3 dc76227 until rollout; do not infer deployment or full GUI acceptance from implementation.

0.4 final predeployment verification:11 Node/build/format tests,19 isolated PostgreSQL tests including scoped-edit versus approval race PASS, WinUI Release0 warnings/errors and20 offline C# checks PASS. New reply selector queries server candidates per selected source with stale-response guards; editing preserves stored scopes absent from the first100 choice rows. Expanded28-check Windows↔VPS runner prepared; runtime/UI acceptance follows deployment. No real WhatsApp/AI or messages.
