import { test, expect } from '@playwright/test';

const uniq = `e2e_${Date.now()}`;

test('register → dashboard → theme switch → sign out → sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every puzzle is a race.' })).toBeVisible();

  await page.getByRole('link', { name: 'Join free' }).click();
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('radio', { name: /Cozy Table/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(uniq);
  await page.getByLabel('Password').fill('longenough123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('unauthenticated visitor is bounced from protected pages', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
