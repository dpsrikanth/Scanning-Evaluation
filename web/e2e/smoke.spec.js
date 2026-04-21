import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000';

test.describe('Smoke', () => {
  test('API health', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
  });
});
