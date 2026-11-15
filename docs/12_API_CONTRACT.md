# API v1 — implementation reference (synthetic pilot)

Implemented in `services/api/src/app.ts`; runtime validation in Zod/contracts and PostgreSQL constraints. See appended live WhatsApp and manual AI contracts for current endpoints. Unlisted target features remain TODO.

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
| GET /v1/reply-jobs | latest500; account/task/group/session labels plus existing fields; status distinct from task; provider-separated dispatch, crash/ambiguous outcome becomes UNKNOWN_DELIVERY, no automatic retry |
| POST /v1/reply-jobs/:id/cancel | reauth; strict `{}`; APPROVED→CANCELED only; repeat CANCELED is idempotent; SENDING/SENT/FAILED/UNKNOWN_DELIVERY409REPLY_NOT_PENDING. Locks account then job; one audit/notification; assignment status unchanged |
| POST /v1/issue-flags | `{accountId,kind,evidenceKind}`; INVALID_ACCOUNT_PASSWORD/INVALID_ACCOUNT_CODE require reauth and MANUAL/AUTHORIZED_CHECK; UNVERIFIED_CREDENTIALS cannot prove error |
| POST /v1/deletions/preview | `{ids:[...]}` or `{all:true}`; fixed IDs/aggregate versions/counts; max1000 |
| POST /v1/deletions/confirm | reauth; `{approvalToken,confirmation:'DELETE N'}`; atomic purge of scoped records, blocks SENDING/UNKNOWN_DELIVERY; changed task/source/reply invalidates snapshot; all also purges unassigned review |
| GET /v1/notifications, /v1/changes?cursor=N | durable safe events; changes `{items,cursor}`; monotonic commit ordering |
| POST /v1/notifications/:id/read | durable read timestamp |
| GET /v1/audit | redacted action/UUID/time, no raw message/password |

## Pilot limits / pending contracts
Live pairing/disconnect/session health, production JWT/MFA, rate limiting across multiple API hosts, true push/toast notifications, production retention/key rotation are not all implemented; manual AI is specified below. UI uses safe polling and server persistence. Backup/restore uses isolated operator tooling (not public API).

## SSH client sessions (continuation)
Migration004 stores only hashes of30-minute owner sessions. Root-only issue-client-session CLI uses the existing SSH trust channel, never HTTP or permanent API-key export. Each sensitive action uses a fresh60-second single-use grant from --reauth SESSION_ID. Expiry/revocation/consumption checked server-side; operator file keys remain supported locally. POST /v1/client-session/revoke revokes the caller session. Windows SshConnection owns its loopback tunnel, uses BatchMode and strict existing host trust, and kills only its child tunnel at window close. Explicit logout revokes; expiry is the fallback on lost connection. No passwords/tokens are persisted by Windows. Production MFA remains open.

## Continuation: routing, list pages, export and task-only deletion
- All accounts/assignments/inbox lists accept `page=true` to return `{items,total,limit,offset}`; default remains an array. Read count+page from one read-only repeatable-read snapshot. Windows uses pages of50.
- Accounts: namespace/archived=all|active|archived/search. Assignments: search/status/sessionId/groupId/taskTypeId/accountId/periodKey/minPriority and account filters; source filters apply to the same source row. Inbox: groupId/sessionId. Invalid UUID/status/limits rejected; names are parameterized and LIKE wildcards escaped.
- GET /v1/group-rules?groupId=UUID; POST /v1/group-rules `{groupId,taskTypeId,keywords:[...],priority:0..100}`; PATCH /v1/group-rules/:id `{version,enabled?,taskTypeId?,keywords?,priority?}` with at least one change field. Highest keyword priority wins; tied distinct task types require review. Identity/credential lines cannot route. Unrelated messages retain only IGNORED dedupe metadata, no raw payload.
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

##0.6.0 manual AI
- GET /v1/ai/config: safe settings/version/keyConfigured only. PATCH with reauth, strict {version,provider:deepseek|openrouter,model,enabled,outboundApproved,dailyRequestLimit:1..100,dailyTokenLimit:1000..100000}; enabling checks current model catalog.
- GET /v1/ai/models?provider=deepseek|openrouter: explicit authenticated upstream catalog. GET /v1/ai/usage: UTC aggregate plus recent20 safe ledger entries; token reservations, estimates and provider-reported cost separate.
- POST /v1/inbox/:id/ai-preview: local candidate task codes/sourceVersion/settingsVersion, no upstream. POST ai-suggestion with reauth and strict {idempotencyKey:16..200}; REVIEW encrypted source only, no raw input accepted. Always needsReview/automaticActions=false. Status SUCCEEDED,UNAVAILABLE,REQUESTED or local ABSTAINED; repeated key reuses stored request. Manual resolve uses existing source version.
- AI_DISABLED403,AI_CONFIGURATION_REQUIRED409,AI_MODEL_UNAVAILABLE409,AI_REVIEW_SOURCE_REQUIRED409,AI_IDEMPOTENCY_CONFLICT409,AI_DAILY_LIMIT429,AI_UNAVAILABLE503. No raw provider responses or key values returned.

##0.8 privacy contract
Authenticated GET /v1/privacy/retention returns versioned review_days/failed_ingress_days/expired_access_days/read_notification_days, manual-execution/retained classes/batch limit. PATCH same path requires reauth and strict camelCase days+version; bounded and optimistic. POST /v1/privacy/retention-preview {} returns one-use300s approvalToken/confirmation/counts/more/policyVersion/cutoffAt; no raw data. POST /v1/privacy/retention-execute {approvalToken,confirmation} requires reauth and exact CLEAN RETENTION. Changed selected row/eligibility/policy rejects STALE_PREVIEW atomically; new rows not in frozen batch untouched. GET /v1/privacy/runs returns latest20 minimal IDs/kind/counts/time.
POST /v1/sessions/:id/forget-preview requires stopped Baileys/session lease/no SENDING or UNKNOWN_DELIVERY; returns UUID/label/counts/historyPreserved/confirmation FORGET UUID/token300s. POST /v1/privacy/forget-session {approvalToken,confirmation} requires reauth; verifies snapshot, performs local forgetting atomically. SESSION_FORGOTTEN prevents reconnect/group-enable; STOP_SESSION_BEFORE_FORGETTING and WHATSAPP_SESSION_IN_USE protect active connection. GET sessions adds forgotten_at; FORGOTTEN status is historical only. Existing source/account/task/SENT metadata retained, auth/quotes/queued raw removed. No external logout/send.

##0.8.2 outbox result recovery (candidate)
Reply status/API shapes unchanged. A provider result is persisted with a SENDING-only guard and one audit/notification; temporary DB failure retries only this persistence before another claim, never transport. Lost final COMMIT response cannot downgrade SENT. A lost pre-provider claim response resolves durable SENDING as definitely FAILED; rolled-back APPROVED is untouched. Process loss conservatively recovers SENDING to UNKNOWN_DELIVERY with durable activity; human reconciliation remains required and never requeues. No migrations.

## Atomic rule editor0.8.2
Authenticated GET /v1/groups/:id/rule-editor returns {group:{id,title,version,readOnly},rules,taskTypes}. Snapshot locks session/group for consistent group/rule versions. Forgotten metadata is readable, never writable.
Authenticated POST /v1/groups/:id/rules accepts strict {groupVersion:positiveInt,updates:[{id,version,enabled?,taskTypeId?,keywords?,priority?}],create?:{taskTypeId,keywords,priority}}.<=100unique update IDs, each with at least one change field; keywords1..20/each1..100trimmed chars, priorityinteger0..100. At least one update/create. Stale versions/cross-group rule409CONFLICT, malformed400, unknown group404, forgotten409SESSION_FORGOTTEN. Session→group→rule lock order; all data/activity atomic. Group version advances once if any change, equal full updates leave versions/activity stable. Response{group,rules,changed}. New rules affect future ingestion, never rewrite prior assignments. No HTTP mutation replay; lost response requires fresh snapshot. Windows069 requires085 for full edits; no sequential fallback.

## Sending policy control (0.8.5)
Authenticated read-only GET `/v1/whatsapp/sending-policy` returns `{enabled,controlAvailable,connectionEnabled,connected,groups,unsettled}` counts, no identities/keys. Main-process `/health` adds livePolicyControl/sendingPolicyReady/liveSendingEnabled; only the sending gate can reload via HUP. Invalid/unreadable policy disables sending without taking down reception. Immutable startup connection approval cannot be enabled through HUP. Assignment source lists and reply previews additionally return readable group/session labels and receivedAt; identifiers remain for source selection.

No HTTP mutation of the root-owned environment. Windows invokes fixed SSH `node /opt/taskpilot/current/ops/sending-policy.mjs`, JSON stdin only: preview(enabled), apply(token,confirmation,reauth), discard(token), each carrying the current temporary clientToken. Root-only entry accepts no path/command arguments or override environment. Preview is private root0700/0600,60seconds, client-bound/single-use, snapshots config/session/group/pending jobs. Apply requires current single-use60-second SSH reauth and exact Arabic phrase returned by preview. Rotation/policy share8240008 admin lock. Enable requires connection approval, exactly1connected requested session, >=1enabled bound group for it, and0live APPROVED/SENDING/UNKNOWN jobs; stale/expired/mismatched preview refuses writes. Atomic env replacement preserves other bytes/owner/mode, signals only TaskPilot main; health ACK required. Uncertain change forces false; if disabled state cannot be verified, stop only TaskPilot. No-op performs no write/signal/audit. Disabling cannot recall an already-started message. Each new reply still requires separate preview/reauth/approval.

### 0.8.6 durable policy decision (supersedes the env-only activation above)
Health advertises `livePolicyControlVersion:2,policyPhase:COMMITTED|PENDING|INVALID,policyOperationId`. Authenticated policy status adds `phase,operationId,recoveryRequired`. Preview adds currentEnabled/phase and freezes the private journal hash as well as env/DB state. Root CLI requires protocol2; no fallback to old env-only activation. Incomplete/invalid state blocks enable with SENDING_POLICY_RECOVERY_REQUIRED, but allows a separately previewed/typed/reauthed disable/recovery when the protected env is parseable.

`/etc/taskpilot/sending-state.json` is root-owned0640. The operator durably replaces PENDING before touching env, durably replaces env preserving bytes/owner/mode, commits an authorization audit, then atomically replaces COMMITTED with the operation UUID and exact env SHA. File contents and parent directory are fsynced. The live connector checks the matching committed decision synchronously at approval/transport gates; missing/corrupt/mismatched/PENDING always disables sending, including startup. HUP is a probe, never a WhatsApp reconnect. Authorization audit is an intent, not a delivery or activation receipt; current phase/operation identify the outcome. Only the durable COMMITTED decision permits enable. A command killed before that point leaves sending disabled; a killed/lost response after commit can leave the authorized committed state enabled, which must be read back instead of replaying. Caught failures publish a new disabled decision linked to the previous operation, or stop only TaskPilot if verification fails. No additional watchdog service or DB migration.

Deployment bootstrap `node ops/initialize-sending-policy.mjs` is root-only, shares the rotation/admin lock, refuses enabled env or an existing journal and creates only a disabled committed decision. Downgrading to085 requires verifying envfalse before starting old code, because085 does not understand the journal. Recovered app probes keep providers disabled and do not restore an enabled root policy.

API0.8.3: explicit multiline message parsing and keyword routing accept LF, CRLF and CR consistently (including WinUI TextBox input). Identity/credential lines remain excluded from task routing; ambiguous explicit fields still require review. No wire/schema change.

API0.8.4: GET /v1/me advertises mockEnabled; false blocks mock session/message creation and Windows hides simulation actions. PATCH /v1/groups/:id accepts strict {version,enabled?,taskTypeId?}, at least one change. Task changes preserve existing assignments/receive_after, require current group version/valid task FK, invalidate old editor/approval snapshots and keep real-group reauth/forgotten-session fences.
