import { expect, test } from '@playwright/test';
import { canvasTexts, getElement, goTo, loadSample, openApp, pasteCsv, selectLayer, setField, storedGet, storedSet, waitForElement } from './helpers';
import type { Dataset, Template } from '../../src/lib/types';

test.describe('Persistence', () => {
  test('template edits and the loaded CSV survive a reload', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 20);
    await waitForElement(page, 'Name', (el) => el.x === 20);
    await page.locator('#content-editor').fill('{{Name}} ★');

    await page.reload();
    await expect(page.getByTestId('tab-design')).toHaveAttribute('aria-selected', 'true'); // opens on Design when data exists
    await expect(page.getByTestId('tab-data')).toContainText('25');
    expect((await getElement(page, 'Name')).x).toBe(20);
    expect(await canvasTexts(page)).toContain('Priya Raman ★');
  });

  test('a fresh visit with no data opens on the Data tab', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('tab-data')).toHaveAttribute('aria-selected', 'true');
    expect(await storedGet(page, 'dataset')).toBeUndefined();
    expect(await page.evaluate(() => window.cardMaker.storage.name())).toBe('indexeddb');
  });

  test('loading a CSV before touching the design rebinds the starter template to its headers', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Full Name,Tent,Team\nAda Lovelace,Tent 1,Red\nBo,Tent 22,Blue\n');
    await goTo(page, 'design');
    expect(await canvasTexts(page)).toEqual(['SUMMER CAMP 2026', 'Ada Lovelace', 'ACCOMMODATION', 'Tent 22', 'Blue']);
    const stored = (await storedGet<Template>(page, 'template'))!;
    expect(stored.sides.front.elements.map((e) => (e as { content?: string }).content)).toContain('{{Full Name}}');
  });

  test('once the design has been edited, loading another CSV keeps the design', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Name,Accommodation,Group\nAda,Cabin 1,Red\n');
    await goTo(page, 'design');
    await selectLayer(page, 'Camp title');
    await page.locator('#content-editor').fill('MY CAMP');
    await goTo(page, 'data');
    await pasteCsv(page, 'Name,Accommodation,Group\nBob,Cabin 2,Blue\n');
    await goTo(page, 'design');
    expect(await canvasTexts(page)).toContain('MY CAMP');
    expect(await canvasTexts(page)).toContain('Bob');
  });

  for (const [what, key, value] of [
    ['a damaged template', 'template', { version: 1, card: 'garbage' }],
    ['a template from another version of the app', 'template', { version: 99, card: { width: 1, height: 1 } }],
    ['an unusable roster', 'dataset', 'not a dataset'],
  ] as const) {
    test(`${what} in storage is cleared and the app starts fresh, with a notice`, async ({ page }) => {
      await loadSample(page);
      await selectLayer(page, 'Name');
      await page.keyboard.press('ArrowRight');
      await page.evaluate(() => window.cardMaker.flushPersist());
      await storedSet(page, key, value);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.reload();
      await expect(page.getByTestId('startup-notice')).toContainText('could not be read, so it was cleared');
      // Everything saved is gone, not just the bad part, so nothing inconsistent is left behind
      expect(await storedGet(page, 'template')).toBeUndefined();
      expect(await storedGet(page, 'dataset')).toBeUndefined();
      await expect(page.getByTestId('tab-data')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: 'Drop Your CSV Here' })).toBeVisible();
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(page.getByTestId('startup-notice')).toHaveCount(0);
      // …and it works normally again: a fresh CSV rebinds the starter design
      await pasteCsv(page, 'Name,Accommodation,Group\nAda,Cabin 1,Red\n');
      await goTo(page, 'design');
      expect(await canvasTexts(page)).toContain('Ada');
      expect(errors).toEqual([]);
    });
  }

  test('no console errors during a full data → design → print round trip', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await loadSample(page);
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await goTo(page, 'print');
    await expect(page.locator('.sheet').first()).toBeVisible();
    await goTo(page, 'data');
    await goTo(page, 'design');
    expect(errors).toEqual([]);
  });
});

test.describe('Persistence – storage backend', () => {
  test('shows a warning when the browser refuses to save', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByTestId('persist-warning')).toHaveCount(0);
    // Simulate a full IndexedDB: every write throws QuotaExceededError.
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('persist-warning')).toContainText('could not be saved: the browser database is full');
    // The app keeps working and the edit is live even though it is not stored
    await waitForElement(page, 'Name', (el) => el.x === 7);
  });

  test('a roster far beyond the 5 MB localStorage limit is saved and reloaded', async ({ page }) => {
    await openApp(page);
    const lines = ['Name,Accommodation,Group,Emergency contact'];
    for (let i = 0; i < 50_000; i++) {
      lines.push(`Person ${String(i).padStart(5, '0')},Cabin ${i % 40},Group ${i % 7},Contact ${i} 555-${String(i % 10_000).padStart(4, '0')}`);
    }
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
    await expect(page.getByText(/big\.csv — 50000 People/)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await storedGet<Dataset>(page, 'dataset'))?.rows.length, { timeout: 20_000 }).toBe(50_000);
    const json = await page.evaluate(() => JSON.stringify(window.cardMaker.getDataset()).length);
    expect(json).toBeGreaterThan(5 * 1024 * 1024);
    await page.reload();
    await expect(page.getByTestId('tab-data')).toContainText('50000', { timeout: 20_000 });
    await expect(page.getByTestId('persist-warning')).toHaveCount(0);
  });
});
