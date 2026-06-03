import { test, expect } from '@playwright/test';
import { makePng } from './png.mjs';

const roomPng = makePng(160, 120, [160, 120, 80]);
const roomFile = { name: 'room.png', mimeType: 'image/png', buffer: roomPng };

test.describe('LUMINA widget — acceptance', () => {
  test('declarative install runs the full flow to a before/after + working CTA', async ({ page }) => {
    await page.goto('/test-store.html');
    await page.evaluate(() => {
      (window as unknown as { __cta: boolean }).__cta = false;
      window.addEventListener('lumina:cta:click', () => {
        (window as unknown as { __cta: boolean }).__cta = true;
      });
    });

    await page.locator('#declarative').click();
    await expect(page.locator('.lumina-overlay')).toBeVisible();

    await page.locator('input[type=file]').setInputFiles(roomFile);
    await page.getByRole('button', { name: 'Generate preview' }).click();

    await expect(page.locator('.lumina-ba')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForFunction(() => (window as unknown as { __cta: boolean }).__cta === true);
  });

  test('programmatic open + a late (SPA) trigger both work', async ({ page }) => {
    await page.goto('/test-store.html');
    await page.locator('#programmatic').click();
    await expect(page.locator('.lumina-overlay')).toBeVisible();
    await page.locator('.lumina-close').click();

    await page.locator('#late').click();
    await expect(page.locator('.lumina-overlay')).toBeVisible();
  });

  test('out-of-credits shows the paused message', async ({ page }) => {
    await page.goto('/test-store.html');
    await page.locator('#nocredit').click();
    await page.locator('input[type=file]').setInputFiles(roomFile);
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.lumina-error')).toContainText('paused');
  });

  test('a non-image file is rejected with the bad-image message', async ({ page }) => {
    await page.goto('/test-store.html');
    await page.locator('#declarative').click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.locator('.lumina-error-text')).toBeVisible();
  });

  test('camera capture (fake device) reaches the confirm step', async ({ page }) => {
    await page.goto('/test-store.html');
    await page.locator('#declarative').click();
    await page.getByRole('button', { name: 'Use camera' }).click();
    await page.waitForTimeout(400); // let the fake stream report dimensions
    await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeVisible({ timeout: 15_000 });
  });
});
