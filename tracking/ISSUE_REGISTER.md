# سجل المشكلات
| ID | Evidence | Status | Next |
|---|---|---|---|
| I-001 | Initial tunnel-based concurrency test exceeded 5s pool wait, returned sanitized 503; whole server-local rerun 13/13 passes after 20s wait | VERIFIED FIX | Track real load once authorized |
| I-002 | Initial missing SDK resolved with isolated .NET10; WinUI Release/publish and observed window PASS | VERIFIED | Installer/signing later |
| I-003 | Production identity/MFA and real-data retention policy remain open from specification | OPEN | Pilot uses synthetic data, SSH and independent auth/reauth secrets |

| I-004 | Auto-review rejected server-token-to-client launch, generic blocked by policy; no detailed reason | RESOLVED via separate protocol | D-029 temporary SSH-issued sessions; original permanent-key export remains unused. Direct-server/native acceptance PASS |
| I-005 | Review discovered deletion snapshot could miss a new related source | VERIFIED FIX | Aggregate account version now advances; regression PASS |
| I-006 | Rebuild hit file lock from own running Windows test app | RESOLVED | Closed app, self-contained publish passed |

| I-007 | f659d9b rollout migration checksum mismatch: deployed CRLF hashes versus LF archive; original62fddfe active | VERIFIED | LF/CRLF regression + final eb0f66b rollout PASS, no DB reset |

| I-008 | Windows locale-default Python edits plus formatter exposed mixed encoding/Arabic corruption while building new features | VERIFIED FIX | Explicit UTF-8 edits; scan rejects invalid UTF-8/replacement/mojibake; rebuild and actual Arabic window create/edit/filter PASS |

| I-009 | Expanded C# acceptance filter expected a rule-routed task but test payload omitted the keyword | VERIFIED FIX | Corrected fixture; full19-check acceptance PASS; scoped leftover fixtures removed |

| I-010 | First final bfcbbd4 ops verifier returned generic failure; unchanged release stage-instrumented rerun PASS, active/healthy0.2.0; original failing assertion unknown | OBSERVED EXTERNAL DRIFT / DIAGNOSTICS IMPROVED | Later17f846e failures identified other-services; read-only samples proved an existing service auto-restarts while TaskPilot PID stays stable/NRestarts0. That service untouched. Final diagnostic full check PASS for one sample; continuous invariance not claimed. Original first generic assertion unconfirmed. Sanitized stage/probe bounds retained |

| I-011 | Notification screen used earliest500 records without pages/read filtering, leaving later records inaccessible | VERIFIED BACKEND FIX | New newest-first snapshot pages/read filter/bulk bounded read;530-event regression PASS. Actual native page2(51–100 of107) and unread badge observed in0.3; current0.4 CI PASS |
| I-012 | Expired SSH session appeared as network outage and mixed manual/SSH auth could retain old reauth identity | VERIFIED LOCAL FIX | Typed401/absolute expiry, explicit reconnect/no mutation retry, old SSH disposal,13 transport/reliability checks PASS; actual own-tunnel interruption/banner/reconnect preserved draft;25 then28 direct-server checks PASS |

| I-013 | First immediate smoke after96e4cbe deployment hit ECONNREFUSED while Type=simple service was starting; unchanged release later healthy0.3/NRestarts0/auth smoke PASS | LOCAL FIX VERIFIED | Added bounded expected-version health wait before deploy success; startup/old-version/timeout regression PASS. Actual dc76227 and87f986b rollout expected-version wait/auth smoke PASS |

0.3 I-010 follow-up: verifier now reports all own-service checks before returning explicit external-drift exit2; it never treats drift as a passed isolation sample. I-014: hosted runs5833c73/96e4cbe remain queued with jobs=[]; cause unconfirmed. Official status page listed Actions operational at inspection; do not attribute queue to an outage or count prior0.2 CI as current0.3 acceptance.

| I-015 | Accepted custom/editable reply templates were global and POST-only | VERIFIED / DEPLOYED | Final19 PG incl scope-edit race and28 direct-server checks PASS; actual native create/edit/scopes/disable reload PASS on87f986b |

I-014 follow-up2026-11-12: exact-source0.4 run43100482889 backend+windows SUCCESS. Earlier queued0.3 runs are not current acceptance evidence; queue cause remains unconfirmed, no workflow/runner/billing settings changed.
| I-016 | Native scope dropdowns contain repeated display names among retained synthetic task/group fixtures | OPEN / usability | Show stable codes/identities in choices before broad human acceptance. Backend UUID scope/version checks and quoted target preview remain authoritative; no wrong send observed |
