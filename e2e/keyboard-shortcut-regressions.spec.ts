import { expect, test } from '@playwright/test';

for (const game of [
  { id: 'rps', title: '가위바위보', key: 'ArrowLeft', marker: '.rps-actions button' },
  { id: 'rotation', title: '도형 회전하기', key: '1', marker: '.rotation-controls button' },
] as const) {
  test(`${game.title}는 브라우저 조합키와 한글 조합 입력을 답안으로 처리하지 않는다`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ rps: true, rotation: true }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`${game.title}, 난이도 .+, 설정 열기`) }).click();
    await page.locator(`section[data-game="${game.id}"]`).getByRole('button', { name: /^설명·연습 시작/ }).click();
    const workspace = page.locator(`.game-workspace.game-${game.id}`);
    await expect(workspace.locator(game.marker).first()).toBeEnabled({ timeout: 10_000 });
    await workspace.focus();

    const intercepted = await workspace.evaluate((element, key) => {
      const options: KeyboardEventInit[] = [
        { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true },
      ];
      const results = options.map((option) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...option });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
      const alreadyHandled = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      alreadyHandled.preventDefault();
      element.dispatchEvent(alreadyHandled);
      return results;
    }, game.key);
    expect(intercepted).toEqual([false, false, false, false, false]);
    if (game.id === 'rotation') {
      await expect(workspace.locator('.rotation-control-head')).toContainText('0/8단계');
    } else {
      await expect(workspace.locator('.rps-actions button').first()).toBeEnabled();
      await expect(workspace.locator('.workspace-progress span')).toContainText('1 /');
    }

    await page.keyboard.press(game.key);
    if (game.id === 'rotation') {
      await expect(workspace.locator('.rotation-control-head')).toContainText('1/8단계');
    } else {
      await expect(workspace.locator('.rps-actions button').first()).toBeDisabled();
    }
  });
}
