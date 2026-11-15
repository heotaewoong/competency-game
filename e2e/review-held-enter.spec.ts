import { expect, test } from '@playwright/test';

type ReviewPassiveWindow = Window & { __reviewEnterPassive?: { history: Record<string, unknown>[]; stop: () => void } };

for (const origin of ['empty-home', 'completed-session'] as const) {
  test(`복습 창은 ${origin}에서 열 때 유지된 Enter로 바로 닫히지 않는다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((recordReviewEvents: boolean) => {
      localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rotation: { quantity: 1, paceMs: 90000 } }));
      localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ rotation: true }));
      localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({ contentMode: 'letters', selectedLetters: ['F'], selectedTransforms: ['turn-left-45'], showPreview: true }));
      if (!recordReviewEvents) return;
      // Keep the last 64 events from document start; attach DOM observation only at the first opener focus.
      const history: Record<string, unknown>[] = [];
      const summarize = (node: EventTarget | null) => node instanceof Element ? { tag: node.tagName, id: node.id,
        className: node.getAttribute('class'), role: node.getAttribute('role'), label: node.getAttribute('aria-label'),
        text: (node.textContent ?? '').trim().slice(0, 80), connected: node.isConnected } : null;
      const record = (entry: Record<string, unknown>) => { history.push({ ticks: performance.now(), ...entry }); if (history.length > 64) history.shift(); };
      const reviewNodes = (nodes: NodeList) => Array.from(nodes).flatMap(node => node instanceof Element
        ? [node, ...node.querySelectorAll('.review-backdrop, .review-dialog')].filter(item => item.matches('.review-backdrop, .review-dialog')).map(summarize) : []);
      const observer = new MutationObserver(records => {
        for (const mutation of records) {
          if (mutation.type === 'attributes' && mutation.target instanceof Element && mutation.target.matches('.stage-content, .review-backdrop, .review-dialog')) {
            record({ type: 'mutation', kind: 'attribute', target: summarize(mutation.target), attribute: mutation.attributeName,
              oldValue: mutation.oldValue, valueAtCallback: mutation.target.getAttribute(mutation.attributeName!) });
          } else if (mutation.type === 'childList') {
            const added = reviewNodes(mutation.addedNodes), removed = reviewNodes(mutation.removedNodes);
            if (added.length || removed.length) record({ type: 'mutation', kind: 'childList', added, removed });
          }
        }
      });
      let armed = false;
      const observeEvent = (event: Event, phase: 'capture' | 'bubble') => {
        if (!armed && event.type === 'focusin' && event.target instanceof Element && event.target.matches('.stage-result .result-review-button')) {
          const panel = event.target.closest('.stage-panel');
          if (panel) observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'aria-hidden'], attributeOldValue: true });
          armed = true;
        }
        record({ type: event.type, phase, eventTime: event.timeStamp, target: summarize(event.target), active: summarize(document.activeElement),
          isTrusted: event.isTrusted, key: event instanceof KeyboardEvent ? event.key : null, repeat: event instanceof KeyboardEvent ? event.repeat : null,
          defaultPrevented: event.defaultPrevented });
      };
      // defaultPrevented is sampled at each listener phase, before any later window listener.
      const capture: EventListener = event => observeEvent(event, 'capture');
      const bubble: EventListener = event => observeEvent(event, 'bubble');
      const types = ['focusin', 'focusout', 'keydown', 'keypress', 'click'];
      for (const type of types) {
        window.addEventListener(type, capture, { capture: true, passive: true });
        if (type !== 'focusin' && type !== 'focusout') window.addEventListener(type, bubble, { passive: true });
      }
      (window as ReviewPassiveWindow).__reviewEnterPassive = { history, stop: () => {
        observer.disconnect();
        for (const type of types) { window.removeEventListener(type, capture, true); window.removeEventListener(type, bubble); }
      } };
    }, origin === 'completed-session');
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
            inertAncestors: { target: inertAncestors(target), active: inertAncestors(active) },
            passiveHistory: (window as ReviewPassiveWindow).__reviewEnterPassive?.history.slice() ?? [],
            reviewDom: Array.from(document.querySelectorAll('.review-backdrop, .review-dialog')).map(summarize) };
        });
        console.log('FOCUS_BOUNDARY_DIAGNOSTIC', JSON.stringify({ callsite: 'completed-session-review-opener', observation, ...raw }));
      } catch (diagnosticError) {
        console.log('FOCUS_BOUNDARY_DIAGNOSTIC_ERROR', JSON.stringify({ callsite: 'completed-session-review-opener', observation, error: String(diagnosticError) }));
      }
    };
    try {
      try {
        await opener.focus();
        if (origin === 'completed-session') await observeFocus('after-focus');
        await expect(opener).toBeFocused();
      } catch (error) {
        if (origin === 'completed-session') await observeFocus('first-focus-failure');
        throw error;
      }
      const dialog = page.getByRole('dialog', { name: origin === 'empty-home' ? '복습 센터' : '내 실수 복습', exact: true });
      try {
        await page.keyboard.down('Enter');
        await expect(dialog).toBeVisible();
      } catch (error) {
        if (origin === 'completed-session') await observeFocus('first-open-failure');
        throw error;
      }
      if (origin === 'completed-session') await observeFocus('first-open-success');
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
    } finally {
      // Earlier setup failures use page-fixture disposal; cleanup must not replace the first failure.
      await page.evaluate(() => {
        (window as ReviewPassiveWindow).__reviewEnterPassive?.stop();
        delete (window as ReviewPassiveWindow).__reviewEnterPassive;
      }).catch((error) => console.log('REVIEW_PASSIVE_CLEANUP_ERROR', JSON.stringify({ origin, error: String(error) })));
    }
  });
}
