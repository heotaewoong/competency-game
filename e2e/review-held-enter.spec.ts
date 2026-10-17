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
    // Separate protocol reads add observation time; they are not atomic focus events or cause proof.
    const observeFocus = async (observation: string) => {
      try {
        const raw = await page.evaluate(() => {
          const summarize = (node: Element | null) => node ? { tag: node.tagName, id: node.id, className: node.getAttribute('class'),
            role: node.getAttribute('role'), label: node.getAttribute('aria-label'), text: (node.textContent ?? '').trim().slice(0, 80) } : null;
          const inertAncestors = (element: Element | null) => {
            const ancestors: { tag: string; id: string; className: string | null; inert: boolean; attribute: boolean }[] = [];
            for (let node = element; node; node = node.parentElement) {
              const inert = node instanceof HTMLElement && node.inert, attribute = node.hasAttribute('inert');
              if (inert || attribute) ancestors.push({ tag: node.tagName, id: node.id, className: node.getAttribute('class'), inert, attribute });
            }
            return ancestors;
          };
          const targets = document.querySelectorAll<HTMLButtonElement>(".stage-result .result-review-button");
          const target = targets.length === 1 ? targets[0] : null, active = document.activeElement;
          return { capturedAt: new Date().toISOString(), ticks: performance.now(), documentHasFocus: document.hasFocus(), visibilityState: document.visibilityState,
            viewport: { width: innerWidth, height: innerHeight }, textScale: document.documentElement.dataset.textScale,
            phase: { preparation: Boolean(document.querySelector('.game-preparation')), result: Boolean(document.querySelector('.stage-result')),
              progress: document.querySelector('.game-workspace .workspace-progress span')?.textContent ?? null },
            gameId: target?.closest('[data-game]')?.getAttribute('data-game') ?? null, targetCount: targets.length,
            target: summarize(target), active: summarize(active), targetIsActive: target ? target === active : null,
            targetIsConnected: target?.isConnected ?? null, activeIsConnected: active?.isConnected ?? null,
            inertAncestors: { target: inertAncestors(target), active: inertAncestors(active) } };
        });
        console.log('FOCUS_BOUNDARY_DIAGNOSTIC', JSON.stringify({ callsite: 'completed-session-review-opener', observation, ...raw }));
      } catch (diagnosticError) {
        console.log('FOCUS_BOUNDARY_DIAGNOSTIC_ERROR', JSON.stringify({ callsite: 'completed-session-review-opener', observation, error: String(diagnosticError) }));
      }
    };
    try {
      await opener.focus();
      if (origin === 'completed-session') await observeFocus('after-focus');
      await expect(opener).toBeFocused();
    } catch (error) {
      if (origin === 'completed-session') await observeFocus('first-focus-failure');
      throw error;
    }
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
