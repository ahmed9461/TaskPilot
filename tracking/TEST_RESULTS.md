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
| T-106 | Windows close/service restart | NOT RUN |
| T-108 | Encrypted backup/restore | NOT RUN |

Initial integration execution over high-latency SSH tunnel: FAIL (pool 5s acquisition timeout; downstream tests lacked fixture). Corrected pool wait to 20s and ran whole suite adjacent to PostgreSQL: PASS. Do not treat that failed attempt as a service deployment failure or live-user evidence.

Reproduce: dedicated DB named `*_test`, set TASKPILOT_TEST_DATABASE_URL securely, run `npm ci`, `npm run check`, `npm run test:integration`. Tests truncate only that dedicated database. Real WhatsApp, live AI and human UI acceptance NOT RUN.
