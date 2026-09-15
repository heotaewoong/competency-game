import { expect, test, type Locator, type Page } from '@playwright/test';

const appointmentRounds = [
  { number: 1, label: '공통 선호 요일', choiceCount: 7, earlyViewport: { width: 320, height: 568 }, lateViewport: { width: 320, height: 568 } },
  { number: 2, label: '공통 선호 위치', choiceCount: 16, earlyViewport: { width: 320, height: 568 }, lateViewport: { width: 844, height: 360 } },
  { number: 3, label: '공통 선호 메뉴', choiceCount: 6, earlyViewport: { width: 390, height: 844 }, lateViewport: { width: 390, height: 844 } },
  { number: 4, label: '미탑승 버스', choiceCount: 5, earlyViewport: { width: 1024, height: 600 }, lateViewport: { width: 1024, height: 600 } },
] as const;

async function expectStageFitsWithoutScroll(workspace: Locator) {
  const subpixelTolerance = 2;
  const body = workspace.locator('.workspace-body');
  const shell = workspace.locator('.appointment-shell');
  const [bodyBox, shellBox] = await Promise.all([body.boundingBox(), shell.boundingBox()]);
  expect(bodyBox).not.toBeNull();
  expect(shellBox).not.toBeNull();
  expect(shellBox!.x).toBeGreaterThanOrEqual(bodyBox!.x - subpixelTolerance);
  expect(shellBox!.x + shellBox!.width).toBeLessThanOrEqual(bodyBox!.x + bodyBox!.width + subpixelTolerance);
  expect(shellBox!.y).toBeGreaterThanOrEqual(bodyBox!.y - subpixelTolerance);
  expect(shellBox!.y + shellBox!.height).toBeLessThanOrEqual(bodyBox!.y + bodyBox!.height + subpixelTolerance);
  const overflow = await body.evaluate((element) => ({
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(subpixelTolerance);
  expect(overflow.vertical).toBeLessThanOrEqual(subpixelTolerance);
}

async function expectChoiceTouchTargets(choices: Locator) {
  const boxes = await choices.evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { width: box.width, height: box.height, hit: Boolean(hit && button.contains(hit)) };
  }));
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.hit).toBe(true);
  }
}

async function runPastDeadline(page: Page, deadline: Locator) {
  await expect(deadline).toHaveAttribute('data-deadline-active', 'true');
  const duration = Number(await deadline.getAttribute('aria-valuemax'));
  const remaining = Number(await deadline.getAttribute('aria-valuenow'));
  expect(duration).toBeGreaterThan(0);
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(duration);
  // 이미 흐른 시간은 다시 더하지 않는다. timeout 직후 100ms까지만 진행해
  // 300ms 피드백 화면까지 건너뛰지 않고 잠금 상태도 확인한다.
  await page.clock.runFor(remaining + 100);
}

test('약속 정하기 실전형은 4라운드 각 10문항을 무응답으로 자동 진행해 결과에 도달한다', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="appointment"]');
  await expect(stage).toBeVisible();

  // 지연 로딩은 실제 시간으로 끝낸 뒤, 게임 타이머가 만들어지기 직전에만
  // 시계를 정지한다. 이후 공개 UI와 게임 상태는 그대로 조작한다.
  const clockOrigin = Date.UTC(2030, 0, 1);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  const preparation = page.locator('.game-preparation');
  for (const second of ['3', '2', '1']) {
    await expect(preparation.locator('> b')).toHaveText(second);
    await page.clock.runFor(1_050);
  }

  const workspace = page.locator('.game-workspace.game-appointment');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.mode-chip')).toHaveText('실전형 연습');
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 40');

  let overallQuestion = 0;
  for (const round of appointmentRounds) {
    const roundIntro = workspace.locator('.appointment-round-intro');
    await expect(roundIntro).toBeVisible();
    await expect(roundIntro.locator('> span')).toHaveText(`ROUND ${round.number} / 4`);
    await expect(roundIntro.getByRole('heading')).toHaveText(round.label);
    await page.clock.runFor(1_700);

    for (let question = 1; question <= 10; question += 1) {
      await page.setViewportSize(question <= 5 ? round.earlyViewport : round.lateViewport);
      overallQuestion += 1;
      const stimulus = workspace.locator('.appointment-stimulus');
      await expect(stimulus).toBeVisible();
      await expect(workspace.locator('.workspace-progress > span')).toContainText(`${overallQuestion} / 40`);
      await expect(workspace.locator('.appointment-round-intro, .appointment-round-rail')).toHaveCount(0);
      await expect(workspace.locator('.appointment-question-progress')).toHaveAttribute('aria-label', `${round.number}라운드 ${round.label}, ${question}번 문항, ${10 - question}문항 남음`);
      await expect(stimulus.locator('.appointment-phase-meta small')).toHaveText(`${question} / 10문항`);

      for (let person = 1; person <= 3; person += 1) {
        // 직전 사람의 320ms 중복 전환 잠금과 React effect 등록을 먼저 끝낸다.
        // 제시 제한시간(1초)보다 짧아서 현재 사람을 건너뛰지는 않는다.
        await page.clock.runFor(400);
        await expect(stimulus.locator('.appointment-phase-meta b')).toHaveText(`${person} / 3`);
        if (round.number === 1) await expect(stimulus.locator('.day-memory > span')).toHaveCount(question <= 5 ? 3 : 4);
        if (round.number === 2) {
          await expect(stimulus.locator('.location-memory > i')).toHaveCount(16);
          await expect(stimulus.locator('.location-memory > i.selected')).toHaveCount(question <= 5 ? 3 : 4);
        }
        if (round.number === 3) await expect(stimulus.locator('.food-memory > .food-card')).toHaveCount(question <= 5 ? 3 : 4);
        if (round.number === 4) await expect(stimulus.locator('.bus-memory > .bus-card')).toHaveCount(person === 2 ? 1 : 2);
        if (person === 1 && (question === 1 || question === 6)) await expectStageFitsWithoutScroll(workspace);
        await runPastDeadline(page, stimulus.locator('.time-strip'));
      }

      const questionPanel = workspace.locator('.appointment-question');
      await expect(questionPanel).toBeVisible();
      await expect(questionPanel.locator('.appointment-phase-meta small')).toHaveText(`${question} / 10문항`);
      await expect(questionPanel.locator('.appointment-choice-grid button')).toHaveCount(round.choiceCount);
      if (round.number === 4) await expect(questionPanel.locator('.bus-choice-grid .bus-stimulus')).toHaveCount(0);
      if (question === 1 || question === 6) {
        await expectStageFitsWithoutScroll(workspace);
        await expectChoiceTouchTargets(questionPanel.locator('.appointment-choice-grid button'));
      }

      const answerDeadline = questionPanel.locator('.time-strip');
      // 응답 화면의 timeout effect가 등록된 뒤 2.7초 제한을 넘긴다.
      await page.clock.runFor(400);
      await runPastDeadline(page, answerDeadline);
      await expect(answerDeadline).toHaveAttribute('data-deadline-active', 'false');

      // 무응답 피드백 체류가 끝나 다음 문항 또는 다음 라운드 안내로 이동한다.
      await page.clock.runFor(400);
    }
  }

  const result = page.locator('.stage-result');
  await expect(page.getByRole('heading', { name: '약속 정하기 결과' })).toBeVisible();
  await expect(result.locator('.result-metrics article').filter({ hasText: '오류' }).locator('b')).toHaveText('40');
});
