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
