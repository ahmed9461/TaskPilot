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
