# 15 · Environment & Secrets Template

> Copy-paste files for `.env.example` and related secrets handling. Includes generation commands, dev/CI profiles, and a redaction policy.

---

## 1. Canonical `backend/.env.example`

The rebuild MUST ship this file verbatim. The agent generates it as part of milestone **M0** (Scaffold).

```dotenv
# ---------------------------------------------------------------
# BiblioVault — backend environment
# Copy this file to backend/.env and fill in real values.
# Never commit backend/.env.
# ---------------------------------------------------------------

# Required ---------------------------------------------------------
PORT=8000
JWT_SECRET=__REPLACE_WITH_64_HEX_CHARS__
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Optional --------------------------------------------------------
# Without DASHSCOPE_API_KEY the LLM features degrade gracefully:
#   • POST /api/llm/summary returns 500 with a clear message
#   • review sentiment classification defaults to 'neutral'
# Get a key at https://dashscope.console.aliyun.com/ (International region)
DASHSCOPE_API_KEY=

# Used by routes/requests.js when downloading restricted Internet Archive items.
# Format: ACCESS_KEY:SECRET_KEY  (see https://archive.org/account/s3.php)
INTERNET_ARCHIVE_AUTH=
```

---

## 2. Generating a Strong JWT_SECRET

Pick **one** of these. All produce a 64-char hex string (256 bits).

| OS | Command |
|---|---|
| POSIX / macOS / WSL | `openssl rand -hex 32` |
| Linux (no openssl) | `head -c 32 /dev/urandom \| xxd -p -c 64` |
| Windows PowerShell | `-join ((48..57) + (97..102) \| Get-Random -Count 64 \| ForEach-Object {[char]$_})` |
| Node (any OS) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Paste the output into `backend/.env` as the value of `JWT_SECRET`.

---

## 3. `.gitignore` Entries (mandatory)

The agent MUST add (or merge with) the following at the repo root `.gitignore`:

```gitignore
# environment
backend/.env
backend/.env.*
!backend/.env.example

# runtime state
backend/data/library.db
backend/data/library.db-shm
backend/data/library.db-wal

# uploads (keep dir, ignore content)
backend/uploads/books/*
backend/uploads/covers/*
backend/uploads/avatars/*
!backend/uploads/books/.gitkeep
!backend/uploads/covers/.gitkeep
!backend/uploads/avatars/.gitkeep

# node + build
node_modules/
frontend/dist/

# editor / OS
.DS_Store
*.log
.idea/
.vscode/
```

The three `.gitkeep` files must be created (empty) so the directories exist on clone.

---

## 4. Frontend Environment

Vite reads variables prefixed with `VITE_*`. The rebuild does **not** require any — the axios baseURL is `/api` (relative), so the proxy resolves it. If a TA wants to point the SPA at a non-localhost backend, document with a sample `.env.local`:

```dotenv
# frontend/.env.local (optional; not required for default dev)
VITE_API_BASE=/api
```

The rebuild does not currently read `VITE_API_BASE` (the axios util hardcodes `/api`). If the agent decides to read it, log the change in `notes/decisions.md`.

---

## 5. Dev vs CI Profiles

There is no production profile in scope. For CI smoke runs (Phase 1 of `07_test_strategy.md`), the env can be set inline:

```bash
# CI smoke run
PORT=8000 JWT_SECRET=ci-fixed-secret-do-not-deploy NODE_ENV=test \
  node backend/server.js &
sleep 2
bash ai-rebuild/test-pack/smoke/01_health.sh
```

Use `JWT_SECRET=ci-fixed-secret-do-not-deploy` so re-runs accept the same tokens across smoke scripts. **Never** ship this value in dev or to a TA's machine.

---

## 6. Secret Redaction Policy

### 6.1 Logs and stdout

The agent and subagents MUST NEVER log full values of:
- `JWT_SECRET`
- `DASHSCOPE_API_KEY`
- `INTERNET_ARCHIVE_AUTH`
- JWT tokens (`Authorization: Bearer …` headers)
- Password fields

Acceptable logging:
- Last 4 characters of a token for debugging: `…a1b2`
- `Bearer <redacted>` instead of the full header
- The fact that `DASHSCOPE_API_KEY` is set (`true`/`false`) — not its value

### 6.2 Test scripts

Smoke scripts may print full responses to local log files in `ai-rebuild/test-pack/results/` because those files are gitignored. The scripts must NOT echo `Authorization` header values to stdout.

### 6.3 Committed files

- `backend/.env` — never commit.
- `backend/.env.example` — placeholders only.
- `ai-rebuild/test-pack/results/*.log` — gitignored.

If the agent finds a real secret in any reference file (e.g., the reference repo's `.env`), it MUST replace it with a placeholder in the rebuilt repo. Do not preserve secrets across rebuilds.

---

## 7. Secret Rotation Checklist

If a secret leaks (committed, screenshotted, pasted in a public channel):

1. **Rotate immediately** at the provider:
   - DashScope: console → API keys → revoke + create new.
   - Internet Archive: account → S3 keys → revoke.
2. Update `backend/.env` with the new value.
3. Restart the backend.
4. Search the repo history: `git log --all -p | grep '<leaked-prefix>'`.
5. If found in history, run BFG or `git filter-repo` and force-push (coordinate with anyone using the repo).
6. Document the incident in `notes/security.md` (date, scope, action taken).

---

## 8. Quick Sanity Check

After editing `.env`, run:

```bash
cd backend
node -e "require('dotenv').config(); console.log({
  PORT: process.env.PORT,
  FRONTEND_URL: process.env.FRONTEND_URL,
  JWT_SECRET_LEN: (process.env.JWT_SECRET || '').length,
  DASHSCOPE: process.env.DASHSCOPE_API_KEY ? 'set' : 'unset',
  IA_AUTH: process.env.INTERNET_ARCHIVE_AUTH ? 'set' : 'unset',
})"
```

Expected output (example):

```
{ PORT: '8000', FRONTEND_URL: 'http://localhost:3000',
  JWT_SECRET_LEN: 64, DASHSCOPE: 'unset', IA_AUTH: 'unset' }
```

- `JWT_SECRET_LEN` should be **≥ 32** (and ideally 64 hex). If it's 0 or undefined the file isn't being read.
- If `PORT` is missing, dotenv didn't load — confirm `.env` is in `backend/`, not the repo root.
