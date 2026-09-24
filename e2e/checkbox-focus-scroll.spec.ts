import { expect, test, type Locator, type Page } from '@playwright/test';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 100; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, '실제 Tab 이동으로 설정에 도달해야 합니다').toBeFocused();
}

const scenarios = [
  { gameId: 'nback', title: '도형 순서 기억하기', checkbox: '시간 제한 없이 연습', viewport: { width: 383, height: 778 } },
  { gameId: 'nback', title: '도형 순서 기억하기', checkbox: '시간 제한 없이 연습', viewport: { width: 844, height: 360 } },
  { gameId: 'nback', title: '도형 순서 기억하기', checkbox: '시간 제한 없이 연습', viewport: { width: 1280, height: 900 } },
  { gameId: 'rotation', title: '도형 회전하기', checkbox: '단계별 과정 미리보기', viewport: { width: 383, height: 778 } },
] as const;

for (const scenario of scenarios) {
  test(`${scenario.title} ${scenario.checkbox} Tab 포커스는 ${scenario.viewport.width}×${scenario.viewport.height} 설정 화면을 유지한다`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    await page.setViewportSize(scenario.viewport);
    await page.goto('/');
    const opener = page.getByRole('button', { name: new RegExp(`${scenario.title}, 난이도 .+, 설정 열기`) });
    await opener.click();
    const stage = page.locator(`section[data-game="${scenario.gameId}"]`);
    await expect(stage).toBeVisible();
    await expect(stage.getByRole('button', { name: '게임 바꾸기' })).toBeFocused();

    if (scenario.gameId === 'rotation') {
      const advanced = stage.locator('.practice-advanced-settings');
      await tabTo(page, advanced.locator('> summary'));
      await page.keyboard.press('Enter');
      await expect(advanced).toHaveAttribute('open', '');
    }
    const checkbox = stage.getByRole('checkbox', { name: new RegExp(scenario.checkbox) });
    const initiallyChecked = await checkbox.isChecked();
    await tabTo(page, checkbox);
    await expect(checkbox).toBeFocused();
    await expect(checkbox).toBeChecked({ checked: initiallyChecked });

    // Measure before Space: the broken absolute input scrolls the outer panel
    // even though ordinary label clicks continue to work.
    const geometry = await checkbox.evaluate((element) => {
      const box = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
      };
      const panel = element.closest<HTMLElement>('.stage-panel')!;
      const intro = element.closest<HTMLElement>('.stage-intro')!;
      return {
        panelScrollTop: panel.scrollTop,
        panelScrollHeight: panel.scrollHeight,
        introScrollTop: intro.scrollTop,
        intro: box(intro),
        input: box(element),
        inputOffsetParent: (element as HTMLElement).offsetParent?.className,
        label: box(element.closest('label')!),
        toolbar: box(panel.querySelector('.stage-intro-toolbar')!),
        startButtons: Array.from(panel.querySelectorAll('.intro-start-options button')).map(box),
      };
    });
    await testInfo.attach('checkbox-focus-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    await testInfo.attach('checkbox-focus-viewport', { body: await page.screenshot(), contentType: 'image/png' });
    expect.soft(geometry.panelScrollTop, '바깥 패널은 스크롤되지 않아야 합니다').toBe(0);
    expect.soft(geometry.startButtons).toHaveLength(2);
    for (const [name, rect] of [
      ['체크박스 라벨', geometry.label],
      ['상단 도구 모음', geometry.toolbar],
      ...geometry.startButtons.map((rect, index) => [`시작 버튼 ${index + 1}`, rect] as const),
    ] as const) {
      expect.soft(rect.width, name).toBeGreaterThan(0);
      expect.soft(rect.height, name).toBeGreaterThan(0);
      expect.soft(rect.left, name).toBeGreaterThanOrEqual(-1);
      expect.soft(rect.right, name).toBeLessThanOrEqual(scenario.viewport.width + 1);
      expect.soft(rect.top, name).toBeGreaterThanOrEqual(-1);
      expect.soft(rect.bottom, name).toBeLessThanOrEqual(scenario.viewport.height + 1);
    }
    // Native focus scrolling rounds scroll offsets; allow border/subpixel rounding only.
    expect.soft(geometry.label.top, '라벨이 스크롤 영역의 상단에 가리지 않아야 합니다').toBeGreaterThanOrEqual(geometry.intro.top - 2);
    expect.soft(geometry.label.bottom, '라벨이 시작 버튼 영역에 가리지 않아야 합니다').toBeLessThanOrEqual(geometry.intro.bottom + 2);

    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked({ checked: !initiallyChecked });
    await expect(checkbox).toBeFocused();
    expect.soft(await stage.evaluate((element) => element.scrollTop)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(stage).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });
}
