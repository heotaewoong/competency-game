import { expect, test, type Page, type Route } from '@playwright/test';

const atlasPath = '**/assets/appointment/food-sprite-v1.webp';

async function openAppointment(page: Page, rounds: string[] = ['food']) {
  await page.addInitScript((selectedRounds) => {
    window.localStorage.setItem('nineflow-appointment-preferences-v1', JSON.stringify({ selectedRounds }));
    window.localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ appointment: { quantity: 1, paceMs: 1500 } }));
    window.localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ appointment: true }));
  }, rounds);
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="appointment"]');
  await expect(stage.getByLabel('라운드당 문항 현재 값')).toHaveText('1');
  return stage;
}

test('메뉴 그림 실패는 시작을 막고 재시도 성공 후 완료·재시작에 성공 캐시를 재사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let failAtlas = true;
  let requests = 0;
  await page.route(atlasPath, (route) => {
    requests += 1;
    return failAtlas ? route.abort() : route.continue();
  });
  const stage = await openAppointment(page);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const failure = page.getByRole('alertdialog', { name: '메뉴 그림을 불러오지 못했습니다' });
  await expect(failure).toBeVisible();
  const dialogBox = await failure.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: test.info().outputPath('menu-asset-recovery-mobile.png') });
  await expect(page.locator('.game-workspace, .stage-result')).toHaveCount(0);

  failAtlas = false;
  await failure.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(failure).toHaveCount(0);
  await page.getByRole('button', { name: '이 라운드 시작' }).click();
  await expect(page.locator('.food-memory')).toBeVisible();
  for (let friend = 0; friend < 3; friend += 1) {
    const next = page.locator('.appointment-stimulus .single-action');
    await expect(next).toBeEnabled();
    await next.click();
  }
  await page.locator('.food-choice-grid button').first().click();
  const result = page.locator('.stage-result');
  await expect(result).toBeVisible();

  const requestsBeforeRestart = requests;
  failAtlas = true;
  await result.getByRole('button', { name: '다시 연습', exact: true }).click();
  await expect(page.getByRole('button', { name: '이 라운드 시작' })).toBeVisible();
  await expect(page.locator('.appointment-asset-dialog')).toHaveCount(0);
  expect(requests).toBe(requestsBeforeRestart);
});

test('실전형 메뉴 그림 대기는 10초 뒤 재시도 안내로 끝나며 문제 시간은 시작하지 않는다', async ({ page }) => {
  let pending: Route | undefined;
  await page.route(atlasPath, (route) => { pending = route; });
  const stage = await openAppointment(page);
  await page.clock.install();
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();
  await expect(page.getByRole('alertdialog', { name: '메뉴 그림을 준비하고 있습니다' })).toBeVisible();
  await expect(page.locator('.game-workspace, .stage-result')).toHaveCount(0);
  await page.clock.runFor(10_100);
  const failure = page.getByRole('alertdialog', { name: '메뉴 그림을 불러오지 못했습니다' });
  await expect(failure).toBeVisible();
  await expect(page.locator('.game-workspace, .stage-result')).toHaveCount(0);
  await failure.getByRole('button', { name: '시작 취소' }).click();
  await expect(stage.locator('.stage-intro')).toBeVisible();
  await pending?.abort().catch(() => undefined);
});

test('그림 대기를 취소하고 다른 게임으로 이동한 뒤 늦게 로드되어도 약속 게임이 시작되지 않는다', async ({ page }) => {
  let pending: Route | undefined;
  await page.route(atlasPath, (route) => { pending = route; });
  const stage = await openAppointment(page);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const loading = page.getByRole('alertdialog', { name: '메뉴 그림을 준비하고 있습니다' });
  await expect(loading).toBeVisible();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await loading.getByRole('button', { name: '시작 취소' }).click();
  await stage.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.getByRole('button', { name: /숫자 누르기, 난이도 하, 설정 열기/ }).click();
  await pending?.continue();
  await expect(page.locator('section[data-game="number"] .stage-intro')).toBeVisible();
  await expect(page.locator('section[data-game="appointment"], .game-workspace')).toHaveCount(0);
});

test('그림을 기다리다 탭을 떠나면 로드가 끝나도 복귀 확인 전에는 카운트다운이 진행되지 않는다', async ({ page }) => {
  let pending: Route | undefined;
  await page.route(atlasPath, (route) => { pending = route; });
  const stage = await openAppointment(page);
  await page.clock.install();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  await expect(page.getByRole('alertdialog', { name: '메뉴 그림을 준비하고 있습니다' })).toBeVisible();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pending!.continue();
  const paused = page.getByRole('alertdialog', { name: '연습을 잠시 멈췄습니다' });
  await expect(paused).toBeVisible();
  const countdown = page.locator('.game-preparation > b');
  await expect(countdown).toHaveText('3');
  await page.clock.runFor(5_000);
  await expect(countdown).toHaveText('3');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await paused.getByRole('button', { name: '준비됐어요 · 계속하기' }).click();
  await page.clock.runFor(1_100);
  await expect(countdown).toHaveText('2');
});

test('메뉴가 없는 요일 연습은 메뉴 그림 실패와 무관하게 시작한다', async ({ page }) => {
  await page.route(atlasPath, (route) => route.abort());
  const stage = await openAppointment(page, ['day']);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  await expect(page.getByRole('button', { name: '이 라운드 시작' })).toBeVisible();
  await expect(page.locator('.appointment-asset-dialog')).toHaveCount(0);
});
