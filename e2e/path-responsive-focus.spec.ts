import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function captureFocus(page: Page, testInfo: TestInfo, name: string) {
  const state = await page.evaluate(() => {
    const active = document.activeElement;
    const describe = (element: Element) => {
      const button = element as HTMLElement;
      const bounds = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        className: element.className,
        ariaLabel: element.getAttribute('aria-label'),
        cell: element.getAttribute('data-cell'),
        cycleCell: element.getAttribute('data-cycle-cell'),
        orientation: element.getAttribute('data-orientation'),
        display: getComputedStyle(element).display,
        visible: button.offsetParent !== null,
        tabIndex: button.tabIndex,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        html: element.matches('button') ? element.outerHTML : null,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      compact: matchMedia('(max-width: 900px), (pointer: coarse)').matches,
      active: active ? describe(active) : null,
      controls: [...document.querySelectorAll('.path-grid button')].filter((element) =>
        ['6', '7'].includes(element.getAttribute('data-cell') ?? element.getAttribute('data-cycle-cell') ?? ''),
      ).map(describe),
      fences: [...document.querySelectorAll('.path-cell')].map((element) => element.getAttribute('data-fence')),
    };
  });
  const statePath = testInfo.outputPath(`${name}.json`);
  await writeFile(statePath, JSON.stringify(state, null, 2));
  await testInfo.attach(name, { path: statePath, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

for (const [from, to] of [[1024, 844], [844, 1024]]) {
  test(`길 만들기 ${from}→${to}px 전환 후 같은 칸의 키보드 조작이 이어진다`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: from, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ path: { quantity: 3, paceMs: 120000 } }));
      localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ path: true }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
    await page.locator('section[data-game="path"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
    await expect(page.locator('.path-shell')).toBeVisible({ timeout: 8_000 });

    const control = (width: number, cell: number) => page.locator(width > 900
      ? `.path-fence-choice[data-cell="${cell}"][data-orientation="slash"]`
      : `.path-fence-cycle[data-cycle-cell="${cell}"]`);
    await expect(control(from, 0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(control(from, 6)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.path-cell').nth(6)).toHaveAttribute('data-fence', 'slash');
    await captureFocus(page, testInfo, 'before-resize');

    await page.setViewportSize({ width: to, height: 768 });
    await expect(control(to, 6)).toBeVisible();
    await expect(control(from, 6)).toBeHidden();
    await expect.soft(control(to, 6), '표시 방식이 바뀌어도 같은 칸에 포커스가 남아야 한다').toBeFocused({ timeout: 1_000 });
    await captureFocus(page, testInfo, 'after-resize');

    // Locator.press() would refocus its target and mask the regression.
    await page.keyboard.press('ArrowRight');
    await expect.soft(control(to, 7), '화면 전환 후 방향키로 다음 칸에 이동해야 한다').toBeFocused({ timeout: 1_000 });
    await page.keyboard.press('Enter');
    await expect.soft(page.locator('.path-cell').nth(7), '화면 전환 후 Enter로 울타리를 배치해야 한다').toHaveAttribute('data-fence', 'slash', { timeout: 1_000 });
    await captureFocus(page, testInfo, 'after-arrow-enter');

    const submit = page.getByRole('button', { name: '경로 확인', exact: true });
    await submit.focus();
    await page.setViewportSize({ width: from, height: 768 });
    await expect(submit, '화면 크기 변경이 제출 버튼의 포커스를 빼앗지 않아야 한다').toBeFocused();

    await page.locator('.game-workspace .session-close').click();
    const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?' });
    await expect(confirmation).toBeVisible();
    await page.setViewportSize({ width: to, height: 768 });
    await expect.poll(() => confirmation.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  });
}
