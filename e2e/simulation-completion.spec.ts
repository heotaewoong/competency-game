import { expect, test, type Locator, type Page } from '@playwright/test';

type SimulationGame = {
  id: 'rps' | 'rotation' | 'path' | 'nback' | 'number' | 'count' | 'mouse';
  title: string;
  difficulty: '하' | '중' | '상';
};

const games = {
  rps: { id: 'rps', title: '가위바위보', difficulty: '하' },
  rotation: { id: 'rotation', title: '도형 회전하기', difficulty: '중' },
  path: { id: 'path', title: '길 만들기', difficulty: '상' },
  nback: { id: 'nback', title: '도형 순서 기억하기', difficulty: '상' },
  number: { id: 'number', title: '숫자 누르기', difficulty: '하' },
  count: { id: 'count', title: '개수 비교하기', difficulty: '하' },
  mouse: { id: 'mouse', title: '고양이 술래잡기', difficulty: '중' },
} as const satisfies Record<string, SimulationGame>;

type StartedSimulation = {
  workspace: Locator;
  pageErrors: string[];
};

async function startSimulation(page: Page, game: SimulationGame, clockDay: number): Promise<StartedSimulation> {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    // 문제 배열은 고정하되 게임의 공개 UI와 타이머를 그대로 통과한다.
    Math.random = () => 0;
  });
  await page.goto('/');
  await page.getByRole('button', {
    name: new RegExp(`${game.title}, 난이도 ${game.difficulty}, 설정 열기`),
  }).click();

  const stage = page.locator(`section[data-game="${game.id}"]`);
  await expect(stage).toBeVisible();

  // 지연 로딩은 실제 시간으로 끝낸 뒤 게임 세션을 만들기 직전에만 시계를
  // 정지한다. 이 순서가 번들 로딩까지 멈춰 게임이 시작되지 않는 회귀를 막는다.
  const clockOrigin = Date.UTC(2035, 0, clockDay);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  // N-back은 자체 라운드 카운트다운이 곧바로 시작되고, 나머지 게임은
  // 공통 준비 카운트다운을 먼저 거친다.
  if (game.id !== 'nback') {
    const preparation = page.locator('.game-preparation');
    for (const second of ['3', '2', '1']) {
      await expect(preparation.locator('> b')).toHaveText(second);
      await page.clock.runFor(1_050);
    }
  }

  const workspace = page.locator(`.game-workspace.game-${game.id}`);
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.mode-chip')).toHaveText('실전형 연습');
  return { workspace, pageErrors };
}

async function runPastDeadline(page: Page, deadline: Locator, expectedDuration: number) {
  await expect(deadline).toHaveAttribute('data-deadline-active', 'true');
  const duration = Number(await deadline.getAttribute('aria-valuemax'));
  const remaining = Number(await deadline.getAttribute('aria-valuenow'));
  expect(duration).toBe(expectedDuration);
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(duration);
  // 이미 흐른 시간은 다시 더하지 않는다. 제한을 막 넘긴 100ms까지만 진행해
  // timeout 처리와 다음 단계 예약을 모두 관찰할 수 있게 한다.
  await page.clock.runFor(remaining + 100);
}

async function expectSimulationResult(
  page: Page,
  game: SimulationGame,
  errorLabel: string,
  errors: number,
  pageErrors: string[],
) {
  const result = page.locator('.stage-result');
  await expect(result).toBeVisible();
  await expect(page.getByRole('heading', { name: `${game.title} 결과` })).toBeVisible();
  await expect(result.locator('> p')).toContainText('실전형 연습 완료');
  await expect(result.locator('.result-metrics article').filter({ hasText: errorLabel }).locator('b')).toHaveText(String(errors));
  expect(pageErrors).toEqual([]);
}

async function expectAllButtonsDisabled(buttons: Locator) {
  await expect.poll(() => buttons.evaluateAll((items) => items.every((item) => (item as HTMLButtonElement).disabled))).toBe(true);
}

test('가위바위보 실전형은 각 라운드의 실제 정답을 잠그고 30문항 채점까지 유지한다', async ({ page }) => {
  test.setTimeout(180_000);
  const game = games.rps;
  const { workspace, pageErrors } = await startSimulation(page, game, 1);

  for (let index = 0; index < 30; index += 1) {
    const phase = Math.floor(index / 10) + 1;
    const phasePosition = (index % 10) + 1;
    await expect(workspace.locator('.workspace-progress > span')).toContainText(`${phasePosition} / 10`);
    await expect(workspace.locator('.round-label span')).toHaveText(`라운드 ${phase} / 3`);
    await expect(workspace.locator('.rps-board')).toBeVisible();
    const actions = workspace.locator('.rps-actions button');
    await expect(actions).toHaveCount(3);
    const deadline = workspace.locator('.time-strip');
    const shouldAnswerCorrectly = phasePosition === 1;
    if (shouldAnswerCorrectly) {
      const shown = await workspace.locator('.rps-board img').getAttribute('alt');
      expect(shown).toMatch(/^(가위|바위|보)$/);
      const playerIsUnknown = await workspace.locator('.rps-board article').first().locator('.rps-question').count() === 1;
      const winningPlayerChoice: Record<string, string> = { 가위: '바위', 바위: '보', 보: '가위' };
      const losingOpponentChoice: Record<string, string> = { 가위: '보', 바위: '가위', 보: '바위' };
      const answerLabel = (playerIsUnknown ? winningPlayerChoice : losingOpponentChoice)[shown!];
      await actions.filter({ hasText: answerLabel }).click();
      await expectAllButtonsDisabled(actions);
      await expect(deadline).toHaveAttribute('data-deadline-active', 'false');
    } else {
      await runPastDeadline(page, deadline, 4_500);
    }
    if (index === 9 || index === 19) {
      await expect(deadline).toHaveAttribute('data-deadline-active', 'false');
      // timeout 피드백 420ms와 입력 잠금 해제 320ms 뒤 전환 화면이 열린다.
      await page.clock.runFor(650);
      const nextPhase = phase + 1;
      const transition = workspace.locator('.rps-round-transition');
      await expect(transition.locator('> span')).toHaveText(`ROUND ${nextPhase} / 3`);
      await expect(workspace.locator('.rps-board')).toHaveCount(0);
      await expect(workspace.locator('.time-strip')).toHaveCount(0);
      const countdown = transition.locator('.rps-transition-countdown');
      for (const second of ['3', '2', '1']) {
        await expect(countdown.locator('b')).toHaveText(second);
        await expect(countdown).toHaveAttribute('aria-label', `${second}초 뒤 ${nextPhase}라운드 시작`);
        await page.clock.runFor(1_050);
      }
      await expect(transition).toHaveCount(0);
      await expect(workspace.locator('.round-label span')).toHaveText(`라운드 ${nextPhase} / 3`);
      await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 10');
    } else if (index < 29) {
      await expect(deadline).toHaveAttribute('data-deadline-active', 'false');
      await page.clock.runFor(800);
      if (shouldAnswerCorrectly) await expect(workspace.locator('.workspace-progress > span')).toContainText('2 / 10');
    } else {
      await page.clock.runFor(500);
    }
  }

  await expectSimulationResult(page, game, '오류', 27, pageErrors);
  await expect(page.locator('.result-metrics article').filter({ hasText: '정확도' }).locator('b')).toHaveText('10%');
});

test('도형 회전하기 실전형은 알파벳과 격자 도형 두 3분 단계를 완주한다', async ({ page }) => {
  test.setTimeout(120_000);
  const game = games.rotation;
  const { workspace, pageErrors } = await startSimulation(page, game, 2);
  const banner = workspace.locator('.rotation-phase-banner');

  await expect(banner.locator('span')).toHaveText('실전형 단계 1 / 2');
  await expect(banner.locator('b')).toHaveText('알파벳');
  await expect(workspace.locator('.rotation-comparison')).toBeVisible();
  await runPastDeadline(page, workspace.locator('.time-strip'), 180_000);

  await expect(banner.locator('span')).toHaveText('실전형 단계 2 / 2');
  await expect(banner.locator('b')).toHaveText('4×4 격자 도형');
  await runPastDeadline(page, workspace.locator('.time-strip'), 180_000);

  await expectSimulationResult(page, game, '오류', 2, pageErrors);
  await expect(page.locator('.rotation-result-detail').getByText('풀이 수').locator('..').locator('dd')).toHaveText('2');
});

test('길 만들기 실전형은 5×5 네 문제와 문제별 제한시간을 끝까지 유지한다', async ({ page }) => {
  test.setTimeout(120_000);
  const game = games.path;
  const { workspace, pageErrors } = await startSimulation(page, game, 3);

  for (let index = 0; index < 4; index += 1) {
    await expect(workspace.locator('.workspace-progress > span')).toContainText(`${index + 1} / 4`);
    await expect(workspace.locator('.path-shell')).toBeVisible();
    await expect(workspace.locator('.path-grid .path-cell')).toHaveCount(25);
    await runPastDeadline(page, workspace.locator('.time-strip'), 60_000);
    await page.clock.runFor(650);
  }

  await expectSimulationResult(page, game, '최대득점 미달', 4, pageErrors);
  await expect(page.locator('.path-result-detail')).toContainText('경로 연결 완료0 / 4');
});

test('도형 순서 기억하기 실전형은 각 라운드의 실제 정답을 잠그고 47개 문항을 채점한다', async ({ page }) => {
  test.setTimeout(240_000);
  const game = games.nback;
  const { workspace, pageErrors } = await startSimulation(page, game, 4);
  const nbackStage = workspace.locator('.nback-stage');

  const runNBackCountdown = async (round: number) => {
    const countdown = nbackStage.locator('.nback-countdown');
    for (const second of ['3', '2', '1']) {
      await expect(countdown.locator('> b')).toHaveText(second);
      await expect(countdown.locator('> span')).toContainText(`ROUND ${round}`);
      await page.clock.runFor(1_050);
    }
  };

  await runNBackCountdown(1);
  let glyphHistory: string[] = [];
  for (let index = 0; index < 52; index += 1) {
    const secondRound = index >= 25;
    const round = secondRound ? 2 : 1;
    const position = secondRound ? index - 25 : index;
    const warmupCount = secondRound ? 3 : 2;
    const actionCount = position < warmupCount ? 0 : secondRound ? 3 : 2;
    if (position === 0) glyphHistory = [];
    await expect(nbackStage.locator('.nback-status span')).toContainText(`ROUND ${round}`);
    const actions = nbackStage.locator('.nback-actions button');
    await expect(actions).toHaveCount(actionCount);
    await expect(nbackStage.locator('.nback-stimulus')).toBeVisible();
    const glyph = await nbackStage.locator('.nback-stimulus').getByRole('img').getAttribute('aria-label');
    expect(glyph).toBeTruthy();
    glyphHistory.push(glyph!);
    const shouldAnswerCorrectly = position === warmupCount;
    const progress = workspace.locator('.workspace-progress i');
    const currentProgress = Number(await progress.getAttribute('aria-valuenow'));
    if (shouldAnswerCorrectly) {
      const current = glyphHistory.at(-1);
      const decision = current === glyphHistory.at(-3)
        ? '2번째 전과 같음'
        : secondRound && current === glyphHistory.at(-4)
          ? '3번째 전과 같음'
          : secondRound ? '둘 다 다름' : '2번째 전과 다름';
      const answer = actions.filter({ hasText: decision });
      await answer.click();
      await expect(answer).toHaveAttribute('aria-pressed', 'true');
      await expectAllButtonsDisabled(actions);
    }
    await runPastDeadline(page, nbackStage.locator('.nback-time'), 3_000);
    if (shouldAnswerCorrectly) await expect(progress).toHaveAttribute('aria-valuenow', String(currentProgress + 1));

    if (index === 24) await runNBackCountdown(2);
  }

  await expectSimulationResult(page, game, '오류', 45, pageErrors);
  await expect(page.locator('.result-metrics article').filter({ hasText: '정확도' }).locator('b')).toHaveText('4%');
  await expect(page.locator('.nback-result-detail')).toContainText('시간 초과45');
  await expect(page.locator('.nback-result-detail')).toContainText('2-back 정확도4%');
  await expect(page.locator('.nback-result-detail')).toContainText('2·3-back 정확도4%');
});

test('숫자 누르기 실전형은 1·2라운드 각 6문항과 전환 타이머를 지킨다', async ({ page }) => {
  test.setTimeout(180_000);
  const game = games.number;
  const { workspace, pageErrors } = await startSimulation(page, game, 5);

  for (let index = 0; index < 12; index += 1) {
    const round = index < 6 ? 1 : 2;
    const question = index < 6 ? index + 1 : index - 5;
    const banner = workspace.locator('.number-round-banner');
    await expect(banner.locator('span')).toHaveText(`ROUND ${round} / 2`);
    await expect(banner.locator('em')).toHaveText(`${question} / 6 문제`);
    await expect(workspace.locator('.number-board-pro button')).toHaveCount(9);
    await runPastDeadline(page, workspace.locator('.time-strip'), 20_000);

    if (index === 5) {
      await page.clock.runFor(400);
      const transition = workspace.locator('.number-round-transition');
      await expect(transition.locator('> span')).toHaveText('ROUND 2 / 2');
      await expect(workspace.locator('.time-strip')).toHaveCount(0);
      const countdown = transition.locator('.number-transition-countdown');
      for (const second of ['3', '2', '1']) {
        await expect(countdown.locator('b')).toHaveText(second);
        await page.clock.runFor(1_050);
      }
    } else if (index < 11) {
      await page.clock.runFor(400);
    } else {
      await page.clock.runFor(400);
    }
  }

  await expectSimulationResult(page, game, '오류', 12, pageErrors);
});

test('개수 비교하기 실전형은 준비·1초 제시·3초 응답 46문항을 완주한다', async ({ page }) => {
  // 46개 문항마다 세 UI 단계와 가상 시계 상태를 검증하므로 느린 CI에서도
  // 제품 제한시간보다 테스트 러너 상한이 먼저 끝나지 않게 여유를 둔다.
  test.setTimeout(420_000);
  const game = games.count;
  const { workspace, pageErrors } = await startSimulation(page, game, 6);

  for (let index = 0; index < 46; index += 1) {
    await expect(workspace.locator('.workspace-progress > span')).toContainText(`${index + 1} / 46`);
    await expect(workspace.locator('.count-fixation')).toBeVisible();
    await page.clock.runFor(400);

    const stimulus = workspace.locator('.count-wrap.phase-show');
    await expect(stimulus).toBeVisible();
    await expect(workspace.locator('.stage-sequence')).toHaveAttribute('aria-label', /현재 1초 동안/);
    await runPastDeadline(page, stimulus.locator('.time-strip'), 1_000);

    const answer = workspace.locator('.count-wrap.phase-answer');
    await expect(answer).toBeVisible();
    await expect(answer.locator('.count-board button')).toHaveCount(2);
    await runPastDeadline(page, answer.locator('.time-strip'), 3_000);
    await page.clock.runFor(250);
  }

  await expectSimulationResult(page, game, '오류', 46, pageErrors);
});

test('고양이 술래잡기 실전형은 위치 제시 네 단계와 색상 판단 20라운드를 완주한다', async ({ page }) => {
  test.setTimeout(300_000);
  const game = games.mouse;
  const { workspace, pageErrors } = await startSimulation(page, game, 7);
  const presentationStages = [
    { message: '생쥐 위치를 기억하세요.', duration: 1_000 },
    { message: '빈 격자에서도 위치를 유지하세요.', duration: 450 },
    { message: '고양이 위치를 확인하세요.', duration: 1_200 },
    { message: '빨강과 파랑 고양이 위치를 대조하세요.', duration: 850 },
  ] as const;

  for (let round = 0; round < 20; round += 1) {
    await expect(workspace.locator('.workspace-progress > span')).toContainText(`${round + 1} / 20`);
    for (const expectedStage of presentationStages) {
      const presentation = workspace.locator('.mouse-layout');
      await expect(presentation).toBeVisible();
      const deadline = presentation.locator('.time-strip');
      await expect(deadline).toHaveAttribute('aria-label', `${expectedStage.message} 제시시간`);
      await runPastDeadline(page, deadline, expectedStage.duration);
    }

    const red = workspace.locator('.cat-decision.red');
    await expect(red).toBeVisible();
    await expect(red.locator('.decision-groups button')).toHaveCount(8);
    await runPastDeadline(page, red.locator('.decision-time'), 4_000);
    await page.clock.runFor(350);

    const blue = workspace.locator('.cat-decision.blue');
    await expect(blue).toBeVisible();
    await expect(blue.locator('.decision-groups button')).toHaveCount(8);
    await runPastDeadline(page, blue.locator('.decision-time'), 4_000);
    await page.clock.runFor(250);
  }

  await expectSimulationResult(page, game, '오류', 40, pageErrors);
  await expect(page.locator('.mouse-result-detail')).toContainText('확신 응답0 / 40');
});
