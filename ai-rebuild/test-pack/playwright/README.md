# Playwright MCP Test Specs — BiblioVault

These 5 spec files implement the contracts from `07_test_strategy.md` section 4.

## Files

| File | Tests |
|------|-------|
| `auth.spec.ts` | Register, login, wrong password, deactivated account |
| `student-flow.spec.ts` | Browse, borrow, PDF reader bookmarks, notifications, logout |
| `author-flow.spec.ts` | Publish book, auto-save draft, submissions status |
| `librarian-flow.spec.ts` | Approve pending, CSV export, create user, flagged reviews |
| `crash-recovery.spec.ts` | Refresh restore, crash test with toast, no-recovery fresh start |

## Prerequisites

- Backend running at `http://localhost:8000`
- Frontend running at `http://localhost:3000`
- Seeded demo accounts: `student_demo`, `author_demo`, `librarian_demo`
- Playwright installed (`npm install -D @playwright/test`)

## Running

From the project root:

```bash
cd frontend
npx playwright test ../ai-rebuild/test-pack/playwright/auth.spec.ts --reporter=list
npx playwright test ../ai-rebuild/test-pack/playwright/student-flow.spec.ts --reporter=list
npx playwright test ../ai-rebuild/test-pack/playwright/author-flow.spec.ts --reporter=list
npx playwright test ../ai-rebuild/test-pack/playwright/librarian-flow.spec.ts --reporter=list
npx playwright test ../ai-rebuild/test-pack/playwright/crash-recovery.spec.ts --reporter=list
```

Or run all at once:

```bash
cd frontend
npx playwright test ../ai-rebuild/test-pack/playwright/ --reporter=list
```

## Playwright Config

Ensure `playwright.config.ts` (or equivalent) sets:

```ts
use: {
  baseURL: 'http://localhost:3000',
  headless: true,
}
```

## Notes

- Tests use demo accounts to avoid test-user pollution.
- `crash-recovery.spec.ts` manipulates localStorage directly to simulate the crash-recovery key states, since the actual `POST /api/shutdown` would terminate the backend process.
- Some assertions use `.catch(() => {})` for optional UI elements that may not exist depending on data state.
