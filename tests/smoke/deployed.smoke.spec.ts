/**
 * Smoke test of a deployed build: one real download per public tool (bytes checked per type), worker and PDF preview load,
 * 404 status, robots/canonical/sitemap per deployment kind. Reuses the E2E drivers, so fixtures and checks match the gate.
 * SMOKE_KIND=preview (default): noindex, no canonical. SMOKE_KIND=production: index, canonical/sitemap on EXPECT_ORIGIN.
 */
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { DRIVERS } from '../e2e/drivers';
import { downloadVia, expectDownloadName, pane } from '../e2e/gate-helpers';

const KIND = process.env.SMOKE_KIND ?? 'preview';
const ORIGIN = process.env.EXPECT_ORIGIN;

for (const d of DRIVERS) {
  test(`${d.slug}: real download, bytes checked`, async ({ page }, info) => {
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    const res = await page.goto(d.path);
    expect(res?.status()).toBe(200);
    if (!(await d.capable(page, info))) return; // verified UNSUPPORTED (e.g. no WebP encoder) is recorded as an annotation
    await page.getByLabel(d.input).first().setInputFiles(d.a);
    await d.prepare?.(page);
    await d.run(page);
    await d.done(page);
    await pane(page, /Settings|Result/);
    const out = await downloadVia(page, page.getByTestId('download'));
    expectDownloadName(out, d.outName, info);
    expect(await d.identify(page, out), 'downloaded file is the converted input').toBe('A');
    if (d.outMime === 'application/pdf') expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(1);
    if (d.outMime === 'application/json') expect(Array.isArray(JSON.parse(out.bytes.toString('utf8')))).toBe(true);
    await d.assertPreview(page, out);
    expect(workers.some((u) => /\/_next\/static\/chunks\/[^/]+\.js$/.test(u)), `worker loaded: ${workers.join(', ')}`).toBe(true);
  });
}

test('images-to-pdf: multi-page PDF preview renders from the downloaded bytes', async ({ page }) => {
  const pdfWorker = page.waitForResponse((r) => r.url().endsWith('/vendor/pdf.worker.min.mjs'));
  await page.goto('/images-to-pdf');
  const d = DRIVERS.find((x) => x.slug === 'images-to-pdf')!;
  await page.getByLabel('Add images').setInputFiles([d.a, d.b, { ...d.a, name: 'third.png' }]);
  await d.run(page);
  await d.done(page);
  await pane(page, /Settings|Result/);
  const out = await downloadVia(page, page.getByTestId('download'));
  expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(3);
  await d.assertPreview(page, out);
  expect((await pdfWorker).status()).toBe(200);
});

test('unknown path returns 404', async ({ page }) => {
  const res = await page.goto('/does-not-exist-smoke');
  expect(res?.status()).toBe(404);
});

test(`robots, canonical and sitemap match a ${KIND} deployment`, async ({ page, request }) => {
  await page.goto('/png-to-jpg');
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  const canonical = page.locator('link[rel="canonical"]');
  const sitemap = await request.get('/sitemap.xml');
  if (KIND === 'production') {
    expect(ORIGIN, 'EXPECT_ORIGIN is required for a production smoke').toBeTruthy();
    expect(robots).not.toMatch(/noindex/);
    await expect(canonical).toHaveAttribute('href', `${ORIGIN}/png-to-jpg`);
    const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThanOrEqual(18);
    expect(locs.every((l) => l.startsWith(`${ORIGIN}/`) || l === ORIGIN)).toBe(true);
  } else {
    expect(robots).toMatch(/noindex/);
    await expect(canonical).toHaveCount(0);
    expect([...(await sitemap.text()).matchAll(/<loc>/g)]).toHaveLength(0);
  }
});
