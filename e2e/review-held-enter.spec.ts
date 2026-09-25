import { expect, test } from '@playwright/test';

for (const origin of ['empty-home', 'completed-session'] as const) {
  test(`복습 창은 ${origin}에서 열 때 유지된 Enter로 바로 닫히지 않는다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rotation: { quantity: 1, paceMs: 90000 } }));
      localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ rotation: true }));
      localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({ contentMode: 'letters', selectedLetters: ['F'], selectedTransforms: ['turn-left-45'], showPreview: true }));
    });
    await page.goto('/');
    if (origin === 'completed-session') {
      await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
      await page.locator('section[data-game="rotation"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
      const workspace = page.locator('.game-workspace.game-rotation');
      await expect(workspace).toBeVisible({ timeout: 8000 });
      await workspace.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();
      await workspace.getByRole('button', { name: /답안 제출/ }).click();
      await workspace.getByRole('button', { name: /결과 보기/ }).click();
      await expect(page.locator('.stage-result')).toBeVisible();
    }
    const opener = page.getByRole('button', { name: origin === 'empty-home' ? '내 실수 복습' : '문항별 복습', exact: true });
    await expect(opener).toBeEnabled();
    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.down('Enter');
    const dialog = page.getByRole('dialog', { name: origin === 'empty-home' ? '복습 센터' : '내 실수 복습', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '복습 센터 닫기' })).toBeFocused();
    await page.keyboard.down('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.up('Enter');
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.keyboard.press('Space');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '복습 센터 닫기' })).toBeFocused();
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await expect(dialog).toBeVisible();
    await page.keyboard.up('Space');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(errors).toEqual([]);
  });
}
