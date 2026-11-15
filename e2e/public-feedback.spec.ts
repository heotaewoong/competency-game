import { expect, test } from '@playwright/test';
import { publicFeedbackEntries } from '../app/lib/feedback';

test('별점 방향키 직후 의견 입력으로 이동하면 예약된 초점이 입력을 방해하지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기' }).click();
  const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
  await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
  const rating = dialog.locator('input[name="feedback-rating"][value="1"]');
  await rating.focus();
  // Keep both actions in one task so a deferred rating callback cannot win by chance.
  await rating.evaluate((input) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    input.closest('[role="dialog"]')!.querySelector('textarea')!.focus();
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(dialog.locator('input[name="feedback-rating"][value="2"]')).toBeChecked();
  await expect(dialog.locator('textarea')).toBeFocused();
});

for (const nested of [false, true]) {
  for (const long of [false, true]) {
    test(`${nested ? '연습 설정' : '홈'}의 ${long ? '긴' : '짧은'} 의견: 유지된 Enter는 제출과 복사를 반복하지 않는다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        const state = window as Window & { __feedbackActions?: { opened: string[]; copied: string[] } };
        const actions = { opened: [] as string[], copied: [] as string[] };
        state.__feedbackActions = actions;
        window.open = ((url?: string | URL) => { actions.opened.push(String(url)); return null; }) as typeof window.open;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (value: string) => { actions.copied.push(value); } },
        });
      });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      if (nested) {
        await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
        await page.locator('section[data-game="rps"]').getByRole('button', { name: '문제 신고', exact: true }).click();
      } else {
        await page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기' }).click();
      }
      const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
      await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
      const message = dialog.locator('textarea');
      await message.fill('입력 보존');
      await page.keyboard.down('Enter');
      await page.keyboard.down('Enter');
      await page.keyboard.up('Enter');
      await page.keyboard.down('Space');
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
      await expect(message).toHaveValue('입력 보존\n\n  ');
      await dialog.locator('.feedback-rating label').filter({ has: page.locator('input[value="1"]') }).click();
      await dialog.locator('input[name="feedback-rating"][value="1"]').focus();
      await page.keyboard.down('ArrowRight');
      await expect(dialog.locator('input[name="feedback-rating"][value="2"]')).toBeFocused();
      await page.keyboard.down('ArrowRight');
      await page.keyboard.up('ArrowRight');
      await expect(dialog.locator('input[name="feedback-rating"][value="3"]')).toBeChecked();
      await message.fill(long ? '가'.repeat(1000) : '반복 입력을 확인하는 테스트 의견입니다.');
      const submit = dialog.getByRole('button', { name: long ? /복사 후 GitHub 열기/ : /GitHub에서 검토 후 제출/ });
      await submit.focus();
      for (let press = 0; press < 4; press += 1) await page.keyboard.down('Enter');
      const actions = () => page.evaluate(() => (window as Window & { __feedbackActions?: { opened: string[]; copied: string[] } }).__feedbackActions!);
      expect((await actions()).opened).toHaveLength(1);
      expect((await actions()).copied).toHaveLength(long ? 1 : 0);
      await page.keyboard.up('Enter');
      await page.keyboard.press('Enter');
      expect((await actions()).opened).toHaveLength(2);
      await submit.click();
      expect((await actions()).opened).toHaveLength(3);
      const beforeCopy = (await actions()).copied.length;
      await dialog.getByRole('button', { name: '내용 복사', exact: true }).focus();
      for (let press = 0; press < 4; press += 1) await page.keyboard.down('Enter');
      expect((await actions()).copied).toHaveLength(beforeCopy + 1);
      await page.keyboard.up('Enter');
      await page.keyboard.press('Space');
      expect((await actions()).copied).toHaveLength(beforeCopy + 2);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      if (nested) await expect(page.locator('section[data-game="rps"]')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

for (const clipboardFailure of ['missing', 'sync-throw', 'rejected'] as const) {
  test(`긴 의견의 클립보드 ${clipboardFailure} 실패는 수동 복사로 복구한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((failure) => {
      const state = window as Window & { __feedbackOpened?: string[] };
      state.__feedbackOpened = [];
      window.open = ((url?: string | URL) => { state.__feedbackOpened!.push(String(url)); return null; }) as typeof window.open;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: failure === 'missing' ? undefined : {
          writeText: () => {
            if (failure === 'sync-throw') throw new Error('Clipboard unavailable');
            return Promise.reject(new Error('Clipboard permission denied'));
          },
        },
      });
    }, clipboardFailure);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기' }).click();
    const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
    await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
    const message = dialog.locator('textarea');
    await message.fill('가'.repeat(1000));
    await expect(message).toHaveValue('가'.repeat(1000));
    await dialog.getByRole('button', { name: /복사 후 GitHub 열기/ }).click();
    await expect(dialog.locator('.feedback-status')).toContainText('자동 복사가 차단됐습니다');
    await expect(message).toHaveValue('가'.repeat(1000));
    await expect(message).toBeFocused();
    expect(await message.evaluate((input) => input instanceof HTMLTextAreaElement ? [input.selectionStart, input.selectionEnd] : null)).toEqual([0, 1000]);
    const opened = await page.evaluate(() => (window as Window & { __feedbackOpened?: string[] }).__feedbackOpened!);
    expect(opened).toHaveLength(1);
    expect(new URL(opened[0]).searchParams.has('body')).toBe(false);
    expect(errors).toEqual([]);
    await dialog.screenshot({ path: testInfo.outputPath('clipboard-fallback.png') });
  });
}

for (const width of [320, 390, 621, 760, 900, 1280]) {
  test(`${width}px 선별 의견 현황에서 제출창을 열고 닫아도 초점과 화면이 유지된다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const githubRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (/(^|\.)(github\.com|githubusercontent\.com)$/.test(new URL(request.url()).hostname)) githubRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#feedback');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const section = page.getByRole('region', { name: '개선 의견과 처리 현황' });
    await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(section).toContainText('실시간 접수함은 아닙니다.');
    await expect(section.locator('li')).toHaveCount(publicFeedbackEntries.length);
    if (publicFeedbackEntries.length === 0) await expect(section.getByRole('heading', { name: '아직 홈페이지에 공개한 개선 의견이 없습니다.' })).toBeVisible();
    for (const entry of publicFeedbackEntries) {
      const item = section.getByRole('article').filter({ has: page.getByRole('heading', { name: entry.title, exact: true }) });
      await expect(item).toContainText(entry.status);
      await expect(item).toContainText(entry.response);
    }
    expect(await section.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const opener = section.getByRole('button', { name: '개선 의견 보내기' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('제출 내용은 GitHub에 공개됩니다.')).toBeVisible();
    await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '의견 보내기 닫기' })).toBeFocused();
    await dialog.locator('textarea').fill('의견 처리 상태를 홈페이지에서 확인하고 싶습니다.');
    await expect(dialog.getByRole('button', { name: /GitHub에서 검토 후 제출/ })).toBeEnabled();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    const requestsLink = section.getByRole('link', { name: '공개 요청 목록, GitHub 새 창으로 열기', exact: true });
    await expect(requestsLink).toContainText('공개 요청 목록 (GitHub)');
    await expect(requestsLink).toHaveAttribute('href', 'https://github.com/heotaewoong/competency-game/issues');
    await expect(requestsLink).toHaveAttribute('target', '_blank');
    await expect(requestsLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(requestsLink.locator('span')).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Tab');
    await expect(requestsLink).toBeFocused();
    const linkLayout = await requestsLink.evaluate((link) => {
      const box = link.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(link);
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const outline = getComputedStyle(link);
      return {
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
        viewport: { width: innerWidth, height: innerHeight },
        outline: { style: outline.outlineStyle, width: outline.outlineWidth, offset: outline.outlineOffset },
        textRects: Array.from(range.getClientRects(), ({ left, right, top, bottom, width, height }) => ({ left, right, top, bottom, width, height })).filter((rect) => rect.width > 0 && rect.height > 0),
        centerHit: hit === link || link.contains(hit),
        clientWidth: link.clientWidth, scrollWidth: link.scrollWidth, clientHeight: link.clientHeight, scrollHeight: link.scrollHeight,
      };
    });
    await testInfo.attach('public-request-link-layout', { body: JSON.stringify({ project: testInfo.project.name, width, layout: linkLayout }), contentType: 'application/json' });
    console.log('PUBLIC_REQUEST_LINK_LAYOUT', JSON.stringify({ project: testInfo.project.name, width, layout: linkLayout }));
    expect(linkLayout.centerHit).toBe(true);
    expect(linkLayout.box.width).toBeGreaterThanOrEqual(44);
    expect(linkLayout.box.height).toBeGreaterThanOrEqual(44);
    expect(linkLayout.box.left).toBeGreaterThanOrEqual(0);
    expect(linkLayout.box.right).toBeLessThanOrEqual(linkLayout.viewport.width);
    expect(linkLayout.box.top).toBeGreaterThanOrEqual(0);
    expect(linkLayout.box.bottom).toBeLessThanOrEqual(linkLayout.viewport.height);
    const outlineWidth = Number.parseFloat(linkLayout.outline.width);
    const outlineOffset = Number.parseFloat(linkLayout.outline.offset);
    expect(['none', 'hidden']).not.toContain(linkLayout.outline.style);
    expect(outlineWidth).toBeGreaterThan(0);
    expect(Number.isFinite(outlineOffset)).toBe(true);
    const outlineOutset = Math.max(0, outlineWidth + outlineOffset);
    expect(linkLayout.box.left - outlineOutset).toBeGreaterThanOrEqual(0);
    expect(linkLayout.box.right + outlineOutset).toBeLessThanOrEqual(linkLayout.viewport.width);
    expect(linkLayout.box.top - outlineOutset).toBeGreaterThanOrEqual(0);
    expect(linkLayout.box.bottom + outlineOutset).toBeLessThanOrEqual(linkLayout.viewport.height);
    expect(linkLayout.textRects.length).toBeGreaterThan(0);
    expect(linkLayout.scrollWidth).toBeLessThanOrEqual(linkLayout.clientWidth);
    expect(linkLayout.scrollHeight).toBeLessThanOrEqual(linkLayout.clientHeight);
    for (const rect of linkLayout.textRects) {
      expect(rect.left).toBeGreaterThanOrEqual(linkLayout.box.left);
      expect(rect.right).toBeLessThanOrEqual(linkLayout.box.right);
      expect(rect.top).toBeGreaterThanOrEqual(linkLayout.box.top);
      expect(rect.bottom).toBeLessThanOrEqual(linkLayout.box.bottom);
    }
    await page.keyboard.press('Shift+Tab');
    await expect(opener).toBeFocused();
    await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width > 620) {
      const menuFits = await page.locator('.topbar nav').evaluate((nav) => {
        const bounds = nav.getBoundingClientRect();
        return Array.from(nav.children).every((item) => {
          const box = item.getBoundingClientRect();
          return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
        });
      });
      expect(menuFits).toBe(true);
    }
    expect(githubRequests).toEqual([]);
    expect(errors).toEqual([]);
    await section.screenshot({ path: testInfo.outputPath('public-feedback.png') });
  });
}
