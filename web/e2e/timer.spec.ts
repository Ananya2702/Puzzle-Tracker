import { test, expect } from '@playwright/test';

const uniq = `e2e3_${Date.now()}`;

test('timer: start → splits → finish → saved and visible in history', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: /Timer/ }).click();
  await expect(page.getByRole('heading', { name: 'Stopwatch' })).toBeVisible();

  await page.getByRole('button', { name: /Start solve/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Split/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Finish/ }).click();

  await expect(page.getByRole('dialog', { name: 'Save solve' })).toBeVisible();
  await page.getByLabel('Pieces *').fill('500');
  await page.getByRole('button', { name: 'Save solve' }).click();
  await expect(page.getByText(/Solve saved/)).toBeVisible();

  await page.getByRole('link', { name: /History/ }).click();
  await expect(page.getByRole('cell', { name: /0:0[1-9]/ }).first()).toBeVisible();
});

test('timer survives a reload mid-solve', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(uniq);
  await page.getByLabel('Password').fill('longenough123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: /Timer/ }).click();
  await page.getByRole('button', { name: /Start solve/ }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('Resumed your solve in progress')).toBeVisible();
  await expect(page.getByRole('button', { name: /Finish/ })).toBeVisible();
  // clock is at least 1 second and still counting
  await expect(page.locator('.clock')).not.toHaveText('0:00');
});
