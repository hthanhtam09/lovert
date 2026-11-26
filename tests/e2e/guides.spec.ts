import { expect, test } from '@playwright/test';

const GUIDES = [
  ['/blog/compress-image-under-500-kb', '/compress-image'],
  ['/blog/combine-photos-into-pdf-under-1-mb', '/images-to-pdf'],
  ['/blog/resize-vs-compress-image', '/compress-image'],
] as const;

test('home shows three guides and a link to all guides', async ({ page }) => {
  await page.goto('/');
  const block = page.locator('section[aria-labelledby="home-guides"]');
  for (const [path] of GUIDES) await expect(block.locator(`a[href="${path}"]`).first()).toBeVisible();
  await expect(block.getByRole('link', { name: 'View all guides' })).toHaveAttribute('href', '/blog');
});

test('header Guides link opens /blog', async ({ page }) => {
  // On mobile the header nav scrolls horizontally; the link must still be reachable.
  await page.goto('/compress-image');
  await page.getByRole('navigation').getByRole('link', { name: 'Guides' }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guides for everyday file tasks');
});

for (const [path, tool] of GUIDES) {
  test(`article ${path} has answer, CTA to ${tool}, no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId('guide-answer')).toBeVisible();
    const toc = page.getByRole('navigation', { name: 'On this page' });
    const hrefs = await toc.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const h of hrefs) await expect(page.locator(h)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'View all guides' })).toHaveAttribute('href', '/blog');
    await expect(page.getByTestId('guide-cta')).toHaveAttribute('href', tool);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('guide-cta').click();
    await expect(page).toHaveURL(new RegExp(`${tool}$`));
  });
}

test('tool pages link to related guides and privacy', async ({ page }) => {
  await page.goto('/images-to-pdf');
  await expect(page.locator('a[href="/blog/combine-photos-into-pdf-under-1-mb"]').first()).toBeVisible();
  await page.goto('/compress-image');
  await expect(page.locator('a[href="/blog/compress-image-under-500-kb"]').first()).toBeVisible();
  await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
});

test('help anchors and privacy analytics status', async ({ page }) => {
  await page.goto('/help');
  for (const id of ['webp-unavailable', 'image-too-large', 'output-too-large']) await expect(page.locator(`#${id}`)).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByText('Analytics are turned off on this site')).toBeVisible();
});

test('blog filters guides by category, topic and search', async ({ page }) => {
  await page.goto('/blog');
  const list = page.locator('#all-guides');
  await expect(list.getByTestId('guide-card')).toHaveCount(3);
  await list.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(list.getByTestId('guide-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Image dimensions' }).click();
  await expect(list.getByTestId('guide-card')).toHaveCount(1);
  await expect(list.locator('a[href="/blog/resize-vs-compress-image"]')).toBeVisible();
  await page.getByRole('button', { name: 'Image dimensions' }).click();
  await page.getByLabel('Search guides').fill('zzzz');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list.getByTestId('guide-card')).toHaveCount(3);
});
