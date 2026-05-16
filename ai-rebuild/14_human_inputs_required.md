# 14 · Human Inputs Required

> **Default policy**: every decision in this pack has a documented default. The agent ships with the default. This file lists the **few** items where a human can override the default after the build is green. Anything not in this file is **not** a blocker — proceed.
>
> Each item has a `HI-<n>` ID. The agent must log the chosen value to `ai-rebuild/notes/decisions.md` when overridden.

---

## A. Absolutely Required Before First Run

Only **one** input is strictly required for the rebuild to start working:

### HI-1 · JWT secret

- **Where**: `backend/.env`, variable `JWT_SECRET`.
- **Default if not set**: `library-system-secret-key-2024` (fall-back in `middleware/auth.js`).
- **Required action**: Generate a 64-character random hex string and put it in `.env`. Sample: `openssl rand -hex 32` (POSIX) or `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")` (PowerShell).
- **Why it matters**: The default is documented in the source — anyone who reads this pack could forge tokens against an unchanged install.
- **Acceptance**: Login + `Authorization: Bearer <token>` works against a freshly generated secret.

---

## B. Recommended Before First Run (graceful fallback exists)

### HI-2 · DashScope API key

- **Where**: `backend/.env`, variable `DASHSCOPE_API_KEY`.
- **Default if not set**: AI summary endpoint returns 500 with a clear message; review sentiment defaults to `'neutral'`.
- **Required action**: Obtain a DashScope (Alibaba Cloud) key at https://dashscope.console.aliyun.com/ → API keys → International region.
- **Acceptance**: `POST /api/llm/summary` with `{title:"Test"}` returns `{summary: "..."}` (200).

### HI-3 · DashScope model name

- **Where**: `backend/services/llm.js`, constant `MODEL`.
- **Default**: `qwen3.5-flash`.
- **Override condition**: If summaries return 4xx with model-not-found.
- **Replacement candidates** (try in order): `qwen-turbo`, `qwen-plus`, `qwen-max`.
- **Acceptance**: Same as HI-2.

---

## C. Optional (rarely needed)

### HI-4 · Internet Archive auth

- **Where**: `backend/.env`, variable `INTERNET_ARCHIVE_AUTH`, format `ACCESS_KEY:SECRET_KEY`.
- **Default if not set**: Restricted IA items fail with 401/403; `alternatives` still work.
- **Required action**: Only if the TA needs to download access-controlled IA items. Skip otherwise.

### HI-5 · Frontend URL for CORS

- **Where**: `backend/.env`, variable `FRONTEND_URL`.
- **Default**: `http://localhost:3000`.
- **Override condition**: Only if running the frontend on a non-default port (don't).

### HI-6 · Backend port

- **Where**: `backend/.env`, variable `PORT`.
- **Default**: `8000`.
- **Override condition**: Almost never. **If overridden, also update**: `vite.config.js` proxy targets, `start.bat` port checks, and the hard-coded URL in `frontend/src/components/CrashRecovery.jsx::CrashTestButton` (the `fetch('http://localhost:8000/api/shutdown')` call). This is why the default is the recommended choice.

---

## D. Rubric-Sensitive Behaviors (confirm against course rubric)

These are behaviors where the reference implementation made a choice and the rebuild followed it. If the course rubric says otherwise, override and re-run gate D.

### HI-7 · Author book deletion model

- **Default behavior**: Two-phase. Author requests deletion (`status='pending_deletion'`); librarian approves the hard-delete.
- **Possible override**: One-click hard delete from the author side (no librarian approval).
- **Where to change**: `routes/books.js DELETE /:id` (author) — replace `UPDATE status='pending_deletion'` with the cascade block from `approve-delete`.
- **Re-run**: smoke C12-C13.

### HI-8 · Crash-Test button semantics

- **Default behavior**: Button does NOT set `bv_crash_test`; the flow simulates a true crash. Recovery toast styling is "error" on next login.
- **Possible override**: Button explicitly sets `bv_crash_test` before POSTing `/api/shutdown` so the next login shows a "success" toast.
- **Where to change**: `frontend/src/components/CrashRecovery.jsx::CrashTestButton.simulateCrash`.
- **Re-run**: Playwright `crash-recovery.spec.ts` Test 3.

### HI-9 · Hide "Crash (No Recovery)" button by default

- **Default**: `SIMULATE_UNRECOVERABLE_CRASH = true` — visible in all portals.
- **Possible override**: Set to `false` for grading runs.
- **Where to change**: `frontend/src/components/CrashRecovery.jsx`, top-level constant.

### HI-10 · Helpful-vote dedup

- **Default**: Monotonic counter; same user can click "helpful" repeatedly to increment.
- **Possible override**: Per-(user, review) UNIQUE constraint with a new table `review_helpful_votes(user_id, review_id)`.
- **Where to change**: `routes/reviews.js POST /:id/helpful` + schema migration.

### HI-11 · Anonymous review reply notification recipient

- **Default**: Reply notifies the reviewer (same user under the hood; "anonymous" is a display flag only).
- **Possible override**: Hide the notification when `anonymous=1`.
- **Where to change**: `routes/reviews.js POST /:id/reply`.

### HI-12 · CSV export columns

- **Default columns** (already locked):
  - `borrow_records.csv`: Book Title · Borrower Username · Borrower Name · Borrow Date · Due Date · Return Date · Status
  - `author_stats.csv`: Title · Genre · Status · Borrows · Avg Rating · Reviews
  - `reading_history.csv`: Title · Author · Genre · Borrow Date · Return Date · Status
- **Override condition**: If the rubric specifies different columns or order.
- **Where to change**: `routes/books.js GET /borrow-records/export`, `routes/stats.js GET /author/export`, `routes/history.js GET /export`.

---

## E. Cosmetic / Theme

### HI-13 · Color palette and typography

- **Default**: Dark academic / library noir. Cormorant Garamond (display) + DM Sans (body). Navy + gold + emerald/ruby accents.
- **Override**: Edit CSS variables in `frontend/src/styles/global.css`. Does not affect gates.

### HI-14 · Demo credentials

- **Default**: 4 seeded accounts listed in [`12_rebuild_readme.md §4`](12_rebuild_readme.md).
- **Override**: Edit `backend/seed_dummy_users.js` then run `node seed_dummy_users.js`.

---

## F. Acceptance: how to confirm overrides

After choosing an override:

1. Edit the listed file.
2. Log the choice in `ai-rebuild/notes/decisions.md` as a one-liner: `HI-<n>: <chosen value> — <reason>`.
3. If the override touches behavior covered by a smoke or Playwright test: rerun the relevant gate from `07_test_strategy.md §7`.
4. If the override is purely cosmetic (HI-13): no rerun required.

---

## G. Items the Agent Should NEVER Prompt For

The agent must not pause and ask the human about:

- Library versions — pinned in [`04_architecture_lock.md §1`](04_architecture_lock.md).
- API response shapes — pinned in [`04_architecture_lock.md §5`](04_architecture_lock.md).
- DB schema or column types — pinned in [`05_data_model.md`](05_data_model.md).
- Tab `id` strings — pinned in [`06_screen_flow.md`](06_screen_flow.md).
- Notification `type` strings — pinned in [`05_data_model.md` Appendix-N](05_data_model.md).
- localStorage key names — pinned in [`00_mission.md DR-10`](00_mission.md).
- Whether to include a feature in scope — pinned in [`02_requirements_normalized.md`](02_requirements_normalized.md) MoSCoW.

If the agent reasons that any of these need a human answer, it has misunderstood the pack — re-read.
