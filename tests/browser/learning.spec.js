import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function expectNoHorizontalOverflow(page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test('learn, submit unknown answers, follow up, download a brief, replay after reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.course-row')).toHaveCount(3);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.locator('.course-start').first().click();
  await expect(page.locator('.question-prompt')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const sourceLink = page.locator('.source-link');
  await sourceLink.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(sourceLink).toBeFocused();
  for (let index = 0; index < 6; index++) {
    await page.locator('.unknown-option').click();
    await page.locator('.question-actions .primary-button').click();
  }
  await expect(page.locator('.result-item')).toHaveCount(6);
  await expect(page.locator('.result-item .status-badge.unknown')).toHaveCount(6);
  await expect(page.getByRole('button', { name: '生成互动课堂', exact: true })).toBeDisabled();
  await page.locator('.lesson-toggle').first().click();
  await expect(page.locator('.micro-lesson')).toBeVisible();
  await page.locator('.mini-choices label').first().click();
  await page.locator('.followup-practice .secondary-button').click();
  await expect(page.locator('.practice-feedback')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载课堂学习提纲', exact: true }).click();
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
  await expect(
    page.getByRole('textbox', { name: 'OpenMAIC classroom URL', exact: true }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
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

test('classroom handoff navigation and original-attempt return (mocked classroom runtime)', async ({
  page,
}) => {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      json: {
        ...config,
        generationAvailable: true,
        openmaicAvailable: true,
        openmaicStatus: { installed: true, ready: false, state: 'stopped', version: 'ui-test' },
      },
    });
  });
  let attemptId;
  await page.route('**/api/attempts/*/classroom-handoff', async (route) => {
    expect(route.request().method()).toBe('POST');
    attemptId = new URL(route.request().url()).pathname.split('/')[3];
    await route.fulfill({ json: { id: 'ui-mock', url: '/studyloop-launch?handoff=ui-mock' } });
  });
  await page.route('**/studyloop-launch?handoff=ui-mock', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Mocked classroom destination</title><h1>Mocked classroom destination</h1>',
    }),
  );
  await page.goto('/');
  await page.locator('.course-start').first().click();
  for (let index = 0; index < 6; index++) {
    await page.locator('.unknown-option').click();
    await page.locator('.question-actions .primary-button').click();
  }
  await page.getByRole('button', { name: '生成互动课堂', exact: true }).click();
  await expect(page).toHaveURL(/\/studyloop-launch\?handoff=ui-mock$/);
  await expect(page.getByRole('heading', { name: 'Mocked classroom destination' })).toBeVisible();
  expect(attemptId).toBeTruthy();
  await page.goto(`/?attempt=${encodeURIComponent(attemptId)}`);
  await expect(page.locator('.result-item')).toHaveCount(6);
  await expect(page.locator('.result-item .status-badge.unknown')).toHaveCount(6);
  await expectNoHorizontalOverflow(page);
});

test('course input tabs follow keyboard focus and new course focuses the topic', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('tab', { name: '搜索主题', exact: true });
  const text = page.getByRole('tab', { name: '粘贴资料', exact: true });
  const upload = page.getByRole('tab', { name: '上传文件', exact: true });
  const panel = page.getByRole('tabpanel');

  await search.focus();
  await search.press('ArrowRight');
  await expect(text).toBeFocused();
  await expect(text).toHaveAttribute('aria-selected', 'true');
  await expect(text).toHaveAttribute('tabindex', '0');
  await expect(search).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-text');
  await expect(panel.locator('#course-material')).toBeVisible();

  await text.press('End');
  await expect(upload).toBeFocused();
  await expect(upload).toHaveAttribute('aria-selected', 'true');
  await expect(upload).toHaveAttribute('tabindex', '0');
  await expect(text).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-upload');
  await expect(panel.locator('.upload-trigger')).toBeVisible();
  await expect(panel.locator('#course-material')).toHaveCount(0);

  await upload.press('Home');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-search');
  await expect(panel.locator('#course-file')).toHaveCount(0);

  await search.press('ArrowLeft');
  await expect(upload).toBeFocused();
  await expect(panel.locator('.upload-trigger')).toBeVisible();
  await upload.press('ArrowRight');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('tabindex', '0');
  await expect(upload).toHaveAttribute('tabindex', '-1');

  const settings = page.getByRole('button', { name: '模型与设置', exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '新建课程', exact: true }).click();
  await expect(page.locator('#course-topic')).toBeFocused();
  await expect(page.locator('.nav-item').first()).toHaveAttribute('aria-current', 'page');
  await expect(settings).not.toHaveAttribute('aria-current', 'page');
});
