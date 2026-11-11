# تسليم قابل للاستئناف — 2026-11-11
## النتيجة
Project moved from docs only to working closed synthetic Backend/PostgreSQL/WinUI pilot. Four implementation commits pushed on feat/mvp-foundation; deployed code `eb0f66bbc35ff008767501526612bdf0e9a94999`. Final tracking-only commit records these results. All initial repository docs were read.

## Reproducible evidence
`npm run check`:8 tests/build PASS; `npm run test:integration` against dedicated *_test DB:14/14 including parent PASS; `dotnet run --project apps/windows-tests/TaskPilot.ClientChecks.csproj -c Release`:6 checks PASS. WinUI Release/publish PASS. Final CI https://github.com/ahmed9461/TaskPilot/actions/runs/43061180349 PASS for backend and Windows. Known-pattern repository scan/format/npm audit PASS.
On VPS run `node ops/verify-pilot.mjs` and `node scripts/pilot-smoke.mjs` from /opt/taskpilot/current: least privilege/restart/data preservation/other service isolation/auth/replay pass. These scripts read keys locally and do not print them.
Backup02 restore:1 synthetic account,1 assignment,3 migrations,0 SENDING. Tamper rejected before DB creation. No off-host/key-loss claim.

## Runtime
Own taskpilot.service API loopback8240; own taskpilot-db loopback15488. Root-owned releases, dedicated user and runtime DB role. Secrets /etc/taskpilot; migration.env root-only, pilot.env restricted service access. Never print or commit their values. Existing services/configs untouched. No real WhatsApp/AI.
Windows observed with local fixture API18241 and separate PostgreSQL UI test DB via tunnel; direct pilot auth was blocked by auto-review when launching client with server token. Do not export that key automatically; owner enters it locally. No live send/reveal/delete UI confirmation was automated.
Local test app/API/SSH forwards closed; no local background helper needed. VPS pilot remains running. Scratch SDK ../dotnet retained; source work/TaskPilot.

## Next useful work
1. Complete native UI acceptance with synthetic fixtures: create/edit/review/status/reconcile/selected purge; list paging, Arabic status labels, accessibility and advanced filters/rules.
2. Production identity/session/MFA and retention/key escrow/off-host recovery decisions before real data. No assumed approval for live WhatsApp or sending.
3. Choose/review live WhatsApp adapter and isolated dedicated-number test only after owner authorization.
4. Wire optional AI task-code suggestions into explicit approved workflow; live provider/model/cost and billing persistence remain open. Current adapters are isolated/offline-tested only.
5. Test whole-host reboot and schema-compatible rollback in a safe window; no global server restart was performed.

## Cautions
Never edit applied SQL except newline-equivalence handled by checksum runner; create new migrations. Integration runner truncates only *_test databases; restore tool only creates fresh *_restore_test. Backup64MiB in-memory cap is pilot-only. Runtime cannot migrate; root deploy loads migration.env. Do not reuse other projects' DBs, WhatsApp sessions or services.

## Continuation stage1 — SSH sessions
Implemented30-minute SSH-issued client sessions,60-second single-use reauth grants, expiry/revocation checks, and Windows-owned secure tunnel/login/logout. No permanent server key export. Windows C# server acceptance runner added for scoped synthetic create/review/status/reveal/mock-reply/archive/purge/revocation. Local WinUI build PASS; dedicated PostgreSQL regression/actual server acceptance are being verified in this stage; do not infer direct-server acceptance from code existence.

Stage1 predeployment evidence:8 Node tests/build PASS, dedicated New-VPS PostgreSQL suite15/15 PASS including session lifecycle, WinUI Release0 warnings/errors and6 offline C# checks PASS. Direct server acceptance is next, not yet claimed.

## Continuation stage2
Implemented deterministic keyword routing/priority and ambiguity review, IGNORE/minimization for unrelated chat, backward-compatible page envelopes and scoped filters, safe filtered-page CSV export, task-only purge preserving accounts/other tasks, and Windows editor/filter/pager/export/purge controls.10 Node tests and16 PostgreSQL suite tests PASS (including parent), Release build PASS. Direct previous auth-stage C# server acceptance15 checks PASS. Final expanded acceptance/visual/CI/deployment still to verify.
