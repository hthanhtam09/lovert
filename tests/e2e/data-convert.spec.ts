import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { showPane, watchNetwork } from './helpers';
import { diagnostics } from './gate-helpers';

const file = (name: string, text: string | Buffer, mimeType = 'text/csv') => ({ name, mimeType, buffer: typeof text === 'string' ? Buffer.from(text, 'utf8') : text });

test.describe('/csv-to-json', () => {
  test('[csv-to-json:full-compare] UTF-8 BOM, Vietnamese text, quoted commas/newlines, leading zeros; download matches preview; nothing sent', async ({ page }, info) => {
    const diag = diagnostics(page);
    try {
      const offenders = watchNetwork(page);
      diag.note('goto');
      await page.goto('/csv-to-json');
      const csv = '\uFEFFmã,họ tên,ghi chú\r\n007,"Nguyễn, Văn A","dòng 1\ndòng ""2"""\r\n010,Trần Thị Bích,Huế\r\n';
      diag.note('setInputFiles');
      await page.getByLabel('Choose a CSV file').setInputFiles(file('khách hàng.csv', csv));
      diag.note('pane');
      await showPane(page, /Settings|Result/);
      diag.note('wait status');
      await expect(page.getByRole('status')).toContainText('2 rows converted and checked', { timeout: 30_000 });
      diag.note('status ok');
      await expect(page.getByText('Output is valid JSON (parsed back from the file bytes)')).toBeVisible();
      const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
      diag.note('downloaded');
      expect(download.suggestedFilename().normalize('NFC')).toBe('khách hàng.json'.normalize('NFC'));
      const text = readFileSync((await download.path())!, 'utf8');
      expect(JSON.parse(text)).toEqual([
        { 'mã': '007', 'họ tên': 'Nguyễn, Văn A', 'ghi chú': 'dòng 1\ndòng "2"' },
        { 'mã': '010', 'họ tên': 'Trần Thị Bích', 'ghi chú': 'Huế' },
      ]);
      await showPane(page, 'Preview');
      expect(await page.getByTestId('preview-text').textContent()).toBe(text);
      await expect(page.getByTestId('preview-table')).toContainText('Nguyễn, Văn A');
      expect(offenders).toEqual([]);
    } finally {
      await diag.attach(info);
    }
  });

  test('[csv-to-json:errors-ui] reports duplicate headers and rows with the wrong number of values', async ({ page }) => {
    await page.goto('/csv-to-json');
    await page.getByLabel('Choose a CSV file').setInputFiles(file('dup.csv', 'id,name,id\n1,a,2\n'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'Header "id" appears in columns 1 and 3' })).toBeVisible();
    await showPane(page, 'Preview');
    await page.getByLabel(/Choose a CSV file/).setInputFiles(file('bad.csv', 'a,b\n1,2\n3,4,5\n'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'Line 3 has 3' })).toBeVisible();
    await expect(page.getByTestId('download')).toHaveCount(0);
  });

  test('[csv-to-json:preview-truncated] large file: preview is cut to 50 rows, download has every row', async ({ page }) => {
    await page.goto('/csv-to-json');
    const rows = Array.from({ length: 3000 }, (_, i) => `${String(i).padStart(5, '0')},Tên ${i}`).join('\n');
    await page.getByLabel('Choose a CSV file').setInputFiles(file('big.csv', `id,name\n${rows}\n`));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('status')).toContainText('3,000 rows', { timeout: 30_000 });
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(data).toHaveLength(3000);
    expect(data[2999]).toEqual({ id: '02999', name: 'Tên 2999' });
    await showPane(page, 'Preview');
    await expect(page.getByTestId('preview-table').locator('tbody tr')).toHaveCount(50);
    await expect(page.getByText('Showing the first 50 of 3,000 rows')).toBeVisible();
  });
});

test.describe('/json-to-csv', () => {
  const json = JSON.stringify([
    { name: 'Lê Văn Ánh', note: 'nói "xin chào", rồi đi', tags: ['a', 'b'] },
    { name: null, city: 'Đà Nẵng', formula: '=1+1' },
  ]);

  test('[json-to-csv:exact-expected] columns by first appearance, escaping, BOM by default, notes for null/nested/formulas; nothing sent', async ({ page }) => {
    const offenders = watchNetwork(page);
    await page.goto('/json-to-csv');
    await page.getByLabel('Choose a JSON file').setInputFiles(file('data.json', json, 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('status')).toContainText('2 rows converted and checked', { timeout: 30_000 });
    await expect(page.getByText('1 null value written as empty cells')).toBeVisible();
    await expect(page.getByText(/nested object or array written as JSON text/)).toBeVisible();
    await expect(page.getByText(/1 text cell starts with = \+ - or @/)).toBeVisible();
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    expect(download.suggestedFilename()).toBe('data.csv');
    const bytes = readFileSync((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8')).toBe(
      'name,note,tags,city,formula\r\nLê Văn Ánh,"nói ""xin chào"", rồi đi","[""a"",""b""]",,\r\n,,,Đà Nẵng,=1+1\r\n',
    );
    expect(offenders).toEqual([]);
  });

  test('[json-to-csv:formula-modes] raw mode keeps formula-like text exactly; protection adds an apostrophe to text only', async ({ page }) => {
    const src = JSON.stringify([{ f: '=SUM(1,2)', at: '@cmd', n: -5, s: '-5', plain: 'Huế' }]);
    await page.goto('/json-to-csv');
    await page.getByLabel('Choose a JSON file').setInputFiles(file('f.json', src, 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('status')).toContainText('checked', { timeout: 30_000 });
    await page.getByLabel(/Add a UTF-8 BOM/).uncheck();
    await expect(page.getByText('UTF-8 without BOM')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/3 text cells start with = \+ - or @/)).toBeVisible();
    const raw = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    expect(readFileSync((await raw.path())!, 'utf8')).toBe('f,at,n,s,plain\r\n"=SUM(1,2)",@cmd,-5,-5,Huế\r\n');
    const oldHref = await page.getByTestId('download').getAttribute('href');
    await page.getByLabel(/Protect against spreadsheet formulas/).check();
    await expect.poll(() => page.getByTestId('download').getAttribute('href').catch(() => null)).not.toBe(oldHref);
    await expect(page.getByText(/3 text cells started with = \+ - or @ and got an apostrophe/)).toBeVisible();
    const safe = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    // The number -5 is unchanged; only text cells get the apostrophe.
    expect(readFileSync((await safe.path())!, 'utf8')).toBe(`f,at,n,s,plain\r\n"'=SUM(1,2)",'@cmd,-5,'-5,Huế\r\n`);
  });

  test('[json-to-csv:preview-truncated] large array: preview cut to 50 rows, download has every row', async ({ page }) => {
    await page.goto('/json-to-csv');
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: String(i).padStart(5, '0'), tên: `Tên ${i}` }));
    await page.getByLabel('Choose a JSON file').setInputFiles(file('big.json', JSON.stringify(rows), 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('status')).toContainText('3,000 rows', { timeout: 30_000 });
    const d = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([x]) => x);
    const lines = readFileSync((await d.path())!, 'utf8').replace(/^\uFEFF/, '').split('\r\n');
    expect(lines).toHaveLength(3002); // header + 3000 rows + final empty string after the last CRLF
    expect(lines[3000]).toBe('02999,Tên 2999');
    await showPane(page, 'Preview');
    await expect(page.getByTestId('preview-table').locator('tbody tr')).toHaveCount(50);
    await expect(page.getByText('Showing the first 50 of 3,000 rows')).toBeVisible();
  });

  test('[json-to-csv:errors-ui] rejects JSON that is not an array of objects', async ({ page }) => {
    await page.goto('/json-to-csv');
    await page.getByLabel('Choose a JSON file').setInputFiles(file('obj.json', '{"a":1}', 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'must be an array of objects' })).toBeVisible();
    await showPane(page, 'Preview');
    await page.getByLabel(/Choose a JSON file/).setInputFiles(file('broken.json', '[{"a":1}', 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'not valid JSON' })).toBeVisible();
    await showPane(page, 'Preview');
    await page.getByLabel(/Choose a JSON file/).setInputFiles(file('items.json', '[{"a":"1"}, 2, null]', 'application/json'));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'Item 2 is a number. Item 3 is null.' })).toBeVisible();
    await expect(page.getByTestId('download')).toHaveCount(0);
  });
});

test('home: All tools search and Data filter list the new converters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  const available = page.getByRole('region', { name: 'Available tools' }).or(page.locator('section[aria-labelledby="available-title"]'));
  await expect(available.getByRole('link', { name: /CSV to JSON/ })).toBeVisible();
  await expect(available.getByRole('link', { name: /JSON to CSV/ })).toBeVisible();
  await page.getByRole('button', { name: 'All tools' }).click();
  await page.getByLabel('Search tools').fill('webp');
  for (const t of ['PNG to WebP', 'JPG to WebP', 'WebP to PNG', 'WebP to JPG']) await expect(available.getByRole('link', { name: new RegExp(t) })).toBeVisible();
  await expect(available.getByRole('link', { name: /PNG to WebP/ })).toHaveAttribute('href', '/png-to-webp');
});

for (const [slug, label, ext] of [['csv-to-json', 'Choose a CSV file', 'csv'], ['json-to-csv', 'Choose a JSON file', 'json']] as const) {
  test(`[${slug}:input-bytes-over] @release a real 20,000,001-byte file is refused`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`/${slug}`);
    await page.getByLabel(label).setInputFiles(file(`big.${ext}`, Buffer.alloc(20_000_001, 0x61)));
    await showPane(page, /Settings|Result/);
    await expect(page.getByRole('alert').filter({ hasText: 'larger than 20 MB' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('download')).toHaveCount(0);
  });
}
