import { test, expect } from '@playwright/test';

const SOURCE_TITLE = '人教版数学 · 六年级上册 · 第一单元，第 2–5 页';
const SOURCE_URL = 'https://basic.smartedu.cn/tchMaterial?chapter=public-fixture';
const MATERIAL =
  '分数表示一个整体平均分成若干份后所取的份数。分子和分母同时乘以相同的非零数，分数的大小不变。'.repeat(
    12,
  );

// Course planning is a local route fixture. No model request, actual textbook
// download, platform login or server-side material storage is involved.
async function mockPlanning(page) {
  const calls = [];
  await page.route('**/api/plans', async (route) => {
    const request = route.request();
    const body = await new Response(request.postDataBuffer(), {
      headers: { 'content-type': request.headers()['content-type'] },
    }).formData();
    const values = Object.fromEntries(body);
    calls.push(values);
    await route.fulfill({
      json: {
        plan: {
          id: 'fixture-textbook-plan',
          title: values.topic,
          description: 'Textbook metadata fixture',
          objectives: ['解释等值分数'],
          sources: [
            {
              id: 'fixture-source',
              title: values.sourceTitle || 'Fixture source',
              url: values.sourceUrl,
              kind: values.mode === 'search' ? 'web' : 'upload',
              text: values.text || (values.file ? await values.file.text() : MATERIAL),
            },
          ],
        },
      },
    });
  });
  return calls;
}

async function noHorizontalOverflow(page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}

test('official textbook entry imports chapters with source metadata and keeps search drafts separate', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === 'mobile' ? 320 : 607,
    height: 808,
  });
  const calls = await mockPlanning(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: '从国内教材开始' });
  await expect(card).toBeVisible();
  const catalog = card.getByRole('link', { name: '打开官方教材目录' });
  await expect(catalog).toHaveAttribute('href', 'https://basic.smartedu.cn/tchMaterial');
  await expect(catalog).toHaveAttribute('target', '_blank');
  await expect(catalog).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(card).toContainText('在官方页面登录阅读');
  await expect(page.locator('#material-source-title')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await card.getByRole('button', { name: '导入教材章节', exact: true }).click();
  await expect(page.getByRole('tab', { name: '上传文件' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.source-metadata')).toHaveAttribute('open', '');
  await page.locator('#course-topic').fill('等值分数');
  await page.getByLabel('教材 / 资料名称', { exact: true }).fill(SOURCE_TITLE);
  await page.getByLabel('原文地址', { exact: true }).fill(SOURCE_URL);
  await page.locator('#course-file').setInputFiles({
    name: 'public-test-chapter.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(MATERIAL),
  });
  await expect(page.locator('#material-source-title')).toHaveAttribute('maxlength', '200');
  await expect(page.locator('#material-source-url')).toHaveAttribute('type', 'url');
  await expect(page.locator('#material-source-url')).toHaveAttribute('maxlength', '2000');
  await noHorizontalOverflow(page);
  await page
    .locator('.course-composer')
    .screenshot({ path: testInfo.outputPath('chapter-source-form.png'), animations: 'disabled' });
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.outline-sources')).toContainText(SOURCE_TITLE);
  expect(calls[0].mode).toBe('upload');
  expect(calls[0].sourceTitle).toBe(SOURCE_TITLE);
  expect(calls[0].sourceUrl).toBe(SOURCE_URL);
  expect(await calls[0].file.text()).toBe(MATERIAL);
  await page.locator('.outline-sources button').click();
  await expect(page.getByRole('dialog')).toContainText(SOURCE_TITLE);
  await expect(page.getByRole('dialog').locator('.source-url')).toHaveAttribute('href', SOURCE_URL);
  await noHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await page.getByRole('tab', { name: '粘贴资料' }).click();
  await expect(page.locator('#material-source-title')).toHaveValue(SOURCE_TITLE);
  await page.locator('#course-material').fill(MATERIAL);
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.outline-sources')).toContainText(SOURCE_TITLE);
  expect(calls[1].mode).toBe('text');
  expect(calls[1].text).toBe(MATERIAL);
  expect(calls[1].sourceTitle).toBe(SOURCE_TITLE);
  expect(calls[1].sourceUrl).toBe(SOURCE_URL);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await page.getByRole('tab', { name: '搜索主题' }).click();
  await expect(page.locator('#material-source-title')).toHaveCount(0);
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.outline-sources')).toContainText('Fixture source');
  expect(calls[2].mode).toBe('search');
  expect(calls[2]).not.toHaveProperty('sourceTitle');
  expect(calls[2]).not.toHaveProperty('sourceUrl');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await page.getByRole('tab', { name: '粘贴资料' }).click();
  await expect(page.locator('#course-material')).toHaveValue(MATERIAL);
  await expect(page.locator('#material-source-title')).toHaveValue(SOURCE_TITLE);
  await expect(page.locator('#material-source-url')).toHaveValue(SOURCE_URL);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(
    page.getByRole('region', { name: 'Start with a Chinese school textbook' }),
  ).toBeVisible();
  await expect(page.getByLabel('Textbook / source title', { exact: true })).toHaveValue(
    SOURCE_TITLE,
  );
  await noHorizontalOverflow(page);
});
