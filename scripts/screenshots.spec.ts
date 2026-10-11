import { expect, test, type Page } from '@playwright/test';
import { canvasCard, goTo, loadSample, preview, selectLayer, setLayerField, setSides } from '../tests/ui/helpers';
import type { ImageElement, RectElement, Template, TextElement } from '../src/lib/types';

/**
 * Screenshots for README.md, taken from a demo design built on the sample data:
 * a group colour on the bottom band and a picture per group in the header.
 * Run with `npm run screenshots`; the images are written to docs/screenshots/.
 */

const OUT = 'docs/screenshots';

const GROUPS: Record<string, { colour: string; emoji: string }> = {
  Otters: { colour: '#0284c7', emoji: '🦦' },
  Falcons: { colour: '#ea580c', emoji: '🐦' },
  Bears: { colour: '#92400e', emoji: '🐻' },
  Eagles: { colour: '#15803d', emoji: '🦅' },
  Wolves: { colour: '#4f46e5', emoji: '🐺' },
  Staff: { colour: '#be123c', emoji: '⭐' },
};

/** A round picture per group, drawn in the browser, as data URLs. */
function groupPictures(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async (groups) => {
    await document.fonts.load('140px "Noto Color Emoji"');
    const out: Record<string, string> = {};
    for (const [group, { emoji }] of Object.entries(groups)) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '140px "Noto Color Emoji"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 128, 140);
      out[group] = c.toDataURL('image/png');
    }
    return out;
  }, GROUPS);
}

/** The starter design with a colour and a picture per group. */
async function demoTemplate(page: Page): Promise<Template> {
  const t = await page.evaluate(() => window.cardMaker.getTemplate());
  const pictures = await groupPictures(page);
  const els = t.sides.front.elements;
  const byName = <T>(name: string) => els.find((e) => e.name === name) as T;

  byName<RectElement>('Header band').bg = '#1e293b';
  Object.assign(byName<TextElement>('Camp title'), { w: 66 });
  const band = byName<RectElement>('Group band');
  band.colorRule = { column: 'Group', map: Object.fromEntries(Object.entries(GROUPS).map(([g, v]) => [g, v.colour])), fallback: '#9ca3af' };
  byName<TextElement>('Group').color = '#ffffff';

  t.assets = {};
  const map: Record<string, string> = {};
  for (const [group, dataUrl] of Object.entries(pictures)) {
    const id = group.toLowerCase();
    t.assets[id] = { name: `${id}.png`, dataUrl };
    map[group] = id;
  }
  const picture: ImageElement = {
    id: 'group-picture',
    name: 'Group picture',
    kind: 'image',
    x: 74,
    y: 6,
    w: 22,
    h: 22,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    src: '',
    srcColumn: null,
    imageRule: { column: 'Group', map, fallback: '' },
    fit: 'contain',
    borderRadius: 0,
  };
  els.push(picture);
  return t;
}

async function importTemplate(page: Page, t: Template) {
  await page.locator('input[type=file][accept*="json"]').setInputFiles({
    name: 'demo.card-maker.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(t)),
  });
  await expect(canvasCard(page).locator('[data-testid="image"]')).toBeVisible();
}

const deselect = (page: Page) => page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });

test('README screenshots', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadSample(page);
  await importTemplate(page, await demoTemplate(page));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/design.png` });

  // Colour per field value
  await selectLayer(page, 'Group band');
  await page.locator('.side.right .color-rule').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/colour-by-field.png` });

  // Picture per field value
  await selectLayer(page, 'Group picture');
  await page.getByTestId('image-rule').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/picture-by-field.png` });

  // Fit check, with a minimum font size too large for the longest name
  await selectLayer(page, 'Name');
  await setLayerField(page, 'Min Shrinked Size', 28);
  await expect(preview(page, 'longest').getByTestId('preview-status')).toContainText('Overflows');
  await deselect(page);
  const divider = page.getByRole('separator', { name: 'Resize card previews and template editor' });
  await divider.focus();
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowUp'); // a taller panel so whole cards show
  await page.waitForTimeout(400);
  const top = (await page.locator('.previews').boundingBox())!;
  const bottom = (await page.locator('.preview-details').boundingBox())!;
  await page.screenshot({
    path: `${OUT}/fit-check.png`,
    clip: { x: top.x, y: top.y, width: top.width, height: bottom.y + bottom.height + 12 - top.y },
  });
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+z');

  // Data
  await goTo(page, 'data');
  await page.screenshot({ path: `${OUT}/data.png` });

  // Print
  await goTo(page, 'print');
  await expect(page.locator('.sheet-stage .sheet')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/print.png` });

  // A different back
  await goTo(page, 'design');
  await setSides(page, 'different');
  for (const [layer, content] of [
    ['Camp title', 'IN AN EMERGENCY'],
    ['Name', '{{Emergency contact}}'],
    ['Accommodation label', 'DIETARY NEEDS'],
    ['Accommodation', '{{Dietary}}'],
  ]) {
    await selectLayer(page, layer);
    await page.locator('#content-editor').fill(content);
  }
  await deselect(page);
  await page.locator('.side.left').evaluate((el) => el.scrollTo(0, 0)); // show the Sides setting
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/double-sided.png` });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('README screenshot on a phone', async ({ page }) => {
    await loadSample(page);
    await importTemplate(page, await demoTemplate(page));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/mobile.png` });
  });
});
