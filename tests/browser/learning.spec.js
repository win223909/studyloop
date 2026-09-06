import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('learn, submit unknown answers, follow up, download a brief, replay after reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.course-row')).toHaveCount(3);
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('.course-start').first().click();
  await expect(page.locator('.question-prompt')).toBeVisible();
  await page.locator('.source-link').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  for (let index = 0; index < 6; index++) {
    await page.locator('.unknown-option').click();
    await page.locator('.question-actions .primary-button').click();
  }
  await expect(page.locator('.result-item')).toHaveCount(6);
  await expect(page.locator('.result-item .status-badge.unknown')).toHaveCount(6);
  await page.locator('.lesson-toggle').first().click();
  await expect(page.locator('.micro-lesson')).toBeVisible();
  await page.locator('.mini-choices label').first().click();
  await page.locator('.followup-practice .secondary-button').click();
  await expect(page.locator('.practice-feedback')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.classroom-handoff .primary-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const brief = await readFile(await download.path(), 'utf8');
  expect(brief).toContain('OpenMAIC');
  expect(brief).not.toContain('studyloop_session');
  await page.reload();
  await page.locator('.nav-item').nth(1).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('.history-row').click();
  await expect(page.locator('.result-item .status-badge.unknown')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('course export/import works; setup and language states are truthful', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.course-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('.nav-item').nth(2).click();
  await expect(page.locator('.settings-page')).toContainText('cp .env.example .env');
  await expect(page.locator('.settings-page')).toContainText('Not configured');
  await page.locator('.nav-item').first().click();
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(fileURLToPath(new URL('../../examples/past-tense.json', import.meta.url)));
  await expect(page.locator('.content-title')).toContainText('English: stories from yesterday');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.practice-topline a[download]').click();
  const download = await downloadPromise;
  const pack = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(pack.questions).toHaveLength(6);
  expect(pack.sources.length).toBeGreaterThan(0);
  await page.locator('.nav-item').first().click();
  await expect(page.locator('.course-row')).toHaveCount(4);
});
