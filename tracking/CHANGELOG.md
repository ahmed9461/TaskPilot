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
