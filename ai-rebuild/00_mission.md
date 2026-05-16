# 00 · Mission

> **You are a future Claude Code lead agent.** The user has handed you this `/ai-rebuild` pack and asked you to **rebuild the BiblioVault E-Book Library Management System** from scratch in a fresh working directory. The original repo is your reference, but the **artifact pack in this folder is the source of truth** — every requirement, schema, route, screen flow, and test gate is pinned here.

## Pack Index

| # | File | Purpose |
|---|---|---|
| 00 | `00_mission.md` *(this file)* | Goal, success criteria, deterministic rules |
| 01 | `01_repo_analysis.md` | Reference repo inventory |
| 02 | `02_requirements_normalized.md` | Requirements with stable IDs + MoSCoW |
| 03 | `03_feature_gap_matrix.md` | Required vs current vs missing per ID |
| 04 | `04_architecture_lock.md` | Pinned versions, ports, conventions |
| 05 | `05_data_model.md` | DDL, migrations, FSMs, notification catalog |
| 06 | `06_screen_flow.md` | Per-portal tabs, snapshots, flows, modals |
| 07 | `07_test_strategy.md` | Smoke matrix, Playwright contracts, gates |
| 08 | `08_traceability_matrix.md` | Req ID → API → DB → UI → verification step |
| 09 | `09_master_prompt.md` | Lead-agent boot prompt + templates |
| 10 | `10_subagents.md` | 8 subagents with time-windowed ownership |
| 11 | `11_execution_plan.md` | M0–M9 milestones, deps, risks |
| 12 | `12_rebuild_readme.md` | TA-facing run-and-verify guide |
| 13 | `13_risks_and_failure_modes.md` | FM-* failure modes + recovery procedures |
| 14 | `14_human_inputs_required.md` | The (small) list of decisions humans actually own |
| 15 | `15_env_and_secrets_template.md` | `.env.example`, secret generation, redaction policy |

---

## 1. Goal

Produce a runnable full-stack application that:

1. Implements **every requirement** in [`02_requirements_normalized.md`](02_requirements_normalized.md) flagged `MUST` (Phase 1, Phase 2, Phase 3 in-scope).
2. **Matches the reference implementation's external behavior** (routes, response shapes, DB schema, screen flow) as locked in [`04_architecture_lock.md`](04_architecture_lock.md), [`05_data_model.md`](05_data_model.md), and [`06_screen_flow.md`](06_screen_flow.md).
3. **Passes every gate** in [`07_test_strategy.md`](07_test_strategy.md) (smoke + Playwright + manual matrix).
4. Builds and runs with the **exact commands** in [`12_rebuild_readme.md`](12_rebuild_readme.md), reproducibly, on a clean machine.

This is not a fork or a port. It is a **clean rebuild** from the artifact pack, with the reference repo treated as read-only documentation.

---

## 2. Success Criteria (pass/fail)

The rebuild is considered complete **only when all of the following are true**:

| ID | Criterion | Verification |
|---|---|---|
| SC-1 | `cd backend && npm install && npm start` exits 0 and binds `:8000` | curl `/api/health` returns `{status:"ok"}` |
| SC-2 | `cd frontend && npm install && npm run dev` serves on `:3000`; `npm run build` exits 0 | manual + CI |
| SC-3 | A clean run creates `backend/data/library.db` with all 14 tables from [`05_data_model.md`](05_data_model.md) | `sqlite3 library.db ".tables"` matches list |
| SC-4 | All four roles (student, staff, author, librarian) can register, log in, and land on the correct portal | Playwright `auth.spec.ts` |
| SC-5 | Every requirement marked `MUST` in `02_requirements_normalized.md` is traced to working code in [`08_traceability_matrix.md`](08_traceability_matrix.md) | Grep evidence + manual run |
| SC-6 | Smoke curl matrix in `07_test_strategy.md §3` returns expected status + JSON shape for every endpoint | Bash/PowerShell scripts |
| SC-7 | Crash recovery: refresh / close / crash-test / unrecoverable-crash all behave per [`06_screen_flow.md §6`](06_screen_flow.md) | Playwright `crash-recovery.spec.ts` |
| SC-8 | No unauthorized cross-role access (a `student` JWT cannot hit `/api/librarian/*`) | Smoke matrix |
| SC-9 | LLM and Open Library integrations **degrade gracefully** when keys/services are unavailable (no 5xx cascade) | Manual unplug test |
| SC-10 | TA can follow `12_rebuild_readme.md` start-to-finish with zero out-of-band commands | Independent run |

---

## 3. Scope Boundaries

**IN scope** (build):
- Backend: Express + better-sqlite3, all 11 route files, 3 services, JWT auth, multer uploads, scheduled jobs (lazy-evaluated).
- Frontend: React 18 + Vite 5, 5 pages, 16 components, AuthContext, CrashRecovery system, axios instance with JWT interceptor.
- Database: 14 tables with migrations, WAL mode, FK enforcement.
- File uploads: book files (PDF/TXT/DOC/DOCX, ≤50 MB) and cover images (JPG/PNG, ≤2 MB) and avatars (JPG/PNG, ≤5 MB).
- External integrations (with graceful degradation): Alibaba DashScope (LLM), Open Library + Internet Archive (book fetch), Covers API.
- Windows `.bat` helpers (`start.bat`, `stop.bat`, `status.bat`) — the reference is Windows-first.
- Demo-data seed script (`backend/seed_dummy_users.js`).

**OUT of scope** (do NOT build):
- Production deployment (Docker, k8s, hosted DB) — local dev only.
- Real email/SMS for notifications — in-app notifications table only.
- OAuth / SSO — username+password only.
- Payment, e-commerce, real-money features.
- Mobile app — responsive web only.
- Data migration tooling beyond the in-source `migrate*` functions.
- Test infra beyond what's described in [`07_test_strategy.md`](07_test_strategy.md).

---

## 4. Deterministic Rules (non-negotiable)

These rules exist because the reference implementation has invariants that quietly affect behavior. Violating them produces a "looks-right-but-broken" rebuild.

| Rule ID | Rule | Why |
|---|---|---|
| DR-1 | Backend port **MUST** be `8000` (env `PORT`, default 8000). Frontend dev port **MUST** be `3000`. | `start.bat`, vite proxy, CORS origin, crash-test fetch URL all hard-coded to these. |
| DR-2 | Vite dev proxies `/api` and `/uploads` to `http://localhost:8000`. The axios baseURL is `/api` (relative). | Removes CORS for dev; production deploy not in scope. |
| DR-3 | JWT secret default is `'library-system-secret-key-2024'`. Production callers MUST set `JWT_SECRET`. Token TTL = 24h. | Auth and recovery routes both fall back to this exact string. |
| DR-4 | All IDs are UUID v4 strings; primary keys are `TEXT PRIMARY KEY`, never INTEGER. | The frontend often passes IDs through URLs and compares with `===` on string. |
| DR-5 | SQLite pragmas: `journal_mode = WAL`, `foreign_keys = ON`. | Required for transactional auto-return and FK-cascade-style deletes. |
| DR-6 | Passwords hashed with **bcryptjs**, cost factor **12**. | Login uses `compareSync` — switching libraries breaks existing dummy seeds. |
| DR-7 | All four roles allowed at registration: `student`, `staff`, `author`, `librarian`. Validation regex `/^[a-zA-Z0-9_]+$/`, min length 3. Passwords must satisfy 8+ chars with upper, lower, digit, special. | Validation runs both client- and server-side. |
| DR-8 | Borrow limit is `5` active borrows per user. Borrow duration accepts EITHER `duration_days` (1–14) OR `duration_seconds` (10–300, for test fast-expiry). | Test routes rely on the seconds path. |
| DR-9 | Book status enum: `pending`, `approved`, `rejected`, `draft`, `pending_deletion`. Availability: `available`, `borrowed`. | CHECK constraints enforce — migration adds `pending_deletion`. |
| DR-10 | Crash-recovery storage keys are localStorage (per-user): `bv_session_<userId>`, `bv_should_clear`, `bv_crash_test`, `bv_crash_no_recovery`; sessionStorage: `bv_is_refresh`. | Test gates assert these exact strings. |
| DR-11 | `/api/shutdown` exists and calls `process.exit(0)`. It is the crash-test endpoint. | Frontend `CrashTestButton` POSTs to this. |
| DR-12 | Author book-deletion is a two-step request: `DELETE /api/books/:id` sets status to `pending_deletion`; librarian `PATCH /api/books/:id/approve-delete` does the hard delete. | Tests verify the intermediate state. |
| DR-13 | Reviews: a user can only review a book they have borrowed (any state, not necessarily returned). One review per (user, book) pair via UNIQUE constraint. | Server returns 403 otherwise. |
| DR-14 | LLM service: if `DASHSCOPE_API_KEY` is missing, summary requests return 500 with a clear message; sentiment classification returns `'neutral'`. **The app must continue to function.** | DR-9 graceful-degradation. |
| DR-15 | Auto-return and due-reminder jobs run **lazily** on calls to `/api/books/borrow-records`, `/api/books/my-borrows`, `/api/books/:id/borrow`, `/api/history`, and `/api/notifications`. There is **no cron scheduler**. | Don't add `node-cron` — the test relies on calling those endpoints to trigger sweeps. |

---

## 5. Workflow for the Lead Agent

Follow this order. **Do not skip ahead.**

1. **Read in order**: `00_mission` → `04_architecture_lock` → `05_data_model` → `02_requirements_normalized` → `03_feature_gap_matrix` → `06_screen_flow` → `07_test_strategy` → `11_execution_plan` → `10_subagents`.
2. **Verify environment**: Node ≥18, npm ≥8, sqlite3 CLI optional, Windows or POSIX OK.
3. **Plan**: produce a TodoWrite list mirroring `11_execution_plan.md` milestones.
4. **Spawn subagents** per `10_subagents.md` — respect ownership boundaries.
5. **Verify after each milestone** using `07_test_strategy.md` gates. Do not advance until gates pass.
6. **Self-correct**: if a subagent returns "blocked / ambiguous", route back through the requirements docs, do **not** invent.

---

## 6. What to Do When Stuck

- **Conflict between docs**: prefer (in order) `04_architecture_lock` > `05_data_model` > `02_requirements_normalized` > reference source > README. The reference repo is documentation, not authority.
- **Ambiguity not in docs**: choose the simpler option, log it in a `decisions.md` file under `/ai-rebuild/notes/`, and continue.
- **External service down** (DashScope, Open Library): build the integration with the documented contract and a fallback path. Do not block on availability.
- **Time pressure**: ship Phase 1 → Phase 2 → Phase 3, in that order. Do not start Phase 3 until Phase 1 + 2 gates pass.

---

## 7. Out-of-Band Clarifications

[`14_human_inputs_required.md`](14_human_inputs_required.md) lists the **few** decisions a human may override. The lead agent always ships with the defaults; do not block on overrides.

[`13_risks_and_failure_modes.md`](13_risks_and_failure_modes.md) catalogs known failure modes (FM-* IDs) with diagnosis + fix recipes. Subagents must consult it before retrying a failing gate.

[`15_env_and_secrets_template.md`](15_env_and_secrets_template.md) is the authoritative source for `.env.example`, secret generation commands, `.gitignore`, and the redaction policy.
