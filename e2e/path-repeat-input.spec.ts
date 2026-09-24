import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`길 만들기 ${viewport.width}px는 배치 키 반복을 무시하고 새 입력과 방향키 반복을 허용한다`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ path: { quantity: 3, paceMs: 120000 } }));
      localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ path: true }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
    await page.locator('section[data-game="path"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
    const workspace = page.locator('.game-workspace.game-path');
    await expect(workspace.locator('.path-shell')).toBeVisible({ timeout: 8_000 });

    const compact = viewport.width <= 900;
    const control = (cell: number) => workspace.locator(compact
      ? `.path-fence-cycle[data-cycle-cell="${cell}"]`
      : `.path-fence-choice[data-cell="${cell}"][data-orientation="slash"]`);
    const firstCell = workspace.locator('.path-cell').first();
    const actionCount = workspace.locator('.path-toolbar > span').filter({ hasText: '현재 조작 기록' }).locator('b');
    // Wait for the game's own focus handoff; locator.press() would hide it.
    await expect(control(0)).toBeFocused();
    await expect(firstCell).toHaveAttribute('data-fence', 'empty');
    await expect(actionCount).toHaveText('0');

    await page.keyboard.down('Enter');
    await expect(firstCell).toHaveAttribute('data-fence', 'slash');
    await expect(actionCount).toHaveText('1');
    // No keyup: this is a native repeated keydown, not a synthetic click.
    await page.keyboard.down('Enter');
    await expect(firstCell).toHaveAttribute('data-fence', 'slash');
    await expect(actionCount).toHaveText('1');
    await page.keyboard.up('Enter');
    await page.keyboard.down('Enter');
    await expect(firstCell).toHaveAttribute('data-fence', compact ? 'backslash' : 'empty');
    await expect(actionCount).toHaveText('2');
    await page.keyboard.up('Enter');

    if (compact) {
      for (const [key, orientation, count] of [['/', 'slash', 3], ['\\', 'backslash', 5]] as const) {
        await page.keyboard.down(key);
        await expect(firstCell).toHaveAttribute('data-fence', orientation);
        await expect(actionCount).toHaveText(String(count));
        await page.keyboard.down(key);
        await expect(firstCell).toHaveAttribute('data-fence', orientation);
        await expect(actionCount).toHaveText(String(count));
        await page.keyboard.up(key);
        await page.keyboard.down(key);
        await expect(firstCell).toHaveAttribute('data-fence', 'empty');
        await expect(actionCount).toHaveText(String(count + 1));
        await page.keyboard.up(key);
      }
    }

    await page.keyboard.down('ArrowRight');
    await expect(control(1)).toBeFocused();
    await page.keyboard.down('ArrowRight');
    await expect(control(2)).toBeFocused();
    await page.keyboard.up('ArrowRight');
    await expect(actionCount).toHaveText(compact ? '6' : '2');
    await expect(workspace.locator('.path-cell').nth(1)).toHaveAttribute('data-fence', 'empty');
    await expect(workspace.locator('.path-cell').nth(2)).toHaveAttribute('data-fence', 'empty');

    await page.keyboard.press('Space');
    await expect(workspace.locator('.path-cell').nth(2)).toHaveAttribute('data-fence', 'slash');
    await expect(actionCount).toHaveText(compact ? '7' : '3');
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await expect(workspace.locator('.path-cell').nth(2)).toHaveAttribute('data-fence', 'slash');
    await expect(actionCount).toHaveText(compact ? '7' : '3');
    await page.keyboard.up('Space');
    await expect(workspace.locator('.path-cell').nth(2)).toHaveAttribute('data-fence', compact ? 'backslash' : 'empty');
    await expect(actionCount).toHaveText(compact ? '8' : '4');
    await page.keyboard.press('Shift+Tab');
    await expect(workspace.getByRole('button', { name: '경로 확인', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(workspace.getByRole('button', { name: '전체 초기화', exact: true })).toBeFocused();
    await page.keyboard.down('Enter');
    await expect(workspace.locator('.path-cell[data-fence="empty"]')).toHaveCount(25);
    await expect(actionCount).toHaveText(compact ? '9' : '5');
    await page.keyboard.down('Enter');
    await expect(actionCount).toHaveText(compact ? '9' : '5');
    await page.keyboard.up('Enter');
    expect(runtimeErrors).toEqual([]);
  });
}
