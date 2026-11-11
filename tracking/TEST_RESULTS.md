# نتائج الاختبار الفعلية
Date: 2026-11-11 UTC. Evidence: commands in repository, phase-1 backend commit containing this file.

| ID | Test / environment | Result |
|---|---|---|
| T-001 | Windows Node 24.15 `npm run check`, server Node 24.19 same command | PASS: tsc + 3 unit tests |
| T-101 | New-VPS own PostgreSQL 17, 12 concurrent same-message ingests + 6 same-account new sources | PASS: one assignment, all sources |
| T-102 | Multiple task types/periods/namespaces | PASS |
| T-103 | Source-scoped preview, reauth, one-use token, mock quoted transport, timeout/crash unknown handling | PASS; no real message sent |
| T-104 | Verified/manual versus UNVERIFIED flags | PASS |
| T-105 | Wrong phrase/reauth/stale preview/uncertain delivery block; single/all purge; archive/restore | PASS on synthetic records |
| T-107 | Two synthetic sessions; cross-session spoof rejected | PASS |
| T-109 | Unauthorized API/reveal denial, AEAD, minimized lists/events, encrypted-at-rest fixture | PASS |
| T-110 | `npm run test:integration` on server, ~4.7s | PASS: 13 tests including parent, zero skipped |
| T-111 | `npm audit --audit-level=low` | PASS: zero known vulnerabilities |
| T-106 | Service running independent of Windows; process restart test pending exact release | PARTIAL |
| T-108 | New-VPS AES-256-GCM pg_dump → fresh *_restore_test DB | PASS:1 account,1 assignment,2 migrations,0 sending |

Initial integration execution over high-latency SSH tunnel: FAIL (pool 5s acquisition timeout; downstream tests lacked fixture). Corrected pool wait to 20s and ran whole suite adjacent to PostgreSQL: PASS. Do not treat that failed attempt as a service deployment failure or live-user evidence.

Reproduce: dedicated DB named `*_test`, set TASKPILOT_TEST_DATABASE_URL securely, run `npm ci`, `npm run check`, `npm run test:integration`. Tests truncate only that dedicated database. Real WhatsApp, live AI and human UI acceptance NOT RUN.

## Native pilot phase
- 2026-11-11: isolated PostgreSQL suite expanded14/14 PASS,0 skipped (~7s including harness), including expired/stale reply tokens, idempotent key reuse, source arrival invalidating deletion snapshot.
- .NET10.0.404 / Windows App SDK2.6.5: Release build0 warnings/errors; self-contained x64 publish PASS after closing EXE locked during an intermediate rebuild.
- `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release`:6 checks PASS, no network; rejects insecure/non-root/userinfo/fragment addresses and short token, checks auth/reauth/response/error contracts. HTTP redirects disabled.
- Computer-use observed real WinUI Arabic RTL window; local fixture API18241, own PostgreSQL UI *_test DB reached via SSH25488. Account/task visible, password absent in list, reply target/text preview correct, canceled before approval. UI confirmation for send/delete/reveal not executed; no claims of full human acceptance.
- Deployed HTTP smoke:unauth401, ready PASS, liveSending false, replay dedupe PASS, one synthetic assignment and one review fixture.
- Backup file creation encrypted=true,32302 bytes; isolated restore PASS. No off-host/VPS-loss recovery claim.
- Direct Windows-to-VPS authenticated launch BLOCKED by auto-review; substitute fixture UI pass is distinct evidence.
- CI workflow committed next; hosted runs not yet observed.

## Stability/adapters phase
- `npm run check`: build +8 tests PASS (3 original,4 mocked AI provider/privacy cases,1 LF/CRLF migration-integrity regression).
- CI https://github.com/ahmed9461/TaskPilot/actions/runs/43059625322: PASS, both Ubuntu/PostgreSQL and Windows/.NET jobs on f659d9b.
- Deploy f659d9b: safely BLOCKED by checksum guard. Verified old SQL hash equals CRLF form of new LF SQL for both files; old62fddfe active. Corrected comparison preserves rejection of actual SQL changes; new full deployment evidence follows.
- AI live requests/billing and direct Windows-pilot auth remain NOT RUN.

- Stability rerun on New-VPS dedicated test DB:8 unit/adapter/integrity tests and14 PostgreSQL workflow tests PASS, including reauth/evidence reconciliation and no resend after reconciliation. WinUI rebuild0 errors/warnings. Runtime least-privilege separation and restart verifier added; actual verification pending deployment.
