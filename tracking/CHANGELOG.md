# سجل التغيير
## [0.1.0-dev] — 2026-11-11
### Added
- Executable TypeScript API, PostgreSQL migrations/contracts, conservative Arabic/English parser.
- Mock sessions/groups, deduplicated multi-source assignments, encrypted review/credentials.
- Auth/reauth, audit/notifications/cursor, status concurrency, preview/approval/outbox and safe purge.
- Isolated pilot PostgreSQL provisioning and hardened systemd definition (API deployment pending).
- Unit and PostgreSQL adversarial integration tests.
### Fixed
- Increased pool acquisition timeout after reproducing queue pressure over SSH tunnel.
- Conflicting/archived credentials retain an encrypted review with account ownership; all purge clears unassigned inbox too.
### Security
- Live WhatsApp absent and sending hard-disabled; AI disabled. Loopback only, external keys, redacted errors.
- Updated zod/tsx/esbuild until npm audit reported zero vulnerabilities.
### Pending
- Windows app, running API pilot, encrypted restore and production identity/retention/live connector acceptance.

## Native pilot phase — 2026-11-11
### Added
- WinUI3 native Arabic RTL navigation/dashboard/accounts/tasks/inbox/session/group/templates/notification forms, secure connection, theme, timed credential view and confirmation previews. Synthetic message entry for testing.
- Self-contained portable x64 publication; client contract checks, locked NuGet graph and pinned GitHub Actions CI.
- Hardened independent pilot API deployment, SSH-only access, encrypted dump/isolated restore tooling and actual HTTP smoke.
### Fixed / Security
- New task/source/reply invalidates account deletion preview via aggregate version; account lock ordering before status/approval writes.
- Disabled HTTP redirects for sensitive headers; bounded lists/body/rate, independent reauth, repository pattern scan.
- Deferred navigation refresh during active actions and serialized poll refresh.
### Pending
- Live WhatsApp/AI, production identity/retention/escrow, selected bulk UI, advanced rules/paging/toasts, unknown reconciliation, signed installer and update channel.

## Stability/adapters phase — 2026-11-11
### Added
- Owner-confirmed unknown-delivery reconciliation with evidence/reauth; no automatic resend. Selected-account Windows purge preview.
- DeepSeek/OpenRouter task-code-only adapters with disabled/approval gates, bounded output/time, usage counters and mocked tests; not activated in runtime.
### Fixed
- Historical Windows CRLF migration archive caused checksum guard to block Linux rollout. Verify LF/CRLF byte equivalence only and store canonical LF checksum; SQL edits still rejected. Prior release stayed running.
- Arabic validation feedback in Windows.

Security deployment follow-up: runtime DB role separated from root-only migration owner; grants limited to DML in own pilot DB, DDL/migration writes denied by design. ops/verify-pilot.mjs checks actual privileges, restart/data preservation and unchanged other running services. Final deployed evidence follows.

## Final pilot verification — 2026-11-11
Deployment eb0f66b, restart/least-privilege/isolation/HTTP smoke and encrypted restore/tamper checks PASS. CI43061180349 both jobs PASS. Portable Windows ZIP validated; temporary local fixtures stopped. Remaining production and UI work is explicit in TODO.

## Continuation stage1 — SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.

## [0.2.0-pilot] — 2026-11-11
- SSH-issued30-minute Windows sessions with hashed storage, revoke/expiry and60-second one-use reauth; permanent server keys stay server-local.
- Deterministic group keyword/priority rules and ambiguity review; unrelated chat raw text is discarded.
- Snapshot page envelopes and scoped filters, Arabic statuses, safe filtered-page CSV, task-only preview/purge preserving account/other tasks.
- Windows busy indicator and deferred polling refresh while draft filters/selection are active.
- Direct C# Windows↔New-VPS19-check acceptance PASS, actual native account create/edit/filter/archive/restore and deletion preview/cancel observed. Own fixtures cleaned.
- Fixed acceptance fixture missing routing keyword; explicit UTF-8 edit/scan enforcement after locale corruption was repaired.
- Still synthetic-only and unsigned; real WhatsApp/AI, production MFA/retention/off-host recovery and full human GUI acceptance remain open.

Operations follow-up: a single generic verifier failure was not reproducible on the unchanged bfcbbd4 release. Added safe per-check stage diagnostics and bounded DB/HTTP probes rather than exposing raw errors/secrets; cause remains unconfirmed in I-010. Five-migration encrypted restore and bfcbbd4 CI both PASS.

Final0.2.0 source17f846e deployed; CI43093897111 both jobs PASS. Encrypted5-migration restore and portable ZIP verified. I-010 later isolated to independent existing-service auto-restart, left untouched; final single-sample diagnostic full verifier PASS. No claim that the other service is repaired.

## 0.3 continuation — connection reliability (local VERIFIED)
Windows distinguishes401/revocation/local session expiry from transient transport failures. Read polling backs off10/20/40/60s; mutations are never retried automatically. Explicit reconnect preserves same-workspace cursor/filters; manual token mode disposes prior SSH session; logout clears identity. Added reconnect UI, expiry display, shutdown guards and draft protection when deselecting accounts/changing task status. Release build0 warnings/errors and6 original +7 simulated reliability checks PASS. Not deployed/visually accepted yet; server remains17f846e.
