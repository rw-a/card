import { expect, test, type Page } from '@playwright/test';
import { goTo, loadSample, openApp, selectOption, setField, setSides } from './helpers';

/** Horizontal centre of the step tabs minus the centre of the window (px). */
async function tabsOffCentre(page: Page): Promise<number> {
  const box = (await page.getByTestId('steps').boundingBox())!;
  const vw = page.viewportSize()!.width;
  return box.x + box.width / 2 - vw / 2;
}

async function tabPositions(page: Page): Promise<number[]> {
  return page.locator('[data-testid^="tab-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
}

test.describe('Top bar', () => {
  test('the Data / Design / Print tabs stay centred when the card size changes', async ({ page }) => {
    await loadSample(page);
    expect(Math.abs(await tabsOffCentre(page))).toBeLessThanOrEqual(1);
    const start = await tabPositions(page);

    // Card sizes with different digit counts
    for (const [w, h] of [
      [5, 5],
      [100, 140],
      [85.6, 54],
      [123.45, 187.65],
    ]) {
      await setField(page, 'Width', w);
      await setField(page, 'Height', h);
      await expect(page.getByTestId('topbar-info')).toContainText(`${w} × ${h} mm`);
      expect(await tabPositions(page), `size ${w}×${h}`).toEqual(start);
    }
  });

  test('card dimensions stay visible beside the tabs', async ({ page }) => {
    await loadSample(page);
    const tabs = (await page.getByTestId('steps').boundingBox())!;
    const info = (await page.getByTestId('topbar-info').boundingBox())!;
    expect(info.x).toBeGreaterThanOrEqual(tabs.x + tabs.width); // no overlap
    expect(info.x + info.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.getByTestId('topbar-info')).toHaveText('100 × 140 mm');
  });

  test('the tabs are centred on every tab and with or without data', async ({ page }) => {
    await openApp(page);
    expect(Math.abs(await tabsOffCentre(page))).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Load sample data' }).click();
    for (const tab of ['data', 'design', 'print'] as const) {
      await goTo(page, tab);
      expect(Math.abs(await tabsOffCentre(page)), tab).toBeLessThanOrEqual(1);
    }
  });

  test('the tabs stay centred at narrower window widths', async ({ page }) => {
    await loadSample(page);
    for (const width of [1280, 1024, 900]) {
      await page.setViewportSize({ width, height: 800 });
      expect(Math.abs(await tabsOffCentre(page)), `${width}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Design panels', () => {
  test('left and right sections collapse independently and keep their controls', async ({ page }) => {
    await loadSample(page);
    const settings = page.locator('.side.left .section').filter({ has: page.getByRole('heading', { name: 'Card Settings' }) });
    const files = page.locator('.side.right .section').filter({ has: page.getByRole('heading', { name: 'Template Files' }) });
    const settingsToggle = settings.getByRole('button', { name: 'Card Settings' });
    const filesToggle = files.getByRole('button', { name: 'Template Files' });

    await settingsToggle.click();
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(settings.locator('[data-field="Preset"]')).toBeHidden();
    await expect(files.getByRole('button', { name: 'Export JSON' })).toBeVisible();

    await filesToggle.click();
    await expect(files.getByRole('button', { name: 'Export JSON' })).toBeHidden();
    await settingsToggle.click();
    await expect(settings.locator('[data-field="Preset"]')).toBeVisible();
  });

  test('sidebar section titles stay on one line', async ({ page }) => {
    await loadSample(page);
    await page.setViewportSize({ width: 900, height: 800 });
    for (const title of ['Card Settings', 'Template Files', 'Pictures Stored']) {
      const toggle = page.getByRole('button', { name: title, exact: true });
      const lines = await toggle.evaluate((element) => {
        const text = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        const range = document.createRange();
        range.selectNode(text!);
        return range.getClientRects().length;
      });
      expect(lines, title).toBe(1);
    }
  });

  test('the editor and fit check divider supports drag and keyboard resizing', async ({ page }) => {
    await loadSample(page);
    const divider = page.getByRole('separator', { name: 'Resize card previews and template editor' });
    const previews = page.locator('.previews');
    const initial = (await previews.boundingBox())!.height;
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 5 });
    await page.mouse.up();
    const dragged = (await previews.boundingBox())!.height;
    expect(dragged).toBeGreaterThan(initial + 60);
    await divider.focus();
    await page.keyboard.press('ArrowDown');
    expect((await previews.boundingBox())!.height).toBeLessThan(dragged);
    const value = Number(await divider.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(Number(await divider.getAttribute('aria-valuemin')));
    expect(value).toBeLessThanOrEqual(Number(await divider.getAttribute('aria-valuemax')));
  });

  test('the divider is hidden when panels stack', async ({ page }) => {
    await loadSample(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(page.getByRole('separator', { name: 'Resize card previews and template editor' })).toBeHidden();
  });
});

test.describe('Sidebar sections', () => {
  /** Space between the bottom of a section's last visible control and the bottom of the open section. */
  async function bottomGaps(page: Page): Promise<Record<string, number>> {
    return page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const s of document.querySelectorAll('.side.left .section')) {
        const body = s.querySelector('.section-body');
        const item = s.querySelector('[data-part="item"]');
        if (!body || !item) continue;
        // Deepest visible content: nested controls carry their own margins, so measure leaf boxes.
        let bottom = 0;
        for (const el of body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && el.children.length === 0) bottom = Math.max(bottom, r.bottom);
        }
        out[s.querySelector('h3')?.textContent ?? '?'] = Math.round(item.getBoundingClientRect().bottom - bottom);
      }
      return out;
    });
  }

  test('open sections end with the same small gap below their last control', async ({ page }) => {
    await loadSample(page);
    const design = await bottomGaps(page);
    expect(design['Card Settings']).toBeLessThanOrEqual(12);
    await goTo(page, 'print');
    const print = await bottomGaps(page);
    expect(print['Paper']).toBeLessThanOrEqual(12);
    expect(print['What to Print']).toBeLessThanOrEqual(12);
    expect(Math.abs(print['Paper'] - print['Cutting'])).toBeLessThanOrEqual(3);
  });
});

test('number fields show their steppers without hovering (Chrome hides them by default)', async ({ page }) => {
  await loadSample(page);
  const input = page.locator('.side.left [data-field="Width"] input');
  await page.mouse.move(700, 450); // well away from the field
  const shown = await input.screenshot();
  // The same field with the steppers forced invisible must look different
  await page.addStyleTag({ content: '.num::-webkit-inner-spin-button { opacity: 0 !important; }' });
  const hidden = await input.screenshot();
  expect(shown.equals(hidden)).toBe(false);
});

test.describe('Design toolbar with different sides', () => {
  /** Positions (px) of the toolbar parts, relative to the toolbar. */
  async function toolbarLayout(page: Page) {
    return page.evaluate(() => {
      const tb = document.querySelector('.designer-toolbar') as HTMLElement;
      const t = tb.getBoundingClientRect();
      const box = (sel: string) => tb.querySelector(sel)!.getBoundingClientRect();
      const sides = box('.side-switcher');
      const left = box('.toolbar-left');
      const right = box('.toolbar-right');
      const value = tb.querySelector('[data-testid="preview-source"] [data-part="value-text"]') as HTMLElement;
      return {
        offCentre: sides.left + sides.width / 2 - (t.left + t.width / 2),
        sameLine: Math.abs(sides.top + sides.height / 2 - (left.top + left.height / 2)) < 4 && Math.abs(sides.top - right.top) < 8,
        clearLeft: sides.left - left.right,
        clearRight: right.left - sides.right,
        below: sides.top >= Math.max(left.bottom, right.bottom) - 1,
        truncated: value.scrollWidth > value.clientWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
  }

  test('Front / Back sits centred on the toolbar line when there is room', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loadSample(page);
    await setSides(page, 'different');
    const l = await toolbarLayout(page);
    expect(l.sameLine).toBe(true);
    expect(Math.abs(l.offCentre)).toBeLessThan(2);
    expect(l.truncated).toBe(false);
    expect(l.overflow).toBe(false);
  });

  test('when space is tight it stays inline, as central as it can be, and "Preview with" truncates', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    // 1440 px: inline, but the right-hand controls are wider than half the space
    let l = await toolbarLayout(page);
    expect(l.sameLine).toBe(true);
    expect(l.clearLeft).toBeGreaterThanOrEqual(8);
    expect(l.clearRight).toBeGreaterThanOrEqual(8);
    expect(Math.abs(l.offCentre)).toBeLessThan(60);
    // A long selected name truncates instead of pushing the switcher off the line
    await page.setViewportSize({ width: 1920, height: 900 });
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'row:3'); // Maximilian Alexander von Habsburg-Lothringen
    l = await toolbarLayout(page);
    expect(l.sameLine).toBe(true);
    expect(l.truncated).toBe(true);
    expect(Math.abs(l.offCentre)).toBeLessThan(2);
    expect(l.clearLeft).toBeGreaterThanOrEqual(8);
  });

  test('when it does not fit it gets a centred line of its own, and only exists for different sides', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await loadSample(page);
    await expect(page.getByTestId('side-switcher')).toHaveCount(0);
    await setSides(page, 'different');
    const l = await toolbarLayout(page);
    expect(l.below).toBe(true);
    expect(Math.abs(l.offCentre)).toBeLessThan(2);
    expect(l.overflow).toBe(false);
    // Widening the window moves it back onto the line
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect.poll(async () => (await toolbarLayout(page)).sameLine).toBe(true);
  });
});

test('on larger screens the app name stays in the top bar and not on the Data page', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('brand')).toBeVisible();
  await expect(page.getByTestId('brand-page')).toBeHidden();
});

test.describe('Hiding the Fit Check', () => {
  const toggle = (page: Page) => page.getByRole('button', { name: 'Fit Check' });
  const visibleCards = (page: Page) => page.locator('.previews-strip .preview:visible');

  test('on desktop it collapses to its heading, the canvas gets the room, and it opens again at the same height', async ({ page }) => {
    await loadSample(page);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('.previews-panel');
    const canvas = page.locator('.canvas-area');
    const openHeight = (await panel.boundingBox())!.height;
    const canvasBefore = (await canvas.boundingBox())!.height;

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(visibleCards(page)).toHaveCount(0);
    await expect(page.locator('#fit-check-body')).toBeHidden();
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(60); // just the heading
    expect((await canvas.boundingBox())!.height).toBeGreaterThan(canvasBefore + 150);
    await expect(toggle(page)).toBeInViewport();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(visibleCards(page)).toHaveCount(3);
    await expect.poll(async () => Math.round((await panel.boundingBox())!.height)).toBe(Math.round(openHeight));
  });

  test('dragging the divider all the way down collapses it too, and the toggle follows', async ({ page }) => {
    await loadSample(page);
    const divider = page.getByRole('separator', { name: 'Resize card previews and template editor' });
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, page.viewportSize()!.height - 2, { steps: 8 });
    await page.mouse.up();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(visibleCards(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(visibleCards(page)).toHaveCount(3);
  });

  test('works from the keyboard', async ({ page }) => {
    await loadSample(page);
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press(' ');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  });
});
