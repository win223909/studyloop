import { test, expect } from '@playwright/test';

const TOPIC = '混合运算与数量关系';
const MATERIAL =
  '乘除和加减的混合运算应先考虑括号，再按照运算顺序计算。数量关系帮助我们分析总量、每份数量与份数之间的联系。'.repeat(
    10,
  );
const evidence = {
  topic: TOPIC,
  rounds: 2,
  queries: [TOPIC, '混合运算', '数量关系'],
  suggestedTopics: ['混合运算', '数量关系', '<b>not a topic</b>'],
};
const noOverflow = async (page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

test('search feedback uses real evidence and recovery keeps the learner’s drafts', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === 'mobile' ? 320 : 607,
    height: 808,
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/api/plans', async (route) => {
    requests += 1;
    if (requests === 1) await gate;
    await route.fulfill({
      status: 422,
      json: {
        code: 'sources_insufficient',
        error: 'raw upstream HTML must not appear',
        sourceSearch: evidence,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '导入教材章节', exact: true }).click();
  await page.locator('#course-file').setInputFiles({
    name: 'saved-chapter.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(MATERIAL),
  });
  await page.getByLabel('教材 / 资料名称', { exact: true }).fill('已有教材来源');
  await page.getByRole('tab', { name: '粘贴资料', exact: true }).click();
  await page.locator('#course-material').fill(MATERIAL);
  await page.getByRole('tab', { name: '搜索主题', exact: true }).click();
  await page.locator('#course-topic').fill(TOPIC);
  await page.locator('.composer-footer .primary-button').click();
  const progress = page.locator('.source-search-progress');
  await expect(progress).toContainText('覆盖不足时会自动补查');
  await expect(progress).toContainText(TOPIC);
  await expect(progress).not.toContainText('第 2 轮');
  await expect(page.locator('#course-topic')).toBeDisabled();
  await expect(page.getByLabel('学习水平', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('课程语言', { exact: true })).toBeDisabled();
  for (const name of ['搜索主题', '粘贴资料', '上传文件'])
    await expect(page.getByRole('tab', { name, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入教材章节', exact: true })).toBeDisabled();
  await page.locator('.course-composer').dispatchEvent('submit');
  expect(requests).toBe(1);
  await noOverflow(page);
  release();
  const error = page.locator('.error-message');
  await expect(progress).toHaveCount(0);
  await expect(error.locator('.source-recovery-topic')).toContainText(TOPIC);
  await expect(error.locator('.source-search-rounds')).toHaveText('已完成搜索轮数：2');
  await expect(error).not.toContainText('raw upstream');
  await expect(error.locator('.source-suggestions button')).toHaveCount(2);
  await error.locator('summary').click();
  await expect(error.locator('.source-search-queries li')).toHaveText(evidence.queries);
  await expect(error).not.toContainText('not a topic');
  await noOverflow(page);
  await error.screenshot({
    path: testInfo.outputPath('source-recovery.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(error.locator('.source-search-rounds')).toHaveText('Completed search rounds：2');
  await expect(error).toContainText('Selecting a suggestion only fills the topic');
  await page.getByRole('button', { name: '切换到中文' }).click();
  await error.getByRole('button', { name: '上传这一章', exact: true }).click();
  await expect(page.getByRole('tab', { name: '上传文件' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.upload-trigger')).toContainText('saved-chapter.txt');
  await expect(page.locator('#course-topic')).toHaveValue(TOPIC);
  await expect(page.locator('#material-source-title')).toHaveValue('已有教材来源');
  expect(requests).toBe(1);
  await page.getByRole('tab', { name: '搜索主题' }).click();
  await page.locator('.composer-footer .primary-button').click();
  await error.getByRole('button', { name: '粘贴课程资料', exact: true }).click();
  await expect(page.locator('#course-material')).toHaveValue(MATERIAL);
  await expect(page.locator('#course-material')).toBeFocused();
  await page.getByRole('tab', { name: '搜索主题' }).click();
  await page.locator('.composer-footer .primary-button').click();
  await error
    .locator('.source-suggestions')
    .getByRole('button', { name: '混合运算', exact: true })
    .click();
  await expect(page.locator('#course-topic')).toHaveValue('混合运算');
  await expect(page.locator('#course-topic')).toBeFocused();
  expect(requests).toBe(3);
  await expect(page.locator('.source-search-progress')).toHaveCount(0);
  await noOverflow(page);
});

test('missing or mismatched search metadata does not invent evidence or alter uploaded-source errors', async ({
  page,
}) => {
  let sourceSearch = { ...evidence, topic: '另一个主题' };
  await page.route('**/api/plans', (route) =>
    route.fulfill({
      status: 422,
      json: { code: 'sources_missing', error: 'raw upstream', sourceSearch },
    }),
  );
  await page.goto('/');
  await page.locator('#course-topic').fill(TOPIC);
  await page.locator('.composer-footer .primary-button').click();
  const error = page.locator('.error-message');
  await expect(error.locator('.source-recovery-topic')).toContainText(TOPIC);
  await expect(error).not.toContainText('另一个主题');
  await expect(error.locator('.source-search-rounds')).toHaveCount(0);
  await expect(error.locator('.source-suggestions')).toHaveCount(0);
  await expect(error.getByRole('button', { name: '上传这一章', exact: true })).toBeVisible();
  sourceSearch = { ...evidence, rounds: 99 };
  await page.locator('.composer-footer .primary-button').click();
  await expect(error.locator('.source-search-rounds')).toHaveCount(0);
  await error.getByRole('button', { name: '粘贴课程资料', exact: true }).click();
  await page.locator('#course-material').fill(MATERIAL);
  sourceSearch = { ...evidence, suggestedTopics: ['混合运算'] };
  await page.locator('.composer-footer .primary-button').click();
  await expect(error).toBeVisible();
  await expect(error.locator('.source-recovery')).toHaveCount(0);
  await expect(page.locator('#course-material')).toHaveValue(MATERIAL);
});
