11# 07 · Test Strategy

> The rebuild has **no built-in test framework** (matching the reference). Verification is performed by:
> 1. **Smoke matrix** — bash/PowerShell curl scripts.
> 2. **Playwright MCP** — browser flows for UI-critical paths.
> 3. **Manual matrix** — TA-style checklist anchored to requirement IDs.
>
> Every gate listed here is a **blocker** for the corresponding milestone in [`11_execution_plan.md`](11_execution_plan.md).

---

## 0. How to Verify Each Major Functional Area (TL;DR)

| Area | What proves it works | Exact command(s) |
|---|---|---|
| **Boot & health** | Both servers respond. | `curl -fsS http://localhost:8000/api/health` then open `http://localhost:3000/login` in a browser |
| **Auth** | Register → login → protected GET. | run `smoke/02_auth.sh` (gates A1–A8) |
| **Book browsing** | `/api/books` returns approved only. | `TOKEN=$(login student); curl -fsS -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/books \| jq 'length>=0'` |
| **Borrow / return** | Availability flips; limit enforced; auto-return fires. | `smoke/03_books_phase1.sh` (gates B3–B7) |
| **Bulk-borrow** | 5-limit guard works. | `smoke/04_books_phase2.sh` C1–C2 |
| **Bookmarks / highlights** | CRUD round-trip per book. | `smoke/04_books_phase2.sh` C4–C7 + Playwright `student-flow.spec` |
| **Author submission + librarian approval** | Submit → notification → approve → book in catalog. | `smoke/04_books_phase2.sh` C9–C11 + Playwright `author-flow` + `librarian-flow` |
| **Two-phase author deletion** | `pending_deletion` → approve-delete → file unlinked. | `smoke/04_books_phase2.sh` C12–C13 |
| **Reviews** | Borrow-then-review enforced; UPSERT; aggregates correct. | `smoke/05_books_phase3.sh` D1–D4 |
| **Review moderation** | Flag → librarian resolve → hidden from public list. | `smoke/05_books_phase3.sh` D5–D7 |
| **Book requests + OL** | Request → librarian search → fulfill. | `smoke/05_books_phase3.sh` D8–D11 (offline: D11 may degrade) |
| **LLM summary** | With key 200; without key 500 with documented message. | `smoke/05_books_phase3.sh` D12 |
| **Reading history + insights + achievements** | All three endpoints return expected shapes. | `smoke/05_books_phase3.sh` D13–D15 |
| **Author stats + downloaded stats** | Aggregates include sentiment + by_source. | `smoke/05_books_phase3.sh` D16–D17 |
| **CSV / PDF exports** | Borrow records CSV downloads; history PDF generates. | `smoke/05_books_phase3.sh` D18 + manual matrix |
| **User management** | Create / edit / deactivate / bulk-action. | `smoke/06_librarian.sh` + Playwright `librarian-flow` |
| **Notifications** | Unread badge; mark/archive/delete; announcements fan out. | smoke during C/D path + Playwright |
| **Crash recovery** | Refresh / close / crash-test / unrecoverable-crash all behave per `06_screen_flow.md §7`. | Playwright `crash-recovery.spec` (3 tests) |
| **Negative authz/validation** | Cross-role + bad payload + oversize file. | `smoke/07_negative.sh` N1–N7 |

Anything green in this table = the matching SC-* line in `00_mission.md §2` is satisfied.

---

## 1. Test Pack Layout

Create `ai-rebuild/test-pack/`:

```
ai-rebuild/test-pack/
├── smoke/
│   ├── 00_env.sh                 # asserts node/npm/sqlite3 versions
│   ├── 01_health.sh              # curl /api/health
│   ├── 02_auth.sh                # register, login, fail-cases
│   ├── 03_books_phase1.sh        # browse, borrow, return
│   ├── 04_books_phase2.sh        # bulk-borrow, recommendations, bookmarks, highlights
│   ├── 05_books_phase3.sh        # reviews, requests, history, llm-summary (skip if no key)
│   ├── 06_librarian.sh           # approval, user mgmt, borrow records, bulk actions
│   ├── 07_negative.sh            # authz, validation, deactivated login
│   └── lib.sh                    # shared: jq helpers, token vars, exit-on-fail wrapper
├── playwright/
│   ├── auth.spec.ts
│   ├── student-flow.spec.ts
│   ├── author-flow.spec.ts
│   ├── librarian-flow.spec.ts
│   ├── crash-recovery.spec.ts
│   └── README.md                 # how to run via Playwright MCP
└── manual/
    └── checklist.md              # one row per requirement ID
```

The smoke scripts are intended to run with `bash` on POSIX or `git bash` / WSL on Windows. PowerShell equivalents (`.ps1`) are optional — provide if the TA's machine is pure Windows.

### 1.1 Canonical `lib.sh` (shared helpers — required)

Create this verbatim so every smoke script is callable:

```bash
# ai-rebuild/test-pack/smoke/lib.sh
set -euo pipefail
API="${API:-http://localhost:8000}"
FAIL=0
PASS=0

note() { printf "\n=== %s ===\n" "$*"; }
ok()   { PASS=$((PASS+1)); printf "  [OK ] %s\n" "$*"; }
fail() { FAIL=$((FAIL+1)); printf "  [FAIL] %s\n" "$*" >&2; }

# Login helper — echoes JWT or exits non-zero
login() { # login <username> <password>
  local body
  body=$(curl -fsS -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" "$API/api/auth/login") || return 1
  echo "$body" | jq -r '.token'
}

# Curl wrapper — sets bearer header, prints status code, swallows body on success
api() { # api <method> <path> [json-body] [token]
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=( -sS -o /tmp/api-body -w "%{http_code}" -X "$method" "$API$path" \
               -H 'Content-Type: application/json' )
  [ -n "$token" ] && args+=( -H "Authorization: Bearer $token" )
  [ -n "$body" ]  && args+=( -d "$body" )
  curl "${args[@]}"
}

summary() {
  printf "\n--- PASSED: %d  FAILED: %d ---\n" "$PASS" "$FAIL"
  if [ "$FAIL" -gt 0 ]; then printf "FAILED: %d\n" "$FAIL"; exit 1; fi
  printf "ALL GREEN\n"
}
```

### 1.2 Reference `02_auth.sh` (must produce A1–A8 pass/fail)

```bash
#!/usr/bin/env bash
# ai-rebuild/test-pack/smoke/02_auth.sh
source "$(dirname "$0")/lib.sh"

note "A1 register student (valid)"
U="t_$(date +%s)"
status=$(api POST /api/auth/register \
  "{\"username\":\"$U\",\"full_name\":\"Test\",\"password\":\"Pa55word!\",\"role\":\"student\"}")
[ "$status" = "201" ] && ok "registered" || fail "expected 201 got $status: $(cat /tmp/api-body)"

note "A2 weak password rejected"
status=$(api POST /api/auth/register \
  "{\"username\":\"weak_$U\",\"full_name\":\"Test\",\"password\":\"short\",\"role\":\"student\"}")
grep -q '"password"' /tmp/api-body && [ "$status" = "400" ] && ok "rejected" || fail "expected 400/errors.password: $(cat /tmp/api-body)"

note "A3 duplicate username"
status=$(api POST /api/auth/register \
  "{\"username\":\"$U\",\"full_name\":\"Test\",\"password\":\"Pa55word!\",\"role\":\"student\"}")
[ "$status" = "400" ] && grep -q 'taken' /tmp/api-body && ok "dup rejected" || fail "expected 400 'taken': $(cat /tmp/api-body)"

note "A4 login OK"
TOKEN=$(login "$U" "Pa55word!")
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && ok "got token" || fail "no token returned"

note "A5 login wrong password"
status=$(api POST /api/auth/login "{\"username\":\"$U\",\"password\":\"wrong\"}")
[ "$status" = "401" ] && ok "rejected" || fail "expected 401 got $status"

note "A6 protected GET without token"
status=$(api GET /api/users/profile)
[ "$status" = "401" ] && ok "blocked" || fail "expected 401 got $status"

note "A7 protected GET with token"
status=$(api GET /api/users/profile "" "$TOKEN")
[ "$status" = "200" ] && ok "200" || fail "expected 200 got $status: $(cat /tmp/api-body)"

note "A8 librarian cannot deactivate self"
LTOK=$(login librarian_demo 'Librarian@1') || { fail "no librarian_demo — run seed_dummy_users.js"; summary; }
SELF=$(curl -fsS -H "Authorization: Bearer $LTOK" "$API/api/users/profile" | jq -r .id)
status=$(api PATCH "/api/users/$SELF/deactivate" "" "$LTOK")
[ "$status" = "400" ] && ok "self-deactivate blocked" || fail "expected 400 got $status"

summary
```

Other smoke scripts (`03_..` through `07_..`) follow the same pattern: `source lib.sh`, run each row in the §3 matrix as a note+assert pair, end with `summary`. Subagents may generate them but must use this format so the verifier's grep for `ALL GREEN` is reliable.

---

## 2. Pre-flight (gate A)

```bash
# 00_env.sh
node --version | grep -E "v(1[89]|[2-9][0-9])" || { echo "Node 18+ required"; exit 1; }
npm  --version | grep -E "^([89]|[1-9][0-9])" || { echo "npm 8+ required"; exit 1; }
which sqlite3 >/dev/null || echo "warning: sqlite3 CLI not found (optional)"
```

```bash
# 01_health.sh
curl -fsS http://localhost:8000/api/health | jq -e '.status=="ok"' || exit 1
```

---

## 3. Smoke Matrix (gate B — after backend boots)

Each row is one curl invocation. Replace `$TOKEN` with the freshly issued JWT.

### 3.1 Auth

| # | Endpoint | Body / params | Expected |
|---|---|---|---|
| A1 | POST /api/auth/register (student) | `{username, full_name, password, role:'student'}` (valid) | 201 |
| A2 | POST /api/auth/register | weak password | 400 with `errors.password` mentions all rules missing |
| A3 | POST /api/auth/register | duplicate username | 400 `errors.username='Username already taken'` |
| A4 | POST /api/auth/login | correct | 200 `{token, user:{id,username,role,full_name,...}}` |
| A5 | POST /api/auth/login | wrong password | 401 |
| A6 | GET /api/users/profile | no token | 401 |
| A7 | GET /api/users/profile | valid token | 200 |
| A8 | PATCH /api/users/:id/deactivate (target=self) | librarian token | 400 `Cannot deactivate your own account` |

### 3.2 Books — Phase 1

| # | Endpoint | Expected |
|---|---|---|
| B1 | GET /api/books (no auth) | 401 |
| B2 | GET /api/books (any role) | 200 array; only `status='approved'` rows |
| B3 | POST /api/books/:id/borrow (student) `{duration_days:7}` | 200; book availability flips to `borrowed`; `times_borrowed` increments |
| B4 | POST /api/books/:id/borrow same book again | 400 "already borrowed" |
| B5 | POST /api/books/:id/borrow with 6th active | 400 mentions limit 5 |
| B6 | POST /api/books/:id/return | 200; book back to available; due-related notifications archived |
| B7 | POST /api/books/:id/borrow `{duration_seconds:10}`, wait 11 s, then GET /api/books/my-borrows | borrow auto-returned; `auto_return` notification exists |

### 3.3 Books — Phase 2

| # | Endpoint | Expected |
|---|---|---|
| C1 | POST /api/books/bulk-borrow `{book_ids:[a,b,c], duration_days:5}` | 200; all three appear in /my-borrows |
| C2 | bulk-borrow with > limit | 400 |
| C3 | GET /api/books/recommendations | top 3 by times_borrowed |
| C4 | POST /api/books/:id/bookmarks `{page_number:5}` | 201 |
| C5 | GET /api/books/:id/bookmarks | 200 contains the new bookmark |
| C6 | DELETE /api/books/bookmarks/:bookmarkId | 200 |
| C7 | POST /api/books/:id/highlights `{page_number, text_content}` | 201 |
| C8 | POST /api/books/draft `{title, genre, description}` (author) | 200 `{draft_id}` |
| C9 | POST /api/books/submit (author, multipart) | 201; librarians get `new_submission` |
| C10 | PATCH /api/books/:id/approve (librarian) | 200; book becomes approved; author gets `approval` notification |
| C11 | PATCH /api/books/:id/reject `{reason}` | 200; `rejection_reason` stored; author gets `rejection` |
| C12 | DELETE /api/books/:id (author) | 200; status = `pending_deletion` |
| C13 | PATCH /api/books/:id/approve-delete (librarian) | 200; book gone; related rows cleaned; file deleted from disk |

### 3.4 Books — Phase 3 / Reviews / Requests / Stats / LLM

| # | Endpoint | Expected |
|---|---|---|
| D1 | POST /api/reviews (student, book they have not borrowed) | 403 |
| D2 | POST /api/reviews (after borrowing) `{rating:5, content:"great"}` | 201; sentiment field set (if LLM up) |
| D3 | POST /api/reviews same book again | 200 update (UPSERT semantics) |
| D4 | GET /api/reviews/book/:bookId | 200; `avg_rating`, `review_count`, `distribution` correct |
| D5 | POST /api/reviews/:id/flag (author of the book) | 200 |
| D6 | GET /api/reviews/flagged (librarian) | review present |
| D7 | POST /api/reviews/:id/resolve-flag `{action:'accept'}` | 200; review hidden from /book/:bookId response |
| D8 | POST /api/requests (student) | 201 |
| D9 | GET /api/requests (librarian) | includes the request, ordered by priority then date |
| D10 | PATCH /api/requests/:id/priority `{priority:'urgent'}` | 200 |
| D11 | GET /api/requests/:id/openlibrary-search | 200 with `exact[]` and `alternatives[]` (or 500 with debug if OL unreachable — that's OK in offline testing) |
| D12 | POST /api/llm/summary `{title, genre}` | with key: 200 `{summary}`. without key: 500 with message mentioning DASHSCOPE_API_KEY |
| D13 | GET /api/history (student) | 200 array with `progress_percent`, `duration_days` |
| D14 | GET /api/history/insights | 200 with totals |
| D15 | GET /api/history/achievements | 200 with 7 badges |
| D16 | GET /api/stats/author (author) | 200 with `books`, `summary`, `trends`, `sentiment` |
| D17 | GET /api/stats/downloaded (librarian) | 200 with `books`, `summary`, `by_source` |
| D18 | GET /api/books/borrow-records/export | 200 `text/csv`; first line is header |

### 3.5 Negative

| # | Action | Expected |
|---|---|---|
| N1 | student JWT → GET /api/librarian/books | 403 |
| N2 | author JWT → PATCH /api/books/:id/approve | 403 |
| N3 | invalid token → any /api/* | 401 |
| N4 | malformed JSON → any POST | 400 |
| N5 | upload 60 MB book file | 400 "File too large. Maximum size is 50MB." |
| N6 | upload .exe as book_file | 400 "Only PDF, TXT, DOC, and DOCX files are allowed" |
| N7 | upload 3 MB cover | 400 "Cover image must be under 2MB" |

---

## 4. Playwright MCP Scripts (gate C — after frontend is up)

Set Playwright base URL to `http://localhost:3000`. Use the seeded demo accounts. The scripts below describe behavior, not literal code — generate the spec files from these contracts.

### 4.1 `auth.spec.ts`
- **Test 1** — Register a new student, log in, land on `/student`, see "Browse Books" header.
- **Test 2** — Wrong password shows inline alert.
- **Test 3** — Deactivated account (preset via librarian) cannot log in.

### 4.2 `student-flow.spec.ts`
- Log in as `student_demo`.
- Browse → click first available book → borrow 7 days → see in My Borrows.
- Open PDF reader → add bookmark page 1 with label → verify it appears in the panel.
- Switch tabs to Notifications → unread badge ≥1 expected after some events.
- Logout removes JWT and routes to `/login`.

### 4.3 `author-flow.spec.ts`
- Log in as `author_demo`.
- Publish a new book with title, genres, ≥20 char description, attach a small PDF.
- Auto-save creates a draft row visible in Drafts tab within 5 s.
- Submit form → see in Submissions with status "Pending Review".

### 4.4 `librarian-flow.spec.ts`
- Log in as `librarian_demo`.
- Pending Submissions tab → approve the book just created by author → confirm.
- Borrow Records tab → export CSV → assert download initiated (filename `borrow_records.csv`).
- Manage Users tab → create a new staff user → assert it appears in the list.
- Flagged Reviews tab (if a flag exists) → resolve.

### 4.5 `crash-recovery.spec.ts`
- Log in as student → switch to "My Borrows" tab → type "math" in browse search.
- Refresh page (`Ctrl+R`) → assert active tab is restored, search query restored, no error toast (refresh path).
- Click "Crash Test" → confirm → browser tab closes → re-open and log in → assert restored state + "recovered after crash test" toast (or matching toast text).
- Click "Crash (No Recovery)" → confirm → re-open and log in → assert tab is default (`browse`), no toast.

---

## 5. Manual Matrix (gate D — full acceptance)

`ai-rebuild/test-pack/manual/checklist.md` template:

```
| Req ID | Description | Tester sign-off | Notes |
|--------|-------------|-----------------|-------|
| P1-T1-REG-001 | Register supports 4 roles | [ ] | |
| P1-T1-REG-003 | Password rules enforced | [ ] | |
... (one row per requirement in 02_requirements_normalized.md)
```

Generation rule: include every MUST/SHOULD. COULDs are optional; mark `[N/A]` if not implemented.

---

## 6. Performance & Load (sanity only)

Open browser DevTools, network tab:
- `/api/books` < 200 ms on a clean DB with 50 books.
- `/api/notifications` < 250 ms.
- PDF viewer first-page render < 2 s on a 5 MB PDF.

No formal load testing in scope.

---

## 7. Acceptance Gates (block the milestone if any row fails)

| Gate | Requires |
|---|---|
| **A** | Pre-flight passes (`00_env.sh`) |
| **B-1** | Phase-1 smoke 100% green (`02-03_*.sh`) — milestone M3 complete |
| **B-2** | Phase-2 smoke 100% green (`04_*.sh`, `06_*.sh`) — milestone M5 complete |
| **B-3** | Phase-3 smoke 100% green (`05_*.sh`) — milestone M7 complete |
| **C** | All Playwright specs pass — milestone M8 complete |
| **D** | All MUST rows on the manual checklist signed off — release |
| **E** | Negative-path smoke 100% green (`07_*.sh`) — release |

Subagents may not advance past a gate without writing the green-test log to `ai-rebuild/test-pack/results/<milestone>.log`.

---

## 8. Common Failure Patterns to Watch

| Symptom | Likely cause |
|---|---|
| `POST /api/books/:id/borrow` returns 500 with `LIMIT_FILE_SIZE` | server.js error handler missing multer special-case |
| Login works for student but redirect goes to `/portal` instead of `/student` | PortalRedirect missing role map |
| Bookmarks panel appears empty after add | Auth header dropped on POST (check axios baseURL is `/api` and JWT is in localStorage) |
| `availability='borrowed'` but no row in borrow_records | Borrow transaction not used; ensure `db.transaction(() => {...})()` is invoked |
| Auto-return never fires | `processAutoReturns` not called from one of the documented routes (DR-15) |
| Crash recovery never restores | `bv_should_clear` written and then re-read with mismatched key; verify exact strings |
| LLM summary endpoint 500s on every call | `DASHSCOPE_API_KEY` unset; this is expected — document, do not fix |
| Open Library download 401 | Restricted IA item; document fallback and try `alternatives` |
| Books table CHECK error on draft insert | `migrateAddDraftStatus` not run; DB created before the migration was added |
