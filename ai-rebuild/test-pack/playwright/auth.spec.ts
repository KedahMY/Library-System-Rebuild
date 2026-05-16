// BiblioVault auth.spec.ts — Playwright MCP auth flow tests
// Contract per 07_test_strategy.md §4.1

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Auth flows', () => {
  const ts = Date.now();
  const testUser = `pw_auth_${ts}`;
  const testPass = 'Pass1234!';

  test('Test 1 — Register a new student, log in, land on /student, see Browse Books header', async ({ page }) => {
    // Navigate to register
    await page.goto(`${BASE}/register`);
    await page.waitForSelector('text=Register', { timeout: 10000 });

    // Fill register form — pick student role
    await page.fill('input[name="username"]', testUser);
    await page.fill('input[name="full_name"]', `Test User ${ts}`);
    await page.fill('input[name="password"]', testPass);
    await page.fill('input[name="confirmPassword"]', testPass);
    await page.click('button:has-text("Student")'); // role selector

    // Submit
    await page.click('button[type="submit"]');

    // Expect success toast/message, then redirected to /login
    await page.waitForSelector('text=success', { timeout: 10000 }).catch(() => {});
    await page.waitForURL('**/login', { timeout: 10000 });

    // Now log in
    await page.fill('input[name="username"]', testUser);
    await page.fill('input[name="password"]', testPass);
    await page.click('button[type="submit"]');

    // Expect to land on /student
    await page.waitForURL('**/student', { timeout: 10000 });

    // Assert "Browse Books" header is visible
    await expect(page.locator('text=Browse Books')).toBeVisible({ timeout: 5000 });
  });

  test('Test 2 — Wrong password shows inline alert', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });

    await page.fill('input[name="username"]', testUser);
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Expect an inline error (alert or toast styled in red)
    await expect(page.locator('text=Invalid').or(page.locator('text=incorrect')).or(page.locator('text=error'))).toBeVisible({ timeout: 5000 });
  });

  test('Test 3 — Deactivated account cannot log in', async ({ page }) => {
    // First, we need a deactivated account. Use the API to deactivate the user we created
    // Login as librarian_demo to deactivate
    const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
      data: { username: 'librarian_demo', password: 'Librarian@1' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { token } = await loginRes.json();

    // Get user profile to find id
    const profileRes = await page.request.get(`${BASE}/api/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(profileRes.ok()).toBeTruthy();
    const usersRes = await page.request.get(`${BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usersRes.ok()).toBeTruthy();
    const users = await usersRes.json();
    const targetUser = (users.users || users).find((u: any) => u.username === testUser);
    if (targetUser) {
      const deactRes = await page.request.patch(`${BASE}/api/users/${targetUser.id}/deactivate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(deactRes.ok()).toBeTruthy();
    }

    // Now try to log in as the deactivated user
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });

    await page.fill('input[name="username"]', testUser);
    await page.fill('input[name="password"]', testPass);
    await page.click('button[type="submit"]');

    // Should see a deactivation error message
    await expect(page.locator('text=deactivated').or(page.locator('text=inactive'))).toBeVisible({ timeout: 5000 });

    // And should still be on /login
    expect(page.url()).toContain('/login');
  });
});
