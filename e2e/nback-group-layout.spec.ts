import { expect, test } from '@playwright/test';

const scenarios: Array<{ name: string; width: number; height: number; containerWidth?: number }> = [
  { name: '1265×712 두 단 설정', width: 1265, height: 712 },
  { name: '실제 컨테이너 979px', width: 1003, height: 712, containerWidth: 979 },
  { name: '실제 컨테이너 981px', width: 1005, height: 712, containerWidth: 981 },
  { name: '620px 모바일 경계', width: 620, height: 778 },
  { name: '621px 가로 카드 경계', width: 621, height: 778 },
  { name: '383px 모바일', width: 383, height: 778 },
];

for (const scenario of scenarios) {
  test(`N-back 묶음 카드 ${scenario.name}에서 제목과 미리보기가 겹치거나 잘리지 않는다`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.addInitScript(() => {
      localStorage.setItem('nineflow-nback-preferences-v1', JSON.stringify({ task: 'n2', group: 0, progression: 'fixed' }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
    const stage = page.locator('section[data-game="nback"]');
    await expect(stage).toBeVisible();

    if (scenario.containerWidth !== undefined) {
      // The breakpoint is a container query, not a viewport media query.
      // Adjust only the real viewport if scrollbar/platform widths differ.
      const measuredWidth = await stage.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      await page.setViewportSize({
        width: scenario.width + Math.round(scenario.containerWidth - measuredWidth),
        height: scenario.height,
      });
      await expect.poll(() => stage.evaluate((element) => {
        const style = getComputedStyle(element);
        return Math.round(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      })).toBe(scenario.containerWidth);
    }

    await stage.locator('.practice-advanced-settings > summary').click();
    const group = stage.getByRole('radiogroup', { name: '출제 도형 묶음' });
    const cards = group.getByRole('radio');
    await expect(cards).toHaveCount(6);
    await expect(cards.locator('b')).toHaveText(['자동 선택', '묶음 1', '묶음 2', '묶음 3', '묶음 4', '묶음 5']);
    await expect(group.locator('.nback-group-preview canvas')).toHaveCount(15);
    await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => document.fonts.ready);

    const geometry = await group.evaluate((element) => {
      const bounds = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const text = (node: HTMLElement) => {
        const style = getComputedStyle(node);
        const range = document.createRange();
        range.selectNodeContents(node);
        return {
          value: node.textContent?.trim(),
          box: bounds(node),
          contentWidth: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
          lines: Array.from(range.getClientRects(), (rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })),
        };
      };
      const panel = element.closest<HTMLElement>('.stage-panel')!;
      const intro = element.closest<HTMLElement>('.stage-intro')!;
      const panelStyle = getComputedStyle(panel);
      return {
        containerWidth: panel.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight),
        introLayout: getComputedStyle(intro.querySelector('.intro-config-grid')!).display,
        grid: bounds(element),
        overflow: {
          grid: element.scrollWidth - element.clientWidth,
          intro: intro.scrollWidth - intro.clientWidth,
          panel: panel.scrollWidth - panel.clientWidth,
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
        },
        cards: Array.from(element.querySelectorAll<HTMLButtonElement>(':scope > button'), (button) => ({
          box: bounds(button),
          title: text(button.querySelector('b')!),
          caption: text(button.querySelector('small')!),
          preview: bounds(button.querySelector('.nback-group-preview')!),
          glyphs: Array.from(button.querySelectorAll('canvas'), bounds),
          overflowX: button.scrollWidth - button.clientWidth,
          overflowY: button.scrollHeight - button.clientHeight,
        })),
      };
    });
    await testInfo.attach('nback-group-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });

    expect.soft(geometry.introLayout, '실제 컨테이너 폭에 맞는 한 단/두 단 배치').toBe(geometry.containerWidth >= 980 ? 'grid' : 'flex');
    for (const [name, overflow] of Object.entries(geometry.overflow)) {
      expect.soft(overflow, `${name} 가로 넘침`).toBeLessThanOrEqual(1);
    }
    if (scenario.width <= 620) {
      const firstRow = geometry.cards.filter((card) => Math.abs(card.box.top - geometry.cards[0].box.top) <= 2);
      expect.soft(firstRow, '모바일의 기존 두 열 배치를 보존한다').toHaveLength(2);
    }
    for (const [index, card] of geometry.cards.entries()) {
      const label = card.title.value ?? `카드 ${index}`;
      expect.soft(card.title.contentWidth, `${label} 제목이 한 글자씩 나뉘지 않을 폭`).toBeGreaterThanOrEqual(card.title.fontSize * 2.5);
      expect.soft(card.title.box.height, `${label} 제목 높이`).toBeLessThanOrEqual(card.title.lineHeight * (index === 0 ? 2 : 1) + 1);
      expect.soft(card.title.lines.length, `${label} 제목 줄 수`).toBeLessThanOrEqual(index === 0 ? 2 : 1);
      expect.soft(card.caption.contentWidth, `${label} 암기명 표시 폭`).toBeGreaterThanOrEqual(card.caption.fontSize * 3);
      expect.soft(card.caption.box.height, `${label} 암기명 높이`).toBeLessThanOrEqual(card.caption.lineHeight * 3 + 1);
      expect.soft(card.overflowX, `${label} 내부 가로 넘침`).toBeLessThanOrEqual(1);
      expect.soft(card.overflowY, `${label} 내부 세로 잘림`).toBeLessThanOrEqual(1);
      expect.soft(card.preview.width, `${label} 미리보기 너비`).toBeGreaterThan(0);
      expect.soft(card.preview.height, `${label} 미리보기 높이`).toBeGreaterThan(0);
      expect.soft(card.glyphs).toHaveLength(index === 0 ? 0 : 3);

      for (const item of [card.title, card.caption]) {
        expect.soft(item.value, `${label} 텍스트 누락`).toBeTruthy();
        expect.soft(item.lines.length, `${label} 글자 영역 누락`).toBeGreaterThan(0);
        for (const line of item.lines) {
          expect.soft(line.width, `${label} 글자 너비`).toBeGreaterThan(0);
          expect.soft(line.height, `${label} 글자 높이`).toBeGreaterThan(0);
          expect.soft(line.left, `${label} 글자 왼쪽 잘림`).toBeGreaterThanOrEqual(item.box.left - 1);
          expect.soft(line.right, `${label} 글자 오른쪽 잘림`).toBeLessThanOrEqual(item.box.right + 1);
          expect.soft(line.top, `${label} 글자 위쪽 잘림`).toBeGreaterThanOrEqual(card.box.top - 1);
          expect.soft(line.bottom, `${label} 글자 아래쪽 잘림`).toBeLessThanOrEqual(card.box.bottom + 1);
          const overlapX = Math.min(line.right, card.preview.right) - Math.max(line.left, card.preview.left);
          const overlapY = Math.min(line.bottom, card.preview.bottom) - Math.max(line.top, card.preview.top);
          expect.soft(overlapX <= 1 || overlapY <= 1, `${label} 글자와 미리보기 겹침`).toBe(true);
        }
      }
      for (const visual of [card.preview, ...card.glyphs]) {
        expect.soft(visual.width, `${label} 도형 너비`).toBeGreaterThan(0);
        expect.soft(visual.height, `${label} 도형 높이`).toBeGreaterThan(0);
        expect.soft(visual.left, `${label} 미리보기 왼쪽 잘림`).toBeGreaterThanOrEqual(card.box.left - 1);
        expect.soft(visual.right, `${label} 미리보기 오른쪽 잘림`).toBeLessThanOrEqual(card.box.right + 1);
        expect.soft(visual.top, `${label} 미리보기 위쪽 잘림`).toBeGreaterThanOrEqual(card.box.top - 1);
        expect.soft(visual.bottom, `${label} 미리보기 아래쪽 잘림`).toBeLessThanOrEqual(card.box.bottom + 1);
      }
      if (scenario.width <= 620) {
        expect.soft(card.preview.top, `${label} 모바일 제목 아래 도형`).toBeGreaterThanOrEqual(card.title.box.bottom - 1);
        expect.soft(card.caption.box.top, `${label} 모바일 도형 아래 암기명`).toBeGreaterThanOrEqual(card.preview.bottom - 1);
      } else {
        expect.soft(card.preview.left, `${label} 데스크톱 본문 오른쪽 도형`).toBeGreaterThanOrEqual(card.caption.box.right - 1);
      }
    }

    if (scenario.width === 1265) {
      await cards.nth(1).press('ArrowRight');
      await expect(cards.nth(2)).toHaveAttribute('aria-checked', 'true');
      await expect(cards.nth(2)).toBeFocused();
      await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'false');
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nineflow-nback-preferences-v1') ?? '{}').group)).toBe(1);
    }
    expect(runtimeErrors).toEqual([]);
  });
}
