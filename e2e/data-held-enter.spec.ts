import { expect, test } from '@playwright/test';

for (const entry of ['records', 'footer'] as const) {
  for (const action of ['export', 'clear'] as const) {
    test(`${entry} 백업 창: 유지된 Enter는 ${action === 'export' ? '백업을 중복 다운로드하지 않는다' : '삭제 확인을 자동 취소하지 않는다'}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        localStorage.setItem('nineflow-practice-results-v2', JSON.stringify([{
          id: 'held-enter-backup', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
          accuracy: 80, medianRt: 720, stability: 74, errors: 2,
        }]));
        const state = window as Window & { __backupDownloads?: number };
        state.__backupDownloads = 0;
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download.startsWith('nineflow-practice-backup-')) {
            state.__backupDownloads! += 1;
            return; // Count the real export path without creating downloaded files.
          }
          originalClick.call(this);
        };
      });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      const opener = entry === 'records'
        ? page.locator('.records-data-button')
        : page.getByRole('button', { name: '기록 백업·복원', exact: true });
      await opener.press('Enter');
      const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
      await expect(dialog.getByRole('button', { name: '내 기록 백업·복원 닫기' })).toBeFocused();
      await expect(dialog).toContainText('현재 기록 1개');
      const generation = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-generation-v1'));
      const trigger = dialog.getByRole('button', { name: action === 'export' ? 'JSON 백업 받기' : '전체 기록 삭제', exact: true });
      await trigger.focus();
      await page.keyboard.down('Enter');
      if (action === 'clear') await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
      for (let repeat = 0; repeat < 3; repeat += 1) await page.keyboard.down('Enter');
      const downloads = () => page.evaluate(() => (window as Window & { __backupDownloads?: number }).__backupDownloads);
      if (action === 'export') expect(await downloads()).toBe(1);
      else await expect(dialog.getByRole('button', { name: '삭제 확정' })).toBeVisible();
      await page.keyboard.up('Enter');
      await page.keyboard.press('Enter');
      if (action === 'export') {
        expect(await downloads()).toBe(2);
        await page.keyboard.press('Space');
        expect(await downloads()).toBe(3);
        await trigger.click();
        expect(await downloads()).toBe(4);
      } else {
        await expect(dialog.getByRole('button', { name: '삭제 확정' })).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Space');
        await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
        await dialog.getByRole('button', { name: '취소', exact: true }).click();
        await expect(trigger).toBeFocused();
      }
      const stored = await page.evaluate((activeGeneration) => ({
        generation: localStorage.getItem('nineflow-practice-results-generation-v1'),
        results: JSON.parse(localStorage.getItem(`nineflow-practice-results-v4:${activeGeneration}`) ?? '{}').results,
      }), generation);
      expect(stored.generation).toBe(generation);
      expect(stored.results).toHaveLength(1);
      expect(stored.results[0].id).toBe('held-enter-backup');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}

test('예약된 창 첫 초점이 사용자가 옮긴 백업 버튼 초점을 뺏지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-results-v2', JSON.stringify([{
      id: 'delayed-dialog-focus', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
      accuracy: 80, medianRt: 720, stability: 74, errors: 2,
    }]));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const nativeRequest = window.requestAnimationFrame;
    const nativeCancel = window.cancelAnimationFrame;
    const pending = new Map<number, FrameRequestCallback>();
    let nextHandle = -1;
    // Hold only the opening frame, then release it after the user moves focus.
    window.requestAnimationFrame = (callback) => { const id = nextHandle--; pending.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { if (!pending.delete(id)) nativeCancel.call(window, id); };
    (window as Window & { __releaseModalFrame?: () => void }).__releaseModalFrame = () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      for (const callback of pending.values()) callback(performance.now());
      pending.clear();
    };
  });
  const opener = page.locator('.records-data-button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog.getByRole('button', { name: '내 기록 백업·복원 닫기' })).toBeFocused();
  const trigger = dialog.getByRole('button', { name: 'JSON 백업 받기', exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => (window as Window & { __releaseModalFrame?: () => void }).__releaseModalFrame!());
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
