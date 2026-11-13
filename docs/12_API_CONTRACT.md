# API v1 — implementation reference (synthetic pilot)

Implemented in `services/api/src/app.ts`; runtime validation in Zod/contracts and PostgreSQL constraints. No live WhatsApp or AI endpoints. Unlisted target features remain TODO.

## Access
- `GET /health` is minimal/unauthenticated; every other endpoint including `/ready` requires `Authorization: Bearer <owner token>`.
- Sensitive operations additionally require `X-Reauth-Secret`. Both independent random secrets are loaded from external files, >=32 characters. This is a closed SSH pilot identity, not production MFA/short sessions.
- Loopback binding only. Maximum body 32 KiB, 120 requests/minute/IP, no-store responses; no request payload logging. Errors return `{code}` without input/SQL/provider details.
- Lists: accounts/assignments/inbox accept `limit` (1..500), `offset`, optional `search`; other resource lists are capped. Incremental notifications use `cursor`.
- JSON resource rows use SQL snake_case. Requests use camelCase; IDs are UUIDs, versions positive integers. POST normally returns 200. Validation 400; auth 401; reauth/scope 403; absent 404; conflicts 409; unavailable 503.

## Implemented routes
| Routes | Request / behavior |
|---|---|
| GET /ready, /v1/me, /v1/dashboard | readiness, owner/capabilities, counts |
| GET/POST /v1/sessions | POST `{label}` creates mock only |
| POST /v1/sessions/pairing-request | always 403 LIVE_WHATSAPP_NOT_AUTHORIZED |
| GET/POST /v1/task-types | POST `{code,name}` |
| GET/POST /v1/groups | POST `{sessionId,externalGroupId,title,taskTypeId,namespace,periodKey}` |
| PATCH /v1/groups/:id | `{version,enabled}` |
| POST /v1/mock/messages | `{sessionId,groupId,externalMessageId,text}`; explicit enabled group/session; replay `{duplicate:true}`; otherwise REVIEW/PROCESSED |
| GET /v1/inbox | safe review metadata; encrypted body excluded |
| POST /v1/inbox/:id/reveal | reauth, `{text,expiresInSeconds:30}`; client hides after 30s |
| POST /v1/inbox/:id/resolve | reauth, `{version,account:{namespace,username,displayName,password?}}`; group namespace must match; conflicting passwords require explicit account update first |
| GET/POST /v1/accounts | POST `{namespace,username,displayName,password?}`; namespace+NFKC/lowercase username unique; no fuzzy name merge |
| PATCH /v1/accounts/:id | `{version,displayName,password?}`; password change requires reauth |
| POST /v1/accounts/:id/reveal | reauth; credential only here, never ordinary list; 30s client presentation |
| POST /v1/accounts/:id/archive or /restore | `{version}`; archive cancels APPROVED jobs; historical tasks retained |
| GET /v1/assignments | independent account/task/period and all source references |
| PATCH /v1/assignments/:id/status | `{version,status}`; NEW/NEEDS_REVIEW/IN_PROGRESS/COMPLETED/CANCELED; recorded reopen, no automatic send |
| GET/POST /v1/reply-templates | `{code,body}`; only `{displayName}`/`{taskName}` placeholders |
| POST /v1/reply-jobs/preview | `{assignmentId,sourceMessageId,templateId}`; body/target/provider and five-minute one-use approvalToken |
| POST /v1/reply-jobs/approve | reauth; `{approvalToken,idempotencyKey}`; stale assignment/group rejected; key conflict rejected; repeated logical key reuses job with fresh preview |
| POST /v1/reply-jobs/:id/reconcile | reauth; `{outcome:CONFIRMED_SENT or CONFIRMED_NOT_SENT,evidenceKind:MANUAL or PROVIDER_RECEIPT,providerMessageId?}`; UNKNOWN_DELIVERY only; provider receipt requires message ID; manual owner verification is explicit; records SENT/FAILED, never requeues |
| GET /v1/reply-jobs | status distinct from task; mock dispatch only; SENDING crash/ambiguous exception becomes UNKNOWN_DELIVERY, no automatic retry |
| POST /v1/issue-flags | `{accountId,kind,evidenceKind}`; INVALID_ACCOUNT_PASSWORD/INVALID_ACCOUNT_CODE require reauth and MANUAL/AUTHORIZED_CHECK; UNVERIFIED_CREDENTIALS cannot prove error |
| POST /v1/deletions/preview | `{ids:[...]}` or `{all:true}`; fixed IDs/aggregate versions/counts; max1000 |
| POST /v1/deletions/confirm | reauth; `{approvalToken,confirmation:'DELETE N'}`; atomic purge of scoped records, blocks SENDING/UNKNOWN_DELIVERY; changed task/source/reply invalidates snapshot; all also purges unassigned review |
| GET /v1/notifications, /v1/changes?cursor=N | durable safe events; changes `{items,cursor}`; monotonic commit ordering |
| POST /v1/notifications/:id/read | durable read timestamp |
| GET /v1/audit | redacted action/UUID/time, no raw message/password |

## Pilot limits / pending contracts
Live pairing/disconnect/session health, production JWT/MFA, rate limiting across multiple API hosts, true push/toast notifications, production retention/key rotation and live AI are not implemented. UI uses safe polling and server persistence. Backup/restore uses isolated operator tooling (not public API).

## SSH client sessions (continuation)
Migration004 stores only hashes of30-minute owner sessions. Root-only issue-client-session CLI uses the existing SSH trust channel, never HTTP or permanent API-key export. Each sensitive action uses a fresh60-second single-use grant from --reauth SESSION_ID. Expiry/revocation/consumption checked server-side; operator file keys remain supported locally. POST /v1/client-session/revoke revokes the caller session. Windows SshConnection owns its loopback tunnel, uses BatchMode and strict existing host trust, and kills only its child tunnel at window close. Explicit logout revokes; expiry is the fallback on lost connection. No passwords/tokens are persisted by Windows. Production MFA remains open.

## Continuation: routing, list pages, export and task-only deletion
- All accounts/assignments/inbox lists accept `page=true` to return `{items,total,limit,offset}`; default remains an array. Read count+page from one read-only repeatable-read snapshot. Windows uses pages of50.
- Accounts: namespace/archived=all|active|archived/search. Assignments: search/status/sessionId/groupId/taskTypeId/accountId/periodKey/minPriority and account filters; source filters apply to the same source row. Inbox: groupId/sessionId. Invalid UUID/status/limits rejected; names are parameterized and LIKE wildcards escaped.
- GET /v1/group-rules?groupId=UUID; POST /v1/group-rules `{groupId,taskTypeId,keywords:[...],priority:0..100}`; PATCH /v1/group-rules/:id `{version,enabled}`. Highest keyword priority wins; tied distinct task types require review. Identity/credential lines cannot route. Unrelated messages retain only IGNORED dedupe metadata, no raw payload.
- Inbox metadata now includes namespace/routing_task_type_id/routing_ambiguous. Resolve accepts optional taskTypeId; ambiguous routing requires explicit task selection. Classified routing is stored at ingest and used for review.
- POST /v1/reports/export (reauth): `{resource:accounts|assignments,query:{...list filters/limit/offset}}` returns `{filename,content,rowsCount,total}` for that filtered page only. CSV allowlist excludes credentials/source bodies; formula-like cells are escaped. Windows asks for a save path after preview/approval.
- POST /v1/assignments/:id/deletion-preview → five-minute single-use preview with confirmation DELETE TASK. POST /v1/assignments/:id/delete `{approvalToken,confirmation}` (reauth): preserves account and other assignments/credentials; deletes only unshared source records; uncertain delivery blocks purge; stale versions reject.

## 0.3: activity and operational visibility
- GET `/v1/notifications/state` → `{newestId:string,unreadCount:number}` from one committed snapshot. Client seeds its cursor at head only for a new workspace, avoiding old toast replay; same-workspace explicit reconnect keeps the cursor. This does not mark old notifications read.
- GET `/v1/notifications?page=true&limit=50&offset=0&read=all|unread|read&type=EVENT_CODE` → snapshot `{items,total,limit,offset}`, newest ID first, safe metadata only. Without page=true the prior ascending cursor array remains compatible. Limits1..500; offsets0..1000000.
- POST `/v1/notifications/read` `{ids:[numeric IDs]}` (1..100, safe integers) marks only those existing IDs; repeat leaves original read timestamp intact. Individual read endpoint remains supported.
- GET `/v1/audit` still returns array by default; `page=true` enables the same envelope. Optional `action=UPPERCASE_CODE`, `targetId=UUID`, `from=ISO8601`, `to=ISO8601`; invalid/reversed dates rejected. Allowlisted audit fields only, no raw messages/credentials.
- GET `/v1/operations` (authenticated) → observedAt/migrations/processUptimeSeconds/provider/liveSendingEnabled/counts/oldestReviewSeconds/oldestApprovedSeconds. Aggregate own-application state only; no server process identifiers, paths, keys or account names. It is an on-demand snapshot, not a backup-success or live-provider proof.
- GET `/v1/changes` adds hasMore (500-row batch may have further records). Cursor order/late commit serialization remains unchanged. Client drains successive batches over polling; no POST is automatically replayed.

## 0.4: editable scoped templates
- POST `/v1/reply-templates` additionally accepts enabled (default true), groupId/taskTypeId (optional nullable). Existing global templates migrate as version1/enabled.
- PATCH `/v1/reply-templates/:id` `{version,body?,enabled?,groupId?,taskTypeId?}` needs at least one editable field. Optimistic conflict409; null clears a scope. code is immutable. Only displayName/taskName placeholders, same2000-character limit; unsafe variables rejected.
- GET list remains an array by default, accepts page=true envelope with limit/offset, search(code), enabled=all|true|false and candidate groupId/taskTypeId filters. Candidate filters include global/null templates. Joined group_title/task_name are safe UI labels. Admin pages50 rows; client reply choice uses enabled/matching templates and rechecks on the server.
- Preview rejects disabled or scope-mismatched templates. Approval locks source/account/group/template and requires unchanged templateVersion as well as existing assignment/group snapshots. Old pre-migration unapproved tokens without templateVersion fail STALE_PREVIEW and need a new preview.
- Edits/disabling affect future previews/approvals. Already-approved jobs keep the exact approved body/target; no edit rewrites/requeues/resends them. This is explicit in the Windows edit dialog. TEMPLATE_UPDATED audit contains only event/UUID/time, not body.

## WhatsApp connector0.5
كل المسارات authenticated/no-store. POST `/v1/sessions` يقبل provider=mock|baileys (default mock)؛ baileys ينشئ STOPPED metadata فقط. GET `/v1/whatsapp/capabilities`: implemented/provider/version/unofficial/connectionEnabled/sendingEnabled/pairingMethod/maxActiveSessions. `/v1/me` وoperations يعكسان مفتاحي الاتصال والإرسال. Session list لا يعرض auth/QR/epoch.

POST `/v1/sessions/:id/connect` مع reauth و`{confirmation:"CONNECT WHATSAPP",acknowledgeUnofficial:true}`؛ server connection gate إلزامي. POST `disconnect` مع reauth يوقف الاستقبال/الإرسال دون محو auth. POST `pairing` مع reauth يرجع image=data PNG وexpiresInSeconds<=45 أوPAIRING_QR_EXPIRED؛ لا حفظ. POST `available-groups` مع reauth وCONNECTED يرجع externalGroupId/title فقط. POST groups للجلسة الحقيقية يحتاج reauth ومعرفًا من آخر discovery؛ PATCH enabled يحتاج reauth للجلسة الحقيقية. `/v1/mock/messages` يرفض provider آخر.

GET `/v1/whatsapp/ingress-errors`: أول100ERROR، id/session_id/group_id/attempts/last_error_code/received_at فقط. POST `/v1/whatsapp/ingress-errors/:id/retry` مع reauth و`{confirmation:"RETRY INGRESS"}` يعيد معالجة داخلية، لا إرسال. Purge previews تضيف pendingIngress وتشمل PENDING/ERROR stamp؛ تغيره يرفض STALE_PREVIEW.

Reply preview يحدد provider؛ approve يرفضLIVE_SENDING_NOT_AUTHORIZED إذاالجلسةحقيقية والإرسال غيرمصرح. لا automatic send/retry من preview أو template edit. Existing old pairing-request remains403.

## Account detail projection0.5
GET `/v1/accounts/:id/details?section=tasks|sources|flags|history&limit=50&offset=0`: authenticated، repeatable-read snapshot، account/section/items/total/limit/offset؛ max100/offset1e6، unknown params rejected، missing account404. Tasks show code/name/state/period/priority/source/reply counts. Sources include distinct task sources and review_account_id credential conflicts، group/session labels/state/time/external ID only. Flags are recorded kind/verified/evidence/time، not a fresh login verification. History is redacted audit of the account and currently linked task/source/reply/flag IDs؛ purged identities cannot be reconstructed from it. No raw/encrypted payload/credentials/auth selected.

0.5.2 deployed: authenticated GET `/v1/sessions/:id/receive-diagnostics` returns active/scope=enabled-groups-only/resetOnProcessRestart/counts/lastObservedAt. Counters are bounded and process-local; keys are fixed reason codes only, no message/group/participant IDs or bodies. Counts include selected-group history/self/rejected/accepted envelopes; accepted count is not proof of business processing (durable ingress/source is separate). No past event reconstruction.
Diagnostics also return bestEffort=true. Rejected-event observations have an independent10-query concurrency cap and never consume durable ingress queue capacity or disconnect the session. Counts are sampled under bursts and capped1000000 per fixed reason; restart resets them.

0.5.3: receive-diagnostics adds durable aggregate counts/firstReasons/lastReasons/acceptedAppendReceipts/withSenderKeyMetadata/acceptedWithoutIngress plus diagnostic retention7 days/max10000, no hashes or packet bodies in API. Group projections add receive_after. Creation starts monitoring at now; enabling a stopped group advances the boundary. Direct selected notify/append text after both consent boundaries can be accepted; bulk history remains disabled.
