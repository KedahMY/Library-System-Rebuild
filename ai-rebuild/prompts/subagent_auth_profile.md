# Subagent Prompt — SA-3: Auth, Profile & User Management

> **Milestone window**: M2 (initial auth+profile) and M5 (user-management extensions).
> Paste this into Claude Code after the lead orchestrator has confirmed M1 (database) is complete.

---

## IDENTITY

You are **SA-3**, the Auth + Profile + User-Management subagent. You own a specific slice of the rebuild. Do not edit files outside your ownership list.

---

## CONTEXT-LOCK (verify before writing any code)

Confirm these values match what you were told by the orchestrator:

- Backend port: **8000**
- JWT secret default: **`library-system-secret-key-2024`**
- JWT TTL: **24 hours**
- Password hash: **bcryptjs, cost factor 12**
- Role set: **`student`, `staff`, `author`, `librarian`**
- Username validation regex: **`/^[a-zA-Z0-9_]+$/`**, min length **3**
- Password rule: **8+ chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special**
- All IDs: **UUID v4 strings** (`crypto.randomUUID()`)

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §3 (API conventions), §5 (auth)
ai-rebuild/05_data_model.md          §2 users table DDL, §7 seed data
ai-rebuild/02_requirements_normalized.md   P1-T1-AUTH-*, P2-T4-PROFILE-*
ai-rebuild/08_traceability_matrix.md Appendix-R rows: /api/auth/*, /api/users/*
ai-rebuild/06_screen_flow.md         §2 (login/register flows), §4.4 (profile tab)
ai-rebuild/13_risks_and_failure_modes.md   FM-AUTH-1..6
```

The database module at `backend/database.js` is already complete (M1). Import it; do not rewrite it.

---

## OWNED FILES (write only these)

```
backend/middleware/auth.js
backend/routes/auth.js
backend/routes/users.js
```

**Read-only** (do not edit):
```
backend/server.js          (SA-1 owns — read to understand route mounting)
backend/database.js        (SA-2 owns)
backend/routes/books.js    (SA-4 owns)
```

---

## FORBIDDEN

- Do not add OAuth, SSO, or any third-party auth provider.
- Do not use `jsonwebtoken` directly in route files — import `generateToken` and `authenticate` from `middleware/auth.js` only.
- Do not store passwords in plaintext anywhere, including logs.
- Do not change the default JWT secret string — `14_human_inputs_required.md` HI-1 says the user sets it via env; code must fall back to the exact string `library-system-secret-key-2024`.
- Do not add `email` or `phone` to the users table — the schema is locked in `05_data_model.md`.
- Do not write a cron job or `setInterval` — scheduling is explicitly out of scope.

---

## DELIVERABLES

### `backend/middleware/auth.js`

Export three items:

```js
// 1. authenticate(req, res, next)
//    Reads Authorization: Bearer <token> header.
//    Decodes JWT, sets req.user = { id, username, role, full_name }.
//    Returns 401 JSON if missing/invalid/expired.

// 2. authorize(...roles)
//    Returns middleware that calls next() if req.user.role is in roles[].
//    Returns 403 JSON otherwise.

// 3. generateToken(user)
//    Signs { id, username, role, full_name } with JWT_SECRET (env or default).
//    expiresIn: '24h'.
```

### `backend/routes/auth.js`

Mount path: `/api/auth` (registered in server.js by SA-1).

#### `POST /api/auth/register`

Request body:
```json
{ "username": "string", "password": "string", "full_name": "string", "role": "string" }
```

Validation (server-side — must mirror client-side):
- `username`: matches `/^[a-zA-Z0-9_]+$/`, length ≥ 3
- `role`: one of `['student','staff','author','librarian']`
- `password`: passes `validatePassword(pw)` — returns `{valid, message}`; valid requires 8+ chars with upper, lower, digit, and special char

On success:
- Hash password with `bcryptjs.hashSync(password, 12)`
- Insert into users with `id = crypto.randomUUID()`, `is_active = 1`, `created_at = CURRENT_TIMESTAMP`
- Send notification to all librarians: `{ type: 'user_update', message: 'New user registered: <username> (<role>)' }`
- Return `201 { message: 'User registered successfully', token, user: { id, username, role, full_name } }`

On conflict (username taken): `409 { error: 'Username already exists' }`
On validation failure: `400 { error: '<message>' }`

#### `POST /api/auth/login`

Request body: `{ "username": "string", "password": "string" }`

- Lookup user by username; if not found → `401 { error: 'Invalid credentials' }`
- If `is_active = 0` → `403 { error: 'Account deactivated' }`
- `bcryptjs.compareSync(password, user.password_hash)` — if false → `401 { error: 'Invalid credentials' }`
- Update `last_login = CURRENT_TIMESTAMP`
- Return `200 { token, user: { id, username, role, full_name, avatar_url } }`

### `backend/routes/users.js`

Mount path: `/api/users` (all routes require `authenticate`).

#### `GET /api/users/profile`

Returns `200 { id, username, full_name, role, avatar_url, email, bio, created_at, last_login }`.

#### `PUT /api/users/profile`

Body: `{ full_name?, email?, bio? }`. Updates in place. Returns `200 { message, user }`.

#### `POST /api/users/change-password`

Body: `{ currentPassword, newPassword }`.
- Verify current password with `compareSync`.
- Validate new password with `validatePassword`.
- Hash and update. Returns `200 { message }`.

#### `POST /api/users/avatar` (multer, field `avatar`, ≤5 MB, images only)

Saves file to `uploads/avatars/<uuid>.<ext>`. Stores relative path `uploads/avatars/<filename>` in `avatar_url`. Returns `200 { avatar_url }`.

#### Librarian-only user management routes (require `authorize('librarian')`):

```
GET  /api/users                     list all users (with pagination: ?page=1&limit=20)
GET  /api/users/:id                 single user detail
PUT  /api/users/:id/toggle-active   flip is_active; returns 200 { message, is_active }
POST /api/users/bulk-action         body: { action: 'activate'|'deactivate', userIds: [...] }
DELETE /api/users/:id               hard delete user (only if no active borrows)
```

All list endpoints return `{ users: [...], total, page, limit }`.

---

## VERIFICATION STEPS

Run these after completing your deliverables. All must pass before reporting DONE.

### V-AUTH-1: Register round-trip
```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"sa3_test","password":"Test@1234","full_name":"SA3 Test","role":"student"}'
```
PASS = `201` with `token` field in response.

### V-AUTH-2: Login round-trip
```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sa3_test","password":"Test@1234"}'
```
PASS = `200` with `token` and `user.role === "student"`.

### V-AUTH-3: Bad password rejection
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sa3_test","password":"wrong"}'
```
PASS = `401`.

### V-AUTH-4: Role authorization
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sa3_test","password":"Test@1234"}' | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/users
```
PASS = `403` (student cannot list all users — librarian-only).

### V-AUTH-5: Password validation
```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"weakpwtest","password":"weak","full_name":"Weak","role":"student"}'
```
PASS = `400` with error message about password requirements.

### V-AUTH-6: Duplicate username
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"sa3_test","password":"Test@1234","full_name":"Dup","role":"student"}'
```
PASS = `409`.

### V-AUTH-7: Profile get
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/users/profile
```
PASS = `200` with `username === "sa3_test"`.

---

## COMPLETION CRITERIA

Report DONE to the lead orchestrator only when:

- [ ] All 6 verification steps above pass
- [ ] `backend/middleware/auth.js` exports exactly `authenticate`, `authorize`, `generateToken`
- [ ] `backend/routes/auth.js` handles register + login with all documented edge cases
- [ ] `backend/routes/users.js` handles profile CRUD + avatar + all librarian user-management routes
- [ ] No file outside the owned list was modified
- [ ] `validatePassword` is exported from `auth.js` so that `books.js` and other routes can import it if needed (or placed in a shared `utils/validate.js` — document the choice in `ai-rebuild/notes/decisions.md`)

Report format to orchestrator:
```json
{
  "subagent": "SA-3",
  "milestone": "M2",
  "status": "DONE",
  "files_written": ["backend/middleware/auth.js", "backend/routes/auth.js", "backend/routes/users.js"],
  "verification_passed": ["V-AUTH-1","V-AUTH-2","V-AUTH-3","V-AUTH-4","V-AUTH-5","V-AUTH-6","V-AUTH-7"],
  "decisions": [],
  "blockers": []
}
```
