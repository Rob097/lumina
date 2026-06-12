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

  test('mobile viewport (360px): modal fits the screen and custom instructions are reachable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/test-store.html');
    await page.locator('#declarative').click();
    await expect(page.locator('.lumina-overlay')).toBeVisible();

    // Upload → confirm step. The custom-instructions field is expanded by default (no disclosure).
    await page.locator('input[type=file]').setInputFiles(roomFile);
    const instructions = page.locator('.lumina-instructions-input');
    await expect(instructions).toBeVisible();

    // The bottom-sheet modal must not overflow the 360px viewport.
    const box = await page.locator('.lumina-modal').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(361);

    // Typing character-by-character must not lose focus between keystrokes (the modal used to
    // re-grab focus on every render). pressSequentially fires a real keydown/input per character.
    await instructions.click();
    await instructions.pressSequentially('near the window');
    await expect(instructions).toHaveValue('near the window');
    await expect(instructions).toBeFocused();
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
