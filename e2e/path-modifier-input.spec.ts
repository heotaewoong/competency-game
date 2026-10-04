import { expect, test } from '@playwright/test';

test('길 만들기 소형 격자는 조합키·IME를 배치하지 않고 기본 입력을 유지한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ path: { quantity: 3, paceMs: 120000 } }));
    localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ path: true }));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
  await page.locator('section[data-game="path"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-path');
  await expect(workspace.locator('.path-shell')).toBeVisible({ timeout: 8_000 });
  const control = (cell: number) => workspace.locator(`[data-cycle-cell="${cell}"]`);
  const firstCell = workspace.locator('.path-cell').first();
  const actionCount = workspace.locator('.path-toolbar > span').filter({ hasText: '현재 조작 기록' }).locator('b');
  // Use the game's own focus handoff, then real modified keyboard input.
  await expect(control(0)).toBeFocused();
  await expect(firstCell).toHaveAttribute('data-fence', 'empty');
  for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
    for (const key of ['Slash', 'Backslash']) {
      await page.keyboard.press(`${modifier}+${key}`);
      await expect(firstCell).toHaveAttribute('data-fence', 'empty');
      await expect(actionCount).toHaveText('0');
      await expect(control(0)).toBeFocused();
    }
  }
  // IME and previously handled events are DOM contracts, not an OS IME session.
  const prevented = await control(0).evaluate((element) => {
    return ['Slash', 'Backslash'].flatMap((code) => {
      const key = code === 'Slash' ? '/' : '\\';
      return [{ isComposing: true }, { ctrlKey: true, repeat: true }, { altKey: true, repeat: true }, { metaKey: true, repeat: true }, { shiftKey: true, repeat: true }, { handled: true }].map((options) => {
        const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...options });
        if ('handled' in options) event.preventDefault();
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
    });
  });
  expect(prevented).toEqual([false, false, false, false, false, true, false, false, false, false, false, true]);
  await expect(firstCell).toHaveAttribute('data-fence', 'empty');
  await expect(actionCount).toHaveText('0');

  await page.keyboard.press('Control+End');
  await expect(control(24)).toBeFocused();
  await page.keyboard.press('Control+Home');
  await expect(control(0)).toBeFocused();
  await page.keyboard.down('/');
  await expect(firstCell).toHaveAttribute('data-fence', 'slash');
  await expect(actionCount).toHaveText('1');
  await page.keyboard.down('/');
  await expect(actionCount).toHaveText('1');
  await page.keyboard.up('/');
  await page.keyboard.press('\\');
  await expect(firstCell).toHaveAttribute('data-fence', 'backslash');
  await expect(actionCount).toHaveText('2');
  await page.keyboard.press('Enter');
  await expect(firstCell).toHaveAttribute('data-fence', 'empty');
  await page.keyboard.press('Space');
  await expect(firstCell).toHaveAttribute('data-fence', 'slash');
  await expect(actionCount).toHaveText('4');
  await page.keyboard.down('ArrowRight');
  await expect(control(1)).toBeFocused();
  await page.keyboard.down('ArrowRight');
  await expect(control(2)).toBeFocused();
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Home');
  await expect(control(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(control(4)).toBeFocused();
  await expect(actionCount).toHaveText('4');
  await page.keyboard.press('Shift+Tab');
  await expect(workspace.getByRole('button', { name: '경로 확인', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('path-modifier-input.png') });
  expect(errors).toEqual([]);
});
