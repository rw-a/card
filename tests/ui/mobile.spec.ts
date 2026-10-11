import { expect, test, type CDPSession } from '@playwright/test';
import { canvasCard, field, getElement, getTemplate, goTo, loadSample, selectOption, setChecked, setSides, waitForElement } from './helpers';

test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

async function touchDrag(cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function expectNoOverflow(page: import('@playwright/test').Page, what: string) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > innerWidth,
    visible: [...document.querySelectorAll('body *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
      .filter((el) => getComputedStyle(el).overflowX === 'visible')
      .map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(overflow, what).toEqual({ page: false, visible: [] });
}

test('the side switcher and duplex controls fit small screens and work by touch', async ({ page }) => {
  await loadSample(page);
  await setSides(page, 'different');
  await goTo(page, 'print');
  await selectOption(page, field(page, 'Printing method'), 'duplex');
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    await goTo(page, 'design');
    await expect(page.getByTestId('side-switcher')).toBeInViewport();
    await expectNoOverflow(page, `${width}px design`);
    await page.getByTestId('side-switcher').locator('label', { hasText: 'Front' }).tap();
    await expect(page.getByTestId('canvas-side')).toHaveText('Front');
    await page.getByTestId('side-switcher').locator('label', { hasText: 'Back' }).tap();
    await expect(page.getByTestId('canvas-side')).toHaveText('Back');
    await goTo(page, 'print');
    await expectNoOverflow(page, `${width}px print`);
    await page.getByRole('radio', { name: 'Back' }).locator('..').tap();
    await expect(page.getByTestId('sheet-label')).toContainText('— Back');
  }
  expect((await getTemplate(page)).sidedness).toBe('different');
});

test('small screens keep every tab within the viewport', async ({ page }) => {
  await loadSample(page);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    for (const tab of ['data', 'design', 'print'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth,
        visible: [...document.querySelectorAll('body *')]
          .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
          .filter((el) => getComputedStyle(el).overflowX === 'visible')
          .map((el) => `${el.tagName}.${el.className}`),
      }));
      expect(overflow, `${width}px ${tab}`).toEqual({ page: false, visible: [] });
      await expect(page.getByTestId(`tab-${tab}`)).toBeInViewport();
    }
  }
});

test('touch moves and resizes a box; Drag to Pan pans the zoomed canvas', async ({ page }) => {
  await loadSample(page);
  const cdp = await page.context().newCDPSession(page);
  const before = await getElement(page, 'Name');
  const box = (await canvasCard(page).locator(`.el[data-id="${before.id}"]`).boundingBox())!;
  await touchDrag(cdp, box.x + box.width / 2, box.y + box.height / 2, 25, 15);
  await waitForElement(page, 'Name', (el) => el.x > before.x && el.y > before.y);
  await expect(page.getByTestId('selection')).toBeVisible();

  const moved = await getElement(page, 'Name');
  const handle = (await page.locator('.handle.s').boundingBox())!;
  await touchDrag(cdp, handle.x + handle.width / 2, handle.y + handle.height / 2, 0, -20);
  await waitForElement(page, 'Name', (el) => el.h < moved.h);

  for (let i = 0; i < 8; i++) await page.getByTitle('Zoom in').click();
  await setChecked(page.getByRole('checkbox', { name: 'Drag to Pan' }), true);
  await expect(page.getByRole('checkbox', { name: 'Drag to Pan' })).toBeChecked();
  const unchanged = await getElement(page, 'Name');
  const area = (await page.locator('.canvas-area').boundingBox())!;
  await touchDrag(cdp, area.x + area.width - 25, area.y + 300, -100, -60);
  await expect.poll(() => page.locator('.canvas-area').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.canvas-area').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await getElement(page, 'Name')).toEqual(unchanged);
});

test('touch screens have no number steppers, so units sit at the right edge', async ({ page }) => {
  await loadSample(page);
  const wrap = page.locator('.side.left [data-field="Width"] .num-wrap');
  const unit = (await wrap.locator('.unit').boundingBox())!;
  const box = (await wrap.boundingBox())!;
  expect(box.x + box.width - (unit.x + unit.width)).toBeLessThanOrEqual(12);
  await expect(wrap.locator('input')).toHaveCSS('padding-right', '30px'); // the value never runs under the unit
});

test('zoom out, the zoom level and zoom in stay together on narrow screens', async ({ page }) => {
  await loadSample(page);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    const tops = await Promise.all(
      [page.getByTitle('Zoom out'), page.getByTitle('Fit to view'), page.getByTitle('Zoom in')].map(async (l) => {
        const b = (await l.boundingBox())!;
        return b.y + b.height / 2;
      }),
    );
    expect(Math.max(...tops) - Math.min(...tops), `${width}px`).toBeLessThan(2);
  }
});

test('small screens still fit with the wider font CI machines use, and the sheet navigation stays beside "Back to design"', async ({ page }) => {
  await loadSample(page);
  // Ubuntu (and so CI) falls back to DejaVu Sans, which is wider than most desktop fonts.
  await page.addStyleTag({ content: `html, body, body * { font-family: 'DejaVu Sans', sans-serif !important; }` });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    for (const tab of ['data', 'design', 'print'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expectNoOverflow(page, `${width}px ${tab} with DejaVu Sans`);
    }
    const back = (await page.getByRole('button', { name: 'Back to design', exact: true }).boundingBox())!;
    const label = (await page.getByTestId('sheet-label').boundingBox())!;
    expect(label.y, `${width}px: sheet navigation on the same line`).toBeLessThan(back.y + back.height);
    expect(label.x).toBeGreaterThan(back.x + back.width);
  }
  // The short label is only used at 360px and narrower
  const back = page.getByRole('button', { name: 'Back to design', exact: true });
  await expect(back.locator('.back-label-long')).toBeVisible(); // 375px
  await expect(back.locator('.back-label-short')).toBeHidden();
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(back.locator('.back-label-short')).toBeVisible();
  await expect(back.locator('.back-label-long')).toBeHidden();
});

test('opening "Preview with" never widens the page, even with long names in the menu', async ({ page }) => {
  await loadSample(page); // has "Maximilian Alexander von Habsburg-Lothringen", wider than a phone
  const pageWidth = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    await page.getByTestId('preview-source').getByRole('combobox').tap();
    const menu = page.getByRole('listbox').filter({ has: page.getByRole('option', { name: /Habsburg-Lothringen/ }) });
    await expect(menu).toBeVisible();
    expect(await pageWidth(), `${width}px, menu open`).toEqual({ scroll: width, viewport: width });
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // The long name is truncated on one line (full text on hover) rather than wrapping
    const longText = menu.getByRole('option', { name: /Habsburg-Lothringen/ }).locator('[data-part="item-text"]');
    await expect(longText).toHaveCSS('text-overflow', 'ellipsis');
    expect(await longText.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const lineHeight = await menu.getByRole('option', { name: 'Shortest values' }).evaluate((el) => el.getBoundingClientRect().height);
    expect((await menu.getByRole('option', { name: /Habsburg-Lothringen/ }).boundingBox())!.height).toBeCloseTo(lineHeight, 0);
    await expect(longText).toHaveAttribute('title', /Maximilian Alexander von Habsburg-Lothringen/);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await pageWidth(), `${width}px, menu closed again`).toEqual({ scroll: width, viewport: width });
  }
});

test('on phones Front / Back goes bottom-left with zoom bottom-right on the same line', async ({ page }) => {
  await loadSample(page);
  await setSides(page, 'different');
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    const l = await page.evaluate(() => {
      const tb = (document.querySelector('.designer-toolbar') as HTMLElement).getBoundingClientRect();
      const box = (sel: string) => document.querySelector(`.designer-toolbar ${sel}`)!.getBoundingClientRect();
      const sides = box('.side-switcher');
      const zoom = box('.zoom-controls');
      const view = box('.toolbar-view');
      return {
        leftInset: sides.left - tb.left,
        rightInset: tb.right - zoom.right,
        sameLine: Math.abs(sides.top + sides.height / 2 - (zoom.top + zoom.height / 2)) < 4,
        lastLine: sides.top >= view.bottom - 1 && Math.abs(sides.bottom - (tb.bottom - 8)) < 4,
      };
    });
    expect(l, `${width}px`).toMatchObject({ sameLine: true, lastLine: true });
    expect(l.leftInset, `${width}px`).toBeLessThanOrEqual(12);
    expect(l.rightInset, `${width}px`).toBeLessThanOrEqual(12);
    await expectNoOverflow(page, `${width}px design toolbar`);
  }
});

test('on phones the app name only shows on the Data page, below the tabs, and pages start right under the tabs', async ({ page }) => {
  await loadSample(page);
  const headerBrand = page.getByTestId('brand');
  const pageBrand = page.getByTestId('brand-page');
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    for (const tab of ['data', 'design', 'print'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(headerBrand, `${width}px ${tab}`).toBeHidden();
      const header = (await page.locator('.topbar').boundingBox())!;
      expect(header.height, `${width}px ${tab}: the top bar is just the tabs`).toBeLessThanOrEqual(50);
      if (tab === 'data') {
        await expect(pageBrand).toBeVisible();
        await expect(pageBrand).toHaveText('Card Maker');
        // Sized as the page title: larger than the tabs' text, with a matching icon
        await expect(pageBrand).toHaveCSS('font-size', '20px');
        await expect(pageBrand.locator('svg')).toHaveCSS('width', '26px');
        const brand = (await pageBrand.boundingBox())!;
        expect(brand.y).toBeGreaterThanOrEqual(header.y + header.height); // below the tabs…
        expect(brand.y - (header.y + header.height)).toBeLessThan(24); // …close to them
        expect(Math.abs(brand.x + brand.width / 2 - width / 2)).toBeLessThan(2); // centred
      } else {
        await expect(pageBrand).toBeHidden();
      }
    }
  }
});
