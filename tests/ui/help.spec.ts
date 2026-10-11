import { expect, test } from '@playwright/test';
import { loadSample, openApp } from './helpers';

test.describe('Help', () => {
  test('the Help button opens instructions that close with the close button or Esc', async ({ page }) => {
    await openApp(page);
    const button = page.getByRole('button', { name: 'Help' });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'How to use Card Maker' });
    await expect(dialog).toBeVisible();
    for (const heading of ['Getting started', 'Your data', 'Designing a card', 'Keyboard shortcuts', 'Printing', 'Saving and sharing']) {
      await expect(dialog.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(dialog).toContainText('CSV UTF-8 (Comma delimited) (.csv)'); // the same steps as on the Data tab
    await expect(dialog).toContainText('Ctrl+D / Delete');

    await dialog.getByRole('button', { name: 'Close help' }).click();
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('long instructions scroll inside the dialog, which stays within the window', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Help' }).click();
    const dialog = page.getByRole('dialog', { name: 'How to use Card Maker' });
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await dialog.getByRole('heading', { name: 'Saving and sharing' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('heading', { name: 'Saving and sharing' })).toBeInViewport();
  });
});
