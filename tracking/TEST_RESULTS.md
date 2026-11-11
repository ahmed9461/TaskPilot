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



## Final code acceptance — eb0f66b

- CI43061180349 PASS: Ubuntu/PG backend and Windows/.NET jobs. Source https://github.com/ahmed9461/TaskPilot/commit/eb0f66bbc35ff008767501526612bdf0e9a94999 .

- New-VPS runtime role least-privilege PASS: NOSUPERUSER, no create DB/role, CREATE TABLE denied42501, schema_migrations UPDATE denied42501.

- Actual taskpilot restart PASS: changed PID, counts identical, other running service list identical, enabled at startup. Active, NRestarts0, observed MemoryCurrent28762112. Host reboot/rollback NOT RUN.

- Final HTTP auth/ready/replay PASS after restart; liveSendingfalse. API8240/DB15488 only127.0.0.1.

- Final encrypted backup32635 bytes; fresh restore DB1 account/1 assignment/3 migrations/0 SENDING. Tampered ciphertext rejected with no target database created.

- Self-contained Windows publish PASS and6 client checks PASS. ZIP96852413 bytes/527 entries: testzip PASS, executable present, no runtime key/backup/log files. SHA2564FEE0763349A0A0258302CDD1F9526FA14FF4BBEFA1618AA02B38EED88708C04.

- Temporary Windows fixture client/API/SSH forwards stopped; VPS pilot intentionally remains active. Full live acceptance not claimed.



## Continuation stage1 — SSH sessions

Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.



Stage1 predeployment evidence:8 Node tests/build PASS, dedicated New-VPS PostgreSQL suite15/15 PASS including session lifecycle, WinUI Release0 warnings/errors and6 offline C# checks PASS. Direct server acceptance is next, not yet claimed.


Windows-to-New-VPS acceptance stage1 PASS:15 C# checks through SshConnection/ApiClient, namespace synthetic-acceptance-71230d4079; scoped fixture accounts removed, session revoked, no permanent key exported/no real send. This is direct-server transport/workflow evidence; visible WinUI acceptance is separate.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.

Continuation expanded C# Windows-to-New-VPS run PASS:19 checks; namespace synthetic-acceptance-fb76da4ff9 cleaned and client session revoked. Covers rule-routed priority/filter page, CSV export, independent task purge plus original workflow. Initial expanded run failed because the test message lacked its routing keyword; corrected fixture, then reran whole acceptance successfully. Two leftover synthetic accounts from that failed namespace were purged through scoped API (not delete-all).
Native WinUI observed against actual New-VPS: connected SSH login, Arabic rendering, account create/edit, namespace filter yielding1/1, archive then restore. Destructive confirmation not executed by GUI; API/C# scoped purge tests are separate evidence. CI a95b018 both jobs PASS: https://github.com/ahmed9461/TaskPilot/actions/runs/43090281021 .

0.2.0 local final polish: WinUI Release build0 warnings/errors PASS;6 offline C# checks PASS;10 Node tests/build/format/encoding-secret scan PASS; npm audit0. Added busy indicator and draft/selection-preserving poll deferral (built; broad GUI regression remains pending). Native synthetic-ui-acceptance account removed through strict scoped cleanup helper, deleted1; own GUI closed.
