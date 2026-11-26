/**
 * Shared contract matrix (section 2 of the QA policy), parameterised over every public tool.
 * Each test carries [slug:case] tags read by the tool gate; each route uses its own fixtures and assertions (drivers.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { formatBytes } from '../../packages/core/src/index.ts';
import { getTool, TOOLS } from '../../apps/web/src/content/tools.ts';
import { DRIVERS, type Driver, type Output } from './drivers';
import { alerts, blobBytes, downloadVia, instrument, marks, onJobSent, pane, privacyWatch, swapFiles } from './gate-helpers';

test.beforeEach(async ({ page }) => instrument(page));

const pick = (page: Page, d: Driver, files: Parameters<Page['setInputFiles']>[1]) => page.getByLabel(d.input).first().setInputFiles(files);

async function runToResult(page: Page, d: Driver) {
  await d.prepare?.(page);
  await d.run(page);
  await d.done(page);
}
async function download(page: Page): Promise<Output> {
  await pane(page, /Settings|Result/);
  return downloadVia(page, page.getByTestId('download'));
}
async function expectRefused(page: Page, d: Driver, message: RegExp) {
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: message })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('download')).toHaveCount(0);
  if (d.action && d.slug !== 'images-to-pdf') await expect(page.getByRole('button', { name: d.action, exact: true })).toBeDisabled();
}

test('every catalogued tool has a driver in the shared matrix', () => {
  expect(DRIVERS.map((d) => d.slug).sort()).toEqual(TOOLS.map((t) => t.slug).sort());
});

for (const d of DRIVERS) {
  const t = (c: string | string[]) => [c].flat().map((x) => `[${d.slug}:${x}]`).join(' ');

  test.describe(d.slug, () => {
    test(`${t(['flow', 'consistency', 'privacy'])} catalogue → pick → run → download; preview == download; no data leaves the page`, async ({ page }, info) => {
      const net = privacyWatch(page, d.secrets);
      await page.goto('/');
      const tool = getTool(d.slug);
      await page.locator(`#tool-library a[href="${d.path}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${d.path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(tool.h1);
      if (!(await d.capable(page, info))) return net.assertClean();
      await pick(page, d, d.a);
      await runToResult(page, d);
      const out = await download(page);
      // Flow: the saved file is the converted A, with the expected name.
      expect(out.name).toBe(d.outName.normalize('NFC'));
      expect(await d.identify(page, out)).toBe('A');
      // Consistency: preview bytes, MIME of the shared Blob, the byte count shown.
      const href = (await page.getByTestId('download').getAttribute('href'))!;
      const blob = await blobBytes(page, href);
      expect(blob.type).toBe(d.outMime);
      expect(blob.bytes.equals(out.bytes)).toBe(true);
      await pane(page, /Settings|Result/);
      if (d.slug === 'images-to-pdf') await expect(page.getByTestId('pdf-meta')).toContainText(formatBytes(out.bytes.length));
      else await expect(page.getByText(`${out.bytes.length.toLocaleString('en-US')} bytes`, { exact: true }).first()).toBeVisible();
      await d.assertPreview(page, out);
      // Privacy also covers the error path.
      await pick(page, d, d.empty.file);
      await expectRefused(page, d, d.empty.message);
      await net.assertClean();
    });

    test(`${t('empty')} 0-byte file is refused`, async ({ page }) => {
      await page.goto(d.path);
      await pick(page, d, d.empty.file);
      await expectRefused(page, d, d.empty.message);
    });

    test(`${t('mismatch')} content that is not the route's input is refused`, async ({ page }) => {
      await page.goto(d.path);
      await pick(page, d, d.mismatch.file);
      await expectRefused(page, d, d.mismatch.message);
    });

    test(`${t('corrupt')} truncated file is refused`, async ({ page }) => {
      await page.goto(d.path);
      await pick(page, d, d.corrupt.file);
      await expectRefused(page, d, d.corrupt.message);
    });

    // Separate from "corrupt": only the retry needs output, so only it may be a verified UNSUPPORTED.
    test(`${t('retry')} after an error, a valid file works without reloading`, async ({ page }, info) => {
      await page.goto(d.path);
      await pick(page, d, d.corrupt.file);
      await expectRefused(page, d, d.corrupt.message);
      if (!(await d.capable(page, info))) return;
      await pane(page, 'Preview');
      await pick(page, d, d.a);
      await runToResult(page, d);
      expect(await d.identify(page, await download(page))).toBe('A');
    });

    test(`${t('misnamed')} valid content under a wrong name/MIME follows the content`, async ({ page }, info) => {
      await page.goto(d.path);
      if (!(await d.capable(page, info))) return;
      await pick(page, d, d.misnamed.file);
      await runToResult(page, d);
      const out = await download(page);
      expect(out.name).toBe(d.misnamed.outName);
    });

    test(`${t('stale-file')} switching A→B while A runs: A's late result never shows`, async ({ page }, info) => {
      await page.goto(d.path);
      if (!(await d.capable(page, info))) return;
      // The page swaps in B synchronously when A's job is handed to the worker
      // (tools without an action button start the job on pick, so the hook goes in first).
      if (!d.action) await onJobSent(page, swapFiles(d.inputSelector, [d.b]));
      await pick(page, d, d.a);
      await d.prepare?.(page);
      if (d.action) await onJobSent(page, swapFiles(d.inputSelector, [d.b]));
      await d.run(page);
      await expect.poll(() => marks(page, 'lovert:job-discarded'), { timeout: 15_000 }).toBeGreaterThan(0);
      if (d.action) {
        await pane(page, /Settings|Result/);
        await expect(page.getByTestId('download')).toHaveCount(0);
        await d.prepare?.(page);
        await d.run(page);
      }
      await d.done(page);
      expect(await d.identify(page, await download(page))).toBe(d.afterSwap);
    });

    test(`${t('stale-read')} switching A→B while A is still being read: B wins`, async ({ page }, info) => {
      await page.goto(d.path);
      if (!(await d.capable(page, info))) return;
      await page.evaluate((n) => (window as unknown as { __lovertHold(n: number): void }).__lovertHold(n), d.readSize(d.a));
      await pick(page, d, d.a);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __lovertHeld(): number }).__lovertHeld())).toBeGreaterThan(0);
      await pane(page, 'Preview');
      await pick(page, d, d.b);
      await page.evaluate(() => (window as unknown as { __lovertRelease(): void }).__lovertRelease());
      if (d.slug === 'images-to-pdf') await expect(page.getByRole('list', { name: 'Pages in order' }).getByRole('listitem')).toHaveCount(2);
      await runToResult(page, d);
      expect(await d.identify(page, await download(page))).toBe(d.afterSwap);
    });

    if (d.changeSetting) {
      test(`${t('stale-setting')} changing a setting clears the result; a change during a job drops its result`, async ({ page }, info) => {
        await page.goto(d.path);
        if (!(await d.capable(page, info))) return;
        await pick(page, d, d.a);
        await runToResult(page, d);
        await pane(page, /Settings|Result/);
        await expect(page.getByTestId('download')).toHaveCount(1);
        const oldHref = (await page.getByTestId('download').getAttribute('href'))!;
        await d.changeSetting!(page);
        if (d.action) await expect(page.getByTestId('download'), 'the old result disappears at once').toHaveCount(0);
        else {
          // Converts again on change (fast): the old result must be gone, i.e. its Blob URL revoked and replaced.
          await expect.poll(async () => page.getByTestId('download').getAttribute('href').catch(() => null)).not.toBe(oldHref);
          const revoked = await page.evaluate((u) => fetch(u).then(() => false, () => true), oldHref);
          expect(revoked, 'old result URL revoked').toBe(true);
        }
        // During a job: the setting changes again the moment the job is sent; that job's result must not appear.
        const before = await marks(page, 'lovert:job-discarded');
        await onJobSent(page, d.changeSettingAction!);
        if (d.action) await d.run(page);
        else await d.changeSetting!(page); // converts on change: this starts the job the hook interrupts
        await expect.poll(() => marks(page, 'lovert:job-discarded'), { timeout: 15_000 }).toBeGreaterThan(before);
        if (d.action) {
          await expect(page.getByTestId('download')).toHaveCount(0);
          await d.run(page);
        }
        await d.done(page);
        await expect(page.getByTestId('download')).toHaveCount(1);
      });
    }

    test(`${t('route-change')} leaving mid-job and coming back leaves no stale result`, async ({ page }, info) => {
      await page.goto(d.path);
      if (!(await d.capable(page, info))) return;
      const leave = { type: 'click', selector: 'header a[href="/"]' } as const;
      if (!d.action) await onJobSent(page, leave);
      await pick(page, d, d.a);
      await d.prepare?.(page);
      if (d.action) await onJobSent(page, leave);
      await d.run(page);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('navigation', { name: 'File tools' })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${d.path}$`));
      await expect(page.getByTestId('download')).toHaveCount(0);
      await pick(page, d, d.b);
      await runToResult(page, d);
      expect(await d.identify(page, await download(page))).toBe('B');
    });

    test(`${t('a11y')} header, visible CTA, keyboard operation, announced status and errors`, async ({ page }, info) => {
      await page.goto(d.path);
      await expect(page.getByRole('navigation', { name: 'File tools' })).toBeVisible();
      const input = page.getByLabel(d.input).first();
      await input.focus();
      await expect(input).toBeFocused();
      await expect(page.locator('label').filter({ hasText: d.input }).first()).toBeInViewport();
      // Error is announced.
      await pick(page, d, d.empty.file);
      await expectRefused(page, d, d.empty.message);
      // Keyboard: start the job with Enter on the focused action.
      if (!(await d.capable(page, info))) return;
      await pane(page, 'Preview');
      await pick(page, d, d.b);
      await d.prepare?.(page);
      if (d.action) {
        await pane(page, /Settings|Result/);
        const btn = page.getByRole('button', { name: d.action, exact: true });
        await btn.focus();
        await page.keyboard.press('Enter');
      }
      await d.done(page);
      await expect(page.getByRole('status').first()).not.toBeEmpty();
      const link = page.getByTestId('download');
      await expect(link).toBeInViewport();
      await link.focus();
      const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
      expect(dl.suggestedFilename().length).toBeGreaterThan(0);
    });

    test(`${t('static')} direct open on the export: catalogue metadata, noindex preview build, worker loads`, async ({ page }, info) => {
      const tool = getTool(d.slug);
      const worker = page.waitForEvent('worker', { timeout: 60_000 });
      const res = await page.goto(d.path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(`${tool.title} | Lovert`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', tool.description);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(tool.h1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      if (!(await d.capable(page, info))) return;
      await pick(page, d, d.b);
      await runToResult(page, d);
      expect((await worker).url()).toMatch(/\/_next\/static\/chunks\/[^/]+\.js$/);
    });
  });
}
