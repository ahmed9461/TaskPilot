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

## Continuation stage1 � SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.
