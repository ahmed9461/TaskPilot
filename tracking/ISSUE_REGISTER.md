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

I-016 update2026-11-13: code/identity labels added to Windows task/group/session choices; build/native acceptance follows.
| I-017 | Durable live ingress could recreate a purged account/task if pending records remained | VERIFIED isolated FIX | Shared ingress/purge lock, bound queue snapshot, matched encrypted pending/quarantined rows cleared; task/account/stale/replay regressions PASS. Future new messages are not blocked by purge |
| I-018 | One poison ingress row could block all later work | VERIFIED isolated FIX | Three attempts then encrypted ERROR quarantine, sanitized monitoring and reauthed internal retry; regression PASS |
| I-019 | Real SDK/live WhatsApp compatibility unverified; Baileys is prerelease/unofficial | OPEN live gate | Dedicated owner-approved pairing/selected test group/receipt/quoted send/restart acceptance required; no real session used |

| I-020 | Published0.5 app crashed0xc000027b; app PRI/XBF absent although build output/native worked | FIX VERIFIED startup; final package/CI pending | Explicit generated-resource publish items and app-relative icon; actual republished portable SSH dashboard now rendered from other cwd. Add CI publish/artifact guard. Historical0.4 ZIP integrity/build-native checks do not establish portable startup |

I-020 final: corrected0.5 actual portable startup from different cwd and native SSH/task/source/session controls PASS;6157855 CI43486994434 including publish/resource check SUCCESS. I-016 code/identity labels implemented/build verified; broad selector human acceptance remains open. I-019 actual provider gate still open.

| I-021 | Pre-live source inspection: libsignal session_record.js console calls include session objects outside Pino | FIX IMPLEMENTED / deployment pending | TaskPilot systemd output/error=null, LimitCORE0; config regression PASS. No real auth/network existed at discovery; no key leakage incident inferred |

I-021 deployed ffe68cf before real socket: actual unit streams /dev/null/core limit0 verified, redacted state proof confirms encrypted auth; no raw provider logs collected.
| I-022 | First actual QR reached CONNECTED with me.id persisted but registered=false; old restore checked registered only | FIX VERIFIED isolated / live restart pending | Match SDK login decision by saved paired identity; QR registered=false/me.id regression PASS. Do not regenerate auth or alter its SDK flag |

| I-023 | Actual native reply list returned to top as background synthetic acceptance events arrived | FIX IMPLEMENTED / native verification pending | Preserve automatic same-page scroll offset after layout; keep explicit navigation/filter refresh semantics and draft guard |

| I-024 | Native review read-only TextBox showed only first line of the seeded two-line message | FIX IMPLEMENTED / native verification pending | Enable multiline/adequate height while retaining30-second hide and cleanup; native full-text/reveal/resolve test follows |

I-022 final:6626697 deployed0.5.1; actual same paired identity restored CONNECTED after own-service restart without QR, no auth reset. I-023 native refresh preserved bottom position3090.67 after synthetic change. I-024 root cause was Text assignment before enabling AcceptsReturn, not missing DB content; reordered source/template initialization. Actual review two lines/hide/resolve/raw clearing PASS; full multiline template editor acceptance remains open.

I-019 current0.5.1: actual owner pairing and same-identity restart PASS. Receive/quoted send/provider receipt/long-running acceptance remain open; no monitored groups or live messages. I-020 corrected resources/native startup remain verified for0.5.1. I-022/023/024 final results above are authoritative; pending wording in earlier entries is historical.

| I-025 | Approved real desktop test message observed sent, but no durable live ingress/source; paired account verified different | OPEN / receive acceptance failed | Add selected-group sanitized reason counters and sender-key metadata compatibility regression; cause of first missed event not yet proved. Never infer success from GUI send or replay synthetic ingest |

I-025 final2026-11-14: first pre-update event remains unprocessed/unreconstructed, cause not proved. SDK co-present sender-key metadata compatibility hole fixed; actual subsequent receive/merge/review/ignore/quoted reply and restart acceptance PASS on0.5.2. Status MITIGATED / current bounded live flow VERIFIED, original incident cause OPEN; no lost-history guarantee.
I-024 final native template acceptance: two-line save/reopen/render/restore in portable0.5.1→API0.5.2 PASS; original SENT body unchanged, version3. Source-switch/flag/accessibility matrix still partial. I-010 latest overall verifier nonzero external drift0 added/1 removed; own checks/paired continuity PASS, other service untouched.

| I-026 | All append upserts treated as history although pinned SDK uses append for server offline delivery | FIX VERIFIED isolated / live outage pending | Accept only selected text after session+binding consent; actual bulk history disabled; new receipt event-type metadata and regression distinguish queued delivery from old history. I-025 original event still lacks historical evidence |

- I-026 update2026-11-14: confirmed live offline append recovery after controlled45s outage; real accepted receipt and ingress matched. Historical first-packet cause remains unknown. Bounded300s observation PASS20 samples; SSH reset after final PASS, transport exit1 recorded separately.

- I-027 CLOSED WITH BOUNDED EVIDENCE2026-11-14: Windows private-backup ACL helper initially used NTAccount string overload for SID and inherited PS7 module path into Windows PowerShell. Fixed native SID grants/owner+SYSTEM-only validation and explicit built-in Windows PowerShell module path. Real encrypted export+restore, local-only restore and manually triggered daily snapshot job passed. No secret dump or raw master key file created. Profile-loss recovery remains a separate open limitation.
- I-028 CLOSED2026-11-14: model may correctly return taskCode=null/confidence0. Windows0.6.0 displayed blank task code;0.6.1 labels safe abstention/manual selection explicitly. Actual same-key native replay and protected manual-review editor/cancel verified, no additional provider call or business mutation.

- I-0292026-11-14: credential flag/evidence combos exposed English implementation enums and generic error for unproven error claims.0.6.2 preserves API enums behind Arabic labels, explains rejection; native verification pending.

- I-029 native0.6.2 VERIFIED: Arabic kind/evidence choices map to correct API enums. Unproven error rejected with explicit Arabic guidance, manual fictitious confirmed flag stored; no real credential checked. Generic toast accepted; visible shell popup/activation remains NOT_OBSERVED, no OS setting changed.

- I-0302026-11-14: first30-minute isolated endurance driver ended nonzero at final assertion: PostgreSQL folded unquoted encryptedCredentials alias, while JS expected camel case. Independently observed8accounts/16assignments/871PROCESSED sources/0replies/8credentials key_version2. No actual business failure observed, but full run remains FAIL (final AEAD verification not reached and ephemeral test key gone). Quote alias, persist sanitized failure stage, rerun fresh database071; preserve original070 database/report. Live1-hour observer unaffected.

- I-031 security review before live rotation: precommit failure can leave mixed legacy/new writes after service restarts with bridge; fixed resumable bridge reader, serialized run lease, stale-run/new-run guards and atomic journal/temp publication. Isolated mixed-key rollback+commit passed; real apply/resume keyVersion2 preserved839 fields/identity and rejected old API/reauth. No live data-loss incident occurred.

- I-030 final: FIX VERIFIED by fresh0711800s PASS/874unique+874duplicate/8accounts/16tasks/874sources/0replies/8credentials AEAD-valid/0errors/provider/outbound. Original070 remains failed harness run with incomplete final AEAD verification; retained report/database, not reclassified PASS.
- I-027 current boundary: per-snapshot recipients and alternate VPS custodian now restore old/new/natural-scheduled copies without DPAPI. Requires surviving VPS/rootSSH and copied files; simultaneous-domain loss remains OPEN. Natural03:15 daily trigger and restore PASS. I-029 Arabic native fix verified; visible toast/click still NOT_OBSERVED. I-010 external-service drift remains OPEN/untouched.

- I-032 OPEN/native0.6.2: after explicit SSH logout the expiry/logout action disappears and tunnel closes, yet InfoBar still says connected/synchronizing. Render settings/disconnected branch does not reset status; in-flight PollChanges also lacks session-revision guard. Fix disconnected presentation and reject obsolete async read/error results; preserve API revocation/no mutation retry.
