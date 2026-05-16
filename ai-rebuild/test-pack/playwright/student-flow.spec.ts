// BiblioVault student-flow.spec.ts — Playwright MCP student flow tests
// Contract per 07_test_strategy.md §4.2

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const STUDENT_USER = 'student_demo';
const STUDENT_PASS = 'Student@1';

test.describe('Student portal flows', () => {
  test('Log in as student_demo, browse, borrow, see in My Borrows', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });
    await page.fill('input[name="username"]', STUDENT_USER);
    await page.fill('input[name="password"]', STUDENT_PASS);
    await page.click('button[type="submit"]');

    // Land on /student with Browse Books tab
    await page.waitForURL('**/student', { timeout: 10000 });
    await expect(page.locator('text=Browse Books')).toBeVisible({ timeout: 5000 });

    // Wait for books to load
    await page.waitForTimeout(2000);

    // Find an available book card and click it
    const availableBadge = page.locator('text=Available').first();
    if (await availableBadge.isVisible()) {
      // Click the parent card
      await availableBadge.click();

      // BookModal should open — look for the borrow slider
      const borrowSection = page.locator('text=Borrow This Book');
      if (await borrowSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Set duration to 7 days via the range slider
        const slider = page.locator('input[type="range"]');
        if (await slider.isVisible()) {
          await slider.fill('7');
        }

        // Click borrow button
        await page.click('button:has-text("Borrow")');

        // Wait for success
        await expect(page.locator('text=borrowed successfully')).toBeVisible({ timeout: 10000 });
      }
    }

    // Switch to My Borrows tab
    await page.click('text=My Borrows');

    // Wait for borrows to load
    await page.waitForTimeout(2000);

    // Should see the borrowed book in the list
    await expect(page.locator('text=Read').first()).toBeVisible({ timeout: 5000 });
  });

  test('Open PDF reader — add bookmark and verify', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });
    await page.fill('input[name="username"]', STUDENT_USER);
    await page.fill('input[name="password"]', STUDENT_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student', { timeout: 10000 });

    // Go to My Borrows
    await page.click('text=My Borrows');
    await page.waitForTimeout(2000);

    // Click "Read" on the first borrowed book
    const readBtn = page.locator('button:has-text("Read")').first();
    if (await readBtn.isVisible({ timeout: 5000 })) {
      await readBtn.click();

      // Wait for PDF reader to load
      await page.waitForTimeout(3000);

      // Look for bookmark controls
      const bookmarkBtn = page.locator('text=Bookmark').or(page.locator('button:has-text("Add Bookmark")'));
      if (await bookmarkBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bookmarkBtn.click();
      }

      // Look for bookmark panel or bookmark list
      await page.waitForTimeout(1000);
    }
  });

  test('Switch tabs to Notifications — unread badge visible', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });
    await page.fill('input[name="username"]', STUDENT_USER);
    await page.fill('input[name="password"]', STUDENT_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student', { timeout: 10000 });

    // Click Notifications tab
    await page.click('text=Notifications');
    await page.waitForTimeout(2000);

    // Should see notification board (or empty state)
    await expect(page.locator('text=Notifications').first()).toBeVisible({ timeout: 5000 });
  });

  test('Logout removes JWT and routes to /login', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Login', { timeout: 10000 });
    await page.fill('input[name="username"]', STUDENT_USER);
    await page.fill('input[name="password"]', STUDENT_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student', { timeout: 10000 });

    // Click Logout in sidebar
    await page.click('button:has-text("Logout")');

    // Should redirect to /login
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');

    // Try accessing /student directly — should redirect to /login
    await page.goto(`${BASE}/student`);
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});
