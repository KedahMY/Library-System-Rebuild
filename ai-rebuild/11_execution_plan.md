# 11 · Execution Plan

> Ten milestones, each with: who owns it, what enters and exits, and the gate that proves it. The lead agent runs these in order. Parallelism is allowed where the dependency graph permits.

---

## Dependency Graph (text)

```
M0 Scaffold ────────────────► M1 DB ────► M2 Auth/Users ────► M3 Books
                                   │             │                │
                                   │             ├──► M4 Notif+Recovery+Wiring
                                   │             │
                                   ▼             ▼
                                  M5 Reviews/Requests/Stats/LLM/Librarian (depends on M1, M2, partly M3)
                                                                  │
                                                                  ▼
                                                       M6 Frontend Pages (depends on M2..M5)
                                                                  │
                                                                  ▼
                                                       M7 Frontend Components (depends on M6)
                                                                  │
                                                                  ▼
                                                       M8 Playwright Verification
                                                                  │
                                                                  ▼
                                                       M9 README + Polish + Final Smoke
                                                                  │
                                                                  ▼
                                                       M10 Requirement Audit (HARD GATE)
                                                            ↺ re-spawn failed SAs
                                                            until ALL REQUIREMENTS PASS
```

Parallel opportunities:
- M3 ⊥ M4 (different routers; both require M1+M2).
- M5 may start in parallel with M4 if SA-5 and SA-6 use disjoint files (they do).
- M7 components may be developed concurrently with M6 pages from the moment shared types/props are stable.

---

## Milestones

### M0 · Scaffold & Skeleton

| | |
|---|---|
| Owner | SA-1 |
| Inputs | `00_mission.md`, `04_architecture_lock.md` |
| Outputs | Project skeleton, `start.bat`/`stop.bat`/`status.bat`, .env.example, .gitignore |
| Gate | A (pre-flight) — backend boots `:8000` and `/api/health` returns OK; frontend boots `:3000` |
| Estimated effort | 1 sweep |
| Notes | Backend `server.js` ships with `/api/health` + `/api/shutdown` placeholders + CORS + static `/uploads`; routers are NOT yet mounted. |

### M1 · Database & Migrations

| | |
|---|---|
| Owner | SA-2 |
| Inputs | `05_data_model.md` |
| Outputs | `backend/database.js`, `backend/seed_dummy_users.js`, runtime `data/library.db` |
| Gate | `node -e "require('./backend/database')"` exits 0; `sqlite3 library.db ".tables"` lists all 14; re-running seed is a no-op |
| Notes | All 3 migrations present even on fresh DB. Pragmas WAL + foreign_keys=ON applied. |

### M2 · Auth & User Management Backend

| | |
|---|---|
| Owner | SA-3 |
| Inputs | M1; `02_requirements_normalized.md` P1-T1, P2-T4, P2-T5 |
| Outputs | `middleware/auth.js`, `routes/auth.js`, `routes/users.js` |
| Gate | Smoke A1–A8 (Phase-1 §3.1) green |
| Notes | Mount these routers in `server.js` at this milestone (SA-1 left placeholders). |

### M3 · Books & Borrowing Backend

| | |
|---|---|
| Owner | SA-4 |
| Inputs | M1, M2 |
| Outputs | `routes/books.js` (32 endpoints) |
| Gate | B-1: 03_books_phase1.sh + most of 04_books_phase2.sh green (C-rows that depend on submissions go green when notifications router is up — these belong to M4) |
| Notes | When testing borrow + auto-return, use `duration_seconds=10` to validate without waiting. |

### M4 · Notifications, Recovery, Server Wiring

| | |
|---|---|
| Owner | SA-6 |
| Inputs | M1; M3 (notifications fan-out happens from books routes) |
| Outputs | `routes/notifications.js`, `routes/recovery.js`, final `server.js` |
| Gate | Smoke B-2 §3.3 C-rows that exercise notifications (C9 librarian receives `new_submission`, C10 author receives `approval`, etc.) green |
| Notes | Confirm `LIMIT_FILE_SIZE` special-case is present in `server.js` error handler. |

### M5 · Phase-3 Backend (Reviews, Requests, History, Stats, Librarian, LLM)

| | |
|---|---|
| Owner | SA-5 |
| Inputs | M1, M2; partly M3 (review borrowed-check) |
| Outputs | 6 routers + 3 services |
| Gate | B-3: 05_books_phase3.sh green (D1–D18 minus D11/D12 may degrade gracefully if external services are offline). |
| Notes | LLM and Open Library failures must not cascade — D12 without `DASHSCOPE_API_KEY` returns 500 with a clear message but the rest of the app must keep working. |

### M6 · Frontend Pages + Routing + Crash-Recovery Wrapper

| | |
|---|---|
| Owner | SA-7 |
| Inputs | M2 (login/register endpoints), M4 (server endpoints); skeleton from M0 |
| Outputs | `App.jsx`, `context/AuthContext.jsx`, `utils/api.js`, 5 pages |
| Gate | Manual + Playwright `auth.spec.ts` green |
| Notes | The pages must use the exact tab `id` strings in `06_screen_flow.md` — they are the keys for crash recovery restoration. |

### M7 · Frontend Components

| | |
|---|---|
| Owner | SA-8 |
| Inputs | M6 |
| Outputs | All 16 components |
| Gate | Playwright `student-flow.spec.ts`, `author-flow.spec.ts`, `librarian-flow.spec.ts` green |
| Notes | `PDFReader.jsx` is the biggest deliverable — allocate budget. |

### M8 · Verification (Playwright + smoke replay)

| | |
|---|---|
| Owner | Verifier |
| Inputs | M0–M7 |
| Outputs | `test-pack/results/*.log` |
| Gate | Gates A, B-1, B-2, B-3, C, E all green |
| Notes | If any gate fails, route the failure to its owning subagent — never patch in the verifier. |

### M9 · README, Polish, Final Manual Matrix

| | |
|---|---|
| Owner | SA-1 (rerun) + SA-6 (rerun for any final wiring fixes) |
| Inputs | All prior |
| Outputs | Final `README.md`, demo-data verification, manual checklist signed off |
| Gate | Gate D — every MUST row in `test-pack/manual/checklist.md` signed off |
| Notes | After this, advance directly to M10. |

### M10 · Requirement Audit (HARD GATE)

| | |
|---|---|
| Owner | Requirement Audit subagent — `ai-rebuild/prompts/subagent_requirement_audit.md` |
| Inputs | Running system on `:8000` + `:3000`; `17_acceptance_checklist.md` (182 REQ-* rows) |
| Outputs | `ai-rebuild/test-pack/results/requirement_audit.log` |
| Gate | Final line must read `ALL REQUIREMENTS PASS (182/182)` |
| Notes | If any REQ-* fails, the lead groups failures by Owner column and re-spawns the offending subagent(s) with attempt=2. Max 5 audit cycles before BLOCKER escalation. After this, SC-1 through SC-11 in `00_mission.md` should all be PASS. |

---

## Effort Budget (rough)

| Milestone | Effort weight |
|---|---|
| M0 | 1 |
| M1 | 1 |
| M2 | 2 |
| M3 | 5 |
| M4 | 1 |
| M5 | 4 |
| M6 | 5 |
| M7 | 6 |
| M8 | 1 |
| M9 | 1 |
| M10 | 2 (audit + up to 5 retry cycles) |
| **Total** | **29** |

Frontend (M6 + M7) is the heaviest. Books router (M3) and Phase-3 backend (M5) are next.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| LLM API unreachable from agent's sandbox | High | Graceful fallback documented; sentiment defaults to 'neutral'; summary returns 500 with clear message. |
| Internet Archive 401/403 on restricted items | High | Multiple PDF candidates tried; alternatives surfaced; document fallback. |
| Crash-recovery flags get out of sync after restore | Medium | Match the exact keys/strings in `06_screen_flow.md §7`; clear in the right order. |
| Subagent extends ownership without permission | Medium | Lead agent rejects PRs that touch outside the allow-list. |
| pdfjs-dist worker mismatch | Medium | Pin pdfjs-dist `^4.10.38`; copy worker via Vite import. |
| SQLite WAL files committed accidentally | Low | `.gitignore` excludes them. |
| `qwen3.5-flash` model name not available on a tenant | Low | If 4xx, swap to `qwen-turbo` and log in `decisions.md`. |
| Windows path quoting in .bat helpers | Medium | Use `%~dp0` and quote `"%~dp0backend"`. |

---

## Definition of Done (release)

The lead agent stops orchestrating only when:

- ✅ All 14 tables exist after a fresh boot.
- ✅ All 11 routers mounted.
- ✅ All 5 pages render and link to their tab ids.
- ✅ All 16 components are imported by at least one page.
- ✅ `start.bat` opens both windows on Windows; manual `cd backend && npm start` + `cd frontend && npm run dev` works on POSIX.
- ✅ Demo logins work (4 seeded accounts).
- ✅ Test logs in `test-pack/results/` show green for gates A, B-1, B-2, B-3, C, E.
- ✅ Manual checklist has every MUST signed off.
- ✅ `ai-rebuild/notes/decisions.md` contains every deviation noted by subagents.
- ✅ No secrets in committed `.env` (only `.env.example`).
