import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000';

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/api/health`);
  test.skip(
    !res.ok(),
    `API not reachable at ${API} — start docker compose or api dev server`
  );
});

test.describe('Admin login', () => {
  test('signs in and reaches dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your username').fill('admin');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible({ timeout: 20_000 });
  });
});
