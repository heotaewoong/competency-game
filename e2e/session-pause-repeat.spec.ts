import { expect, test, type Page } from '@playwright/test';

async function startTimedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 2500 } }));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  const origin = Date.UTC(2030, 0, 8);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rps');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.rps-board')).toBeVisible();
  return workspace;
}

for (const trigger of ['연습 닫기', '게임 바꾸기', '문제 신고', 'Escape'] as const) {
  test(`${trigger}: 유지된 키는 종료 확인창을 취소하지 않고 새 입력만 재개한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const workspace = await startTimedSession(page);
    const key = trigger === 'Escape' ? 'Escape' : 'Enter';
    if (trigger === 'Escape') await workspace.focus();
    else await workspace.getByRole('button', { name: trigger, exact: true }).focus();
    await page.keyboard.down(key);
    const confirmation = page.locator('.session-confirm[role="alertdialog"]');
    await expect(confirmation).toBeVisible();
    await page.clock.runFor(20);
    await expect(confirmation.getByRole('button', { name: '계속 연습' })).toBeFocused();
    await page.keyboard.down(key);
    await expect(confirmation).toBeVisible();
    await page.clock.runFor(5000);
    await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
    await page.screenshot({ path: testInfo.outputPath('held-key-paused.png') });
    await page.keyboard.up(key);
    await page.keyboard.down(key);
    await expect(confirmation).toHaveCount(0);
    await page.clock.runFor(20);
    // Holding the fresh Escape that resumed must not reopen the confirmation.
    if (key === 'Escape') {
      await page.keyboard.down(key);
      await expect(confirmation).toHaveCount(0);
    }
    await page.keyboard.up(key);
    await page.clock.runFor(4000);
    await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
    await workspace.getByRole('button', { name: '연습 닫기', exact: true }).click();
    await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
    await expect(page.locator('.stage-panel')).toHaveCount(0);
    await expect(page.locator('.record-summary')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('탭 이탈 일시정지도 유지된 Enter로 자동 재개되지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const workspace = await startTimedSession(page);
  await workspace.focus();
  await page.keyboard.down('Enter');
  // Model the browser visibility event; the key events remain native inputs.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pause = page.getByRole('alertdialog', { name: '연습을 잠시 멈췄습니다' });
  await expect(pause).toBeVisible();
  await page.clock.runFor(20);
  await expect(pause.getByRole('button', { name: '준비됐어요 · 계속하기' })).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.down('Enter');
  await expect(pause).toBeVisible();
  await page.clock.runFor(5000);
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await page.screenshot({ path: testInfo.outputPath('visibility-held-enter.png') });
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  await expect(pause).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
  expect(errors).toEqual([]);
});

async function startFeedbackSession(page: Page, mode: 'practice' | 'simulation') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  const origin = Date.UTC(2030, 0, 9);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  await stage.getByRole('button', { name: mode === 'practice' ? /^설명·연습 시작/ : /^실전형 연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rps');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.rps-board')).toBeVisible();
  const shown = await workspace.locator('.rps-board img').getAttribute('alt');
  expect(shown).toMatch(/^(가위|바위|보)$/);
  // 보이는 패와 같은 패는 어느 관점에서도 무승부이므로 항상 오답이다.
  await workspace.locator('.rps-actions button').filter({ hasText: shown! }).click();
  return { workspace, errors };
}

for (const mode of ['practice', 'simulation'] as const) {
  test(`${mode}: 가위바위보 오답은 빨간 신호와 이름표로 1초 표시하고 한 번만 이동한다`, async ({ page }, testInfo) => {
    const { workspace, errors } = await startFeedbackSession(page, mode);
    const signal = workspace.locator('.answer-signal');
    await expect(signal).toBeVisible();
    await expect(signal).toHaveText('오답');
    await expect(signal).toHaveAttribute('aria-label', '응답 결과: 오답');
    await expect(signal).toHaveAttribute('data-feedback-tone', 'error');
    await expect(signal).toHaveCSS('color', 'rgb(163, 63, 73)');
    await expect(signal.locator('i')).toHaveCSS('background-color', 'rgb(163, 63, 73)');
    if (mode === 'simulation') await expect(workspace.locator('.workspace-foot > b')).toHaveText('');
    else await expect(workspace.locator('.workspace-foot > b')).toHaveText('물음표 위치를 먼저 확인하세요.');
    await page.keyboard.press('ArrowRight');
    await page.clock.runFor(999);
    await expect(workspace.locator('.workspace-progress > span')).toContainText('1 /');
    await expect(signal).toBeVisible();
    for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`rps-${mode}-error-signal.png`) });
    await page.clock.runFor(320);
    await expect(workspace.locator('.workspace-progress > span')).toContainText('1 /');
    await expect(signal).toBeVisible();
    for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeDisabled();
    await page.clock.runFor(1);
    await expect(workspace.locator('.workspace-progress > span')).toContainText('2 /');
    await expect(signal).toHaveCount(0);
    await page.clock.runFor(30);
    await expect(workspace.locator('.workspace-progress > span')).toContainText('2 /');
    await expect(signal).toHaveCount(0);
    for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeEnabled();
    const total = mode === 'practice' ? 15 : 30;
    await expect(workspace.locator('.workspace-progress > span')).toContainText(`2 / ${mode === 'practice' ? total : 10}`);
    for (let index = 1; index < total; index += 1) {
      const shown = await workspace.locator('.rps-board img').getAttribute('alt');
      expect(shown).toMatch(/^(가위|바위|보)$/);
      await workspace.locator('.rps-actions button').filter({ hasText: shown! }).click();
      if (index === total - 1) {
        // 마지막 문항에는 320ms 입력 정착이 없다. 실제 응답 시점의 1초를 독립 검증한다.
        await page.clock.runFor(999);
        await expect(signal).toHaveText('오답');
        for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeDisabled();
        await expect(page.locator('.stage-result')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath(`rps-${mode}-final-feedback-999.png`) });
        await page.clock.runFor(1);
        await expect(page.locator('.stage-result')).toBeVisible();
        await expect(workspace).toHaveCount(0);
        await expect(page.locator('.result-metrics article').filter({ hasText: '오류' }).locator('b')).toHaveText(String(total));
        await expect(page.locator('.result-metrics article').filter({ hasText: '정확도' }).locator('b')).toHaveText('0%');
      } else {
        await page.clock.runFor(1320);
        if (mode === 'simulation' && (index === 9 || index === 19)) {
          const transition = workspace.locator('.rps-round-transition');
          for (const second of ['3', '2', '1']) {
            await expect(transition.locator('.rps-transition-countdown > b')).toHaveText(second);
            await page.clock.runFor(1050);
          }
          await expect(transition).toHaveCount(0);
        }
        await expect(workspace.locator('.rps-board')).toBeVisible();
        await expect(signal).toHaveCount(0);
        for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeEnabled();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('실전형 가로 화면에서도 오답 신호는 도움 문구와 별개로 보인다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const { workspace, errors } = await startFeedbackSession(page, 'simulation');
  const signal = workspace.locator('.answer-signal');
  await expect(signal).toBeVisible();
  await expect(signal).toHaveText('오답');
  const box = await signal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(844);
  expect(box!.y + box!.height).toBeLessThanOrEqual(390);
  await expect(workspace.locator('.workspace-foot > b')).toHaveText('');
  const liveResult = workspace.locator(':scope > .sr-only[aria-live="polite"]');
  await expect(liveResult).toBeVisible();
  await expect(liveResult).toContainText('오답');
  await page.screenshot({ path: testInfo.outputPath('rps-landscape-error-signal.png') });
  expect(errors).toEqual([]);
});

test('오답 신호 유지 중 종료 확인창은 남은 표시 시간을 보존한다', async ({ page }, testInfo) => {
  const { workspace, errors } = await startFeedbackSession(page, 'simulation');
  await page.clock.runFor(300);
  await workspace.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
  const confirmation = page.locator('.session-confirm[role="alertdialog"]');
  await expect(confirmation).toBeVisible();
  await page.clock.runFor(5000);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 /');
  await expect(workspace.locator('.answer-signal')).toHaveText('오답');
  await page.screenshot({ path: testInfo.outputPath('rps-error-signal-paused.png') });
  await confirmation.getByRole('button', { name: '계속 연습' }).click();
  await expect(confirmation).toHaveCount(0);
  await page.clock.runFor(699);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 /');
  await expect(workspace.locator('.answer-signal')).toBeVisible();
  await page.clock.runFor(320);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 /');
  await expect(workspace.locator('.answer-signal')).toBeVisible();
  for (const action of await workspace.locator('.rps-actions button').all()) await expect(action).toBeDisabled();
  await page.clock.runFor(1);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('2 /');
  await expect(workspace.locator('.answer-signal')).toHaveCount(0);
  await page.clock.runFor(30);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('2 /');
  await expect(workspace.locator('.answer-signal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('도형 순서 실전형 정오 표시는 고정 간격과 일시정지 잔여 시간을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="nback"]');
  await expect(stage).toBeVisible();
  await stage.getByRole('radio', { name: /실전형 연습/ }).click();
  const preset = stage.locator('.nback-simulation-preset');
  await expect(preset).toBeVisible();
  await expect(preset.locator('em')).toHaveText('훈련용 47문항');
  await expect(preset).toContainText('2개 → 3개 · 무채점');
  await expect(preset).toContainText('이름표·정답 해설 숨김 · 정오 신호 표시');
  await expect(preset).not.toContainText('정오 피드백 숨김');
  const origin = Date.UTC(2030, 0, 9);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  const clockStart = await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }));
  let advancedMs = 0;
  const expectClock = async () => {
    expect(await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }))).toEqual({
      wall: clockStart.wall + advancedMs,
      ticks: clockStart.ticks + advancedMs,
    });
  };
  const advanceClock = async (ms: number) => {
    await page.clock.runFor(ms);
    advancedMs += ms;
    await expectClock();
  };
  await expectClock();
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();
  await expectClock();
  const workspace = page.locator('.game-workspace.game-nback');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.mode-chip')).toHaveText('실전형 연습');
  const countdown = workspace.locator('.nback-countdown');
  for (const second of ['3', '2', '1']) {
    await expect(countdown.locator('> b')).toHaveText(second);
    // 초과 진행 없이 상태를 확인해 다음 타이머도 같은 정지 시각에서 시작한다.
    await advanceClock(1000);
  }
  const stimulus = workspace.locator('.nback-stimulus').getByRole('img');
  const actions = workspace.locator('.nback-actions button');
  const signal = workspace.locator('.answer-signal');
  const liveResult = workspace.locator(':scope > .sr-only[aria-live="polite"]');
  const progress = workspace.locator('.workspace-progress i');
  const deadline = workspace.locator('.nback-time');
  const glyphHistory: string[] = [];
  for (const position of [1, 2]) {
    await expect(workspace.locator('.nback-lag-map')).toHaveAttribute('aria-label', `기억 채우기 ${position}/2`);
    await expect(actions).toHaveCount(0);
    await expect(signal).toHaveCount(0);
    const glyph = await stimulus.getAttribute('aria-label');
    expect(glyph).toBeTruthy();
    glyphHistory.push(glyph!);
    await advanceClock(3000);
  }
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(actions).toHaveCount(2);
  await expect(deadline).toHaveAttribute('data-deadline-active', 'true');
  await expect(deadline).toHaveAttribute('aria-valuemax', '3000');
  await expect(deadline).toHaveAttribute('aria-valuenow', '3000');
  expect(advancedMs).toBe(9000);
  const firstGlyph = await stimulus.getAttribute('aria-label');
  expect(firstGlyph).toBeTruthy();
  glyphHistory.push(firstGlyph!);
  await advanceClock(20);
  await expect(workspace).toBeFocused();
  const wrongDecision = firstGlyph === glyphHistory.at(-3) ? '2번째 전과 다름' : '2번째 전과 같음';
  const wrongAnswer = actions.filter({ hasText: wrongDecision });
  await expect(wrongAnswer).toHaveCount(1);
  await expect(wrongAnswer).toBeEnabled();
  await expectClock();
  await wrongAnswer.click();
  await expectClock();
  await expect(wrongAnswer).toHaveAttribute('aria-pressed', 'true');
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  await expect(signal).toBeVisible();
  await expect(signal).toHaveText('오답');
  await expect(signal).toHaveAttribute('aria-label', '응답 결과: 오답');
  await expect(signal).toHaveAttribute('data-feedback-tone', 'error');
  await expect(signal).toHaveCSS('color', 'rgb(163, 63, 73)');
  await expect(signal.locator('i')).toHaveCSS('background-color', 'rgb(163, 63, 73)');
  await expect(liveResult).toContainText(`오답 · 현재 도형 ${firstGlyph}`);
  await expect(liveResult).toContainText('응답 저장됨');
  await expect(liveResult).toContainText('고정 간격이 끝나면 다음 도형으로 이동합니다.');
  await expect(liveResult).not.toContainText('정답은');
  await expect(workspace.locator('.workspace-foot > b')).not.toContainText('정답은');
  await advanceClock(300);
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expectClock();
  await workspace.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
  await expectClock();
  const confirmation = page.locator('.session-confirm[role="alertdialog"]');
  await expect(confirmation).toBeVisible();
  await expect(deadline.locator('.time-track > i')).toHaveCSS('animation-play-state', 'paused');
  await expect(stage.locator('.stage-content')).toHaveAttribute('inert', '');
  await expect(stage.locator('.stage-content')).toHaveAttribute('aria-hidden', 'true');
  await expect(stimulus).toHaveCount(0);
  // 첫 채점 시작 9000ms부터 응답 전 초점 20ms와 정지 전 300ms를 소비했다.
  const pausedRemainingMs = 3000 - (advancedMs - 9000);
  expect(pausedRemainingMs).toBe(2680);
  await expect(deadline).toHaveAttribute('aria-valuenow', String(pausedRemainingMs));
  await advanceClock(20);
  await expect(confirmation.getByRole('button', { name: '계속 연습' })).toBeFocused();
  await advanceClock(5000);
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  // 확인창에 의해 접근성 탐색에서 숨겨진 도형의 DOM 상태만 확인한다.
  await expect(workspace.locator('.nback-stimulus').getByRole('img', { includeHidden: true })).toHaveAttribute('aria-label', firstGlyph!);
  await expect(wrongAnswer).toHaveAttribute('aria-pressed', 'true');
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  await expect(signal).toHaveText('오답');
  await expect(deadline).toHaveAttribute('aria-valuenow', String(pausedRemainingMs));
  await page.screenshot({ path: testInfo.outputPath('nback-simulation-error-paused.png') });
  await expectClock();
  await confirmation.getByRole('button', { name: '계속 연습' }).click();
  await expectClock();
  await expect(confirmation).toHaveCount(0);
  await expect(deadline.locator('.time-track > i')).toHaveCSS('animation-play-state', 'running');
  await expect(stage.locator('.stage-content')).not.toHaveAttribute('inert', '');
  await expect(stage.locator('.stage-content')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(stimulus).toHaveCount(1);
  await advanceClock(20);
  // 정지 중 초점 20ms는 보존됐지만, 재개 후 초점 20ms는 활성 시간을 소비한다.
  await advanceClock(pausedRemainingMs - 20 - 1);
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(stimulus).toHaveAttribute('aria-label', firstGlyph!);
  await expect(signal).toHaveText('오답');
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('nback-simulation-resume-before-deadline.png') });
  await advanceClock(1);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(signal).toHaveCount(0);
  for (const action of await actions.all()) await expect(action).toBeEnabled();
  const nextStimulusStartMs = advancedMs;
  const nextGlyph = await stimulus.getAttribute('aria-label');
  expect(nextGlyph).toBeTruthy();
  glyphHistory.push(nextGlyph!);
  await expect(liveResult).toContainText(`현재 도형 ${nextGlyph}. 지금 분류하세요.`);
  await advanceClock(20);
  await expect(workspace).toBeFocused();
  const correctDecision = nextGlyph === glyphHistory.at(-3) ? '2번째 전과 같음' : '2번째 전과 다름';
  const correctAnswer = actions.filter({ hasText: correctDecision });
  await expect(correctAnswer).toHaveCount(1);
  await expect(correctAnswer).toBeEnabled();
  await expectClock();
  await correctAnswer.click();
  await expectClock();
  await expect(correctAnswer).toHaveAttribute('aria-pressed', 'true');
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  await expect(signal).toBeVisible();
  await expect(signal).toHaveText('정답');
  await expect(signal).toHaveAttribute('aria-label', '응답 결과: 정답');
  await expect(signal).toHaveAttribute('data-feedback-tone', 'success');
  await expect(signal).toHaveCSS('color', 'rgb(25, 112, 103)');
  await expect(liveResult).toContainText(`정답 · 현재 도형 ${nextGlyph}`);
  await expect(liveResult).toContainText('응답 저장됨');
  await expect(liveResult).toContainText('고정 간격이 끝나면 다음 도형으로 이동합니다.');
  await expect(liveResult).not.toContainText('정답은');
  await advanceClock(300);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(signal).toHaveText('정답');
  await page.screenshot({ path: testInfo.outputPath('nback-simulation-next-correct-fixed-interval.png') });
  const correctRemainingMs = 3000 - (advancedMs - nextStimulusStartMs);
  expect(correctRemainingMs).toBe(2680);
  await advanceClock(correctRemainingMs - 1);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(signal).toHaveText('정답');
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  await advanceClock(1);
  await expect(progress).toHaveAttribute('aria-valuenow', '3');
  await expect(signal).toHaveCount(0);
  for (const action of await actions.all()) await expect(action).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('nback-simulation-correct-cleared-at-deadline.png') });
  await expectClock();
  await workspace.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
  await expectClock();
  await expect(confirmation).toBeVisible();
  await expectClock();
  await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
  await expectClock();
  await expect(page.locator('.stage-panel')).toHaveCount(0);
  await expect(page.locator('.record-summary')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('길 만들기 초기화는 결과 배지를 만들지 않고 안내와 누적 조작을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="path"]');
  await expect(stage).toBeVisible();
  const origin = Date.UTC(2030, 0, 9);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-path');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  const grid = workspace.locator('.path-grid');
  await expect(grid).toBeVisible();
  const geometry = await grid.evaluate(board => {
    const rect = board.getBoundingClientRect();
    const shell = board.parentElement!;
    const left = shell.querySelector('.edge-column.left')!.getBoundingClientRect();
    const right = shell.querySelector('.edge-column.right')!.getBoundingClientRect();
    const cells = [...board.querySelectorAll('.path-cell')].map(cell => {
      const cellRect = cell.getBoundingClientRect();
      return { width: cellRect.width, height: cellRect.height };
    });
    return { width: rect.width, height: rect.height, available: shell.getBoundingClientRect().width - left.width - right.width, cells };
  });
  expect(Math.abs(geometry.width - geometry.available)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(1);
  expect(geometry.cells).toHaveLength(25);
  for (const cell of geometry.cells) {
    expect(cell.width).toBeGreaterThanOrEqual(44);
    expect(cell.height).toBeGreaterThanOrEqual(44);
  }
  const firstCell = workspace.locator('.path-cell').first();
  // 두 화면 크기 모두 실제 보이는 조작부를 사용한다.
  const cycle = firstCell.locator('.path-fence-cycle');
  if (await cycle.isVisible()) await cycle.click();
  else await firstCell.locator('.path-fence-choice.is-slash').click();
  await expect(firstCell).toHaveAttribute('data-fence', 'slash');
  const actions = workspace.locator('.path-toolbar > span').first().locator('b');
  await expect(actions).toHaveText('1');
  await workspace.getByRole('button', { name: '전체 초기화', exact: true }).click();
  await expect(workspace.locator('.path-cell[data-fence="empty"]')).toHaveCount(25);
  await expect(actions).toHaveText('2');
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 3');
  await expect(workspace.locator('.answer-signal')).toHaveCount(0);
  await expect(workspace.locator('.workspace-foot > b')).toHaveText('배치를 초기화했습니다. 누적 조작 기록은 유지됩니다.');
  await expect(workspace.locator(':scope > .sr-only[aria-live="polite"]')).toContainText('배치를 초기화했습니다. 누적 조작 기록은 유지됩니다.');
  await page.screenshot({ path: testInfo.outputPath('path-reset-status-without-result.png') });
  await workspace.locator('.path-submit').click();
  await expect(workspace.locator('.answer-signal')).toHaveText('오답');
  await expect(workspace.locator('.answer-signal')).toHaveAttribute('data-feedback-tone', 'error');
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 3');
  expect(errors).toEqual([]);
});

test('길 만들기 실전형 경로 오답은 빨간 신호를 표시하고 한 번만 이동한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="path"]');
  await expect(stage).toBeVisible();
  const origin = Date.UTC(2030, 0, 9);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-path');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.path-grid')).toBeVisible();
  await expect(workspace.locator('.path-cell[data-fence="empty"]')).toHaveCount(25);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 4');
  await workspace.locator('.path-submit').click();
  const signal = workspace.locator('.answer-signal');
  await expect(signal).toBeVisible();
  await expect(signal).toHaveText('오답');
  await expect(signal).toHaveAttribute('aria-label', '응답 결과: 오답');
  await expect(signal).toHaveAttribute('data-feedback-tone', 'error');
  await expect(signal).toHaveCSS('color', 'rgb(163, 63, 73)');
  await expect(signal.locator('i')).toHaveCSS('background-color', 'rgb(163, 63, 73)');
  await expect(workspace.locator(':scope > .sr-only[aria-live="polite"]')).toContainText('오답');
  await expect(workspace.locator('.workspace-foot > b')).toHaveText('');
  await expect(workspace.locator('.path-submit')).toBeDisabled();
  await expect(workspace.locator('.path-toolbar button')).toBeDisabled();
  await expect(workspace.locator('.path-grid button:enabled')).toHaveCount(0);
  await page.keyboard.press('Slash');
  await page.keyboard.press('Enter');
  await expect(workspace.locator('.path-cell[data-fence="empty"]')).toHaveCount(25);
  await page.clock.runFor(549);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 4');
  await expect(signal).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('path-simulation-error-signal.png') });
  await page.clock.runFor(1);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('2 / 4');
  await expect(signal).toHaveCount(0);
  await expect(workspace.locator('.path-submit')).toBeEnabled();
  await expect(workspace.locator('.path-toolbar button')).toBeEnabled();
  await expect(workspace.locator('.path-grid button:disabled')).toHaveCount(0);
  await expect(workspace.locator('.path-cell[data-fence="empty"]')).toHaveCount(25);
  await page.clock.runFor(550);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('2 / 4');
  await page.screenshot({ path: testInfo.outputPath('path-simulation-next-once.png') });
  expect(errors).toEqual([]);
});
