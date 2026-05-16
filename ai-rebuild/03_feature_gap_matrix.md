# 03 · Feature ↔ Gap Matrix

For each requirement ID from [`02_requirements_normalized.md`](02_requirements_normalized.md):
- **Required**: what the contract says.
- **Current (reference repo)**: what the reference actually does.
- **Status**: `MATCH` · `PARTIAL` · `MISSING` · `EXTRA` · `AMBIGUOUS`.
- **Evidence**: file + line range (in the reference).
- **Rebuild action**: what the rebuilt system must do.

> `MATCH`: reference fully implements. Replicate.
> `PARTIAL`: reference works but is incomplete vs requirement. Replicate then finish.
> `MISSING`: reference does not implement. Build new per the requirement.
> `EXTRA`: reference goes beyond the requirement. Keep — it's documented behavior used by other features.
> `AMBIGUOUS`: requirement is open to interpretation. Pick the safer reading and log in `notes/decisions.md`.

---

## Phase 1

| Req ID | Status | Evidence (file:lines) | Rebuild action |
|---|---|---|---|
| P1-T1-REG-001 | MATCH | `backend/routes/auth.js:51-115`, `frontend/src/pages/RegisterPage.jsx:9-156` | Replicate role grid + dynamic fields. |
| P1-T1-REG-002 | MATCH | `routes/auth.js:57-61` | Replicate. |
| P1-T1-REG-003 | MATCH | `routes/auth.js:30-45,67-70` | Replicate `validatePassword`. |
| P1-T1-REG-004 | MATCH | `routes/auth.js:92-103` | Replicate conditional inserts. |
| P1-T1-REG-005 | MATCH | `routes/auth.js:88` (bcrypt cost 12) | Replicate. |
| P1-T1-REG-006 | MATCH | `routes/auth.js:106-112` | Replicate librarian fan-out. |
| P1-T1-LOG-007 | MATCH | `routes/auth.js:121-164`, `middleware/auth.js:51-57` (24h TTL) | Replicate. |
| P1-T1-LOG-008 | MATCH | `routes/auth.js:142-144` | Replicate. |
| P1-T1-LOG-009 | MATCH | `routes/auth.js:147` | Replicate. |
| P1-T1-LOG-010 | MATCH | `frontend/src/pages/LoginPage.jsx:22-24`, `App.jsx:38-49` | Replicate `PortalRedirect`. |
| P1-T1-LOG-011 | MATCH | `App.jsx:24-33` | Replicate `ProtectedRoute`. |
| P1-T1-LOG-012 | MATCH | `frontend/src/utils/api.js:23-37` | Replicate 401 interceptor. |
| P1-T2-BOOK-001 | MATCH | `routes/books.js:86-96` | Replicate. |
| P1-T2-BOOK-002 | MATCH | `pages/StudentPortal.jsx` (filter state lifted, client-side filtering) | Replicate. |
| P1-T2-BOOK-003 | MATCH | `components/BookModal.jsx` | Replicate modal. |
| P1-T2-BORROW-004 | MATCH | `routes/books.js:119-198` | Replicate full borrow logic incl. seconds path. |
| P1-T2-BORROW-005 | MATCH | `routes/books.js:15,144-150` (`BORROW_LIMIT = 5`) | Constant `5`. |
| P1-T2-BORROW-006 | MATCH | `routes/books.js:162-170` | Replicate. |
| P1-T2-BORROW-007 | MATCH | `routes/books.js:328-372` | Replicate including notification archival. |
| P1-T2-BORROW-008 | MATCH | StudentPortal UI shows overdue/due-soon badges | Replicate. |
| P1-T3-SUB-001 | MATCH | `routes/books.js:382-440` | Replicate w/ multer (50 MB cap, MIME filter). |
| P1-T3-SUB-002 | MATCH | `routes/books.js:30-71,397-410` | 2 MB cover cap. |
| P1-T3-SUB-003 | MATCH | `routes/books.js:428-434` | Replicate librarian fan-out. |
| P1-T3-SUB-004 | MATCH | `pages/AuthorPortal.jsx` (submissions tab) | Replicate. |
| P1-T4-APP-001 | MATCH | `routes/books.js:533-560` (filters) | Replicate. |
| P1-T4-APP-002 | MATCH | `routes/books.js:566-590` | Replicate. |
| P1-T4-APP-003 | MATCH | `routes/books.js:597-619` | Replicate w/ `rejection_reason`. |
| P1-T4-APP-004 | MATCH | `routes/books.js:1136-1155` (`/preview/:id`) | Replicate (librarian-only). |
| P1-T4-APP-005 | MATCH | `routes/books.js:715-745` | Replicate. |

---

## Phase 2

| Req ID | Status | Evidence | Rebuild action |
|---|---|---|---|
| P2-T1-READ-001 | MATCH | `components/PDFReader.jsx` (~656 LOC), uses pdfjs-dist | Replicate viewer. |
| P2-T1-READ-002 | MATCH | `routes/history.js:149-172` (progress save) + reader UI | Replicate progress writes. |
| P2-T1-BM-003 | MATCH | `routes/books.js:975-1008` | Replicate CRUD endpoints + reader UI panel. |
| P2-T1-HL-004 | MATCH | `routes/books.js:1018-1051` | Replicate. |
| P2-T1-READ-005 | MATCH | `routes/books.js:792-810` + `components/QuickReview.jsx` | Replicate. |
| P2-T2-MULTI-001 | MATCH | `routes/books.js:202-262` | Replicate w/ limit guard. |
| P2-T2-MULTI-002 | MATCH | UI confirmation dialog in StudentPortal | Replicate. |
| P2-T2-REC-003 | MATCH | `routes/books.js:99-113` | Replicate top-3. |
| P2-T2-AR-004 | MATCH | `backend/database.js:389-420` + sprinkled call sites | Replicate lazy invocation. |
| P2-T2-AR-005 | MATCH | `database.js:425-458` | Replicate dedup-on-day logic. |
| P2-T3-NOTIF-001 | MATCH | `components/NotificationBoard.jsx`, every portal | Replicate. |
| P2-T3-NOTIF-002 | MATCH | `routes/notifications.js:14-44` | Replicate filters + default `is_archived=0`. |
| P2-T3-NOTIF-003 | MATCH | `routes/notifications.js:60-95` | Replicate. |
| P2-T3-NOTIF-004 | MATCH | `routes/notifications.js:50-55` | Replicate unread-count. |
| P2-T3-NOTIF-005 | MATCH | `routes/notifications.js:101-129` | Replicate announcement fan-out. |
| P2-T3-NOTIF-006 | MATCH | All notification type strings inserted across routes | Use exact strings (see [`08_traceability_matrix.md`](08_traceability_matrix.md) Appendix-N). |
| P2-T4-PROF-001 | MATCH | `routes/users.js:64-109` | Replicate password re-auth. |
| P2-T4-PROF-002 | MATCH | `routes/users.js:115-149` | Replicate strength rules. |
| P2-T4-PROF-003 | MATCH | `routes/users.js:155-171` | Replicate; delete old avatar. |
| P2-T4-PROF-004 | MATCH | `routes/users.js:98-106` | Replicate notify. |
| P2-T5-USR-001 | MATCH | `routes/users.js:181-199` | Replicate. |
| P2-T5-USR-002 | MATCH | `routes/users.js:205-255` | Replicate. |
| P2-T5-USR-003 | MATCH | `routes/users.js:261-292` | Replicate. |
| P2-T5-USR-004 | MATCH | `routes/users.js:298-315` | Replicate self-check. |
| P2-T5-USR-005 | MATCH | `routes/librarian.js:208-232` | Replicate. |
| P2-T6-REC-001 | MATCH | `routes/books.js:1061-1097` | Replicate. |
| P2-T6-REC-002 | MATCH | `routes/books.js:1104-1126` | Replicate CSV builder. |
| P2-T7-EDIT-001 | MATCH | `routes/books.js:820-890` | Replicate w/ status revert + librarian notify. |
| P2-T7-DEL-002 | MATCH | `routes/books.js:896-924` | Two-phase deletion. |
| P2-T7-DEL-003 | MATCH | `routes/books.js:626-708` | Hard delete + cascade + file cleanup. |
| P2-T7-DEL-004 | MATCH | `routes/books.js:930-964` | Replicate bulk. |
| P2-T7-DRAFT-005 | MATCH | `routes/books.js:446-495`, `pages/AuthorPortal.jsx` (3 s debounce) | Replicate. |
| P2-T8-CR-001 | MATCH | `components/CrashRecovery.jsx:47-110` | Replicate hook & flags. |
| P2-T8-CR-002 | MATCH | `App.jsx:64-190` | Replicate full state machine. |
| P2-T8-CR-003 | MATCH | `CrashRecovery.jsx:87-107` | Replicate. |
| P2-T8-CR-004 | MATCH | `App.jsx:113-141` | Replicate. |
| P2-T8-CR-005 | MATCH | `CrashRecovery.jsx:157-193` | Replicate button + key. |
| P2-T8-CR-006 | MATCH | `routes/recovery.js` | Replicate for completeness even though primary path is localStorage. |

---

## Phase 3

| Req ID | Status | Evidence | Rebuild action |
|---|---|---|---|
| P3-T1-REV-001 | MATCH | `routes/reviews.js:89-134` | Replicate w/ UNIQUE(user_id, book_id) and borrowed-only guard. |
| P3-T1-REV-002 | MATCH | `routes/reviews.js:16-64` | Replicate aggregates + distribution. |
| P3-T1-REV-003 | MATCH | `routes/reviews.js:176-200` | Replicate author reply. |
| P3-T1-REV-004 | MATCH | `routes/reviews.js:205-307` | Replicate flag/resolve/bulk-resolve. |
| P3-T1-REV-005 | MATCH | `services/llm.js:48-62` + `routes/reviews.js:103` | Replicate w/ neutral fallback. |
| P3-T1-REV-006 | PARTIAL | `routes/reviews.js:165-169` (no per-user dedup) | Keep simple increment; log in `decisions.md`. |
| P3-T2-HIST-001 | MATCH | `routes/history.js:14-59` | Replicate filters + duration_days enrichment. |
| P3-T2-INS-002 | MATCH | `routes/history.js:62-102` | Replicate. |
| P3-T2-ACH-003 | MATCH | `routes/history.js:106-144` | Replicate 7 badges. |
| P3-T2-HIST-004 | MATCH | `routes/history.js:185-230` (CSV + pdfkit) | Replicate. |
| P3-T2-INS-005 | MATCH | `routes/history.js:148-172` | Replicate cumulative seconds. |
| P3-T3-REQ-001 | MATCH | `routes/requests.js:18-60` | Replicate w/ duplicate-detection note. |
| P3-T3-REQ-002 | MATCH | `routes/requests.js:28-38,73-85` | Replicate non-blocking warning. |
| P3-T3-REQ-003 | MATCH | `routes/requests.js:88-140` | Replicate. |
| P3-T3-OL-004 | MATCH | `services/openlibrary.js:45-71` + `routes/requests.js:144-163` | Replicate. |
| P3-T3-OL-005 | MATCH | `services/openlibrary.js:77-134` + `routes/requests.js:165-280` | Replicate w/ retry-over-PDF-candidates. |
| P3-T3-OL-006 | MATCH | `routes/requests.js:198-211` | Replicate optional summary. |
| P3-T3-REQ-007 | MATCH | `routes/requests.js:283-347` | Replicate manual-upload path. |
| P3-T3-REQ-008 | MATCH | `routes/requests.js:251-265` | Replicate similar-pending notify. |
| P3-T3-REQ-009 | MATCH | `routes/requests.js:351-363` | Replicate analytics. |
| P3-T4-STAT-001 | MATCH | `routes/stats.js:13-81` | Replicate per-book enrichment. |
| P3-T4-STAT-002 | MATCH | same | Replicate aggregates incl. sentiment + 30-day trends. |
| P3-T4-STAT-003 | MATCH | `routes/stats.js:127-147` | Replicate CSV export. |
| P3-T4-STAT-004 | MATCH | `routes/stats.js:13-19` (`status != 'draft'`) | Replicate exclusion. |
| P3-T5-MGT-001 | MATCH | `routes/librarian.js:34-52` | Replicate. |
| P3-T5-MGT-002 | MATCH | `routes/librarian.js:55-104` | Replicate w/ version log. |
| P3-T5-MGT-003 | MATCH | `routes/librarian.js:107-138` | Replicate. |
| P3-T5-MGT-004 | MATCH | `routes/librarian.js:153-201` | Replicate full cascade. |
| P3-T5-MGT-005 | MATCH | `routes/librarian.js:142-150` | Replicate. |
| P3-T6-LLM-001 | MATCH | `routes/llm.js:18-37` + `services/llm.js:30-46` | Replicate styles + book_id excerpt. |
| P3-T6-LLM-002 | MATCH | `services/llm.js:48-62` | Replicate. |
| P3-T6-LLM-003 | MATCH | `services/llm.js:9-13` throws → routes return 500 cleanly | Replicate graceful degradation. |
| P3-T7-DLS-001 | MATCH | `routes/stats.js:86-125` | Replicate. |
| P3-T7-DLS-002 | MATCH | `routes/stats.js:114` | Replicate. |

---

## NFR

| Req ID | Status | Evidence | Rebuild action |
|---|---|---|---|
| NFR-PERF-001 | MATCH | Vite + small bundle | Keep; avoid heavy deps. |
| NFR-SEC-001 | MATCH | `middleware/auth.js:51-57` payload allowlist | Replicate. |
| NFR-SEC-002 | MATCH | `authenticate` applied per-route | Replicate (do not drop on any handler). |
| NFR-SEC-003 | MATCH | `authorize(...roles)` factory | Replicate. |
| NFR-SEC-004 | MATCH | All queries use `db.prepare(...).run(...args)` | Replicate. **No template-literal SQL with user input.** |
| NFR-SEC-005 | MATCH | multer `fileFilter` + `limits.fileSize` | Replicate per-uploader. |
| NFR-UX-001 | MATCH | `styles/global.css` palette + fonts | Replicate theme tokens; can simplify. |
| NFR-UX-002 | PARTIAL | Some screens are tight at <1024 | Allow rebuild to leave as-is. |
| NFR-DATA-001 | MATCH | `database.js:15-17` | Replicate pragmas. |
| NFR-DATA-002 | MATCH | All `uuidv4()` insertions | Replicate. |

---

## Reference EXTRA (kept on purpose)

| Extra | Why we keep it |
|---|---|
| `routes/books.js POST /bulk-return` | The student UI may select multiple borrows and return them — keeps parity with bulk-borrow. |
| `routes/recovery.js authenticateWithFallback` (`_token` in body) | Supports `navigator.sendBeacon` on unload, which can't set headers. Used by future-proofed reliability path. |
| `routes/requests.js` similar-pending notification fan-out | Improves UX continuity but not strictly required. |
| `routes/stats.js GET /user-activity/:userId` | Used by the librarian "Manage Users" drawer in the reference UI. |
| `services/openlibrary.js scorePdfCandidate` heuristic | Reduces 401/403s from restricted IA items. Worth keeping. |
| `frontend SIMULATE_UNRECOVERABLE_CRASH=true` flag | Reveals the "Crash (No Recovery)" button for demonstrations. Keep default `true`. |
| `start.bat`/`stop.bat`/`status.bat` | Reproducibility on Windows. Keep. |
| `backend/seed_dummy_users.js` | Required for demo logins in `12_rebuild_readme.md`. Keep. |

---

## Known reference drift (rebuild must clean up)

| ID | Drift | Cleanup |
|---|---|---|
| INC-1 | README still says backend port 5000 | Rebuild README must say **8000**. |
| INC-2 | README omits `bulk-return`, `pending_deletion` flow, `quick-review`, `approve-delete`/`reject-delete`, `flagged reviews`, `book_requests`, OL search, version history | Rebuild README documents all of them. |
| INC-3 | Mixed absolute/relative path storage (`books.file_path` absolute, `cover_image` relative) | Keep as-is for compatibility — `resolveFilePath` already handles both. |
| INC-4 | `.env` in repo carries real keys | Rebuild must regenerate JWT_SECRET and require the TA to set `DASHSCOPE_API_KEY` (placeholder in `.env.example`). |
| INC-6 | Model name `qwen3.5-flash` may be deprecated on some tenants | If 4xx, fallback to `qwen-turbo`; document the swap in `decisions.md`. |
