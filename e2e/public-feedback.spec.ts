import { expect, test } from '@playwright/test';
import { publicFeedbackEntries } from '../app/lib/feedback';
import { contrastRatio } from './color-contrast';

for (const nested of [false, true]) {
  test(`${nested ? '연습 설정' : '홈'} 의견창의 첫 초점은 빠른 입력보다 늦게 실행되지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    if (nested) await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
    const opener = nested
      ? page.locator('section[data-game="rps"]').getByRole('button', { name: '문제 신고', exact: true })
      : page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기', exact: true });
    await page.evaluate(() => {
      const nativeRequest = window.requestAnimationFrame;
      const nativeCancel = window.cancelAnimationFrame;
      const pending = new Map<number, FrameRequestCallback>();
      let nextHandle = -1;
      window.requestAnimationFrame = callback => { const id = nextHandle--; pending.set(id, callback); return id; };
      window.cancelAnimationFrame = id => { if (!pending.delete(id)) nativeCancel.call(window, id); };
      (window as Window & { __releaseFeedbackOpeningFrames?: () => void }).__releaseFeedbackOpeningFrames = () => {
        window.requestAnimationFrame = nativeRequest;
        window.cancelAnimationFrame = nativeCancel;
        for (const callback of pending.values()) callback(performance.now());
        pending.clear();
      };
    });
    try {
      await opener.press('Enter');
      const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
      await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
      const message = dialog.locator('textarea');
      const value = '창을 열자마자 입력한 의견을 보존해 주세요.';
      await message.fill(value);
      const beforeRelease = await message.evaluate(input => ({ value: (input as HTMLTextAreaElement).value, focused: document.activeElement === input, locked: document.body.style.position === 'fixed' }));
      console.log('FEEDBACK_OPEN_FOCUS_BEFORE_RELEASE', JSON.stringify({ nested, ...beforeRelease }));
      expect(beforeRelease).toEqual({ value, focused: true, locked: true });
      await page.evaluate(() => (window as Window & { __releaseFeedbackOpeningFrames?: () => void }).__releaseFeedbackOpeningFrames!());
      const afterRelease = await message.evaluate(input => ({ value: (input as HTMLTextAreaElement).value, focused: document.activeElement === input, locked: document.body.style.position === 'fixed' }));
      console.log('FEEDBACK_OPEN_FOCUS_AFTER_RELEASE', JSON.stringify({ nested, ...afterRelease }));
      expect(afterRelease).toEqual(beforeRelease);
      await expect(message).toHaveValue(value);
      await expect(message).toBeFocused();
      await expect(dialog.getByRole('button', { name: /GitHub에서 검토 후 제출/ })).toBeEnabled();
      await dialog.screenshot({ path: testInfo.outputPath(`feedback-first-input-${nested}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const returnedFocus = await opener.evaluate(button => ({ focused: document.activeElement === button, inert: Boolean(button.closest('[inert]')), locked: document.body.style.position === 'fixed' }));
      console.log('FEEDBACK_CLOSE_RETURN_FOCUS', JSON.stringify({ nested, ...returnedFocus }));
      await expect(opener).toBeFocused();
      const settledFocus = await opener.evaluate(button => ({ focused: document.activeElement === button, inert: Boolean(button.closest('[inert]')), locked: document.body.style.position === 'fixed' }));
      console.log('FEEDBACK_CLOSE_SETTLED_FOCUS', JSON.stringify({ nested, ...settledFocus }));
      expect(settledFocus).toEqual({ focused: true, inert: false, locked: nested });
      await opener.screenshot({ path: testInfo.outputPath(`feedback-return-focus-${nested}.png`) });
      if (nested) await expect(page.locator('section[data-game="rps"]')).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => (window as Window & { __releaseFeedbackOpeningFrames?: () => void }).__releaseFeedbackOpeningFrames?.());
    }
  });
}

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
    const message = dialog.locator('textarea');
    await message.fill('가'.repeat(1000));
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

for (const nested of [false, true]) {
  test(`${nested ? '연습 설정 큰 글자' : '홈'} 오류 작성 안내는 입력·복사 내용을 바꾸거나 개인정보를 자동 첨부하지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const githubRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/(^|\.)(github\.com|githubusercontent\.com)$/.test(new URL(request.url()).hostname)) githubRequests.push(request.url()); });
    await page.addInitScript(() => {
      const actions = { opened: [] as string[], copied: [] as string[] };
      (window as Window & { __feedbackGuideActions?: typeof actions }).__feedbackGuideActions = actions;
      window.open = ((url?: string | URL) => { actions.opened.push(String(url)); return null; }) as typeof window.open;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { actions.copied.push(text); } } });
    });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    if (nested) {
      await page.locator('.readiness-banner button').click();
      const preparation = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
      await preparation.getByRole('button', { name: '고대비', exact: true }).click();
      await preparation.getByRole('button', { name: '큰 글자', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(preparation).toHaveCount(0);
    }
    const homeGameOpener = page.locator('.game-card-hitarea[aria-describedby="rps-summary"]');
    const stage = page.locator('section[data-game="rps"]');
    if (nested) await homeGameOpener.click();
    const opener = nested ? stage.getByRole('button', { name: '문제 신고', exact: true }) : page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기', exact: true });
    const storage = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
    const beforeStorage = await storage();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '의견 보내기', exact: true });
    const message = dialog.locator('textarea');
    const category = dialog.getByRole('combobox', { name: '의견 유형', exact: true });
    const guide = dialog.locator('#feedback-writing-guide');
    const guideText = '오류 제보는 시작 후 대략 언제 · 어느 단계(설정·진행·결과) · 기대한 동작 · 실제 현상 순서로 적어 주세요. 모르는 항목은 생략해도 됩니다. 점수·답안·개인정보는 적지 마세요.';
    const capture = async (phase: string) => {
      const view = await page.evaluate(() => {
        const dialog = document.querySelector('.feedback-dialog');
        const input = dialog?.querySelector('textarea');
        const guide = dialog?.querySelector('#feedback-writing-guide');
        const style = guide ? getComputedStyle(guide) : null;
        const box = guide?.getBoundingClientRect();
        const opacities: string[] = [];
        for (let parent = guide; parent; parent = parent.parentElement) opacities.push(getComputedStyle(parent).opacity);
        return {
          viewport: { width: innerWidth, height: innerHeight }, contrast: document.documentElement.dataset.contrast, textScale: document.documentElement.dataset.textScale,
          open: Boolean(dialog), value: input?.value, describedBy: input?.getAttribute('aria-describedby'), category: dialog?.querySelector('select')?.value,
          counter: dialog?.querySelector('.feedback-message small')?.textContent, focused: document.activeElement?.tagName,
          guide: guide && style && box ? { text: guide.textContent, font: parseFloat(style.fontSize), color: style.color, background: getComputedStyle(dialog!).backgroundColor, backgroundImage: style.backgroundImage, opacities, fits: guide.scrollWidth <= guide.clientWidth, box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height } } : null,
          dialogFits: !dialog || dialog.scrollWidth <= dialog.clientWidth, documentFits: document.documentElement.scrollWidth <= innerWidth,
          actions: (window as Window & { __feedbackGuideActions?: { opened: string[]; copied: string[] } }).__feedbackGuideActions!,
        };
      });
      const sample = { phase, nested, ...view, ratio: view.guide ? contrastRatio(view.guide.color, view.guide.background) : null, saved: await storage(), errors: [...errors], githubRequests: [...githubRequests] };
      console.log('FEEDBACK_WRITING_GUIDE', JSON.stringify(sample));
      await testInfo.attach(`feedback-writing-${phase}.json`, { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`feedback-writing-${phase}.png`) });
      return sample;
    };
    const initial = await capture('initial');
    expect(initial.category).toBe(nested ? 'bug' : 'feature');
    expect(initial.value).toBe('');
    expect(initial.counter).toBe('0 / 1000');
    expect(initial.guide?.text ?? null).toBe(nested ? guideText : null);
    await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
    await category.selectOption('bug');
    const emptyBug = await capture('bug-empty');
    expect(emptyBug.value).toBe('');
    expect(emptyBug.actions).toEqual({ opened: [], copied: [] });
    expect(emptyBug.describedBy).toBe('feedback-public-notice feedback-writing-guide');
    await expect(message).toHaveAccessibleDescription(/제출 내용은 GitHub에 공개됩니다\.[\s\S]*오류 제보는 시작 후 대략 언제/);
    await expect(dialog.getByRole('button', { name: /GitHub에서 검토 후 제출/ })).toBeDisabled();
    const value = '시작 후 약 10초 · 진행 단계\n기대: 다음 화면 이동\n실제: 버튼을 눌러도 같은 화면입니다.';
    await message.fill(value);
    const typed = await capture('typed');
    expect(typed.value).toBe(value);
    expect(typed.counter).toBe(`${Array.from(value).length} / 1000`);
    expect(typed.guide?.text).toBe(guideText);
    await category.selectOption('feature');
    const other = await capture('feature-retained');
    expect(other.value).toBe(value);
    expect(other.guide).toBeNull();
    expect(other.describedBy).toBe('feedback-public-notice');
    await category.selectOption('bug');
    await expect(message).toHaveValue(value);
    await guide.scrollIntoViewIfNeeded();
    const portrait = await capture('portrait');
    await expect(guide).toBeVisible();
    await page.setViewportSize({ width: 844, height: 360 });
    await guide.scrollIntoViewIfNeeded();
    const landscape = await capture('landscape');
    await expect(guide).toBeVisible();
    for (const sample of [portrait, landscape]) {
      expect(sample.guide?.text).toBe(guideText);
      expect(sample.guide?.font).toBeGreaterThanOrEqual(nested ? 14 : 13);
      expect(sample.guide?.fits).toBe(true);
      expect(sample.guide?.box.height).toBeGreaterThan(0);
      expect(sample.guide?.box.top).toBeGreaterThanOrEqual(0);
      expect(sample.guide?.box.bottom).toBeLessThanOrEqual(sample.viewport.height);
      expect(sample.guide?.box.left).toBeGreaterThanOrEqual(0);
      expect(sample.guide?.box.right).toBeLessThanOrEqual(sample.viewport.width);
      expect(sample.guide?.opacities.every(opacity => opacity === '1')).toBe(true);
      expect(sample.guide?.backgroundImage).toBe('none');
      expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
      expect(sample.dialogFits).toBe(true);
      expect(sample.documentFits).toBe(true);
      expect(sample.saved).toEqual(beforeStorage);
    }
    await message.focus();
    await page.keyboard.press('Tab');
    const environment = dialog.getByRole('checkbox', { name: /비식별 환경정보 함께 보내기/ });
    await expect(environment).toBeFocused();
    await page.keyboard.press('Space');
    await expect(environment).not.toBeChecked();
    await dialog.getByRole('button', { name: '내용 복사', exact: true }).click();
    await expect(dialog.locator('.feedback-status')).toContainText('의견 내용을 복사했습니다.');
    const copied = await capture('copied');
    const game = nested ? '가위바위보' : '사이트 전체';
    const expectedCopy = `[오류 제보] ${game}\n\n## 의견\n\n${value}\n\n## 관련 항목\n\n- 유형: 오류 제보\n- 게임: ${game}${nested ? '\n- 진행 모드: 연습 모드' : ''}\n\n> 이 의견은 NINEFLOW LAB의 공개 피드백 창구를 통해 작성되었습니다.`;
    expect(copied.actions).toEqual({ opened: [], copied: [expectedCopy] });
    expect(copied.value).toBe(value);
    expect(copied.saved).toEqual(beforeStorage);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    if (nested) await expect(stage.locator('.stage-content')).not.toHaveAttribute('inert', '');
    await opener.click();
    const reopened = await capture('reopened');
    expect(reopened.value).toBe('');
    expect(reopened.counter).toBe('0 / 1000');
    expect(reopened.category).toBe(nested ? 'bug' : 'feature');
    expect(reopened.saved).toEqual(beforeStorage);
    await page.keyboard.press('Escape');
    if (nested) {
      await page.keyboard.press('Escape');
      await expect(stage).toHaveCount(0);
      await expect(homeGameOpener).toBeFocused();
    }
    expect(githubRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
