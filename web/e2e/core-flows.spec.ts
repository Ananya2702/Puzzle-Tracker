import { test, expect } from '@playwright/test';

const uniq = `e2e2_${Date.now()}`;

test('log → dashboard → history edit → goals → awards → analytics → settings scaling', async ({ page }) => {
  // Register
  await page.goto('/register');
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Quick-add a solve
  await page.getByRole('link', { name: /Log/ }).first().click();
  // Use exact: true to avoid matching "1500" when searching for "500"
  await page.getByRole('radio', { name: '500', exact: true }).click();
  await page.getByLabel('Time').fill('45:00');
  await page.getByRole('button', { name: 'Log 500pc' }).click();
  await expect(page.getByText(/Logged 500pc in 45:00/)).toBeVisible();

  // Dashboard reflects it
  // A single solve already pushes longest_streak to 1, which alone is worth
  // 100 XP in the legacy-ported XP curve (50/puzzle + 10/hour + 100/streak-day,
  // see src/lib/levels.ts and its unit tests) — that clears the 100-XP L1→2
  // threshold, so the dashboard correctly reads "Level 2" here, not "Level 1".
  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page.getByText('Level 2')).toBeVisible();
  await expect(page.getByText('45:00').first()).toBeVisible();

  // History: edit the time
  await page.getByRole('link', { name: /History/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Time *').fill('40:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Session updated')).toBeVisible();
  // For a 500pc solve the scaling factor is (500/500)^exponent = 1 regardless
  // of exponent, so the Time and Scaled columns both render "40:00" — .first()
  // targets the (earlier) Time column deterministically.
  await expect(page.getByRole('cell', { name: '40:00' }).first()).toBeVisible();

  // Goals: add and see progress line
  await page.getByRole('link', { name: /Goals/ }).click();
  await page.getByLabel('Target time').fill('35:00');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await expect(page.getByText('500pc under 35:00')).toBeVisible();
  await expect(page.getByText(/Current PB 40:00/)).toBeVisible();

  // Awards: first_puzzle unlocked
  await page.getByRole('link', { name: /Awards/ }).click();
  await expect(page.getByText('First Piece')).toBeVisible();
  await expect(page.getByText(/1 of 19 unlocked/)).toBeVisible();

  // Analytics renders charts
  await page.getByRole('link', { name: /Analytics/ }).click();
  await expect(page.getByText('Scaled time with moving averages')).toBeVisible();

  // Settings: scaling slider saves
  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByLabel('Scaling exponent').fill('0');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Scaling updated — history rescaled')).toBeVisible();
});
