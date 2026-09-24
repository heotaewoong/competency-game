import { expect, test, type Locator, type Page } from '@playwright/test';

const CONFIG_KEY = 'nineflow-practice-config-v1';
const APPOINTMENT_KEY = 'nineflow-appointment-preferences-v1';
const ACCESSIBILITY_KEY = 'nineflow-accessibility-v1';
const PACING_KEY = 'nineflow-practice-pacing-v1';

async function seedPracticeConfig(page: Page) {
  await page.addInitScript(({ configKey, appointmentKey }) => {
    window.localStorage.setItem(configKey, JSON.stringify({
      appointment: { quantity: 1, paceMs: 6000 },
      count: { quantity: 5, paceMs: 2500 },
      mouse: { quantity: 1, paceMs: 3000 },
      rps: { quantity: 9, paceMs: 2500 },
      nback: { quantity: 1, paceMs: 3000 },
    }));
    window.localStorage.setItem(appointmentKey, JSON.stringify({ selectedRounds: ['location'] }));
  }, { configKey: CONFIG_KEY, appointmentKey: APPOINTMENT_KEY });
}

async function setDocumentVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((nextState) => {
    const target = document as Document & { __nineflowTestVisibility?: DocumentVisibilityState };
    target.__nineflowTestVisibility = nextState;
    if (!Object.prototype.hasOwnProperty.call(document, 'visibilityState')) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => target.__nineflowTestVisibility ?? 'visible',
      });
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

function contrastRatio(foreground: string, background: string) {
  const channels = (value: string) => {
    const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!parts || parts.length !== 3) throw new Error(`RGB 색상을 해석할 수 없습니다: ${value}`);
    return parts.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (value: string) => {
    const [red, green, blue] = channels(value);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function expectReadableChip(locator: Locator, minimumHeight?: number) {
  const styles = await locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontSize: Number.parseFloat(style.fontSize),
      minHeight: Number.parseFloat(style.minHeight),
    };
  });
  expect(styles.fontSize).toBeGreaterThanOrEqual(11);
  if (minimumHeight !== undefined) expect(styles.minHeight).toBeGreaterThanOrEqual(minimumHeight);
  expect(contrastRatio(styles.color, styles.backgroundColor)).toBeGreaterThanOrEqual(4.5);
}

test('모바일 준비 배너의 보조 문구는 작은 글씨에 필요한 대비와 크기를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const surface = page.locator('.readiness-banner');
  const background = await surface.evaluate((element) => window.getComputedStyle(element).backgroundColor);

  for (const locator of [surface.locator('dt').first(), surface.locator('.readiness-banner-action small')]) {
    const style = await locator.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return { color: computed.color, fontSize: Number.parseFloat(computed.fontSize) };
    });
    expect(style.fontSize).toBeGreaterThanOrEqual(10);
    expect(contrastRatio(style.color, background)).toBeGreaterThanOrEqual(4.5);
  }
});

async function expectControlsInsideViewport(locator: Locator, width: number, height: number) {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width + 1);
    expect(box.bottom).toBeLessThanOrEqual(height + 1);
  }
}

async function forceWorkspaceScroll(workspace: Locator) {
  const body = workspace.locator('.workspace-body');
  await body.evaluate((element) => {
    const spacer = document.createElement('div');
    spacer.dataset.scrollProbe = 'true';
    spacer.style.width = '1px';
    spacer.style.height = '900px';
    spacer.style.minHeight = '900px';
    element.appendChild(spacer);
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  return body;
}

test('약속 위치 격자는 경계 방향키에서도 페이지 스크롤을 차단한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="appointment"]');
  await expect(stage.getByLabel('라운드당 문항 현재 값')).toHaveText('1');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const beginRound = page.getByRole('button', { name: '이 라운드 시작' });
  await expect(beginRound).toBeVisible({ timeout: 8_000 });
  await beginRound.click();

  const nextFriend = page.locator('.appointment-stimulus .single-action');
  await nextFriend.click();
  await nextFriend.click();
  await nextFriend.click();

  const grid = page.locator('.location-choice-grid');
  await expect(grid).toBeVisible();
  const first = grid.getByRole('button', { name: '1행 1열' });
  const last = grid.getByRole('button', { name: '4행 4열' });

  await first.focus();
  const firstBoundary = await first.evaluate((element) => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(firstBoundary).toBe(true);
  await expect(first).toBeFocused();

  await last.focus();
  const lastBoundary = await last.evaluate((element) => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(lastBoundary).toBe(true);
  await expect(last).toBeFocused();
});

test('마법약 실전형은 선택 후 실제 제조색과 예측 성공·실패를 함께 안내한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /마법약 만들기, 난이도 중, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="potion"]');
  await stage.getByRole('radio', { name: /실전형 연습/ }).click();
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-potion');
  await expect(workspace.locator('.potion-layout')).toBeVisible({ timeout: 10_000 });
  await expect(workspace.locator('.workspace-foot > span').first()).toContainText('매 시행 성공·실패와 실제 제조색 공개');
  await expect(workspace.locator('.workspace-foot')).not.toContainText('피드백 없이 고정 설정으로 진행 중');
  await expect(workspace.locator('.workspace-foot .sr-only')).not.toContainText(/이 조합의 이전 관찰은 파랑/);

  await workspace.locator('.potion-actions button.blue').click();
  const preview = workspace.locator('.potion-result-preview');
  await expect(preview.locator('header b')).toHaveText('실제 제조색 공개');
  await expect(preview.locator('small')).toContainText(/실제 결과는 (파란 약|빨간 약)입니다/);
  await expect(preview.locator('small')).toContainText(/예측 (성공|실패)입니다/);
  await expect(preview.locator('article.is-result')).toHaveCount(1);
  await expect(preview.locator('article.is-muted')).toHaveCount(1);
  await expect(preview.locator('small')).not.toHaveAttribute('aria-live');
  await expect(workspace.locator('.workspace-foot > b')).toContainText(/예측 (성공|실패)/);
  await expect(workspace.locator('.workspace-foot > b')).toContainText(/실제 결과: (파란 약|빨간 약)/);
  await expect(workspace.locator('.workspace-foot .sr-only')).toContainText(/예측 (성공|실패)/);
  await expect(workspace.locator('.workspace-foot .sr-only')).toContainText(/실제 결과: (파란 약|빨간 약)/);
});

test('마법약 실전형의 시간 초과 실제색도 다음 동일 레시피 학습 근거에 누적한다', async ({ page }) => {
  // 100회 전체 시행을 생략하지 않고 가상 시계와 누적 근거까지 확인하므로
  // 느린 CI에서도 테스트 러너 상한이 제품 흐름보다 먼저 끝나지 않게 한다.
  test.setTimeout(360_000);
  await page.goto('/');
  await page.getByRole('button', { name: /마법약 만들기, 난이도 중, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="potion"]');
  await expect(stage).toBeVisible();
  const clockOrigin = Date.UTC(2030, 0, 1);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('radio', { name: /실전형 연습/ }).click();
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-potion');
  await expect(workspace.locator('.game-preparation')).toBeVisible();
  const potionLayout = workspace.locator('.potion-layout');
  for (let countdownStep = 0; countdownStep < 4 && !await potionLayout.isVisible(); countdownStep += 1) {
    await page.clock.runFor(1_100);
  }
  await expect(potionLayout).toBeVisible();
  const progress = workspace.locator('.workspace-progress span');
  const deadline = workspace.locator('.time-strip');
  const totalTrials = Number((await progress.textContent())?.match(/\d+\s*\/\s*(\d+)/)?.[1]);
  expect(totalTrials).toBeGreaterThan(1);

  for (let trial = 0; trial < totalTrials; trial += 1) {
    await expect(progress).toContainText(`${trial + 1} / ${totalTrials}`);
    await expect(deadline).toHaveAttribute('data-deadline-active', 'true');
    const responseLimit = Number(await deadline.getAttribute('aria-valuenow'));
    expect(responseLimit).toBeGreaterThan(0);
    await page.clock.runFor(responseLimit + 50);

    if (trial === 0) {
      await expect(workspace.locator('.potion-result-preview small')).toContainText(/시간이 끝났습니다.*실제 결과는 (파란 약|빨간 약)입니다/);
      await expect(workspace.locator('.potion-result-preview article.is-result')).toHaveCount(1);
      await expect(workspace.locator('.workspace-foot > b')).toContainText(/시간 초과.*실제 결과: (파란 약|빨간 약)/);
    }

    await page.clock.runFor(trial === totalTrials - 1 ? 600 : 920);
  }

  const result = page.locator('.stage-result');
  await expect(result).toBeVisible();
  const evidenceDetail = await result.locator('.potion-result-detail').textContent();
  const evidenceTrials = evidenceDetail?.match(/근거 판정 가능 시행\s*(\d+)\s*\/\s*(\d+)/);
  expect(evidenceTrials, '시간 초과 실제색이 누적되면 다음 블록에서 근거 판정이 가능해야 합니다.').not.toBeNull();
  expect(Number(evidenceTrials?.[1])).toBeGreaterThan(0);
  expect(Number(evidenceTrials?.[2])).toBe(totalTrials);

  await result.getByRole('button', { name: '문항별 복습' }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습' });
  await expect(review).toBeVisible();
  await expect(review.locator('.review-attempt-detail')).toContainText('시간 초과');
  await expect(review.locator('.review-facts')).toContainText(/실제결과\s*(파란 약|빨간 약)/);
  await expect(review.locator('.review-facts')).not.toContainText('비공개');
});

test('마법약 누적 근거는 연습 힌트를 켠 사용자에게만 동일하게 제공한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /마법약 만들기, 난이도 중, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="potion"]');
  await stage.locator('.practice-advanced-settings > summary').click();
  const evidenceHint = stage.getByRole('checkbox', { name: /누적 근거 힌트/ });
  await expect(evidenceHint).toBeChecked();
  await stage.getByText('누적 근거 힌트', { exact: true }).click();
  await expect(evidenceHint).not.toBeChecked();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-potion');
  await expect(workspace.locator('.potion-layout')).toBeVisible({ timeout: 10_000 });
  await expect(workspace.locator('.potion-observation')).toHaveCount(0);
  await expect(workspace.locator('.workspace-foot .sr-only')).not.toContainText(/이 조합의 이전 관찰은 파랑/);
  await expect(workspace.locator('.workspace-foot .sr-only')).toContainText(/이번 재료는 .*결과 색을 예측하세요/);
});

test('단계 표시와 라운드 칩은 모바일에서도 읽을 수 있는 크기와 대비 토큰을 사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /개수 비교하기, 난이도 하, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="count"]');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('5');
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const step = page.locator('.game-count .stage-sequence span').first();
  await expect(step).toBeVisible({ timeout: 8_000 });
  await expectReadableChip(step, 32);
  const modeChip = page.locator('.game-count .mode-chip');
  await expect(modeChip).toBeVisible();
  const modeChipLayout = await modeChip.evaluate((element) => ({
    display: window.getComputedStyle(element).display,
    whiteSpace: window.getComputedStyle(element).whiteSpace,
    rects: element.getClientRects().length,
  }));
  expect(modeChipLayout).toEqual({ display: 'inline-flex', whiteSpace: 'nowrap', rects: 1 });

  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const rpsStage = page.locator('section[data-game="rps"]');
  await expect(rpsStage.getByLabel('문제 수 현재 값')).toHaveText('9');
  await rpsStage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const roundChip = page.locator('.game-rps .round-label span');
  await expect(roundChip).toBeVisible({ timeout: 8_000 });
  await expectReadableChip(roundChip);
});

test('844×360과 901px 경계에서도 회전·길·마법약·숫자의 시간제한 조작부가 첫 화면 안에 있다', async ({ page }) => {
  test.setTimeout(180_000);
  await seedPracticeConfig(page);
  await page.setViewportSize({ width: 844, height: 360 });
  const cases = [
    { title: '도형 회전하기', difficulty: '중', ready: '.rotation-comparison', controls: '.rotation-op-grid button, .rotation-submit-row button' },
    { title: '길 만들기', difficulty: '상', ready: '.path-shell', controls: '.path-fence-cycle[data-cycle-cell="0"], .path-submit' },
    { title: '마법약 만들기', difficulty: '중', ready: '.potion-layout', controls: '.potion-actions button' },
    { title: '숫자 누르기', difficulty: '하', ready: '.number-layout', controls: '.number-board-pro button' },
  ] as const;

  for (const entry of cases) {
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`${entry.title}, 난이도 ${entry.difficulty}, 설정 열기`) }).click();
    const stage = page.locator('.stage-panel');
    await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
    const workspace = page.locator('.game-workspace');
    const readySurface = workspace.locator(entry.ready);
    await expect(readySurface).toBeVisible({ timeout: 8_000 });
    await expectControlsInsideViewport(workspace.locator(entry.controls), 844, 360);
    if (entry.title === '숫자 누르기') {
      const roundBanner = workspace.locator('.number-round-banner');
      await expect(roundBanner).toContainText('ROUND 1 / 2');
      const bannerBox = await roundBanner.boundingBox();
      expect(bannerBox).not.toBeNull();
      expect(bannerBox!.height).toBeGreaterThanOrEqual(28);
      expect(bannerBox!.y).toBeGreaterThanOrEqual(0);
      expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(361);
    }
    const surfaceBox = await readySurface.boundingBox();
    expect(surfaceBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((surfaceBox?.y ?? 361) + (surfaceBox?.height ?? 0)).toBeLessThanOrEqual(361);
    const overflow = await workspace.locator('.workspace-body').evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(overflow.scrollWidth, `${entry.title} 본문의 가로 넘침`).toBeLessThanOrEqual(overflow.width + 1);
    expect.soft(overflow.scrollHeight, `${entry.title} 본문의 세로 넘침`).toBeLessThanOrEqual(overflow.height + 1);
    if (entry.title === '숫자 누르기') {
      for (const viewport of [{ width: 844, height: 360 }, { width: 901, height: 360 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(100);
        const layout = await workspace.locator('.workspace-body').evaluate((body) => {
          const bodyRect = body.getBoundingClientRect();
          const lastButtonRect = body.querySelector('.number-board-pro button:last-child')?.getBoundingClientRect();
          return lastButtonRect ? {
            clientWidth: body.clientWidth,
            scrollWidth: body.scrollWidth,
            clientHeight: body.clientHeight,
            scrollHeight: body.scrollHeight,
            body: { left: bodyRect.left, right: bodyRect.right, top: bodyRect.top, bottom: bodyRect.bottom },
            lastButton: { left: lastButtonRect.left, right: lastButtonRect.right, top: lastButtonRect.top, bottom: lastButtonRect.bottom },
          } : null;
        });
        expect(layout, `${viewport.width}×${viewport.height} 숫자판 측정`).not.toBeNull();
        expect(layout!.scrollWidth - layout!.clientWidth, `${viewport.width}×${viewport.height} 숫자판 가로 넘침`).toBeLessThanOrEqual(1);
        expect(layout!.scrollHeight - layout!.clientHeight, `${viewport.width}×${viewport.height} 숫자판 세로 넘침`).toBeLessThanOrEqual(1);
        expect(layout!.lastButton.left).toBeGreaterThanOrEqual(layout!.body.left - 1);
        expect(layout!.lastButton.right).toBeLessThanOrEqual(layout!.body.right + 1);
        expect(layout!.lastButton.top).toBeGreaterThanOrEqual(layout!.body.top - 1);
        expect(layout!.lastButton.bottom).toBeLessThanOrEqual(layout!.body.bottom + 1);
      }
    }
  }
});

test('700~768px 태블릿에서도 길 만들기 보드가 가로로 밀리지 않는다', async ({ page }) => {
  await seedPracticeConfig(page);

  for (const viewport of [{ width: 700, height: 360 }, { width: 768, height: 360 }, { width: 700, height: 800 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
    const stage = page.locator('section[data-game="path"]');
    await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
    await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

    const workspace = page.locator('.game-workspace.game-path');
    const board = workspace.locator('.path-shell');
    await expect(board).toBeVisible({ timeout: 8_000 });
    const bodyOverflow = await workspace.locator('.workspace-body').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(bodyOverflow.scrollWidth, `${viewport.width}px 본문의 가로 넘침`).toBeLessThanOrEqual(bodyOverflow.clientWidth + 1);
    const boardBox = await board.boundingBox();
    const bodyBox = await workspace.locator('.workspace-body').boundingBox();
    expect(boardBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    expect(boardBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((boardBox?.x ?? viewport.width + 1) + (boardBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.height <= 600) {
      expect((boardBox?.y ?? viewport.height + 1) + (boardBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
      expect((boardBox?.y ?? 0) + (boardBox?.height ?? 0)).toBeLessThanOrEqual((bodyBox?.y ?? 0) + (bodyBox?.height ?? 0) - 4);
      const firstCellBox = await workspace.locator('.path-cell').first().boundingBox();
      expect(firstCellBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(firstCellBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expectControlsInsideViewport(workspace.locator('.path-submit, .path-fence-cycle[data-cycle-cell="0"]'), viewport.width, viewport.height);
      if (viewport.width === 700) {
        await workspace.locator('.path-submit').click();
        const feedback = workspace.locator('.workspace-foot:visible');
        await expect(feedback.locator('b')).not.toBeEmpty({ timeout: 5_000 });
        const feedbackBox = await feedback.boundingBox();
        expect(feedbackBox).not.toBeNull();
        expect((feedbackBox?.x ?? 0) + (feedbackBox?.width ?? 0)).toBeLessThanOrEqual((boardBox?.x ?? 0) + 1);
        const bottomCellRemainsClickable = await workspace.locator('.path-fence-cycle[data-cycle-cell="20"]').evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit?.closest('.path-fence-cycle') === button;
        });
        expect(bottomCellRemainsClickable).toBe(true);
      }
    }
  }
});

test('844×360 N-back 응답 단계에서 자극과 모든 선택지가 잘리지 않는다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.setViewportSize({ width: 844, height: 360 });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="nback"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-nback');
  for (let index = 0; index < 2; index += 1) {
    const nextGlyph = workspace.getByRole('button', { name: /기억했어요 · 다음 도형/ });
    await expect(nextGlyph).toBeVisible({ timeout: 8_000 });
    await nextGlyph.click();
  }

  const actions = workspace.locator('.nback-actions button');
  await expect(actions).toHaveCount(2);
  await expectControlsInsideViewport(actions, 844, 360);
  const nextAction = workspace.getByRole('button', { name: /응답 완료 · 다음 도형/ });
  await expect(nextAction).toBeVisible();
  await expectControlsInsideViewport(nextAction, 844, 360);
  const answerGroupBox = await workspace.locator('.nback-actions').boundingBox();
  const nextActionBox = await nextAction.boundingBox();
  expect(answerGroupBox).not.toBeNull();
  expect(nextActionBox).not.toBeNull();
  expect((answerGroupBox?.y ?? 0) + (answerGroupBox?.height ?? 0)).toBeLessThanOrEqual((nextActionBox?.y ?? 0) + 1);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 360 }, { width: 901, height: 360 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const overflow = await workspace.locator('.workspace-body').evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(overflow.scrollWidth - overflow.width, `${viewport.width}×${viewport.height} N-back 가로 넘침`).toBeLessThanOrEqual(1);
    expect(overflow.scrollHeight - overflow.height, `${viewport.width}×${viewport.height} N-back 세로 넘침`).toBeLessThanOrEqual(1);
    const containment = await workspace.locator('.nback-stimulus').evaluate((element) => {
      const body = element.closest('.workspace-body')?.getBoundingClientRect();
      const surface = element.getBoundingClientRect();
      const glyph = element.querySelector('canvas')?.getBoundingClientRect();
      return body && glyph ? {
        body: { left: body.left, top: body.top, right: body.right, bottom: body.bottom },
        surface: { left: surface.left, top: surface.top, right: surface.right, bottom: surface.bottom },
        glyph: { left: glyph.left, top: glyph.top, right: glyph.right, bottom: glyph.bottom, width: glyph.width, height: glyph.height },
      } : null;
    });
    expect(containment, `${viewport.width}×${viewport.height} 도형 측정`).not.toBeNull();
    expect(containment!.surface.left).toBeGreaterThanOrEqual(containment!.body.left - 1);
    expect(containment!.surface.top).toBeGreaterThanOrEqual(containment!.body.top - 1);
    expect(containment!.surface.right).toBeLessThanOrEqual(containment!.body.right + 1);
    expect(containment!.surface.bottom).toBeLessThanOrEqual(containment!.body.bottom + 1);
    expect(containment!.glyph.left).toBeGreaterThanOrEqual(containment!.surface.left - 1);
    expect(containment!.glyph.top).toBeGreaterThanOrEqual(containment!.surface.top - 1);
    expect(containment!.glyph.right).toBeLessThanOrEqual(containment!.surface.right + 1);
    expect(containment!.glyph.bottom).toBeLessThanOrEqual(containment!.surface.bottom + 1);
    expect(Math.abs(containment!.glyph.width - containment!.glyph.height)).toBeLessThanOrEqual(1);
    await expectControlsInsideViewport(workspace.locator('.nback-actions button, .nback-stage > .single-action'), viewport.width, viewport.height);
  }
});

test('약속 정하기는 답을 고른 즉시 표시 타이머도 멈춘다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="appointment"]');
  await expect(stage).toBeVisible();
  // Keep assertions inside the 900 ms feedback window even on a busy host.
  const clockOrigin = Date.UTC(2030, 0, 2);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-appointment');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await workspace.getByRole('button', { name: '이 라운드 시작' }).click();
  for (let person = 0; person < 3; person += 1) {
    if (person > 0) await page.clock.runFor(350);
    const next = workspace.locator('.appointment-stimulus .single-action');
    await expect.poll(() => next.getAttribute('aria-disabled')).toBe('false');
    await next.click();
  }
  const deadline = workspace.locator('.appointment-question .time-strip');
  const runningRemaining = Number(await deadline.getAttribute('aria-valuenow'));
  await workspace.locator('.appointment-choice-grid button').first().click();
  await expect(deadline).toHaveAttribute('data-deadline-active', 'false');
  await expect(deadline).toHaveAttribute('aria-valuetext', '응답 완료 · 다음 문제 준비 중');
  const stoppedAt = await deadline.getAttribute('aria-valuenow');
  expect(Number(stoppedAt)).toBeLessThanOrEqual(runningRemaining);
  expect(Number(stoppedAt)).toBeGreaterThan(0);
  await page.clock.runFor(400);
  await expect(deadline).toHaveAttribute('aria-valuenow', stoppedAt!);
  await page.clock.runFor(550);
  await expect(page.locator('.stage-result')).toBeVisible();
});

test('약속·개수·N-back 단계 전환은 이전 내부 스크롤 위치를 남기지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await seedPracticeConfig(page);
  await page.setViewportSize({ width: 844, height: 360 });

  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  let stage = page.locator('section[data-game="appointment"]');
  let untimedToggle = stage.getByText('시간 제한 없이 연습', { exact: true });
  await expect(untimedToggle).toBeVisible({ timeout: 30_000 });
  await untimedToggle.click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  let workspace = page.locator('.game-workspace.game-appointment');
  await workspace.getByRole('button', { name: '이 라운드 시작' }).click();
  const nextFriend = workspace.locator('.appointment-stimulus .single-action');
  await expect(nextFriend).toBeVisible();
  let body = await forceWorkspaceScroll(workspace);
  await nextFriend.evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

  await page.goto('/');
  await page.getByRole('button', { name: /개수 비교하기, 난이도 하, 설정 열기/ }).click();
  stage = page.locator('section[data-game="count"]');
  untimedToggle = stage.getByText('시간 제한 없이 연습', { exact: true });
  await expect(untimedToggle).toBeVisible({ timeout: 30_000 });
  await untimedToggle.click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  workspace = page.locator('.game-workspace.game-count');
  const beginAnswer = workspace.locator('.accessible-next-action');
  await expect(beginAnswer).toBeVisible({ timeout: 8_000 });
  body = await forceWorkspaceScroll(workspace);
  await beginAnswer.evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  stage = page.locator('section[data-game="nback"]');
  untimedToggle = stage.getByText('시간 제한 없이 연습', { exact: true });
  await expect(untimedToggle).toBeVisible({ timeout: 30_000 });
  await untimedToggle.click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  workspace = page.locator('.game-workspace.game-nback');
  const nextGlyph = workspace.getByRole('button', { name: /기억했어요 · 다음 도형/ });
  await expect(nextGlyph).toBeVisible({ timeout: 8_000 });
  body = await forceWorkspaceScroll(workspace);
  await nextGlyph.evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => body.evaluate((element) => element.scrollTop), { timeout: 2_000 }).toBe(0);
});

test('작은 세로·가로 설정 화면은 수평 넘침 없이 긴 설정의 마지막 항목까지 조작할 수 있다', async ({ page }) => {
  await seedPracticeConfig(page);

  for (const viewport of [{ width: 320, height: 844 }, { width: 844, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();

    const stage = page.locator('section[data-game="rotation"]');
    const untimed = stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
    if (!(await untimed.isChecked())) await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
    await expect(untimed).toBeChecked();
    await stage.locator('.practice-advanced-settings > summary').click();
    await stage.locator('.rotation-transform-exact > summary').click();
    const lastTransform = stage.getByRole('button', { name: /180° 점대칭/ });
    await lastTransform.click();
    await expect(stage.getByRole('button', { name: /^설명·연습 시작/ })).toBeVisible();

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);

    await stage.getByRole('button', { name: '연습 닫기' }).click();

    await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
    const nbackStage = page.locator('section[data-game="nback"]');
    await nbackStage.getByText('도형 이름표 설정', { exact: true }).click();
    await nbackStage.locator('.glyph-legend').getByRole('button', { name: '기본값 복원' }).click();
    await nbackStage.getByRole('button', { name: '연습 닫기' }).click();
  }
});

test('작은 화면의 핵심 설정과 N-back 헤더는 44px 터치 영역을 유지한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const footerActions = page.locator('.footer-links a, .footer-links button');
  for (let index = 0; index < await footerActions.count(); index += 1) {
    const box = await footerActions.nth(index).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const appointmentStage = page.locator('section[data-game="appointment"]');
  await expect(appointmentStage.getByRole('region', { name: '연습할 게임 선택' })).toBeVisible();
  const roundLabel = appointmentStage.locator('.appointment-round-picker label').first();
  const roundInput = roundLabel.locator('input');
  const onlyButton = appointmentStage.getByRole('button', { name: '1라운드 요일만 연습' });
  await expect(roundLabel).toBeVisible();
  expect((await roundLabel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await roundInput.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(20);
  expect((await onlyButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await appointmentStage.getByRole('button', { name: '연습 닫기' }).click();

  await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
  const pathStage = page.locator('section[data-game="path"]');
  await pathStage.locator('.practice-advanced-settings > summary').click();
  await pathStage.getByText('12개 대표 조합표', { exact: true }).click();
  const referenceLink = pathStage.getByRole('link', { name: /참고 영상/ });
  await expect(referenceLink).toBeVisible();
  expect((await referenceLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await pathStage.getByRole('button', { name: '연습 닫기' }).click();

  await page.setViewportSize({ width: 844, height: 360 });
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const nbackStage = page.locator('section[data-game="nback"]');
  await nbackStage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const nbackWorkspace = page.locator('.game-workspace.game-nback');
  await expect(nbackWorkspace.locator('.nback-stage')).toBeVisible({ timeout: 8_000 });
  const switchButton = nbackWorkspace.getByRole('button', { name: '게임 바꾸기' });
  const switchBox = await switchButton.boundingBox();
  expect(switchBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(switchBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('모바일 입력은 자동 확대를 피하고 모달 포커스는 바깥에서 즉시 회수한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');

  for (const [openName, dialogName, closeName] of [
    ['공략 보기', '전략게임 가이드', '전략게임 가이드 닫기'],
    ['내 실수 복습', '복습 센터', '복습 센터 닫기'],
  ] as const) {
    await page.getByRole('button', { name: openName }).click();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button', { name: closeName }).click();
  }

  await page.getByRole('button', { name: '의견 보내기' }).first().click();
  const feedback = page.getByRole('dialog', { name: '의견 보내기' });
  await expect(feedback).toBeVisible();
  for (const control of [feedback.locator('select').first(), feedback.locator('textarea')]) {
    const fontSize = await control.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  }
});

test('9개 게임 모두 시간 제한 없는 연습을 제공하고 N-back은 수동으로 이동한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  const games = [
    ['도형 회전하기', '중'], ['가위바위보', '하'], ['약속 정하기', '상'],
    ['길 만들기', '상'], ['마법약 만들기', '중'], ['도형 순서 기억하기', '상'],
    ['숫자 누르기', '하'], ['개수 비교하기', '하'], ['고양이 술래잡기', '중'],
  ] as const;
  for (const [title, difficulty] of games) {
    await page.getByRole('button', { name: new RegExp(`${title}, 난이도 ${difficulty}, 설정 열기`) }).click();
    const stage = page.locator('.stage-panel');
    await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeVisible();
    await stage.getByRole('button', { name: '연습 닫기' }).click();
  }

  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const rpsStage = page.locator('section[data-game="rps"]');
  const rpsUntimed = rpsStage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
  await rpsStage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(rpsUntimed).toBeChecked();
  await rpsStage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const rpsWorkspace = page.locator('.game-workspace.game-rps');
  await expect(rpsWorkspace.locator('.rps-board')).toBeVisible({ timeout: 8_000 });
  await expect(rpsWorkspace.locator('.guided-pacing-note')).toContainText('시간 제한 없이 연습 중');
  await expect(rpsWorkspace.locator('.time-strip')).toHaveCount(0);
  await page.waitForTimeout(3_200);
  await expect(rpsWorkspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await expect(rpsWorkspace.locator('.workspace-foot')).not.toContainText('시간 초과');

  await rpsWorkspace.getByRole('button', { name: '연습 닫기' }).click();
  await page.getByRole('button', { name: '연습창 닫기' }).click();
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const nbackStage = page.locator('section[data-game="nback"]');
  const nbackUntimed = nbackStage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
  await nbackStage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(nbackUntimed).toBeChecked();
  await nbackStage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const nbackWorkspace = page.locator('.game-workspace.game-nback');
  const nextGlyph = nbackWorkspace.getByRole('button', { name: /기억했어요 · 다음 도형/ });
  await expect(nextGlyph).toBeVisible({ timeout: 8_000 });
  await nextGlyph.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await page.waitForTimeout(400);
  await expect(nextGlyph).toBeVisible();
  await nbackWorkspace.getByRole('button', { name: /기억했어요 · 다음 도형/ }).click();
  const responseNext = nbackWorkspace.getByRole('button', { name: /응답 완료 · 다음 도형/ });
  const firstAnswer = nbackWorkspace.locator('.nback-actions button').first();
  await expect(responseNext).toBeDisabled();
  await expect(firstAnswer).toBeEnabled({ timeout: 1_000 });
  await firstAnswer.click();
  await expect(responseNext).toBeEnabled();
  await page.waitForTimeout(600);
  await expect(responseNext).toBeVisible();
  await responseNext.click();
  await expect(page.getByRole('heading', { name: '도형 순서 기억하기 결과' })).toBeVisible();
});

test('탭 이탈은 준비와 문제 타이머를 멈추고 명시적 재개를 요구한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  const clockOrigin = Date.UTC(2030, 0, 3);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const preparationCountdown = page.locator('.game-preparation > b');
  await expect(preparationCountdown).toBeVisible();
  await setDocumentVisibility(page, 'hidden');
  // Advance browser time explicitly so a busy test host cannot skip the
  // preparation or first question while the runner observes the pause state.
  await page.clock.runFor(150);
  const pausedPreparationValue = await preparationCountdown.textContent();
  await page.clock.runFor(1_400);
  await expect(preparationCountdown).toHaveText(pausedPreparationValue ?? '');
  await setDocumentVisibility(page, 'visible');

  const pauseDialog = page.getByRole('alertdialog', { name: '연습을 잠시 멈췄습니다' });
  await expect(pauseDialog).toBeVisible();
  const resume = pauseDialog.getByRole('button', { name: '준비됐어요 · 계속하기' });
  await expect(resume).toBeFocused();
  await resume.click();

  const workspace = page.locator('.game-workspace.game-rps');
  for (let second = Number(pausedPreparationValue); second > 0; second -= 1) {
    await expect(preparationCountdown).toHaveText(String(second));
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.rps-board')).toBeVisible({ timeout: 8_000 });
  await workspace.getByRole('button', { name: '문제 신고' }).click();
  const pendingDialog = page.getByRole('alertdialog', { name: '현재 세션을 종료하고 의견을 작성할까요?' });
  await expect(pendingDialog).toBeVisible();
  await setDocumentVisibility(page, 'hidden');
  await setDocumentVisibility(page, 'visible');
  await expect(pauseDialog).toBeHidden();
  await pendingDialog.getByRole('button', { name: '계속 연습' }).click();
  await setDocumentVisibility(page, 'hidden');
  await page.clock.runFor(3_000);
  await setDocumentVisibility(page, 'visible');
  await expect(pauseDialog).toBeVisible();
  await expect(pauseDialog).toContainText('탭 이탈 3회');
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await page.clock.runFor(2_800);
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await pauseDialog.getByRole('button', { name: '준비됐어요 · 계속하기' }).click();
  await page.clock.runFor(50);
  await expect(pauseDialog).toBeHidden();
  await expect(workspace).toBeFocused();
  await workspace.locator('.rps-actions button').first().click();
  await page.clock.runFor(1400);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 3_000 });
});

test('문항 전환 준비시간은 제한시간과 반응시간 측정을 먼저 소모하지 않는다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.addInitScript(({ configKey }) => {
    const saved = JSON.parse(window.localStorage.getItem(configKey) ?? '{}') as Record<string, { quantity: number; paceMs: number }>;
    window.localStorage.setItem(configKey, JSON.stringify({ ...saved, rps: { quantity: 9, paceMs: 9_000 } }));
  }, { configKey: CONFIG_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  await page.locator('section[data-game="rps"]').getByRole('button', { name: /^설명·연습 시작/ }).click();

  const rpsWorkspace = page.locator('.game-workspace.game-rps');
  await expect(rpsWorkspace.locator('.rps-board')).toBeVisible({ timeout: 8_000 });
  const rpsDeadline = rpsWorkspace.locator('.time-strip');
  await expect(rpsDeadline).toHaveAttribute('data-deadline-active', 'true');
  await rpsWorkspace.locator('.rps-actions button').first().evaluate((button) => (button as HTMLButtonElement).click());
  await expect(rpsDeadline).toHaveAttribute('data-deadline-active', 'false');
  await expect(rpsWorkspace.locator('.rps-actions button').first()).toBeDisabled();
  await expect(rpsWorkspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await expect(rpsWorkspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 3_000 });
  await expect(rpsDeadline).toHaveAttribute('data-deadline-active', 'true');
  await expect(rpsWorkspace.locator('.rps-actions button').first()).toBeEnabled();
  const rpsBudget = await rpsDeadline.evaluate((element) => ({
    maximum: Number(element.getAttribute('aria-valuemax')),
    remaining: Number(element.getAttribute('aria-valuenow')),
  }));
  expect(rpsBudget.maximum - rpsBudget.remaining).toBeLessThan(1_500);

  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  await page.locator('section[data-game="nback"]').getByRole('button', { name: /^설명·연습 시작/ }).click();

  const nbackWorkspace = page.locator('.game-workspace.game-nback');
  await expect(nbackWorkspace.locator('.nback-stage')).toBeVisible({ timeout: 8_000 });
  const nbackDeadline = nbackWorkspace.locator('.time-strip');
  await expect(nbackWorkspace.locator('.time-strip[data-deadline-active="true"]')).toBeVisible({ timeout: 8_000 });
  const nbackStartingRemaining = Number(await nbackDeadline.getAttribute('aria-valuenow'));
  const nbackTransitionStartedAt = Date.now();
  await nbackWorkspace.locator('.nback-stimulus').evaluate((element) => { element.setAttribute('data-transition-probe', 'old'); });
  await page.waitForFunction(() => document.querySelector('.game-nback .nback-stimulus')?.getAttribute('data-transition-probe') !== 'old', null, { timeout: 4_000, polling: 20 });
  const nbackTransitionElapsed = Date.now() - nbackTransitionStartedAt;
  expect(nbackTransitionElapsed).toBeGreaterThanOrEqual(nbackStartingRemaining - 500);
  expect(nbackTransitionElapsed).toBeLessThanOrEqual(nbackStartingRemaining + 750);
  await expect(nbackDeadline).toHaveAttribute('data-deadline-active', 'true');
  const nbackBudget = await nbackDeadline.evaluate((element) => ({
    maximum: Number(element.getAttribute('aria-valuemax')),
    remaining: Number(element.getAttribute('aria-valuenow')),
  }));
  expect(nbackBudget.maximum - nbackBudget.remaining).toBeLessThan(1_500);
});

test('개수 비교하기는 연습 응답 직후 정오답과 실제 정답을 보여준다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /개수 비교하기, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="count"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-count');
  await expect(workspace.locator('.accessible-next-action')).toBeVisible({ timeout: 8_000 });
  await workspace.locator('.accessible-next-action').click();
  await workspace.locator('.count-board button').first().click();
  const feedback = workspace.locator('.workspace-foot > b');
  await expect(feedback).toContainText(/(정답|오답) · (정답은 )?(왼쪽|오른쪽) \d+개/);
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 5');
  await expect(feedback).not.toHaveText('');
});

test('개수 비교하기는 클릭과 키 입력이 겹쳐도 한 문항만 채점한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /개수 비교하기, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="count"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-count');
  await expect(workspace.locator('.accessible-next-action')).toBeVisible({ timeout: 8_000 });
  await workspace.locator('.accessible-next-action').click();
  const firstChoice = workspace.locator('.count-board button').first();
  await expect(firstChoice).toBeEnabled();
  await firstChoice.evaluate((element: HTMLButtonElement) => {
    element.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });

  await expect(workspace.locator('.workspace-foot > b')).toContainText(/(정답|오답) ·/);
  await page.waitForTimeout(850);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 5');
});

test('고양이 술래잡기는 연습에서 빨강·파랑 판단을 색상별로 피드백한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.setViewportSize({ width: 844, height: 360 });
  await page.goto('/');
  await page.getByRole('button', { name: /고양이 술래잡기, 난이도 중, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="mouse"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-mouse');
  const next = workspace.locator('.accessible-next-action');
  await expect(next).toBeVisible({ timeout: 8_000 });
  for (let step = 0; step < 4; step += 1) {
    await next.click();
    if (step < 3) await page.waitForTimeout(350);
  }
  await expect(workspace.locator('.cat-decision.red')).toBeVisible();
  const workspaceBody = workspace.locator('.workspace-body');
  const bodyOverflow = await workspaceBody.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(bodyOverflow.scrollHeight).toBeLessThanOrEqual(bodyOverflow.clientHeight + 1);
  const decisionButtons = workspace.locator('.cat-decision.red .decision-groups button');
  await expect(decisionButtons).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    const box = await decisionButtons.nth(index).boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 361) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
  }
  await workspace.locator('.cat-decision.red .decision-groups button').first().click();
  const feedback = workspace.locator('.workspace-foot > b');
  await expect(feedback).toContainText(/(정답|오답) · 빨간 고양이는 (찾았다|놓쳤다)/);
  await expect(workspace.locator('.cat-decision.red')).toBeVisible();
  await expect(feedback).not.toHaveText('');
  await expect(workspace.locator('.cat-decision.blue')).toBeVisible({ timeout: 1_500 });
  await expect(feedback).toHaveText('');
});

test('고양이 술래잡기는 라운드별 빨강·파랑 판단을 결과와 복습에 모두 보존한다', async ({ page }) => {
  await seedPracticeConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: /고양이 술래잡기, 난이도 중, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="mouse"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-mouse');
  const next = workspace.locator('.accessible-next-action');
  for (let round = 0; round < 3; round += 1) {
    await expect(next).toBeVisible({ timeout: round === 0 ? 8_000 : 2_000 });
    for (let step = 0; step < 4; step += 1) {
      await next.click();
      if (step < 3) await page.waitForTimeout(350);
    }
    await workspace.locator('.cat-decision.red .decision-groups button').first().click();
    await expect(workspace.locator('.cat-decision.blue')).toBeVisible({ timeout: 1_500 });
    await workspace.locator('.cat-decision.blue .decision-groups button').first().click();
  }

  const result = page.locator('.stage-result');
  await expect(result).toBeVisible({ timeout: 2_000 });
  await expect(result.locator('.mouse-result-detail')).toContainText('확신 응답');
  await expect(result.locator('.mouse-result-detail')).toContainText('6 / 6');
  await result.getByRole('button', { name: '문항별 복습' }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습' });
  await expect(review).toBeVisible();
  const attemptsFilter = review.getByRole('button', { name: '오류·점검만' });
  if (await attemptsFilter.isVisible()) await attemptsFilter.click();
  await expect(review.getByRole('listbox', { name: '저장된 시도 목록' }).getByRole('option')).toHaveCount(6);
});

test('844×360 첫 화면과 게임 설명에서 핵심 시작 버튼을 바로 사용할 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 360 });
  await page.goto('/');

  const heroStart = page.locator('.hero-primary');
  await expect(heroStart).toBeVisible();
  await expectControlsInsideViewport(heroStart, 844, 360);
  await heroStart.click();

  const stage = page.locator('.stage-panel');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole('list', { name: '시작 전 확인 순서' })).toBeVisible();
  const startOptions = stage.locator('.intro-start-options button');
  await expect(startOptions).toHaveCount(2);
  await expectControlsInsideViewport(startOptions, 844, 360);
  await expect(startOptions.nth(0)).toContainText('설명·연습 시작');
  await expect(startOptions.nth(1)).toContainText('실전형 연습 시작');
  await expect(startOptions.nth(0)).toHaveClass(/is-selected/);
  await expect(startOptions.nth(1)).not.toHaveClass(/is-selected/);

  const shortcutBox = await stage.locator('.intro-settings-shortcut').boundingBox();
  const actionsBox = await stage.locator('.intro-actions').boundingBox();
  expect(shortcutBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect((shortcutBox?.y ?? 1) + (shortcutBox?.height ?? 0)).toBeLessThanOrEqual(actionsBox?.y ?? 0);

  await startOptions.nth(1).click();
  const workspace = page.locator('.game-workspace');
  await expect(workspace).toBeVisible({ timeout: 8_000 });
  await expect(workspace.locator('.mode-chip')).toHaveText('실전형 연습');
});

test('앱의 움직임 줄이기는 회전 풀이와 문항 복습 자동 재생에도 적용된다', async ({ page }) => {
  await page.addInitScript(({ accessibilityKey, configKey, pacingKey }) => {
    window.localStorage.setItem(accessibilityKey, JSON.stringify({ contrast: 'standard', textScale: 'standard', motion: 'reduce' }));
    window.localStorage.setItem(configKey, JSON.stringify({ rotation: { quantity: 1, paceMs: 90_000 } }));
    window.localStorage.setItem(pacingKey, JSON.stringify({ rotation: true }));
    window.localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({
      contentMode: 'letters',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: true,
    }));
  }, { accessibilityKey: ACCESSIBILITY_KEY, configKey: CONFIG_KEY, pacingKey: PACING_KEY });

  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rotation"]');
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-rotation');
  await expect(workspace).toBeVisible({ timeout: 8_000 });
  await workspace.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();

  const processReplay = workspace.locator('.rotation-process-controls .is-play');
  await expect(processReplay).toBeDisabled();
  await expect(processReplay).toContainText('재생 꺼짐');

  await workspace.getByRole('button', { name: /답안 제출/ }).click();
  await workspace.getByRole('button', { name: /결과 보기/ }).click();
  await page.getByRole('button', { name: '문항별 복습' }).click();

  const review = page.getByRole('dialog', { name: '내 실수 복습' });
  await expect(review).toBeVisible();
  const reviewReplay = review.locator('.review-replay-controls .is-play');
  await expect(reviewReplay).toBeDisabled();
  await expect(reviewReplay).toHaveText('재생 꺼짐');
});

test('도형 회전 격자 자극은 공개 화면과 같은 4×4 구조를 유지한다', async ({ page }) => {
  await page.addInitScript(({ configKey }) => {
    window.localStorage.setItem(configKey, JSON.stringify({ rotation: { quantity: 1, paceMs: 90_000 } }));
    window.localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({
      contentMode: 'tiles',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: false,
    }));
  }, { configKey: CONFIG_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="rotation"]');
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rotation');
  await expect(workspace).toBeVisible({ timeout: 8_000 });
  await expect(workspace).toContainText('4×4 격자 도형');
  await expect(workspace).not.toContainText('5×5');

  const grids = workspace.locator('.rotation-comparison .rotation-tile-grid');
  await expect(grids).toHaveCount(2);
  await expect(grids.first().locator(':scope > i')).toHaveCount(16);
  const geometry = await grids.first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.trim().split(/\s+/).length,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(geometry.columns).toBe(4);
  expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(1);
});

test('도형 회전 핵심 조작은 휴대폰 가로와 일반 데스크톱 비율에서 내부 스크롤 없이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(({ configKey }) => {
    window.localStorage.setItem(configKey, JSON.stringify({ rotation: { quantity: 1, paceMs: 90_000 } }));
    window.localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({
      contentMode: 'letters',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: false,
    }));
  }, { configKey: CONFIG_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  await page.locator('section[data-game="rotation"]').getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-rotation');
  await expect(workspace.locator('.rotation-comparison')).toBeVisible({ timeout: 8_000 });
  const viewports = [
    { width: 768, height: 1024 },
    { width: 844, height: 360 },
    { width: 901, height: 360 },
    { width: 901, height: 720 },
    { width: 1024, height: 600 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const layout = await workspace.locator('.workspace-body').evaluate((body) => {
      const bodyRect = body.getBoundingClientRect();
      const tracked = Array.from(body.querySelectorAll('.rotation-comparison, .rotation-controls, .rotation-submit-row, .operation-sequence'));
      return {
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        body: { left: bodyRect.left, right: bodyRect.right, top: bodyRect.top, bottom: bodyRect.bottom },
        tracked: tracked.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }),
      };
    });
    expect(layout.scrollWidth - layout.clientWidth, `${viewport.width}×${viewport.height} 내부 가로 넘침`).toBeLessThanOrEqual(2);
    expect(layout.scrollHeight - layout.clientHeight, `${viewport.width}×${viewport.height} 내부 세로 넘침`).toBeLessThanOrEqual(2);
    expect(layout.tracked.length).toBe(4);
    for (const rect of layout.tracked) {
      expect(rect.left, `${viewport.width}×${viewport.height} 조작 좌측`).toBeGreaterThanOrEqual(layout.body.left - 1);
      expect(rect.right, `${viewport.width}×${viewport.height} 조작 우측`).toBeLessThanOrEqual(layout.body.right + 1);
      expect(rect.top, `${viewport.width}×${viewport.height} 조작 상단`).toBeGreaterThanOrEqual(layout.body.top - 1);
      expect(rect.bottom, `${viewport.width}×${viewport.height} 조작 하단`).toBeLessThanOrEqual(layout.body.bottom + 1);
    }
  }
});
