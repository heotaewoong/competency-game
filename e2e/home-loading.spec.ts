import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { games, type GameId, type SessionResult } from '../app/lib/game-data';
import { createPracticeResultsBackup, parsePracticeResultsBackup, PRACTICE_RESULTS_BACKUP_FORMAT, PRACTICE_RESULTS_BACKUP_VERSION } from '../app/lib/practice-backup';
import { compactReviewPayload, REVIEW_SCHEMA_VERSION, type GenericReviewAttempt } from '../app/lib/review-data';
import { contrastRatio } from './color-contrast';

const activityGoalKey = 'nineflow-training-activity-goal-v1';

async function installHistoryDateFixture(page: Page) {
  await page.addInitScript(() => {
    const generationKey = 'nineflow-practice-results-generation-v1';
    if (localStorage.getItem(generationKey) !== null) return;
    const now = new Date();
    const generation = 'history-date-regression';
    const offsetText = (timestamp: number, minutes: number, suffix: string) => new Date(timestamp + minutes * 60_000).toISOString().slice(0, -1) + suffix;
    const results = [0, -1, -20].flatMap((offset, group) => Array.from({ length: group < 2 ? 10 : 4 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, index < 2 ? (now.getTimezoneOffset() < 0 ? 0 : 23) : 11, index < 2 ? 30 : 60 - index);
      const completedAt = group === 0 && index < 2 ? offsetText(date.getTime(), index === 0 ? 540 : -240, index === 0 ? '+09:00' : '-04:00') : date.toISOString();
      return { id: `date-record-${group}-${String(index).padStart(2, '0')}`, gameId: index % 2 ? 'number' : 'rps', completedAt, accuracy: 30 + group * 10 + index, medianRt: 720, stability: 74, errors: 2, detail: { sessionMode: index % 4 < 2 ? 'practice' : 'simulation', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용', accessibilityProfile: 'standard|standard|system', simulationPresetVersion: 'public-rules-training-v4-2026-09' } };
    }));
    localStorage.setItem(generationKey, generation);
    localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 4500 } }));
    localStorage.setItem('nineflow-game-order-v2', 'perceived');
    localStorage.setItem('nineflow-training-activity-goal-v1', '3');
  });
}

async function readHistoryDateOracle(page: Page) {
  return page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const raw = generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null;
    const results: Array<{ id: string; gameId: string; completedAt: string; accuracy: number; medianRt: number; stability: number; errors: number; detail: Record<string, string | number> }> = raw ? JSON.parse(raw).results : [];
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const formatter = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const records = [...results].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt) || left.id.localeCompare(right.id)).map(record => ({ ...record, date: dateKey(new Date(record.completedAt)), when: formatter.format(new Date(record.completedAt)), utc: new Date(record.completedAt).toISOString() }));
    return { generation, records, dates: [...new Set(records.map(record => record.date))], offsetPair: records.filter(record => record.id === 'date-record-0-00' || record.id === 'date-record-0-01').map(record => ({ id: record.id, raw: record.completedAt, timestamp: Date.parse(record.completedAt), date: record.date, utcDate: new Date(record.completedAt).toISOString().slice(0, 10) })) };
  });
}

async function captureHistoryDate(page: Page, testInfo: TestInfo, phase: string, errors: string[], extra: Record<string, unknown> = {}) {
  const dateControl = page.locator('#history-completed-date');
  if (await dateControl.count()) await dateControl.scrollIntoViewIfNeeded();
  else await page.locator('#records-title').scrollIntoViewIfNeeded();
  const view = await page.evaluate(() => {
    const history = document.querySelector('.history-panel');
    const date = history?.querySelector('#history-completed-date');
    const active = document.activeElement;
    const rgba = (value: string) => {
      if (!/^rgba?\(/.test(value)) throw new Error(`지원하지 않는 실제 색상: ${value}`);
      const parts = value.match(/[\d.]+/g)!.map(Number);
      if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) throw new Error(`실제 색상 채널 오류: ${value}`);
      return { channels: parts.slice(0, 3), alpha: parts[3] ?? 1 };
    };
    const control = (node: Element) => {
      const style = getComputedStyle(node);
      const layers: ReturnType<typeof rgba>[] = [];
      const images: string[] = [];
      const opacities: number[] = [];
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        const computed = getComputedStyle(parent);
        const layer = rgba(computed.backgroundColor);
        layers.push(layer);
        images.push(computed.backgroundImage);
        if (layer.alpha === 1) break;
      }
      for (let parent: Element | null = node; parent; parent = parent.parentElement) opacities.push(Number(getComputedStyle(parent).opacity));
      let background = [255, 255, 255];
      for (const layer of layers.reverse()) background = layer.channels.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
      const foreground = rgba(style.color);
      const effective = foreground.channels.map((channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha));
      const box = node.getBoundingClientRect();
      return { tag: node.tagName, focused: active === node, focusVisible: node.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth), fontSize: Number.parseFloat(style.fontSize), effectiveColor: `rgb(${effective.join(', ')})`, effectiveBackground: `rgb(${background.join(', ')})`, images, opacities, box: { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } };
    };
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      contrast: document.documentElement.dataset.contrast, textScale: document.documentElement.dataset.textScale,
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      panel: history ? { clientWidth: history.clientWidth, scrollWidth: history.scrollWidth } : null,
      filters: Array.from(history?.querySelectorAll('select') ?? [], select => ({ id: select.id, label: select.closest('label')?.childNodes[0]?.textContent, value: select.querySelector('option:checked')?.getAttribute('value'), options: Array.from(select.querySelectorAll('option'), option => ({ value: option.getAttribute('value'), text: option.textContent })) })),
      date: date ? { value: date.querySelector('option:checked')?.getAttribute('value'), describedBy: date.getAttribute('aria-describedby'), ...control(date) } : null,
      note: history?.querySelector('#history-date-note')?.textContent,
      rows: Array.from(history?.querySelectorAll('.record-list > article') ?? [], article => ({ title: article.querySelector('div > b')?.textContent, when: article.querySelector('div > small')?.textContent, score: article.querySelector('dd')?.textContent })),
      status: history?.querySelector('[role="status"]')?.textContent, empty: history?.querySelector('.history-empty')?.textContent,
      more: history?.querySelector('.history-more')?.textContent,
      unfiltered: { header: document.querySelector('.header-status')?.textContent, summary: document.querySelector('.record-summary')?.textContent, gameRecords: document.querySelector('.game-record-grid')?.textContent, progress: Array.from(document.querySelectorAll('.record-progress'), panel => panel.textContent), activity: document.querySelector('.training-activity')?.textContent, activityDates: Array.from(document.querySelectorAll('.training-activity-days li'), day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })) },
      active: { tag: active?.tagName, id: active?.id, text: active?.textContent?.slice(0, 160), connected: active?.isConnected, inert: Boolean(active?.closest('[inert], [aria-hidden="true"]')) },
    };
  });
  const sample = { phase, ...view, date: view.date ? { ...view.date, ratio: contrastRatio(view.date.effectiveColor, view.date.effectiveBackground) } : null, saved: await readActivityGoalStorage(page), errors: [...errors], ...extra };
  console.log('HISTORY_DATE', JSON.stringify(sample));
  await testInfo.attach(`history-date-${phase}.json`, { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`history-date-${phase}.png`) });
  return sample;
}

async function installActivityGoalFixture(page: Page, { offsets = [], rawGoal = null, fault = null }: { offsets?: number[]; rawGoal?: string | null; fault?: 'get' | 'set' | 'remove' | null } = {}) {
  await page.addInitScript(({ key, dates, initialGoal, initialFault }) => {
    const generationKey = 'nineflow-practice-results-generation-v1';
    // Reload must read the user's changed goal, not reinstall the fixture.
    if (localStorage.getItem(generationKey) === null) {
      const now = new Date();
      const generation = 'activity-goal-regression';
      const results = dates.map((offset, index) => ({ id: `goal-record-${index}`, gameId: 'rps', completedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, offset === 0 ? 0 : 12).toISOString(), accuracy: 80, medianRt: 720, stability: 74, errors: 2 }));
      localStorage.setItem(generationKey, generation);
      localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
      localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 4500 } }));
      localStorage.setItem('nineflow-game-order-v2', 'perceived');
      if (initialGoal !== null) localStorage.setItem(key, initialGoal);
    }
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const writes: Array<{ method: 'set' | 'remove'; value: string | null }> = [];
    let failure = initialFault;
    Object.defineProperty(window, '__activityGoalProbe', { configurable: true, value: { writes, readGoal: () => originalGet.call(localStorage, key), setFault: (next: 'get' | 'set' | 'remove' | null) => { failure = next; } } });
    Storage.prototype.getItem = function getItem(name: string) {
      if (name === key && failure === 'get') throw new DOMException('Goal read blocked', 'SecurityError');
      return originalGet.call(this, name);
    };
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key) {
        writes.push({ method: 'set', value });
        if (failure === 'set') throw new DOMException('Goal write blocked', 'QuotaExceededError');
      }
      return originalSet.call(this, name, value);
    };
    Storage.prototype.removeItem = function removeItem(name: string) {
      if (name === key) {
        writes.push({ method: 'remove', value: null });
        if (failure === 'remove') throw new DOMException('Goal removal blocked', 'SecurityError');
      }
      return originalRemove.call(this, name);
    };
  }, { key: activityGoalKey, dates: offsets, initialGoal: rawGoal, initialFault: fault });
}

function watchActivityGoalErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

function setActivityGoalFault(page: Page, failure: 'get' | 'set' | 'remove' | null) {
  return page.evaluate(next => {
    const probe = Reflect.get(window, '__activityGoalProbe');
    if (typeof probe?.setFault !== 'function') throw new Error('활동 목표 Storage 관찰자가 없습니다.');
    probe.setFault(next);
  }, failure);
}

function readActivityGoalStorage(page: Page) {
  return page.evaluate(key => {
    const probe = Reflect.get(window, '__activityGoalProbe');
    return {
      // The saved value is read with the original getter during a read fault;
      // the application still sees the real injected SecurityError.
      goal: typeof probe?.readGoal === 'function' ? probe.readGoal() : localStorage.getItem(key),
      writes: probe?.writes ?? [],
      accessibility: localStorage.getItem('nineflow-accessibility-v1'),
      protected: Object.fromEntries(Object.keys(localStorage).filter(name => name.startsWith('nineflow-practice-results') || name === 'nineflow-practice-config-v1' || name === 'nineflow-game-order-v2').sort().map(name => [name, localStorage.getItem(name)])),
    };
  }, activityGoalKey);
}

async function captureActivityGoal(page: Page, testInfo: TestInfo, phase: string, errors: string[], extra: Record<string, unknown> = {}) {
  await page.locator('#training-activity-goal').scrollIntoViewIfNeeded();
  const view = await page.locator('.training-activity').evaluate(element => {
    const goal = element.querySelector('#training-activity-goal');
    const active = document.activeElement;
    const rgba = (value: string) => {
      if (!/^rgba?\(/.test(value)) throw new Error(`지원하지 않는 실제 색상: ${value}`);
      const parts = value.match(/[\d.]+/g)!.map(Number);
      if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) throw new Error(`실제 색상 채널 오류: ${value}`);
      return { channels: parts.slice(0, 3), alpha: parts[3] ?? 1 };
    };
    const control = (node: Element) => {
      const computed = getComputedStyle(node);
      const layers: ReturnType<typeof rgba>[] = [];
      const opacities: number[] = [];
      const images: string[] = [];
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const layer = rgba(style.backgroundColor);
        layers.push(layer);
        images.push(style.backgroundImage);
        if (layer.alpha === 1) break;
      }
      for (let parent: Element | null = node; parent; parent = parent.parentElement) opacities.push(Number(getComputedStyle(parent).opacity));
      let background = [255, 255, 255];
      for (const layer of layers.reverse()) background = layer.channels.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
      const foreground = rgba(computed.color);
      const effective = foreground.channels.map((channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha));
      const box = node.getBoundingClientRect();
      return { tag: node.tagName, text: node.textContent, focused: active === node, focusVisible: node.matches(':focus-visible'), outlineStyle: computed.outlineStyle, outlineWidth: Number.parseFloat(computed.outlineWidth), color: computed.color, background: computed.backgroundColor, effectiveColor: `rgb(${effective.join(', ')})`, effectiveBackground: `rgb(${background.join(', ')})`, images, opacities, fontSize: Number.parseFloat(computed.fontSize), box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height } };
    };
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const raw = generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null;
    const results: Array<{ completedAt: string }> = raw ? JSON.parse(raw).results : [];
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dates = Array.from(element.querySelectorAll('time'), node => node.getAttribute('datetime'));
    const expectedCounts = dates.map(date => results.filter(result => dateKey(new Date(result.completedAt)) === date).length);
    const now = new Date();
    const referenceDates = Array.from({ length: 7 }, (_, index) => dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index)));
    return { referenceDates, viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }, panel: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }, contrast: document.documentElement.dataset.contrast, textScale: document.documentElement.dataset.textScale, status: element.querySelector('[role="status"]')?.textContent, statusCount: element.querySelectorAll('[role="status"]').length, period: element.querySelector('.training-activity-heading p')?.textContent, dates, counts: Array.from(element.querySelectorAll('.training-activity-days li > b'), node => node.textContent), expectedCounts, expectedActiveDays: expectedCounts.filter(count => count > 0).length, today: dateKey(now), goal: goal ? { value: goal.querySelector('option:checked')?.getAttribute('value'), disabled: goal.hasAttribute('disabled'), describedBy: goal.getAttribute('aria-describedby'), options: Array.from(goal.querySelectorAll('option'), option => ({ value: option.getAttribute('value'), text: option.textContent })), ...control(goal) } : null, controls: Array.from(element.querySelectorAll('button, select'), control), alert: element.querySelector('#training-activity-goal-error')?.textContent, note: element.querySelector('#training-activity-goal-note')?.textContent, active: { tag: active?.tagName, id: active?.id, text: active?.textContent, connected: active?.isConnected, inert: Boolean(active?.closest('[inert], [aria-hidden="true"]')) } };
  });
  const sample = { phase, ...view, goal: view.goal ? { ...view.goal, ratio: contrastRatio(view.goal.effectiveColor, view.goal.effectiveBackground) } : null, saved: await readActivityGoalStorage(page), errors: [...errors], ...extra };
  console.log('ACTIVITY_GOAL', JSON.stringify(sample));
  await testInfo.attach(`activity-goal-${phase}.json`, { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`activity-goal-${phase}.png`) });
  return sample;
}

function readRecoveryStorage(page: Page) {
  return page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const key = generation ? `nineflow-practice-results-v4:${generation}` : null;
    return { generation, key, raw: key ? localStorage.getItem(key) : null };
  });
}

async function completeUnsavedRotation(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rotation: { quantity: 1, paceMs: 90000 } }));
    localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({ contentMode: 'letters', selectedLetters: ['F'], selectedTransforms: ['turn-left-45'], showPreview: false }));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const opener = page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ });
  await opener.click();
  const stage = page.locator('section[data-game="rotation"]');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('1');
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  await expect(stage.locator('.game-workspace.game-rotation')).toBeVisible();
  const saved = await readRecoveryStorage(page);
  expect(saved.generation).toBeTruthy();
  expect(JSON.parse(saved.raw!).results).toEqual([]);
  // Only this document's active results write fails. A real reload restores native Storage.
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, saved.key);
  await stage.getByRole('button', { name: '1번 왼쪽 45° 회전', exact: true }).click();
  await stage.getByRole('button', { name: /답안 제출/ }).click();
  await stage.getByRole('button', { name: /결과 보기/ }).click();
  await expect(stage.getByRole('heading', { name: '도형 회전하기 결과', exact: true })).toBeVisible();
  const notice = stage.locator('.result-storage-notice:not(.result-comparison-notice)');
  await expect(notice).toContainText('브라우저 저장 공간을 사용할 수 없습니다');
  expect(await readRecoveryStorage(page)).toEqual(saved);
  return { stage, opener, notice, saved, backup: notice.getByRole('button', { name: '목록으로 이동해 백업하기', exact: true }) };
}

test('실제 완료 결과에서 다른 모드 설정으로 이동해도 자동 시작·중복 저장 없이 맞춤값을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const origin = Date.UTC(2035, 0, 12);
  await page.clock.install({ time: origin });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const opener = page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ });
  await opener.click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage.getByRole('button', { name: '게임 바꾸기', exact: true })).toBeFocused();
  for (let index = 0; index < 2; index += 1) await stage.getByRole('button', { name: '문제 수 줄이기', exact: true }).click();
  await stage.locator('.session-stepper').nth(1).getByRole('button').last().click();
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('9');
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  const readPreferences = () => page.evaluate(() => ({
    config: localStorage.getItem('nineflow-practice-config-v1'),
    pacing: localStorage.getItem('nineflow-practice-pacing-v1'),
    focus: localStorage.getItem('nineflow-focused-practice-v1'),
  }));
  const preferences = await readPreferences();
  expect(JSON.parse(preferences.config!).rps).toMatchObject({ quantity: 9, paceMs: 5000 });
  expect(JSON.parse(preferences.pacing!).rps).toBe(true);
  await page.clock.pauseAt(origin + 60_000);

  async function completeRps(mode: 'practice' | 'simulation', quantity: number) {
    await stage.getByRole('button', { name: mode === 'practice' ? /^설명·연습 시작/ : /^실전형 연습 시작/ }).click();
    for (const second of ['3', '2', '1']) {
      await expect(stage.locator('.game-preparation > b')).toHaveText(second);
      await page.clock.runFor(1050);
    }
    const workspace = stage.locator('.game-workspace.game-rps');
    await expect(workspace.locator('.mode-chip')).toHaveText(mode === 'practice' ? '연습' : '실전형 연습');
    for (let index = 0; index < quantity; index += 1) {
      await expect(workspace.locator('.workspace-progress > span')).toContainText(`${mode === 'simulation' ? index % 10 + 1 : index + 1} / ${mode === 'simulation' ? 10 : quantity}`);
      const shown = await workspace.locator('.rps-board img').getAttribute('alt');
      expect(shown).toMatch(/^(가위|바위|보)$/);
      const playerUnknown = await workspace.locator('.rps-board article').first().locator('.rps-question').count() === 1;
      const answers: Record<string, string> = playerUnknown ? { 가위: '바위', 바위: '보', 보: '가위' } : { 가위: '보', 바위: '가위', 보: '바위' };
      await workspace.locator('.rps-actions button').filter({ hasText: answers[shown!] }).click();
      await expect.poll(() => workspace.locator('.rps-actions button').evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
      if (index === quantity - 1) {
        await page.clock.runFor(1100);
      } else {
        await page.clock.runFor(1400);
        if (mode === 'simulation' && (index === 9 || index === 19)) {
          const transition = workspace.locator('.rps-round-transition');
          await expect(transition).toBeVisible();
          for (const second of ['3', '2', '1']) {
            await expect(transition.locator('.rps-transition-countdown b')).toHaveText(second);
            await page.clock.runFor(1050);
          }
          await expect(transition).toHaveCount(0);
        }
      }
    }
    await expect(stage.locator('.stage-result')).toBeVisible();
    // Allow the existing paint save or its 500ms fallback to finish.
    await page.clock.runFor(500);
    await expect(stage.locator('.result-metrics article').first().locator('b')).toHaveText('100%');
  }

  async function inspectButton(mode: 'practice' | 'simulation') {
    const button = stage.getByRole('button', { name: mode === 'practice' ? '실전형 설정 보기' : '맞춤 연습 설정 보기', exact: true });
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 360 }]) {
      await page.setViewportSize(viewport);
      await button.scrollIntoViewIfNeeded();
      const snapshot = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { label: element.textContent, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, color: style.color, background: style.backgroundColor, width: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
      });
      console.log('RESULT_MODE_BUTTON', JSON.stringify({ mode, viewport, ...snapshot }));
      await testInfo.attach(`result-mode-${mode}-${viewport.width}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`result-mode-${mode}-${viewport.width}.png`) });
      expect(snapshot.height).toBeGreaterThanOrEqual(44);
      expect(snapshot.left).toBeGreaterThanOrEqual(-1);
      expect(snapshot.right).toBeLessThanOrEqual(snapshot.width + 1);
      expect(snapshot.top).toBeGreaterThanOrEqual(-1);
      expect(snapshot.bottom).toBeLessThanOrEqual(snapshot.viewportHeight + 1);
      expect(snapshot.scrollWidth).toBeLessThanOrEqual(snapshot.documentWidth + 1);
      expect(contrastRatio(snapshot.color, snapshot.background)).toBeGreaterThanOrEqual(4.5);
    }
    return button;
  }

  for (const mode of ['practice', 'simulation'] as const) {
    await completeRps(mode, mode === 'practice' ? 9 : 30);
    const saved = await readRecoveryStorage(page);
    const results = JSON.parse(saved.raw!).results as SessionResult[];
    expect(results).toHaveLength(mode === 'practice' ? 1 : 2);
    expect(new Set(results.map(result => result.id)).size).toBe(results.length);
    expect(results[0].detail).toMatchObject({ sessionMode: mode === 'practice' ? '연습 모드' : '실전형 연습', trialCount: mode === 'practice' ? 9 : 30, correctCount: mode === 'practice' ? 9 : 30 });
    const button = await inspectButton(mode);
    await button.focus();
    await page.keyboard.press('Enter');
    // Deliver the existing phase-focus RAF, without starting a game timer.
    await page.clock.runFor(20);
    const target = stage.locator(mode === 'practice' ? '.simulation-preset' : '.session-settings');
    const snapshot = await stage.evaluate(element => ({ label: element.getAttribute('aria-label'), activeClass: document.activeElement?.className, checkedMode: element.querySelector('[role="radio"][aria-checked="true"]')?.textContent, workspaces: element.querySelectorAll('.game-workspace').length, preparations: element.querySelectorAll('.game-preparation').length, results: element.querySelectorAll('.stage-result').length }));
    console.log('RESULT_MODE_SETTINGS', JSON.stringify({ from: mode, snapshot, saved: await readRecoveryStorage(page), preferences: await readPreferences() }));
    await testInfo.attach(`result-mode-settings-from-${mode}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`result-mode-settings-from-${mode}.png`) });
    await expect(target).toBeFocused();
    await expect(stage.getByRole('radio', { name: mode === 'practice' ? /실전형 연습/ : /연습 모드/ })).toHaveAttribute('aria-checked', 'true');
    await expect(stage.locator('.game-workspace, .game-preparation, .stage-result')).toHaveCount(0);
    expect(await readRecoveryStorage(page)).toEqual(saved);
    expect(await readPreferences()).toEqual(preferences);
    // Passing the whole preparation interval must not start or save another session.
    await page.clock.runFor(3100);
    await expect(target).toBeFocused();
    await expect(stage.locator('.game-workspace, .game-preparation')).toHaveCount(0);
    expect(await readRecoveryStorage(page)).toEqual(saved);
    if (mode === 'simulation') {
      await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('9');
      await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
    }
  }
  const beforeClose = await readRecoveryStorage(page);
  await page.keyboard.press('Escape');
  await expect(stage).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await readRecoveryStorage(page)).toEqual(beforeClose);
  expect(errors).toEqual([]);
});

test('저장 실패 복구: 실제 내려받은 JSON을 새로고침 뒤 가져와 결과와 문항별 복습을 복원한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 320, height: 568 });
  const { stage, opener, notice, saved, backup } = await completeUnsavedRotation(page);
  await backup.scrollIntoViewIfNeeded();
  const before = await backup.evaluate(element => ({ height: element.getBoundingClientRect().height, label: element.textContent, documentWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log('RESULT_BACKUP_RECOVERY', JSON.stringify({ phase: 'unsaved', before, saved }));
  await testInfo.attach('result-backup-unsaved.json', { body: JSON.stringify({ before, saved }, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('result-backup-unsaved.png') });
  expect(before.height).toBeGreaterThanOrEqual(44);
  expect(before.scrollWidth).toBeLessThanOrEqual(before.documentWidth + 1);
  await expect(notice).toContainText('새로고침하면 사라질 수 있습니다');
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await backup.focus();
  try {
    await page.keyboard.down('Enter');
    await expect(data).toBeVisible();
    await expect(data.getByRole('button', { name: '내 기록 백업·복원 닫기', exact: true })).toBeFocused();
    await page.keyboard.down('Enter');
    await expect(data).toBeVisible();
    expect(downloads).toBe(0);
  } finally { await page.keyboard.up('Enter'); }
  await expect(stage).toHaveCount(0);
  await expect(data).toContainText('현재 기록 1개');
  const pendingDownload = page.waitForEvent('download');
  await data.getByRole('button', { name: 'JSON 백업 받기', exact: true }).click();
  const download = await pendingDownload;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('실제 JSON 다운로드 스트림이 없습니다.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^nineflow-practice-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const parsed = parsePracticeResultsBackup(bytes.toString('utf8'));
  if (!parsed.ok) throw new Error(`실제 백업 검증 실패: ${parsed.message}`);
  expect(parsed.results).toHaveLength(1);
  const result = parsed.results[0];
  expect(result.gameId).toBe('rotation');
  expect(result.accuracy).toBe(100);
  expect(result.review?.summary).toMatchObject({ attemptedCount: 1, correctCount: 1 });
  expect(result.review?.attempts).toHaveLength(1);
  expect(await readRecoveryStorage(page)).toEqual(saved);
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(opener).toBeFocused();
  await page.reload();
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.header-status')).toHaveAccessibleName('완료한 연습 0회, 기록으로 이동');
  expect(await readRecoveryStorage(page)).toEqual(saved);
  await page.locator('.records-data-button').click();
  await data.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes });
  await expect(data.locator('.data-import-preview')).toContainText('1개 기록');
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText('현재 총 1개');
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  await page.reload();
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const restored = await readRecoveryStorage(page);
  expect(restored.generation).toBe(saved.generation);
  expect(JSON.parse(restored.raw!).results).toEqual(parsed.results);
  await expect(page.locator('.header-status')).toHaveAccessibleName('완료한 연습 1회, 기록으로 이동');
  const reviewOpener = page.getByRole('button', { name: '도형 회전하기 최근 세션 복습', exact: true });
  await reviewOpener.click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  await expect(review.locator('.rotation-session-review')).toBeVisible();
  await expect(review.getByRole('listbox', { name: '저장된 시도 목록' }).getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', result.review!.attempts[0].id);
  console.log('RESULT_BACKUP_RECOVERY', JSON.stringify({ phase: 'restored', downloadBytes: bytes.length, result, restored, errors }));
  await testInfo.attach('result-backup-restored.json', { body: JSON.stringify({ downloadBytes: bytes.length, result, restored, errors }, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('result-backup-restored.png') });
  await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(reviewOpener).toBeFocused();
  expect(errors).toEqual([]);
});

for (const action of ['load', 'retry', 'close', 'review', 'guide', 'restart', 'configure'] as const) {
  test(`결과 백업 창 로딩: ${action} 동안 결과를 보존하고 취소된 이동을 되살리지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const resourceErrors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') resourceErrors.push(message.text()); });
    const { stage, opener, notice, saved, backup } = await completeUnsavedRotation(page);
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
    let delayedRequests = 0;
    let backupScriptUrl = '';
    let completedRequests = 0;
    let rejectBackup = action === 'retry';
    const failedRequests: string[] = [];
    page.on('requestfinished', request => { if (request.url() === backupScriptUrl) completedRequests += 1; });
    await page.route('**/_next/static/**/*.js', async route => {
      const response = await route.fetch();
      const body = await response.body();
      // Identify the actual backup module; other overlay modules remain loadable.
      if (Buffer.from(body).toString('utf8').includes('data-dialog-title')) {
        backupScriptUrl = route.request().url();
        delayedRequests += 1;
        if (rejectBackup) {
          failedRequests.push(route.request().url());
          await route.abort('failed');
          return;
        }
        await scriptsReady;
      }
      await route.fulfill({ response });
    });
    const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
    try {
      await backup.click();
      await expect.poll(() => delayedRequests).toBeGreaterThan(0);
      if (action === 'retry') {
        await expect(notice).toContainText('백업 창을 불러오지 못했습니다. 결과는 그대로입니다. 다시 눌러 주세요.');
        await expect(backup).toHaveAttribute('aria-disabled', 'false');
        await expect(data).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath('result-backup-load-failed.png') });
        rejectBackup = false;
        const failedAttemptCount = delayedRequests;
        await backup.click();
        await expect.poll(() => delayedRequests).toBeGreaterThan(failedAttemptCount);
      }
      const pendingRequestCount = delayedRequests;
      await expect(backup).toHaveAttribute('aria-busy', 'true');
      await expect(backup).toHaveAttribute('aria-disabled', 'true');
      await expect(notice).toContainText('브라우저 저장 공간을 사용할 수 없습니다');
      await expect(notice).toContainText('백업 창을 불러오고 있습니다. 결과 화면은 유지됩니다.');
      await expect(stage.getByRole('heading', { name: '도형 회전하기 결과', exact: true })).toBeVisible();
      await expect(data).toHaveCount(0);
      await backup.focus();
      await page.keyboard.press('Enter');
      expect(delayedRequests).toBe(pendingRequestCount);
      const pending = { action, delayedRequests, failedRequests, saved, notice: await notice.textContent() };
      console.log('RESULT_BACKUP_LOADING', JSON.stringify({ phase: 'pending', ...pending }));
      await testInfo.attach('result-backup-pending.json', { body: JSON.stringify(pending, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('result-backup-pending.png') });
      if (action === 'close') {
        await stage.getByRole('button', { name: /^게임 목록/ }).click();
        await expect(stage).toHaveCount(0);
        await expect(opener).toBeFocused();
      } else if (action === 'review') {
        await stage.getByRole('button', { name: '문항별 복습', exact: true }).click();
        await expect(page.getByRole('dialog', { name: '내 실수 복습', exact: true })).toBeVisible();
      } else if (action === 'guide') {
        await stage.getByRole('button', { name: '공략 복습', exact: true }).click();
        await expect(page.locator('.strategy-guide-dialog')).toBeVisible();
      } else if (action === 'restart') {
        await stage.getByRole('button', { name: '다시 연습', exact: true }).click();
        await expect(stage.locator('.game-workspace.game-rotation')).toBeVisible();
      } else if (action === 'configure') {
        await stage.getByRole('button', { name: '실전형 설정 보기', exact: true }).click();
        await expect(stage.locator('.simulation-preset')).toBeFocused();
        await expect(stage.locator('.game-workspace, .game-preparation, .stage-result')).toHaveCount(0);
      }
      releaseScripts();
      await page.unrouteAll({ behavior: 'wait' });
      // Observe the actual browser transfer, independent of the framework's script loader.
      await expect.poll(() => completedRequests, { timeout: 15_000 }).toBeGreaterThan(0);
      if (action === 'load' || action === 'retry') {
        await expect(data).toBeVisible();
        await expect(stage).toHaveCount(0);
        await expect(data).toContainText('현재 기록 1개');
        await data.getByRole('button', { name: '닫기', exact: true }).click();
        await expect(opener).toBeFocused();
      } else {
        await expect(data).toHaveCount(0);
        if (action === 'close') {
          await expect(stage).toHaveCount(0);
          await opener.press('Enter');
          await expect(stage.getByRole('button', { name: '게임 바꾸기', exact: true })).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(opener).toBeFocused();
          await expect(data).toHaveCount(0);
        } else if (action === 'restart') {
          await expect(stage.locator('.game-workspace.game-rotation')).toBeVisible();
          await stage.getByRole('button', { name: '1번 왼쪽 45° 회전', exact: true }).click();
          await expect(stage.getByRole('list', { name: '입력한 변환 순서', exact: true }).locator('li.filled')).toHaveCount(1);
          await expect(data).toHaveCount(0);
        } else if (action === 'configure') {
          await expect(stage.locator('.simulation-preset')).toBeFocused();
          await expect(stage.getByRole('radio', { name: /실전형 연습/ })).toHaveAttribute('aria-checked', 'true');
          await expect(stage.locator('.game-workspace, .game-preparation, .stage-result')).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(stage).toHaveCount(0);
          await expect(opener).toBeFocused();
          await expect(data).toHaveCount(0);
        } else {
          const overlay = action === 'review' ? page.getByRole('dialog', { name: '내 실수 복습', exact: true }) : page.locator('.strategy-guide-dialog');
          await expect(overlay).toBeVisible();
          await overlay.getByRole('button', { name: action === 'review' ? '복습 센터 닫기' : '전략게임 가이드 닫기', exact: true }).click();
          await expect(backup).toHaveAttribute('aria-disabled', 'false');
          await expect(notice).toContainText('브라우저 저장 공간을 사용할 수 없습니다');
          await backup.click();
          await expect(data).toBeVisible();
          await expect(data).toContainText('현재 기록 1개');
          await data.getByRole('button', { name: '닫기', exact: true }).click();
        }
      }
      const final = { action, delayedRequests, completedRequests, failedRequests, errors, resourceErrors, saved: await readRecoveryStorage(page) };
      console.log('RESULT_BACKUP_LOADING', JSON.stringify({ phase: 'settled', ...final }));
      await testInfo.attach('result-backup-settled.json', { body: JSON.stringify(final, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('result-backup-settled.png') });
      expect(final.saved).toEqual(saved);
      expect(errors).toEqual([]);
      if (action !== 'retry') expect(resourceErrors).toEqual([]);
      else {
        expect(failedRequests.length).toBeGreaterThanOrEqual(1);
        // Deliberate resource failure is preserved separately, not hidden as a clean console.
        expect(resourceErrors.every(error => /Failed to load resource|Load failed|Failed to fetch|loading chunk|load chunk/i.test(error))).toBe(true);
      }
    } finally {
      releaseScripts();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

function reviewFilterFixtures(): SessionResult[] {
  const attempt = (id: string, index: number, errorCodes: string[]): GenericReviewAttempt => ({
    kind: 'generic', id, index, status: errorCodes.length ? 'error' : 'correct', errorCodes,
    title: id, prompt: `${id} 보관 문제`, expected: '기대 응답', selected: '저장된 응답', explanation: '가져온 복습 기록의 필터 검증용 예제입니다.',
  });
  const full = compactReviewPayload('rps', [attempt('loss-1', 0, ['rps-loss']), attempt('tie-1', 1, ['rps-tie']), attempt('loss-2', 2, ['rps-loss']), attempt('correct-1', 3, [])]);
  const sampled = compactReviewPayload('rps', [attempt('old-loss', 0, ['rps-loss']), attempt('old-correct', 4, [])]);
  sampled.summary = { attemptedCount: 5, correctCount: 1, neutralCount: 0, reviewPointCount: 4, errorCounts: { 'rps-loss': 2, 'rps-tie': 2 }, omittedDetailCount: 3, coverage: 'sampled' };
  const mouse = compactReviewPayload('mouse', [attempt('mouse-multiple', 0, ['mouse-miss', 'mouse-overconfidence']), attempt('mouse-correct', 1, []), { ...attempt('mouse-unscored', 2, []), status: 'neutral', scored: false }]);
  const detail = { sessionMode: '연습 모드', quantity: 4, paceMs: 4500, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' };
  return [
    { id: 'filter-full', gameId: 'rps', completedAt: '2026-10-14T12:00:00.000Z', accuracy: 25, medianRt: 720, stability: 70, errors: 3, detail, review: full },
    { id: 'filter-sampled', gameId: 'rps', completedAt: '2026-10-14T11:00:00.000Z', accuracy: 20, medianRt: 720, stability: 70, errors: 4, detail: { ...detail, quantity: 5 }, review: sampled },
    { id: 'filter-mouse', gameId: 'mouse', completedAt: '2026-10-14T10:00:00.000Z', accuracy: 50, medianRt: 720, stability: 70, errors: 1, detail: { ...detail, quantity: 2 }, review: mouse },
  ];
}

async function importReviewFilterRecords(page: Page, results: SessionResult[], expectedTotal: number) {
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  const backup = createPracticeResultsBackup(results, new Date('2026-10-14T13:00:00.000Z'));
  await data.locator('input[type="file"]').setInputFiles({ name: 'review-types.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(data.locator('.data-import-preview')).toContainText(`${results.length}개 기록`);
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText(`현재 총 ${expectedTotal}개`);
  await data.getByRole('button', { name: '닫기', exact: true }).click();
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 360 }]) {
  test(`복습 유형 ${viewport.width}x${viewport.height}: 가져온 상세만 분류하고 통계·저장·키보드 탐색을 보존한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await importReviewFilterRecords(page, reviewFilterFixtures(), 3);
    const readSaved = () => page.evaluate(() => {
      const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
      return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
    });
    const saved = await readSaved();
    expect(JSON.parse(saved.raw!).results).toHaveLength(3);
    const opener = page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ });
    await opener.click();
    const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
    const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
    const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
    const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
    const detail = review.locator('.review-attempt-detail');
    const observe = async (label: string) => {
      const view = await review.evaluate(element => {
        const select = element.querySelector<HTMLElement>('.review-attempt-filter select')!;
        const detail = element.querySelector<HTMLElement>('.review-attempt-detail')!;
        return {
          value: select.querySelector('option:checked')?.getAttribute('value') ?? null, options: Array.from(select.querySelectorAll('option'), item => item.getAttribute('value')), focused: document.activeElement === select,
          ids: Array.from(element.querySelectorAll('[role="listbox"] [role="option"]'), item => item.getAttribute('data-review-attempt-id')),
          selected: element.querySelector('[role="listbox"] [aria-selected="true"]')?.getAttribute('data-review-attempt-id') ?? null,
          status: element.querySelector('.review-attempt-filter [role="status"]')?.textContent,
          statistics: element.querySelector('.review-summary-list')?.textContent,
          font: Number.parseFloat(getComputedStyle(select).fontSize), height: select.getBoundingClientRect().height,
          selectWidth: select.getBoundingClientRect().width, detailWidth: detail.clientWidth, detailScrollWidth: detail.scrollWidth,
          documentWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth,
        };
      });
      console.log('REVIEW_TYPE_FILTER', JSON.stringify({ label, viewport, ...view }));
      await testInfo.attach(`review-type-${label}.json`, { body: JSON.stringify({ label, viewport, ...view }, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`review-type-${label}.png`) });
      expect(await filter.inputValue()).toBe(view.value);
      expect(await readSaved()).toEqual(saved);
      expect(view.height).toBeGreaterThanOrEqual(44);
      expect(view.font).toBeGreaterThanOrEqual(16);
      expect(view.selectWidth).toBeLessThanOrEqual(view.detailWidth);
      expect(view.detailScrollWidth).toBeLessThanOrEqual(view.detailWidth + 1);
      expect(view.documentScrollWidth).toBeLessThanOrEqual(view.documentWidth + 1);
      return view;
    };
    const initial = await observe('initial-loss');
    expect(initial.value).toBe('rps-loss');
    expect(initial.ids).toEqual(['loss-1', 'loss-2']);
    expect(initial.status).toBe('현재 표시 2개 · 저장된 상세 4개');
    await list.getByRole('option').first().press('ArrowDown');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-2');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await list.getByRole('option', { selected: true }).press('Home');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-1');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await list.getByRole('option', { selected: true }).press('End');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-2');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await filter.focus();
    await filter.selectOption('rps-tie');
    const tie = await observe('tie');
    expect(tie.ids).toEqual(['tie-1']);
    expect(tie.focused).toBe(true);
    expect(tie.statistics).toBe(initial.statistics);
    await filter.selectOption('');
    await expect(list.getByRole('option')).toHaveCount(3);
    await filter.selectOption('rps-loss');
    await review.getByRole('button', { name: '오류·점검만', exact: true }).click();
    const all = await observe('all');
    expect(all.value).toBe('');
    expect(all.ids).toEqual(['loss-1', 'tie-1', 'loss-2', 'correct-1']);
    await session.selectOption('filter-sampled');
    await expect(filter).toHaveValue('');
    await filter.selectOption('rps-tie');
    const pruned = await observe('pruned-tie');
    expect(pruned.ids).toEqual([]);
    expect(pruned.status).toBe('현재 표시 0개 · 저장된 상세 2개 · 상세 3개가 정리되었습니다.');
    await expect(list).toContainText('선택한 유형의 보관 상세가 없습니다.');
    await expect(review.locator('.review-summary-list')).toContainText('2/5회');
    await list.getByRole('button', { name: '전체 시도 보기', exact: true }).click();
    await expect(filter).toHaveValue('');
    await expect(list.getByRole('option')).toHaveCount(2);
    await filter.selectOption('rps-loss');
    await review.locator('[data-review-game-id="mouse"]').click();
    const mouse = await observe('mouse-reset');
    expect(mouse.value).toBe('');
    expect(mouse.ids).toEqual(['mouse-multiple', 'mouse-unscored']);
    for (const code of ['mouse-miss', 'mouse-overconfidence']) {
      await filter.selectOption(code);
      const multi = await observe(code);
      expect(multi.ids).toEqual(['mouse-multiple']);
      expect(multi.selected).toBe('mouse-multiple');
    }
    await review.getByRole('button', { name: '오류·점검만', exact: true }).click();
    await expect(filter).toHaveValue('');
    await expect(list.getByRole('option')).toHaveCount(3);
    await detail.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await readSaved()).toEqual(saved);
    expect(errors).toEqual([]);
  });
}

test('복습 유형은 다른 탭의 정상 가져오기로 선택 세션이 정리된 뒤에도 새 세션에서 선택할 수 있다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await importReviewFilterRecords(page, reviewFilterFixtures(), 3);
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const initial = await readSaved();
  await page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
  const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  await expect(session).toHaveValue('filter-full');
  await expect(filter).toHaveValue('rps-loss');
  const peer = await page.context().newPage();
  peer.on('pageerror', error => errors.push(error.message));
  peer.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await peer.goto('/');
    const prototype = reviewFilterFixtures()[0];
    const replacements = Array.from({ length: 100 }, (_, index) => ({ ...prototype, id: `peer-filter-${index}`, completedAt: new Date(Date.UTC(2026, 9, 14, 13, 0, index)).toISOString() }));
    await importReviewFilterRecords(peer, replacements, 100);
    await expect(session).toHaveValue('peer-filter-99');
    await expect(filter).toHaveValue('');
    const afterImport = await readSaved();
    const results = JSON.parse(afterImport.raw!).results as SessionResult[];
    expect(results).toHaveLength(100);
    expect(results.some(result => result.id === 'filter-full')).toBe(false);
    expect(afterImport.generation).toBe(initial.generation);
    await filter.selectOption('rps-tie');
    const observed = {
      session: await session.inputValue(), value: await filter.inputValue(),
      ids: await list.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-review-attempt-id'))),
      status: await review.locator('.review-attempt-filter [role="status"]').textContent(),
      generation: (await readSaved()).generation, retained: results.length, removedOriginal: !results.some(result => result.id === 'filter-full'), errors,
    };
    console.log('REVIEW_TYPE_PEER_PRUNE', JSON.stringify(observed));
    await testInfo.attach('review-type-peer-prune.json', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('review-type-peer-prune.png') });
    expect(observed.session).toBe('peer-filter-99');
    expect(observed.value).toBe('rps-tie');
    expect(observed.ids).toEqual(['tie-1']);
    expect(observed.status).toBe('현재 표시 1개 · 저장된 상세 4개');
    expect(await readSaved()).toEqual(afterImport);
    expect(errors).toEqual([]);
    await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
    await expect(review).toHaveCount(0);
  } finally {
    await peer.close();
  }
});

test('정상 백업의 예약된 오류 코드도 복습 안내·숫자 집계·유형 선택을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const codes = ['constructor', '__proto__', 'toString'];
  const attempts: GenericReviewAttempt[] = codes.map((code, index) => ({ kind: 'generic', id: `reserved-${index}`, index, status: 'error', errorCodes: [code], title: `가져온 문항 ${index + 1}`, prompt: '예약 코드 복습 예제', expected: '기대 응답', selected: '저장된 응답', explanation: '검증을 통과한 백업의 코드와 안내를 확인합니다.' }));
  const errorCounts = Object.fromEntries(codes.map(code => [code, 1]));
  const base = reviewFilterFixtures()[0];
  const results: SessionResult[] = [
    { ...base, id: 'reserved-full', completedAt: '2026-10-15T01:02:00.000Z', accuracy: 0, errors: 3, detail: { ...base.detail, quantity: 3 }, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts, summary: { attemptedCount: 3, correctCount: 0, neutralCount: 0, reviewPointCount: 3, errorCounts, omittedDetailCount: 0, coverage: 'full' } } },
    { ...base, id: 'reserved-sampled', completedAt: '2026-10-15T01:01:00.000Z', accuracy: 25, errors: 3, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts: [attempts[1]], summary: { attemptedCount: 4, correctCount: 1, neutralCount: 0, reviewPointCount: 3, errorCounts, omittedDetailCount: 3, coverage: 'sampled' } } },
  ];
  const raw = JSON.stringify({ format: PRACTICE_RESULTS_BACKUP_FORMAT, version: PRACTICE_RESULTS_BACKUP_VERSION, exportedAt: '2026-10-15T01:03:00.000Z', results });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.locator('input[type="file"]').setInputFiles({ name: 'reserved-review-codes.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(data.locator('.data-import-preview')).toContainText('2개 기록');
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText('현재 총 2개');
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const saved = await readSaved();
  const restored = JSON.parse(saved.raw!).results as SessionResult[];
  expect(restored).toHaveLength(2);
  for (const result of restored) expect(result.review?.summary.errorCounts).toEqual(errorCounts);
  const opener = page.locator('.home-review-ranking').getByRole('button', { name: /추가 확인이 필요한 응답/ }).first();
  await opener.click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
  const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  const observe = async (label: string) => {
    const snapshot = { label, session: await session.inputValue(), value: await filter.inputValue(), ids: await list.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-review-attempt-id'))), status: await review.locator('.review-attempt-filter [role="status"]').textContent(), labels: await review.locator('.review-error-tips b').allTextContents(), errors };
    console.log('REVIEW_RESERVED_CODES', JSON.stringify(snapshot));
    await testInfo.attach(`review-reserved-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`review-reserved-${label}.png`) });
    return snapshot;
  };
  await expect(session).toHaveValue('reserved-full');
  await expect(filter.locator('option')).toHaveCount(4);
  for (const [index, code] of codes.entries()) {
    await filter.selectOption(code);
    const current = await observe(`full-${index}`);
    expect(current.value).toBe(code);
    expect(current.ids).toEqual([`reserved-${index}`]);
    expect(current.labels).toEqual(['추가 확인이 필요한 응답']);
    expect(current.status).toBe('현재 표시 1개 · 저장된 상세 3개');
  }
  await session.selectOption('reserved-sampled');
  await filter.selectOption('constructor');
  const omitted = await observe('sampled-omitted');
  expect(omitted.value).toBe('constructor');
  expect(omitted.ids).toEqual([]);
  expect(omitted.status).toBe('현재 표시 0개 · 저장된 상세 1개 · 상세 3개가 정리되었습니다.');
  await expect(list).toContainText('선택한 유형의 보관 상세가 없습니다.');
  await filter.selectOption('__proto__');
  const retained = await observe('sampled-retained');
  expect(retained.value).toBe('__proto__');
  expect(retained.ids).toEqual(['reserved-1']);
  expect(retained.labels).toEqual(['추가 확인이 필요한 응답']);
  expect(await readSaved()).toEqual(saved);
  await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('정상 백업의 특수문자 문항 ID도 복습 선택·상세·키보드 초점과 저장값을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const ids = ['plain-control', 'a"b', 'a\\b', 'a\nb', 'a\u0000b'];
  const attempts: GenericReviewAttempt[] = ids.map((id, index) => ({ kind: 'generic', id, index, status: 'error', errorCodes: ['rps-loss'], title: `문항 ${index + 1}`, prompt: `보관 문제 ${index + 1}`, expected: '기대 응답', selected: '저장된 응답', explanation: '정상 백업의 문항 식별자를 그대로 보존합니다.' }));
  const base = reviewFilterFixtures()[0];
  const results: SessionResult[] = [{ ...base, id: 'quoted-attempt-ids', completedAt: '2026-10-15T02:00:00.000Z', accuracy: 0, errors: ids.length, detail: { ...base.detail, quantity: ids.length }, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts, summary: { attemptedCount: ids.length, correctCount: 0, neutralCount: 0, reviewPointCount: ids.length, errorCounts: { 'rps-loss': ids.length }, omittedDetailCount: 0, coverage: 'full' } } }];
  const raw = JSON.stringify({ format: PRACTICE_RESULTS_BACKUP_FORMAT, version: PRACTICE_RESULTS_BACKUP_VERSION, exportedAt: '2026-10-15T02:01:00.000Z', results });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.locator('input[type="file"]').setInputFiles({ name: 'quoted-attempt-ids.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(data.locator('.data-import-preview')).toContainText('1개 기록');
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText('현재 총 1개');
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const saved = await readSaved();
  expect(JSON.parse(saved.raw!).results[0].review.attempts.map((attempt: GenericReviewAttempt) => attempt.id)).toEqual(ids);
  const opener = page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ });
  await opener.click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  const observe = async (label: string) => {
    const view = await page.evaluate(() => {
      const dialog = document.querySelector('.review-dialog');
      const options = Array.from(dialog?.querySelectorAll('[role="listbox"] [role="option"]') ?? []);
      return {
        dialog: Boolean(dialog),
        ids: options.map(item => item.getAttribute('data-review-attempt-id')),
        selected: options.find(item => item.getAttribute('aria-selected') === 'true')?.getAttribute('data-review-attempt-id') ?? null,
        focused: document.activeElement?.getAttribute('data-review-attempt-id') ?? null,
        prompt: dialog?.querySelector('.generic-attempt-review h4')?.textContent ?? null,
      };
    });
    const snapshot = { label, ...view, errors: [...errors], savedUnchanged: JSON.stringify(await readSaved()) === JSON.stringify(saved) };
    console.log('REVIEW_IMPORTED_ID_NAVIGATION', JSON.stringify(snapshot));
    await testInfo.attach(`review-imported-id-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`review-imported-id-${label}.png`) });
    return snapshot;
  };
  await expect(list.getByRole('option')).toHaveCount(ids.length);
  const initial = await observe('initial-control');
  expect(initial.ids).toEqual(ids);
  expect(initial.selected).toBe(ids[0]);
  for (let index = 1; index < ids.length; index += 1) {
    let moved;
    try {
      await list.getByRole('option', { selected: true }).press('ArrowDown');
    } finally {
      moved = await observe(`arrow-${index}`);
    }
    expect(moved.dialog).toBe(true);
    expect(moved.ids).toEqual(ids);
    expect(moved.selected).toBe(ids[index]);
    expect(moved.prompt).toBe(`보관 문제 ${index + 1}`);
    expect(moved.savedUnchanged).toBe(true);
    expect(moved.errors).toEqual([]);
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
  }
  await list.getByRole('option', { selected: true }).press('Home');
  await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', ids[0]);
  await expect(list.getByRole('option', { selected: true })).toBeFocused();
  await list.getByRole('option', { selected: true }).press('End');
  const last = await observe('end');
  expect(last.selected).toBe(ids.at(-1));
  await expect(list.getByRole('option', { selected: true })).toBeFocused();
  expect(await readSaved()).toEqual(saved);
  await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`기록 찾기 ${width}px: 오래된 기록의 게임·모드 필터와 더 보기는 저장값을 바꾸지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const generation = 'history-filter-regression';
      localStorage.setItem('nineflow-practice-results-generation-v1', generation);
      localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results: Array.from({ length: 12 }, (_, index) => ({
        id: `history-${index}`, gameId: index < 8 ? 'rps' : 'number',
        completedAt: new Date(Date.UTC(2026, 9, 1, 12 - index)).toISOString(),
        accuracy: 80, medianRt: 720, stability: 74, errors: 2,
        ...(index === 0 ? {} : { detail: { sessionMode: index % 2 ? 'practice' : 'simulation' } }),
      })) }));
    });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const saved = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:history-filter-regression'));
    const history = page.locator('.history-panel');
    await history.locator('summary').click();
    await expect(history.locator('.record-list > article')).toHaveCount(8);
    await history.getByRole('button', { name: /기록 더 보기/ }).click();
    await expect(history.locator('.record-list > article')).toHaveCount(12);
    await expect(history.getByRole('button', { name: /기록 더 보기/ })).toHaveCount(0);
    await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('number');
    await expect(history.locator('.record-list > article')).toHaveCount(4);
    await expect(history.locator('.record-list')).toContainText('숫자 누르기');
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('simulation');
    await expect(history.locator('.record-list > article')).toHaveCount(2);
    await expect(history.getByRole('status')).toHaveText('저장된 12개 중 2개 일치 · 2개 표시');
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('unknown');
    await expect(history.locator('.record-list > article')).toHaveCount(0);
    await expect(history.locator('.history-empty')).toBeVisible();
    await history.getByRole('button', { name: '필터 초기화', exact: true }).click();
    await expect(history.locator('.record-list > article')).toHaveCount(8);
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('unknown');
    await expect(history.locator('.record-list > article')).toHaveCount(1);
    await expect(history.locator('.record-list')).toContainText('가위바위보');
    await history.getByRole('combobox', { name: '게임', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(history.getByRole('combobox', { name: '모드', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:history-filter-regression'))).toBe(saved);
    await page.screenshot({ path: testInfo.outputPath(`history-filter-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const timezone of ['Asia/Seoul', 'America/New_York']) {
  test.describe(`훈련 활동 ${timezone}`, () => {
    test.use({ timezoneId: timezone });
    for (const width of [390, 1280]) {
      test(`${width}px: 현지 날짜 7일의 활동을 읽고 새로고침해도 저장값은 그대로다`, async ({ page }, testInfo) => {
        const referenceTime = Date.now();
        // Keep the fixture and date oracle on the same day across midnight.
        await page.clock.setFixedTime(referenceTime);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => {
          const now = new Date();
          const generation = 'training-activity-regression';
          const results = [0, 0, -1, -6, -7, 1].map((offset, index) => ({
            id: `activity-${index}`, gameId: 'rps',
            completedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, offset === -1 ? 23 : offset < 0 ? 12 : 0, offset === -1 ? 59 : 0).toISOString(),
            accuracy: 80, medianRt: 720, stability: 74, errors: 2,
          }));
          localStorage.setItem('nineflow-practice-results-generation-v1', generation);
          localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
        });
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        const saved = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'));
        const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
        const snapshot = await activity.evaluate(element => {
          const period = element.querySelector('.training-activity-heading p');
          return {
            wall: Date.now(),
            status: element.querySelector('[role="status"]')?.textContent,
            statusAtomic: element.querySelector('[role="status"]')?.getAttribute('aria-atomic'),
            period: { text: period?.textContent, live: period?.getAttribute('aria-live'), atomic: period?.getAttribute('aria-atomic') },
            days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
          };
        });
        console.log('TRAINING_ACTIVITY', JSON.stringify({ timezone, width, ...snapshot }));
        const expectedDates = await page.evaluate(() => {
          const now = new Date();
          return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          });
        });
        expect(snapshot.wall).toBe(referenceTime);
        expect(snapshot.period).toEqual({ text: `${expectedDates[0]} ~ ${expectedDates[6]} · 브라우저 현지 날짜 기준`, live: 'polite', atomic: 'true' });
        expect(snapshot.statusAtomic).toBe('true');
        expect(snapshot.days.map(day => day.date)).toEqual(expectedDates);
        expect(snapshot.days.map(day => day.count)).toEqual(['1회', '0회', '0회', '0회', '0회', '1회', '2회']);
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        await expect(activity.getByRole('list')).toHaveAttribute('role', 'list');
        await expect(activity.getByRole('listitem')).toHaveCount(7);
        for (const weekday of await activity.locator('time > span').all()) await expect(weekday).toHaveCSS('color', 'rgb(24, 33, 58)');
        await expect(activity).toContainText('브라우저 현지 날짜 기준');
        await expect(activity).toContainText('점수·실력 향상 지표가 아닙니다.');
        const refresh = activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true });
        await refresh.focus();
        await page.keyboard.press('Enter');
        await expect(refresh).toBeFocused();
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        expect(await activity.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))).toEqual(expectedDates);
        expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'))).toBe(saved);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await activity.screenshot({ path: testInfo.outputPath(`activity-${width}-${timezone.replace('/', '-')}.png`) });
        await page.screenshot({ path: testInfo.outputPath(`activity-page-${width}-${timezone.replace('/', '-')}.png`), fullPage: true });
        expect(errors).toEqual([]);

        const nextDay = await page.evaluate(() => {
          const now = new Date();
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
          return { time: date.getTime(), key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
        });
        await page.clock.setFixedTime(nextDay.time);
        const beforeRefresh = await activity.evaluate(element => ({
          wall: Date.now(),
          days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
        }));
        console.log('TRAINING_ACTIVITY_DAY_SHIFT', JSON.stringify({ timezone, width, referenceTime, nextDay, beforeRefresh }));
        expect(beforeRefresh.wall).toBe(nextDay.time);
        expect(beforeRefresh.days).toEqual(snapshot.days);
        await refresh.focus();
        await page.keyboard.press('Enter');
        const attemptedRefresh = await activity.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')));
        console.log('TRAINING_ACTIVITY_DAY_REFRESH_ATTEMPT', JSON.stringify({ timezone, width, attemptedRefresh }));
        await expect(activity.locator('time').last()).toHaveAttribute('datetime', nextDay.key);
        const refreshed = await activity.evaluate(element => {
          const period = element.querySelector('.training-activity-heading p');
          return {
            wall: Date.now(),
            statusAtomic: element.querySelector('[role="status"]')?.getAttribute('aria-atomic'),
            period: { text: period?.textContent, live: period?.getAttribute('aria-live'), atomic: period?.getAttribute('aria-atomic') },
            days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
          };
        });
        console.log('TRAINING_ACTIVITY_DAY_REFRESH', JSON.stringify({ timezone, width, referenceTime, nextDay, refreshed }));
        expect(refreshed.wall).toBe(nextDay.time);
        expect(refreshed.period).toEqual({ text: `${expectedDates[1]} ~ ${nextDay.key} · 브라우저 현지 날짜 기준`, live: 'polite', atomic: 'true' });
        expect(refreshed.statusAtomic).toBe('true');
        expect(refreshed.days.map(day => day.date)).toEqual([...expectedDates.slice(1), nextDay.key]);
        expect(refreshed.days.map(day => day.count)).toEqual(['0회', '0회', '0회', '0회', '1회', '2회', '1회']);
        await expect(refresh).toBeFocused();
        await expect(activity).toContainText(`${expectedDates[1]} ~ ${nextDay.key}`);
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'))).toBe(saved);
        await activity.screenshot({ path: testInfo.outputPath(`activity-next-day-${width}-${timezone.replace('/', '-')}.png`) });
        expect(errors).toEqual([]);
      });
    }
  });
}

test('첫 화면은 Tailwind 빌드 컴파일러를 내려받지 않는다', async ({ page }) => {
  const scripts: import('@playwright/test').Response[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/_next/static/') && response.request().resourceType() === 'script') scripts.push(response);
  });
  await page.goto('/');
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const path = new URL(script.url()).pathname;
    expect(script.ok(), path).toBe(true);
    expect((await script.text()).includes('__unstable__loadDesignSystem'), path).toBe(false);
  }
});

for (const savedCount of [0, 1]) {
  test(`기록 ${savedCount}개: 느린 첫 로딩에서는 빈 기록으로 단정하지 않고 복원 후 표시한다`, async ({ page }, testInfo) => {
    await page.setViewportSize(savedCount ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((count) => {
      const generation = 'loading-regression';
      window.localStorage.setItem('nineflow-practice-results-generation-v1', generation);
      window.localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({
        version: 4, generation,
        results: count ? [{ id: 'saved-before-loading', gameId: 'rps', completedAt: '2026-09-24T03:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2 }] : [],
      }));
    }, savedCount);
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
    await page.route('**/_next/static/**/*.js', async (route) => {
      await scriptsReady;
      await route.continue();
    });
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await expect(page.locator('.header-status')).toHaveAccessibleName('연습 기록 확인 중, 기록으로 이동');
      await expect(page.locator('.header-status b')).toHaveText('—');
      await expect(page.locator('.card-record[aria-busy="true"]')).toHaveCount(9);
      await expect(page.locator('.game-grid .thumb-scene')).toHaveCount(9);
      await expect(page.locator('.card-record dd').filter({ hasText: /^0회$/ })).toHaveCount(0);
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('#records')).toContainText('연습 기록을 불러오고 있어요.');
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toHaveCount(0);
      await expect(page.locator('.hero-primary')).toBeDisabled();
      await expect(page.locator('.records-data-button')).toBeDisabled();
      await expect(page.locator('#coach-title')).toHaveText('연습 기록을 확인하고 있어요.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // WebKit's fonts.ready can wait for the scripts held here, so capture DOM now and pixels after release.
      await testInfo.attach('loading-home.html', { body: await page.content(), contentType: 'text/html' });
    } finally {
      releaseScripts();
    }
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.header-status')).toHaveAccessibleName(`완료한 연습 ${savedCount}회, 기록으로 이동`);
    await expect(page.locator('.hero-primary')).toBeEnabled();
    await expect(page.locator('.records-data-button')).toBeEnabled();
    // Selective hydration must preserve every server-rendered game preview.
    const thumbnails = page.locator('.game-grid .thumb-scene');
    await expect(thumbnails).toHaveCount(9);
    for (const thumbnail of await thumbnails.all()) await expect(thumbnail).toBeVisible();
    if (savedCount) {
      await expect(page.locator('.record-summary')).toContainText('1회');
      await expect(page.locator('.game-record-grid')).toContainText('80%');
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('ready-home.png') });
    await page.locator('#records').screenshot({ path: testInfo.outputPath('ready-records.png') });
    await page.locator('.records-data-button').click();
    const backup = page.getByRole('dialog', { name: '내 기록 백업·복원' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: '닫기', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test('기본 스크롤로 이동한 백업 버튼이 고정 메뉴에 가려지지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const trigger = page.locator('.records-data-button');
  await trigger.evaluate((button) => button.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const position = await trigger.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const header = document.querySelector('.topbar')!.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, headerBottom: header.bottom, hitIsButton: hit === button || button.contains(hit) };
  });
  expect(position.top).toBeGreaterThanOrEqual(position.headerBottom);
  expect(position.hitIsButton).toBe(true);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('저장소 접근이 차단돼도 기록 로딩이 끝나고 게임 설정을 열 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.hero-primary')).toBeEnabled();
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="rps"]')).toBeVisible();
});

function progressRecord(gameId: GameId, day: number, accuracy: number, extra: Record<string, string | number> = {}): SessionResult {
  const specifics: Partial<Record<GameId, Record<string, string | number>>> = {
    rotation: { rotationContent: 'letters', rotationLetters: 'F', rotationTargetIds: 'turn90', previewUsed: '숨김' },
    appointment: { appointmentRounds: '1→2→3→4' },
    potion: { evidenceHint: '표시', scoringVersion: 'potion-evidence-v1', evidenceTrials: 10 },
    nback: { nbackTask: 'n2', nbackGroupSetting: 'auto', nbackProgression: 'fixed', nbackNameLabels: '숨김', nbackMnemonics: '숨김' },
  };
  return { id: `${gameId}-${day}-${accuracy}`, gameId, completedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`, accuracy, medianRt: 720, stability: 74, errors: 2, detail: { sessionMode: 'practice', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '제한시간 없음', accessibilityProfile: 'standard|standard|system', ...specifics[gameId], ...extra } };
}

async function installProgressRecords(page: Page, results: SessionResult[]) {
  await page.addInitScript((saved) => {
    const generation = 'progress-regression';
    window.localStorage.setItem('nineflow-practice-results-generation-v1', generation);
    window.localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results: saved }));
  }, results);
}

async function progressStorage(page: Page) {
  return page.evaluate(() => ({ generation: window.localStorage.getItem('nineflow-practice-results-generation-v1'), raw: window.localStorage.getItem('nineflow-practice-results-v4:progress-regression') }));
}

test('9게임 동일 조건 점수 변화와 최근 이력을 키보드로 열어도 기록은 바뀌지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installProgressRecords(page, games.flatMap((game) => [progressRecord(game.id, 12, 80), progressRecord(game.id, 13, 90)]));
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const snapshot = await page.locator('.record-progress').evaluateAll((panels) => panels.map((panel) => ({ label: panel.getAttribute('aria-label'), heading: panel.querySelector('h3')?.textContent, rows: Array.from(panel.querySelectorAll('tbody tr'), (row) => row.textContent), summaryHeight: panel.querySelector('summary')!.getBoundingClientRect().height })));
  console.log('RECORD_PROGRESS_ALL_GAMES', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-all-games.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  expect(snapshot).toHaveLength(9);
  for (const [index, game] of games.entries()) {
    const panel = page.getByRole('region', { name: `${game.title} 같은 조건 기록 변화`, exact: true });
    await expect(panel.getByRole('heading')).toHaveText('직전 동일 조건 대비 +10%p');
    const summary = panel.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(summary).toBeFocused();
    await expect(panel.locator('details')).toHaveAttribute('open', '');
    await expect(panel.getByRole('table')).toBeVisible();
    await expect(panel.locator('tbody tr')).toHaveCount(2);
    await expect(panel.locator('tbody td:last-child')).toHaveText(['90%', '80%']);
    await expect(panel.locator('tbody tr').first()).toContainText('2026');
    await expect(panel).toContainText('실제 역량이나 JOBDA 점수의 변화를 뜻하지 않습니다.');
    expect(snapshot[index].summaryHeight).toBeGreaterThanOrEqual(44);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (index === 0) await panel.screenshot({ path: testInfo.outputPath('record-progress-open.png') });
    await page.keyboard.press('Space');
    await expect(panel.locator('details')).not.toHaveAttribute('open');
  }
  expect(await progressStorage(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('동일 조건 최근 5회에는 다른 게임·설정·모드·탭 이탈 기록이 섞이지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const differences: Record<string, string | number>[] = [{ quantity: 30 }, { paceMs: 4000 }, { practiceFocus: 'mixed' }, { guidedPacing: '설정 제한시간 적용' }, { accessibilityProfile: 'high|large|reduced' }, { sessionMode: 'simulation', simulationPresetVersion: 'public-rules-training-v4-2026-09' }, { visibilityPauses: 1 }];
  await installProgressRecords(page, [
    ...Array.from({ length: 7 }, (_, index) => progressRecord('rps', index + 1, (index + 1) * 10)),
    ...differences.map((detail, index) => ({ ...progressRecord('rps', 6, 99, detail), id: `excluded-${index}` })),
    progressRecord('number', 6, 99),
    { ...progressRecord('rps', 6, 99), id: 'legacy', detail: undefined },
  ]);
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const panel = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await panel.locator('summary').click();
  const snapshot = await panel.evaluate((element) => ({ heading: element.querySelector('h3')?.textContent, rows: Array.from(element.querySelectorAll('tbody tr'), (row) => row.textContent), scores: Array.from(element.querySelectorAll('tbody td:last-child'), (cell) => cell.textContent), text: element.textContent }));
  console.log('RECORD_PROGRESS_FILTERED', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-filtered.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  await expect(panel.getByRole('heading')).toHaveText('직전 동일 조건 대비 +10%p');
  expect(snapshot.scores).toEqual(['70%', '60%', '50%', '40%', '30%']);
  expect(snapshot.rows).toHaveLength(5);
  await expect(panel).not.toContainText('99%');
  await panel.screenshot({ path: testInfo.outputPath('record-progress-filtered.png') });
  expect(await progressStorage(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('이전 설정 없는 기록·단일 기록·마법약 근거 없는 기록은 점수 변화와 0점 최고를 만들지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installProgressRecords(page, [
    { ...progressRecord('rps', 13, 80), detail: undefined },
    progressRecord('number', 13, 80),
    progressRecord('potion', 12, 0, { evidenceTrials: 0 }),
    progressRecord('potion', 13, 0, { evidenceTrials: 0 }),
  ]);
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const snapshot = await page.locator('.record-progress').evaluateAll((panels) => panels.map((panel) => ({ label: panel.getAttribute('aria-label'), text: panel.textContent })));
  console.log('RECORD_PROGRESS_PENDING', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-pending.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  const legacy = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await expect(legacy).toContainText('설정·날짜 정보가 부족하거나 탭 이탈이 있는 기록은 비교하지 않습니다.');
  await expect(legacy.locator('summary')).toHaveCount(0);
  const single = page.getByRole('region', { name: '숫자 누르기 같은 조건 기록 변화', exact: true });
  await expect(single).toContainText('동일 조건 기록을 한 번 더 완료하면 비교할 수 있습니다.');
  await expect(single.locator('summary')).toHaveCount(0);
  const potion = page.getByRole('region', { name: '마법약 만들기 같은 조건 기록 변화', exact: true });
  await expect(potion).toContainText('비교 가능한 점수가 없어 변화는 표시하지 않습니다.');
  await potion.locator('summary').click();
  await expect(potion.getByRole('columnheader', { name: '근거 정렬률', exact: true })).toBeVisible();
  await expect(potion.locator('tbody td:last-child')).toHaveText(['—', '—']);
  const potionCard = page.locator('.game-record-grid > article').filter({ has: potion });
  await expect(potionCard.locator('dl dd')).toHaveText(['—', '—', '2회']);
  await potionCard.screenshot({ path: testInfo.outputPath('record-progress-unscored.png') });
  expect(await progressStorage(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('실제 가위바위보 두 번 완주 기록의 점수 변화·활동·필터·CSV와 새로고침이 함께 유지된다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const raw = generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null;
    const envelope = raw ? JSON.parse(raw) : null;
    return { generation, raw, version: envelope?.version, envelopeGeneration: envelope?.generation, results: (envelope?.results ?? []) as SessionResult[] };
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  expect((await readSaved()).results).toEqual([]);
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('15');
  for (let count = 0; count < 2; count += 1) await stage.getByRole('button', { name: '문제 수 줄이기', exact: true }).click();
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('9');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const result = page.locator('.stage-result');
  const completions: SessionResult[] = [];
  for (let session = 0; session < 2; session += 1) {
    const workspace = page.locator('.game-workspace.game-rps');
    await expect(workspace.locator('.rps-board')).toBeVisible();
    await expect(workspace.locator('.guided-pacing-note')).toContainText('시간 제한 없이 연습 중');
    for (let question = 0; question < 9; question += 1) {
      await expect(workspace.locator('.workspace-progress > span')).toContainText(`${question + 1} / 9`);
      const choice = workspace.locator('.rps-actions button').filter({ hasText: '바위' });
      await expect(choice).toBeEnabled();
      await choice.click();
    }
    await expect(result.getByRole('heading', { name: '가위바위보 결과', exact: true })).toBeVisible();
    await expect.poll(async () => (await readSaved()).results.length).toBe(session + 1);
    const saved = (await readSaved()).results[0];
    completions.push(saved);
    const snapshot = { id: saved.id, completedAt: saved.completedAt, accuracy: saved.accuracy, errors: saved.errors, detail: saved.detail, reviewSummary: saved.review?.summary };
    console.log('RECORD_PROGRESS_REAL_COMPLETION', JSON.stringify(snapshot));
    await testInfo.attach(`record-progress-real-completion-${session + 1}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    expect(saved.gameId).toBe('rps');
    expect(saved.detail).toMatchObject({ quantity: 9, paceMs: 4500, trialCount: 9, responseCount: 9, practiceFocus: 'full', guidedPacing: '제한시간 없음', sessionMode: '연습 모드', visibilityPauses: 0 });
    expect(saved.detail?.accessibilityProfile).toMatch(/\S+/);
    expect(Number(saved.detail?.correctCount) + saved.errors).toBe(9);
    expect(saved.review?.summary.attemptedCount).toBe(9);
    await expect(result.locator('.result-metrics article').first().locator('b')).toHaveText(`${saved.accuracy}%`);
    if (session === 0) await result.getByRole('button', { name: '다시 연습', exact: true }).click();
  }
  const [previous, latest] = completions;
  expect(latest.id).not.toBe(previous.id);
  expect(Date.parse(latest.completedAt)).toBeGreaterThan(Date.parse(previous.completedAt));
  for (const key of ['quantity', 'paceMs', 'practiceFocus', 'guidedPacing', 'sessionMode', 'accessibilityProfile']) expect(latest.detail?.[key]).toEqual(previous.detail?.[key]);
  const beforeHistory = await readSaved();
  expect(beforeHistory.version).toBe(4);
  expect(beforeHistory.envelopeGeneration).toBe(beforeHistory.generation);
  await result.getByRole('button', { name: /^게임 목록/ }).click();
  await expect(page.locator('.stage-panel')).toHaveCount(0);
  const panel = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await panel.locator('summary').focus();
  await page.keyboard.press('Enter');
  const snapshot = await panel.evaluate((element) => ({ heading: element.querySelector('h3')?.textContent, scores: Array.from(element.querySelectorAll('tbody td:last-child'), (cell) => cell.textContent), rows: Array.from(element.querySelectorAll('tbody tr'), (row) => row.textContent), open: element.querySelector('details')?.hasAttribute('open') }));
  console.log('RECORD_PROGRESS_REAL_HISTORY', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-real-history.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  const change = Math.round((latest.accuracy - previous.accuracy) * 10) / 10;
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  expect(snapshot.scores).toEqual([`${latest.accuracy}%`, `${previous.accuracy}%`]);
  expect(snapshot.open).toBe(true);
  const card = page.locator('.game-record-grid > article').filter({ has: panel });
  await expect(card.locator('dl dd')).toHaveText([`${latest.accuracy}%`, `${Math.max(latest.accuracy, previous.accuracy)}%`, '2회']);
  await panel.screenshot({ path: testInfo.outputPath('record-progress-real-history.png') });
  expect(await readSaved()).toEqual(beforeHistory);
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  await activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true }).press('Enter');
  const activitySnapshot = await activity.evaluate((element, saved) => {
    const dates = Array.from(element.querySelectorAll('li'), day => day.getAttribute('data-date'));
    const expected = dates.map(date => saved.filter(record => {
      const completed = new Date(record.completedAt);
      const key = `${completed.getFullYear()}-${String(completed.getMonth() + 1).padStart(2, '0')}-${String(completed.getDate()).padStart(2, '0')}`;
      return key === date;
    }).length);
    return { dates, expected, counts: Array.from(element.querySelectorAll('li b'), count => count.textContent), status: element.querySelector('[role="status"]')?.textContent };
  }, beforeHistory.results);
  console.log('PRACTICE_DASHBOARD_REAL_ACTIVITY', JSON.stringify(activitySnapshot));
  expect(activitySnapshot.dates).toHaveLength(7);
  expect(activitySnapshot.expected.reduce((sum, count) => sum + count, 0)).toBe(2);
  expect(activitySnapshot.counts).toEqual(activitySnapshot.expected.map(count => `${count}회`));
  await expect(activity.getByRole('status')).toHaveText(`완료 세션 2회 · 기록이 있는 날 ${activitySnapshot.expected.filter(count => count > 0).length}일 / 7일`);
  const history = page.locator('.history-panel');
  await history.locator('summary').press('Enter');
  await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('rps');
  await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('practice');
  await expect(history.locator('.record-list > article')).toHaveCount(2);
  await expect(history.getByRole('status')).toHaveText('저장된 2개 중 2개 일치 · 2개 표시');
  await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('number');
  await expect(history.locator('.record-list > article')).toHaveCount(0);
  await expect(history.locator('.history-empty')).toBeVisible();
  // A view filter must not hide records from progress, activity, or a full export.
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  await expect(activity.getByRole('status')).toHaveText(activitySnapshot.status!);
  const opener = page.locator('.records-data-button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  const csvButton = dialog.getByRole('button', { name: 'CSV 요약 받기', exact: true });
  const downloadPromise = page.waitForEvent('download');
  await csvButton.press('Enter');
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Actual practice CSV download stream is unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const csv: string = bytes.toString('utf8');
  const csvRows = csv.slice(1, -2).split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replaceAll('""', '"')));
  console.log('PRACTICE_DASHBOARD_REAL_CSV', JSON.stringify({ filename: download.suggestedFilename(), bom: [...bytes.subarray(0, 3)], rows: csvRows }));
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^nineflow-practice-summary-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(csv.endsWith('\r\n')).toBe(true);
  expect(csvRows).toHaveLength(3);
  expect(csvRows.every(row => row.length === 10)).toBe(true);
  expect(csvRows[0]).toEqual(['완료 시각(UTC)', '게임', '모드', '점수 지표', '점수(%)', '시간 지표', '중앙시간(ms)', '오류 지표', '오류 수', '훈련 설정(JSON)']);
  for (const [index, saved] of beforeHistory.results.entries()) {
    expect(csvRows[index + 1].slice(0, 9)).toEqual([saved.completedAt, '가위바위보', '연습 모드', '정확도', String(saved.accuracy), '중앙 반응', saved.medianRt ? String(saved.medianRt) : '', '오류', String(saved.errors)]);
    expect(JSON.parse(csvRows[index + 1][9])).toEqual(saved.detail);
    expect(csv).not.toContain(saved.id);
  }
  await expect(dialog.locator('.data-dialog-notice')).toContainText('연습 요약 2개를 CSV 파일로 내보냈습니다.');
  await expect(csvButton).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath('practice-dashboard-real-csv.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await history.getByRole('button', { name: '필터 초기화', exact: true }).press('Enter');
  await expect(history.locator('.record-list > article')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('practice-dashboard-real-home.png'), fullPage: true });
  expect(await readSaved()).toEqual(beforeHistory);
  await page.reload();
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const restored = await readSaved();
  console.log('RECORD_PROGRESS_REAL_RELOAD', JSON.stringify({ generation: restored.generation, ids: restored.results.map((item) => item.id), scores: restored.results.map((item) => item.accuracy) }));
  expect(restored.generation).toBe(beforeHistory.generation);
  expect(restored.results).toEqual(beforeHistory.results);
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  expect(errors).toEqual([]);

  const beforeScale = await readSaved();
  const summary = panel.locator('summary');
  await summary.press('Enter');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const observeScale = async (label: string) => {
    const view = await panel.evaluate((element) => {
      const summary = element.querySelector('summary')!;
      const table = element.querySelector('table')!;
      const font = (selector: string) => Number.parseFloat(getComputedStyle(element.querySelector(selector)!).fontSize);
      return {
        scale: document.documentElement.dataset.textScale,
        fonts: { heading: font('h3'), summary: font('summary'), table: font('table'), paragraph: font('p') },
        cellFonts: Array.from(element.querySelectorAll('th, td'), cell => Number.parseFloat(getComputedStyle(cell).fontSize)),
        heading: element.querySelector('h3')?.textContent,
        rows: Array.from(element.querySelectorAll('tbody tr'), row => row.textContent),
        open: element.querySelector('details')?.hasAttribute('open'),
        summaryFocused: document.activeElement === summary,
        summaryHeight: summary.getBoundingClientRect().height,
        panelClientWidth: element.clientWidth,
        panelScrollWidth: element.scrollWidth,
        tableWidth: table.getBoundingClientRect().width,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    });
    const saved = await readSaved();
    const snapshot = { label, ...view, generation: saved.generation, ids: saved.results.map(item => item.id), profiles: saved.results.map(item => item.detail?.accessibilityProfile) };
    console.log('RECORD_PROGRESS_TEXT_SCALE', JSON.stringify(snapshot));
    await testInfo.attach(`record-progress-text-scale-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await panel.screenshot({ path: testInfo.outputPath(`record-progress-text-scale-${label}.png`) });
    return { view, saved };
  };
  const standard = await observeScale('standard');
  const readinessOpener = page.locator('.readiness-banner button');
  const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
  await readinessOpener.press('Enter');
  const largeButton = readiness.getByRole('button', { name: '큰 글자', exact: true });
  await expect(largeButton).toHaveAttribute('aria-pressed', 'false');
  await largeButton.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(largeButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(readiness).toHaveCount(0);
  await expect(readinessOpener).toBeFocused();
  await summary.press('Space');
  await expect(panel.locator('details')).not.toHaveAttribute('open', '');
  await summary.press('Space');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const large = await observeScale('large');
  await readinessOpener.press('Enter');
  const standardButton = readiness.getByRole('button', { name: '기본 크기', exact: true });
  await standardButton.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'standard');
  await expect(standardButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(readiness).toHaveCount(0);
  await expect(readinessOpener).toBeFocused();
  await summary.press('Space');
  await expect(panel.locator('details')).not.toHaveAttribute('open', '');
  await summary.press('Space');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const reset = await observeScale('reset');
  for (const observed of [standard, large, reset]) {
    expect(observed.saved).toEqual(beforeScale);
    expect(observed.view.rows).toEqual(standard.view.rows);
    expect(observed.view.heading).toBe(standard.view.heading);
    expect(observed.view.open).toBe(true);
    expect(observed.view.summaryFocused).toBe(true);
    expect(observed.view.summaryHeight).toBeGreaterThanOrEqual(44);
    expect(observed.view.panelScrollWidth).toBeLessThanOrEqual(observed.view.panelClientWidth + 1);
    expect(observed.view.documentScrollWidth).toBeLessThanOrEqual(observed.view.documentClientWidth + 1);
    expect(observed.view.tableWidth).toBeLessThanOrEqual(observed.view.panelClientWidth + 1);
  }
  expect(standard.view.scale).toBe('standard');
  expect(large.view.scale).toBe('large');
  expect(reset.view.scale).toBe('standard');
  expect(reset.view.fonts).toEqual(standard.view.fonts);
  expect(reset.view.cellFonts).toEqual(standard.view.cellFonts);
  expect(large.view.fonts.paragraph).toBeGreaterThan(standard.view.fonts.paragraph);
  for (const key of ['heading', 'summary'] as const) {
    expect(large.view.fonts[key], `large text ${key}`).toBeGreaterThan(standard.view.fonts[key]);
  }
  expect(standard.view.cellFonts).toHaveLength(6);
  expect(large.view.cellFonts).toHaveLength(standard.view.cellFonts.length);
  for (const [index, size] of large.view.cellFonts.entries()) {
    expect(size, `large text cell ${index}`).toBeGreaterThan(standard.view.cellFonts[index]);
  }
  expect(errors).toEqual([]);
});

test('9게임 시작 버튼은 현재 패널과 무관하게 각 모드의 실제 분량·시간을 알린다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const expected: Record<GameId, [string, string]> = {
    rotation: ['10문제 · 문제 제한 30초', '2단계 · 단계당 180초'],
    rps: ['15문항 · 문제 제한 4.5초', '30문항 · 문제 제한 4.5초'],
    appointment: ['한 사람 제시 3초', '4라운드 · 40문항 · 한 사람 제시 1초'],
    path: ['3문제 · 문제 제한 60초', '4문제 · 문제 제한 60초'],
    potion: ['42시행 · 응답 제한 7초', '100시행 · 응답 제한 3초'],
    nback: ['채점 20문항 · 준비 별도 · 고정 간격 3초', '채점 47문항 · 준비 별도 · 도형 간격 3초'],
    number: ['10문제 · 문제 제한 20초', '12문제 · 문제 제한 20초'],
    count: ['15문항 · 단어 제시 1초', '46문항 · 단어 제시 1초'],
    mouse: ['5라운드 · 생쥐 제시 1초', '20라운드 · 생쥐 제시 1초'],
  };
  const saved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const before = await saved();
  for (const game of games) {
    await page.getByRole('button', { name: new RegExp(`${game.title}, 난이도`) }).click();
    const stage = page.locator(`section[data-game="${game.id}"]`);
    const practice = stage.getByRole('button', { name: /^설명·연습 시작/ });
    const simulation = stage.getByRole('button', { name: /^실전형 연습 시작/ });
    for (const mode of ['practice', 'simulation'] as const) {
      if (mode === 'simulation') await stage.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^실전형 연습/ }).press('Space');
      const snapshot = await stage.locator('.intro-start-options').evaluate(element => Array.from(element.querySelectorAll('button'), button => {
        const box = button.getBoundingClientRect();
        return { title: button.querySelector(':scope > span')?.textContent, text: button.querySelector(':scope > small')?.innerHTML, smallCount: button.querySelectorAll(':scope > small').length, selected: button.classList.contains('is-selected'), x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: button.clientWidth, scrollWidth: button.scrollWidth };
      }));
      console.log('START_SETTING_SUMMARY', JSON.stringify({ game: game.id, mode, snapshot }));
      await testInfo.attach(`start-summary-${game.id}-${mode}.json`, { body: JSON.stringify({ game: game.id, mode, snapshot }, null, 2), contentType: 'application/json' });
      await expect(practice.locator(':scope > small')).toContainText(expected[game.id][0]);
      await expect(simulation.locator(':scope > small')).toContainText(expected[game.id][1]);
      if (game.id === 'appointment') await expect(practice).toContainText('선택: 요일 · 위치 · 메뉴 · 미탑승 버스 · 총 12문항');
      expect(snapshot.map(item => item.title)).toEqual(['설명·연습 시작', '실전형 연습 시작']);
      expect(snapshot.map(item => item.selected)).toEqual([mode === 'practice', mode === 'simulation']);
      for (const button of snapshot) {
        expect(button.smallCount).toBe(1);
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.y).toBeGreaterThanOrEqual(0);
        expect(button.right).toBeLessThanOrEqual(320);
        expect(button.bottom).toBeLessThanOrEqual(568);
        expect(button.scrollWidth).toBeLessThanOrEqual(button.width + 1);
      }
      expect(await saved()).toEqual(before);
    }
    await stage.screenshot({ path: testInfo.outputPath(`start-summary-${game.id}.png`) });
    await stage.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

for (const target of ['practice', 'simulation'] as const) {
  test(`시작 요약 ${target}: 숨겨진 맞춤 설정을 보존하고 누른 버튼의 모드로 진입한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const open = () => page.getByRole('button', { name: /숫자 누르기, 난이도 하, 설정 열기/ }).click();
    await open();
    const stage = page.locator('section[data-game="number"]');
    await stage.getByRole('button', { name: '문제 수 늘리기', exact: true }).press('Enter');
    await stage.getByRole('button', { name: '문제 제한 늘리기', exact: true }).press('Enter');
    await stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
    await expect(stage.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('15문제 · 응답 제한 없음');
    await page.reload();
    await open();
    await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
    await expect(stage.getByLabel('문제 수 현재 값', { exact: true })).toHaveText('15');
    await expect(stage.getByLabel('문제 제한 현재 값', { exact: true })).toHaveText('25초');
    const readSaved = () => page.evaluate(() => {
      const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
      return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
    });
    const before = await readSaved();
    const modes = stage.getByRole('radiogroup', { name: '진행 방식', exact: true });
    if (target === 'practice') await modes.getByRole('radio', { name: /^실전형 연습/ }).press('Space');
    await expect(stage.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('15문제 · 응답 제한 없음');
    await expect(stage.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('12문제 · 문제 제한 20초');
    await stage.screenshot({ path: testInfo.outputPath(`start-summary-cross-${target}.png`) });
    await stage.getByRole('button', { name: target === 'practice' ? /^설명·연습 시작/ : /^실전형 연습 시작/ }).press('Enter');
    const workspace = page.locator('.game-workspace.game-number');
    await expect(workspace.locator('.number-board-pro')).toBeVisible();
    const snapshot = await workspace.evaluate(element => ({ mode: element.getAttribute('data-mode'), progress: element.querySelector('.workspace-progress span')?.textContent, guided: element.querySelector('.guided-pacing-note')?.textContent ?? null, deadline: element.querySelector('.time-strip')?.getAttribute('aria-valuemax') ?? null, selected: element.querySelectorAll('.number-board-pro button:disabled').length }));
    console.log('START_SETTING_CROSS_MODE', JSON.stringify({ target, ...snapshot }));
    await testInfo.attach(`start-summary-cross-${target}.json`, { body: JSON.stringify({ target, ...snapshot }, null, 2), contentType: 'application/json' });
    expect(snapshot.mode).toBe(target);
    expect(snapshot.progress).toBe(`1라운드 · 점등 숫자 · 1 / ${target === 'practice' ? 7 : 6} 문제`);
    expect(snapshot.selected).toBe(0);
    if (target === 'practice') {
      expect(snapshot.guided).toContain('시간 제한 없이 연습 중');
      expect(snapshot.deadline).toBeNull();
      await expect(workspace.locator('.time-strip')).toHaveCount(0);
    } else {
      expect(snapshot.guided).toBeNull();
      expect(snapshot.deadline).toBe('20000');
      await expect(workspace.locator('.time-strip')).toBeVisible();
    }
    await workspace.getByRole('button', { name: target === 'practice' ? '연습 닫기' : '실전형 연습 닫기', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '연습창 닫기', exact: true }).click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator('.record-summary')).toHaveCount(0);
    expect(await readSaved()).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('시작 요약은 N-back 빠른 전환보다 무시간제를 우선하고 약속의 선택 분량을 갱신한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const nback = page.locator('section[data-game="nback"]');
  const practice = nback.getByRole('button', { name: /^설명·연습 시작/ });
  await nback.locator('.practice-advanced-settings > summary').press('Enter');
  await nback.getByRole('radio', { name: /^응답 빠른 전환/ }).press('Space');
  await expect(practice).toContainText('채점 20문항 · 준비 별도 · 응답 후 빠른 전환 · 무응답 제한 3초');
  await nback.getByRole('button', { name: '문제 간격 늘리기', exact: true }).press('Enter');
  await expect(practice).toContainText('응답 후 빠른 전환 · 무응답 제한 3.5초');
  await nback.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
  await expect(practice).toContainText('채점 20문항 · 준비 별도 · 응답 제한 없음');
  await expect(practice).not.toContainText('응답 후 빠른 전환');
  await nback.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^실전형 연습/ }).press('Space');
  await expect(practice).toContainText('응답 제한 없음');
  await expect(nback.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('채점 47문항 · 준비 별도 · 도형 간격 3초');
  await nback.screenshot({ path: testInfo.outputPath('start-summary-nback-guided.png') });
  await nback.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^연습 모드/ }).press('Space');
  await nback.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
  await expect(practice).toContainText('응답 후 빠른 전환 · 무응답 제한 3.5초');
  await nback.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const appointment = page.locator('section[data-game="appointment"]');
  await appointment.getByRole('button', { name: '4라운드 미탑승 버스만 연습', exact: true }).press('Enter');
  await appointment.getByRole('button', { name: '라운드당 문항 늘리기', exact: true }).press('Enter');
  await expect(appointment.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('선택: 미탑승 버스 · 총 4문항');
  await appointment.getByRole('checkbox', { name: '요일 연습 포함', exact: true }).press('Space');
  await expect(appointment.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('선택: 요일 · 미탑승 버스 · 총 8문항');
  await expect(appointment.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('4라운드 · 40문항 · 한 사람 제시 1초');
  await appointment.screenshot({ path: testInfo.outputPath('start-summary-appointment-selection.png') });
  expect(errors).toEqual([]);
});

for (const contrast of ['standard', 'high'] as const) {
  for (const textScale of ['standard', 'large'] as const) {
    test(`시작 버튼 대비 ${contrast}/${textScale}: 9게임의 선택 상태와 N-back hover·키보드 초점을 보존한다`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21);
      expect(contrastRatio('rgb(53, 66, 89)', 'rgb(53, 66, 89)')).toBe(1);
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      await page.locator('.readiness-banner button').click();
      const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
      await readiness.getByRole('button', { name: contrast === 'high' ? '고대비' : '기본 명암', exact: true }).press('Enter');
      await readiness.getByRole('button', { name: textScale === 'large' ? '큰 글자' : '기본 크기', exact: true }).press('Enter');
      await page.keyboard.press('Escape');
      await expect(readiness).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-contrast', contrast);
      await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
      const readSaved = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('nineflow-practice-results')).sort().map(key => [key, localStorage.getItem(key)])));
      const before = await readSaved();
      const observe = async (stage: Locator, gameId: GameId, mode: 'practice' | 'simulation', interaction: string) => {
          const buttons = stage.locator('.intro-start-options button');
          await expect(buttons).toHaveCount(2);
          await expect(buttons.first()).toBeVisible();
          await expect(buttons.nth(1)).toBeVisible();
          const snapshot = await buttons.evaluateAll(elements => elements.map(element => {
            const button = element as HTMLButtonElement;
            const computed = getComputedStyle(button);
            const color = (value: string) => {
              if (!/^rgba?\(/.test(value)) throw new Error(`지원하지 않는 실제 색상: ${value}`);
              const parts = value.match(/[\d.]+/g)!.map(Number);
              if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) throw new Error(`실제 색상 채널 오류: ${value}`);
              return { channels: parts.slice(0, 3), alpha: parts[3] ?? 1 };
            };
            const background = color(computed.backgroundColor);
            if (background.alpha !== 1 || computed.backgroundImage !== 'none') throw new Error('시작 버튼 배경이 불투명 단색이 아닙니다.');
            const texts = Array.from(button.querySelectorAll(':scope > span, :scope > small'), node => {
              const style = getComputedStyle(node);
              const foreground = color(style.color);
              const opacity = Number(style.opacity);
              const alpha = foreground.alpha * opacity;
              const effective = foreground.channels.map((channel, index) => channel * alpha + background.channels[index] * (1 - alpha));
              return { tag: node.tagName, text: node.textContent, color: style.color, opacity, ownBackground: style.backgroundColor, effectiveColor: `rgb(${effective.join(', ')})`, fontSize: Number.parseFloat(style.fontSize) };
            });
            const box = button.getBoundingClientRect();
            return { title: button.querySelector(':scope > span')?.textContent, selected: button.classList.contains('is-selected'), disabled: button.disabled, background: computed.backgroundColor, opacity: Number(computed.opacity), focused: document.activeElement === button, focusVisible: button.matches(':focus-visible'), hovered: button.matches(':hover'), outlineStyle: computed.outlineStyle, outlineWidth: Number.parseFloat(computed.outlineWidth), box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom, height: box.height }, texts };
          }));
          const sample = { game: gameId, mode, interaction, contrast, textScale, snapshot: snapshot.map(button => ({ ...button, texts: button.texts.map(text => ({ ...text, ratio: contrastRatio(text.effectiveColor, button.background) })) })) };
          console.log('START_BUTTON_CONTRAST', JSON.stringify(sample));
          await testInfo.attach(`start-contrast-${gameId}-${mode}-${interaction}.json`, { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
          if (gameId === 'nback') await stage.screenshot({ path: testInfo.outputPath(`start-contrast-${mode}-${interaction}.png`) });
          expect(await readSaved()).toEqual(before);
          return sample;
      };
      const observations: Array<Awaited<ReturnType<typeof observe>>> = [];
      for (const game of games) {
        await page.getByRole('button', { name: new RegExp(`${game.title}, 난이도`) }).click();
        const stage = page.locator(`section[data-game="${game.id}"]`);
        await expect(stage.getByRole('button', { name: '게임 바꾸기', exact: true })).toBeFocused();
        const buttons = stage.locator('.intro-start-options button');
        for (const mode of ['practice', 'simulation'] as const) {
          if (mode === 'simulation') {
            const simulation = stage.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^실전형 연습/ });
            await simulation.press('Space');
            await expect(simulation).toHaveAttribute('aria-checked', 'true');
          }
          await page.mouse.move(1, 1);
          observations.push(await observe(stage, game.id, mode, 'normal'));
          if (game.id === 'nback') {
            for (const [index, label] of ['practice', 'simulation'].entries()) {
              await buttons.nth(index).hover();
              observations.push(await observe(stage, game.id, mode, `hover-${label}`));
              await page.mouse.move(1, 1);
            }
            const first = buttons.first();
            const second = buttons.nth(1);
            await first.focus();
            await page.keyboard.press('Tab');
            await expect(second).toBeFocused();
            observations.push(await observe(stage, game.id, mode, 'keyboard-simulation'));
            await page.keyboard.press('Shift+Tab');
            await expect(first).toBeFocused();
            observations.push(await observe(stage, game.id, mode, 'keyboard-practice'));
          }
        }
        await stage.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
      }
      // Capture every actual state before a contrast assertion can stop the test.
      expect(observations).toHaveLength(26);
      for (const sample of observations) {
        expect(sample.snapshot.map(button => button.selected)).toEqual([sample.mode === 'practice', sample.mode === 'simulation']);
        for (const [index, button] of sample.snapshot.entries()) {
          expect(button.disabled).toBe(false);
          expect(button.opacity).toBe(1);
          expect(button.box.x).toBeGreaterThanOrEqual(0);
          expect(button.box.y).toBeGreaterThanOrEqual(0);
          expect(button.box.right).toBeLessThanOrEqual(320);
          expect(button.box.bottom).toBeLessThanOrEqual(568);
          expect(button.box.height).toBeGreaterThanOrEqual(44);
          expect(button.texts).toHaveLength(2);
          for (const text of button.texts) {
            expect(text.ownBackground).toBe('rgba(0, 0, 0, 0)');
            expect(text.fontSize).toBeGreaterThanOrEqual(text.tag === 'SMALL' && textScale === 'standard' ? 9 : text.tag === 'SMALL' ? 12 : 11);
            expect(text.ratio, `${sample.game}/${sample.mode}/${sample.interaction}/${index}/${text.tag}: ${text.effectiveColor} on ${button.background}`).toBeGreaterThanOrEqual(4.5);
          }
          if (sample.interaction === `hover-${index ? 'simulation' : 'practice'}`) expect(button.hovered).toBe(true);
          if (sample.interaction === `keyboard-${index ? 'simulation' : 'practice'}`) {
            expect(button.focused).toBe(true);
            expect(button.focusVisible).toBe(true);
            expect(button.outlineStyle).not.toBe('none');
            expect(button.outlineWidth).toBeGreaterThanOrEqual(3);
          }
        }
      }
      expect(await readSaved()).toEqual(before);
      expect(errors).toEqual([]);
    });
  }
}

test('활동 목표는 기록 0건에도 키보드로 설정·복원·해제하고 좁은 화면과 고대비 큰 글자를 보존한다', async ({ page }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  await installActivityGoalFixture(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(goal).toBeEnabled();
  const initial = await captureActivityGoal(page, testInfo, 'empty-initial', errors);
  expect(initial.goal?.value).toBe('');
  expect(initial.goal?.options).toEqual([{ value: '', text: '설정 안 함' }, ...[1, 2, 3, 4, 5, 6, 7].map(day => ({ value: String(day), text: `${day}일` }))]);
  expect(initial.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일');
  expect(initial.statusCount).toBe(1);
  expect(initial.dates).toHaveLength(7);
  expect(initial.saved.goal).toBeNull();
  expect(initial.saved.writes).toEqual([]);
  expect(JSON.parse(initial.saved.protected['nineflow-practice-results-v4:activity-goal-regression']!).results).toEqual([]);
  await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toBeVisible();
  await goal.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  const keyboard = await captureActivityGoal(page, testInfo, 'empty-keyboard-selected', errors);
  expect(keyboard.goal?.value).toBe('1');
  expect(keyboard.saved.goal).toBe('1');
  expect(keyboard.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일 · 내 목표 1일 · 1일 더 활동하면 달성');
  expect(keyboard.saved.protected).toEqual(initial.saved.protected);
  await page.reload();
  await expect(goal).toBeEnabled();
  const restored = await captureActivityGoal(page, testInfo, 'empty-reloaded', errors);
  expect(restored.goal?.value).toBe('1');
  expect(restored.saved.goal).toBe('1');
  expect(restored.saved.writes).toEqual([]);
  expect(restored.saved.protected).toEqual(initial.saved.protected);

  for (const profile of ['standard', 'high-large'] as const) {
    if (profile === 'high-large') {
      await page.locator('.readiness-banner button').press('Enter');
      const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
      await readiness.getByRole('button', { name: '고대비', exact: true }).press('Enter');
      await readiness.getByRole('button', { name: '큰 글자', exact: true }).press('Enter');
      await page.keyboard.press('Escape');
      await expect(readiness).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
      await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
    }
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 360 }]) {
      await page.setViewportSize(viewport);
      await activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true }).focus();
      await page.keyboard.press('Tab');
      const layout = await captureActivityGoal(page, testInfo, `layout-${profile}-${viewport.width}`, errors);
      expect(layout.goal?.focused).toBe(true);
      expect(layout.goal?.focusVisible).toBe(true);
      expect(layout.goal?.outlineStyle).not.toBe('none');
      expect(layout.goal!.outlineWidth).toBeGreaterThanOrEqual(3);
      expect(layout.goal!.box.width).toBeGreaterThanOrEqual(44);
      expect(layout.goal!.box.height).toBeGreaterThanOrEqual(44);
      expect(layout.goal!.box.x).toBeGreaterThanOrEqual(0);
      expect(layout.goal!.box.y).toBeGreaterThanOrEqual(0);
      expect(layout.goal!.box.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.goal!.box.bottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.goal!.ratio).toBeGreaterThanOrEqual(4.5);
      expect(layout.goal!.images.every(image => image === 'none')).toBe(true);
      expect(layout.goal!.opacities.every(opacity => opacity === 1)).toBe(true);
      expect(layout.goal!.fontSize).toBeGreaterThanOrEqual(profile === 'high-large' ? 13 : 12);
      expect(layout.panel.scrollWidth).toBeLessThanOrEqual(layout.panel.clientWidth);
      expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.clientWidth);
      expect(layout.saved.protected).toEqual(initial.saved.protected);
      if (profile === 'high-large') expect([layout.contrast, layout.textScale]).toEqual(['high', 'large']);
    }
  }
  const accessibility = (await readActivityGoalStorage(page)).accessibility;
  await goal.selectOption('');
  const cleared = await captureActivityGoal(page, testInfo, 'empty-unset', errors);
  expect(cleared.goal?.value).toBe('');
  expect(cleared.saved.goal).toBeNull();
  expect(cleared.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일');
  expect(cleared.saved.protected).toEqual(initial.saved.protected);
  expect(cleared.saved.accessibility).toBe(accessibility);
  await page.reload();
  await expect(goal).toBeEnabled();
  const clearedReload = await captureActivityGoal(page, testInfo, 'empty-unset-reloaded', errors);
  expect(clearedReload.goal?.value).toBe('');
  expect(clearedReload.saved.goal).toBeNull();
  expect(clearedReload.saved.writes).toEqual([]);
  expect(clearedReload.saved.protected).toEqual(initial.saved.protected);
  expect(clearedReload.saved.accessibility).toBe(accessibility);
  expect(errors).toEqual([]);
});

test('활동 목표는 같은 날 여러 보관 세션을 하루로 세고 미달·달성·초과와 날짜 새로고침을 구분한다', async ({ page }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  // These are retained record fixtures, not four games completed by this test.
  await installActivityGoalFixture(page, { offsets: [0, 0, -1, -2] });
  await page.goto('/');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(goal).toBeEnabled();
  const initial = await captureActivityGoal(page, testInfo, 'records-before-goal', errors);
  expect(initial.expectedActiveDays).toBe(3);
  expect(initial.expectedCounts.reduce((sum, count) => sum + count, 0)).toBe(4);
  expect(initial.counts).toEqual(initial.expectedCounts.map(count => `${count}회`));
  expect(initial.status).toBe('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
  for (const days of [4, 3, 2]) {
    await goal.selectOption(String(days));
    const selected = await captureActivityGoal(page, testInfo, `records-goal-${days}`, errors);
    expect(selected.goal?.value).toBe(String(days));
    expect(selected.saved.goal).toBe(String(days));
    expect(selected.expectedActiveDays).toBe(3);
    expect(selected.status).toBe(`완료 세션 4회 · 기록이 있는 날 3일 / 7일 · 내 목표 ${days}일 · ${days > 3 ? '1일 더 활동하면 달성' : '달성'}`);
    expect(selected.saved.protected).toEqual(initial.saved.protected);
  }
  // Native same-document storage writes emit no storage event: refresh must
  // reread the saved preference, not merely repeat the current React value.
  await page.evaluate(key => localStorage.setItem(key, '6'), activityGoalKey);
  const changedStore = await captureActivityGoal(page, testInfo, 'records-storage-before-refresh', errors);
  expect(changedStore.goal?.value).toBe('2');
  expect(changedStore.saved.goal).toBe('6');
  const beforeRefresh = await readActivityGoalStorage(page);
  const refresh = activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true });
  await refresh.press('Enter');
  const refreshed = await captureActivityGoal(page, testInfo, 'records-refreshed', errors);
  expect(refreshed.dates).toHaveLength(7);
  // The native click can fall on either side of midnight between these reads.
  expect([changedStore.referenceDates, refreshed.referenceDates]).toContainEqual(refreshed.dates);
  expect(refreshed.counts).toEqual(refreshed.expectedCounts.map(count => `${count}회`));
  expect(refreshed.goal?.value).toBe('6');
  expect(refreshed.status).toBe('완료 세션 4회 · 기록이 있는 날 3일 / 7일 · 내 목표 6일 · 3일 더 활동하면 달성');
  expect(refreshed.active.text).toBe('오늘 기준으로 새로고침');
  expect(refreshed.saved).toEqual(beforeRefresh);
  expect(errors).toEqual([]);
});

test('활동 목표는 실제 다른 탭의 설정·해제를 반영하고 기록 전체삭제 뒤 목표를 유지한다', async ({ page, context }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  await installActivityGoalFixture(page, { offsets: [0, -1], rawGoal: '3' });
  await page.goto('/');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(goal).toBeEnabled();
  const initial = await captureActivityGoal(page, testInfo, 'peer-initial', errors);
  expect(initial.goal?.value).toBe('3');
  expect(initial.saved.writes).toEqual([]);
  const peer = await context.newPage();
  const peerErrors = watchActivityGoalErrors(peer);
  await peer.goto('/');
  const peerGoal = peer.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(peerGoal).toBeEnabled();
  for (const value of ['5', '', '3']) {
    await peerGoal.selectOption(value);
    await captureActivityGoal(page, testInfo, `peer-${value || 'unset'}-requested`, errors);
    await expect(goal).toHaveValue(value);
    const synced = await captureActivityGoal(page, testInfo, `peer-${value || 'unset'}-settled`, errors);
    expect(synced.goal?.value).toBe(value);
    expect(synced.saved.goal).toBe(value || null);
    expect(synced.saved.writes).toEqual([]);
    expect(synced.saved.protected).toEqual(initial.saved.protected);
  }
  await peer.locator('.records-data-button').click();
  const data = peer.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.getByRole('button', { name: '전체 기록 삭제', exact: true }).click();
  await expect(data).toContainText('2개 기록을 삭제할까요?');
  await expect(data.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await data.getByRole('button', { name: '삭제 확정', exact: true }).click();
  await expect(data).toContainText('모두 삭제했습니다');
  await captureActivityGoal(page, testInfo, 'peer-record-clear-requested', errors, { peerNotice: await data.textContent() });
  await expect(page.locator('.header-status b')).toHaveText('0');
  const deleted = await captureActivityGoal(page, testInfo, 'peer-record-clear-settled', errors);
  expect(deleted.goal?.value).toBe('3');
  expect(deleted.saved.goal).toBe('3');
  expect(deleted.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일 · 내 목표 3일 · 3일 더 활동하면 달성');
  expect(deleted.counts).toEqual(Array(7).fill('0회'));
  expect(deleted.saved.writes).toEqual([]);
  expect(deleted.saved.protected['nineflow-practice-config-v1']).toBe(initial.saved.protected['nineflow-practice-config-v1']);
  expect(deleted.saved.protected['nineflow-game-order-v2']).toBe(initial.saved.protected['nineflow-game-order-v2']);
  const generation = deleted.saved.protected['nineflow-practice-results-generation-v1'];
  expect(JSON.parse(deleted.saved.protected[`nineflow-practice-results-v4:${generation}`]!)).toEqual({ version: 4, generation, results: [] });
  // A native clear in the disposable peer context emits key=null naturally.
  await peer.evaluate(() => localStorage.clear());
  await captureActivityGoal(page, testInfo, 'peer-site-clear-requested', errors);
  await expect(goal).toHaveValue('');
  const cleared = await captureActivityGoal(page, testInfo, 'peer-site-clear-settled', errors);
  expect(cleared.saved.goal).toBeNull();
  expect(cleared.saved.protected).toEqual({});
  expect(cleared.saved.writes).toEqual([]);
  expect(cleared.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일');
  await peer.close();
  expect(errors).toEqual([]);
  expect(peerErrors).toEqual([]);
});

test('활동 목표의 저장·해제 실패는 현재 선택과 원문을 보존하고 같은 값 재시도로 복구한다', async ({ page }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  await installActivityGoalFixture(page, { offsets: [0], rawGoal: '3' });
  await page.goto('/');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(goal).toBeEnabled();
  const before = await readActivityGoalStorage(page);
  const retry = activity.getByRole('button', { name: '목표 다시 저장', exact: true });
  const warning = '활동 목표를 이 화면에만 적용했습니다. 새로고침하면 이전 설정으로 돌아갈 수 있습니다.';
  await setActivityGoalFault(page, 'set');
  await goal.selectOption('5');
  const failedSet = await captureActivityGoal(page, testInfo, 'set-failed', errors);
  expect(failedSet.goal?.value).toBe('5');
  expect(failedSet.goal?.disabled).toBe(false);
  expect(failedSet.saved.goal).toBe('3');
  expect(failedSet.alert).toBe(warning);
  expect(failedSet.saved.protected).toEqual(before.protected);
  await expect(retry).toBeEnabled();
  await setActivityGoalFault(page, null);
  await retry.press('Enter');
  const saved = await captureActivityGoal(page, testInfo, 'set-retried', errors);
  expect(saved.goal?.value).toBe('5');
  expect(saved.saved.goal).toBe('5');
  expect(saved.alert).toBeUndefined();
  expect(saved.goal?.focused).toBe(true);
  await expect(retry).toHaveCount(0);
  expect(saved.saved.protected).toEqual(before.protected);
  await setActivityGoalFault(page, 'remove');
  await goal.selectOption('');
  const failedRemove = await captureActivityGoal(page, testInfo, 'remove-failed', errors);
  expect(failedRemove.goal?.value).toBe('');
  expect(failedRemove.goal?.disabled).toBe(false);
  expect(failedRemove.saved.goal).toBe('5');
  expect(failedRemove.alert).toBe(warning);
  expect(failedRemove.saved.protected).toEqual(before.protected);
  await expect(retry).toBeEnabled();
  await setActivityGoalFault(page, null);
  await retry.press('Space');
  const removed = await captureActivityGoal(page, testInfo, 'remove-retried', errors);
  expect(removed.goal?.value).toBe('');
  expect(removed.saved.goal).toBeNull();
  expect(removed.alert).toBeUndefined();
  expect(removed.goal?.focused).toBe(true);
  expect(removed.saved.writes).toEqual([{ method: 'set', value: '5' }, { method: 'set', value: '5' }, { method: 'remove', value: null }, { method: 'remove', value: null }]);
  await expect(retry).toHaveCount(0);
  expect(removed.saved.protected).toEqual(before.protected);
  expect(errors).toEqual([]);
});

test('활동 목표 읽기만 실패해도 기록은 유지하고 기존 새로고침으로 복구하며 초점을 보존한다', async ({ page }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  await installActivityGoalFixture(page, { offsets: [0], rawGoal: '3', fault: 'get' });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  const failed = await captureActivityGoal(page, testInfo, 'read-failed', errors);
  expect(failed.goal?.disabled).toBe(true);
  expect(failed.alert).toBe('활동 목표를 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.');
  expect(failed.saved.goal).toBe('3');
  expect(failed.saved.writes).toEqual([]);
  await expect(page.locator('.header-status b')).toHaveText('1');
  await expect(page.locator('.hero-primary')).toBeEnabled();
  await setActivityGoalFault(page, null);
  const refresh = activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true });
  await refresh.press('Enter');
  const restored = await captureActivityGoal(page, testInfo, 'read-refreshed', errors);
  expect(restored.goal?.value).toBe('3');
  expect(restored.goal?.disabled).toBe(false);
  expect(restored.alert).toBeUndefined();
  expect(restored.saved.goal).toBe('3');
  expect(restored.saved.writes).toEqual([]);
  expect(restored.saved.protected).toEqual(failed.saved.protected);
  await expect(goal).toBeEnabled();
  await expect(refresh).toBeFocused();
  expect(errors).toEqual([]);
});

test('올바르지 않은 활동 목표 원문은 설정 안 함으로 읽고 새로고침·날짜 갱신에도 덮어쓰지 않는다', async ({ page }, testInfo) => {
  const errors = watchActivityGoalErrors(page);
  const invalid = ['0', '8', '3.5', ' 3', '{"days":3}'];
  await installActivityGoalFixture(page, { rawGoal: invalid[0] });
  await page.goto('/');
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  const goal = activity.getByRole('combobox', { name: '최근 7일 활동 목표(선택)', exact: true });
  await expect(goal).toBeEnabled();
  const before = (await readActivityGoalStorage(page)).protected;
  for (const [index, raw] of invalid.entries()) {
    if (index > 0) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: activityGoalKey, value: raw });
      await page.reload();
      await expect(goal).toBeEnabled();
    }
    const loaded = await captureActivityGoal(page, testInfo, `invalid-${index}-loaded`, errors, { invalidRaw: raw });
    expect(loaded.goal?.value).toBe('');
    expect(loaded.saved.goal).toBe(raw);
    expect(loaded.saved.writes).toEqual([]);
    expect(loaded.saved.protected).toEqual(before);
    expect(loaded.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일');
    await activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true }).press('Enter');
    const refreshed = await captureActivityGoal(page, testInfo, `invalid-${index}-refreshed`, errors, { invalidRaw: raw });
    expect(refreshed.goal?.value).toBe('');
    expect(refreshed.saved.goal).toBe(raw);
    expect(refreshed.saved.writes).toEqual([]);
    expect(refreshed.saved.protected).toEqual(before);
    expect(refreshed.status).toBe('완료 세션 0회 · 기록이 있는 날 0일 / 7일');
  }
  expect(errors).toEqual([]);
});

for (const timezone of ['Asia/Seoul', 'America/New_York']) {
  test.describe(`완료 날짜 찾기 ${timezone}`, () => {
    test.use({ timezoneId: timezone });

    test('완료 날짜·게임·모드 교집합과 더 보기는 전체 활동·비교·CSV·저장 원문을 바꾸지 않는다', async ({ page }, testInfo) => {
      const errors = watchActivityGoalErrors(page);
      await installHistoryDateFixture(page);
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      const oracle = await readHistoryDateOracle(page);
      const history = page.locator('.history-panel');
      await history.locator('summary').press('Enter');
      const game = history.getByRole('combobox', { name: '게임', exact: true });
      const mode = history.getByRole('combobox', { name: '모드', exact: true });
      const date = history.getByRole('combobox', { name: '완료 날짜', exact: true });
      await expect(date).toBeVisible();
      const initial = await captureHistoryDate(page, testInfo, 'initial', errors, { oracle });
      const expectedRows = (records: typeof oracle.records) => records.map(record => ({ title: games.find(game => game.id === record.gameId)!.title, when: `${record.when} · ${record.detail.sessionMode === 'practice' ? '연습 모드' : '실전형 연습'}`, score: `${record.accuracy}%` }));
      const check = (sample: Awaited<ReturnType<typeof captureHistoryDate>>, records: typeof oracle.records, limit = 8) => {
        expect(sample.rows).toEqual(expectedRows(records.slice(0, limit)));
        expect(sample.status).toBe(`저장된 24개 중 ${records.length}개 일치 · ${Math.min(limit, records.length)}개 표시`);
        expect(sample.unfiltered).toEqual(initial.unfiltered);
        expect(sample.saved.protected).toEqual(initial.saved.protected);
        expect(sample.saved.goal).toBe('3');
        expect(sample.errors).toEqual([]);
      };
      expect(oracle.records).toHaveLength(24);
      expect(oracle.dates).toHaveLength(3);
      expect(oracle.offsetPair).toHaveLength(2);
      expect(oracle.offsetPair[0].timestamp).toBe(oracle.offsetPair[1].timestamp);
      expect(oracle.offsetPair[0].date).toBe(oracle.offsetPair[1].date);
      expect(oracle.offsetPair.some(record => record.raw.slice(0, 10) !== record.date)).toBe(true);
      expect(oracle.offsetPair.every(record => record.utcDate !== record.date)).toBe(true);
      expect(initial.timezone).toBe(timezone);
      expect(initial.filters.map(filter => filter.label)).toEqual(['게임', '모드', '완료 날짜']);
      expect(initial.filters[2].options).toEqual([{ value: '', text: '모든 날짜' }, ...oracle.dates.map(value => ({ value, text: value }))]);
      expect(initial.date?.describedBy).toBe('history-date-note');
      expect(initial.note).toBe('브라우저 현지 날짜 기준입니다. 필터는 화면 표시만 바꾸며 백업·활동 집계에는 적용하지 않습니다.');
      expect(initial.unfiltered.progress.length).toBe(2);
      check(initial, oracle.records);
      for (const limit of [16, 24]) {
        await history.getByRole('button', { name: /기록 더 보기/ }).press('Enter');
        const expanded = await captureHistoryDate(page, testInfo, `all-${limit}`, errors);
        check(expanded, oracle.records, limit);
      }
      await expect(history.getByRole('button', { name: /기록 더 보기/ })).toHaveCount(0);
      await mode.selectOption('practice');
      const modeReset = await captureHistoryDate(page, testInfo, 'mode-limit-reset', errors);
      check(modeReset, oracle.records.filter(record => record.detail.sessionMode === 'practice'));
      expect(modeReset.rows).toHaveLength(8);
      expect(oracle.records.filter(record => record.detail.sessionMode === 'practice')).toHaveLength(14);
      await mode.selectOption('all');
      await history.getByRole('button', { name: /기록 더 보기/ }).press('Enter');
      await game.selectOption('rps');
      const gameReset = await captureHistoryDate(page, testInfo, 'game-limit-reset', errors);
      check(gameReset, oracle.records.filter(record => record.gameId === 'rps'));
      expect(gameReset.rows).toHaveLength(8);
      expect(oracle.records.filter(record => record.gameId === 'rps')).toHaveLength(12);
      await game.selectOption('all');
      await history.getByRole('button', { name: /기록 더 보기/ }).press('Enter');

      const newest = oracle.dates[0];
      const newestRecords = oracle.records.filter(record => record.date === newest);
      await date.selectOption(newest);
      const day = await captureHistoryDate(page, testInfo, 'newest-limit-reset', errors);
      check(day, newestRecords);
      expect(newestRecords).toHaveLength(10);
      expect(day.more).toBe('기록 더 보기 (2개 남음)');
      await history.getByRole('button', { name: /기록 더 보기/ }).press('Enter');
      const expandedDay = await captureHistoryDate(page, testInfo, 'newest-expanded', errors);
      check(expandedDay, newestRecords, 16);
      await game.selectOption('rps');
      const gameDay = await captureHistoryDate(page, testInfo, 'date-game', errors);
      check(gameDay, newestRecords.filter(record => record.gameId === 'rps'));
      await mode.selectOption('practice');
      const intersection = await captureHistoryDate(page, testInfo, 'date-game-mode', errors);
      check(intersection, newestRecords.filter(record => record.gameId === 'rps' && record.detail.sessionMode === 'practice'));

      const oldest = oracle.dates[2];
      const oldestRecords = oracle.records.filter(record => record.date === oldest);
      expect(oracle.records.slice(0, 8).every(record => record.date !== oldest)).toBe(true);
      await date.selectOption(oldest);
      const old = await captureHistoryDate(page, testInfo, 'old-date-outside-first-eight', errors);
      check(old, oldestRecords.filter(record => record.gameId === 'rps' && record.detail.sessionMode === 'practice'));
      expect(old.filters[2].options).toEqual(initial.filters[2].options);
      await game.selectOption('number');
      await mode.selectOption('unknown');
      const empty = await captureHistoryDate(page, testInfo, 'empty-intersection', errors);
      check(empty, []);
      expect(empty.date?.value).toBe(oldest);
      expect(empty.empty).toBe('이 조건의 기록이 없습니다. 다른 날짜·게임·모드를 선택하거나 필터를 초기화하세요.');
      await mode.selectOption('simulation');
      const beforeExport = await captureHistoryDate(page, testInfo, 'filtered-before-full-export', errors);
      check(beforeExport, oldestRecords.filter(record => record.gameId === 'number' && record.detail.sessionMode === 'simulation'));

      const opener = page.locator('.records-data-button');
      await opener.press('Enter');
      const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
      const downloadPromise = page.waitForEvent('download');
      await data.getByRole('button', { name: 'CSV 요약 받기', exact: true }).press('Enter');
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      if (!stream) throw new Error('Actual history date CSV download stream is unavailable');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const csv = bytes.toString('utf8');
      const csvRows = csv.slice(1, -2).split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replaceAll('""', '"')));
      const exported = await captureHistoryDate(page, testInfo, 'full-csv', errors, { filename: download.suggestedFilename(), downloadBytes: bytes.length, csvRows });
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(/^nineflow-practice-summary-\d{4}-\d{2}-\d{2}\.csv$/);
      expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
      expect(csv.endsWith('\r\n')).toBe(true);
      expect(csvRows).toHaveLength(25);
      expect(csvRows.every(row => row.length === 10)).toBe(true);
      expect(csvRows[0]).toEqual(['완료 시각(UTC)', '게임', '모드', '점수 지표', '점수(%)', '시간 지표', '중앙시간(ms)', '오류 지표', '오류 수', '훈련 설정(JSON)']);
      for (const [index, record] of oracle.records.entries()) {
        expect(csvRows[index + 1].slice(0, 9)).toEqual([record.utc, games.find(game => game.id === record.gameId)!.title, record.detail.sessionMode === 'practice' ? '연습 모드' : '실전형 연습', '정확도', String(record.accuracy), '중앙 반응', '720', '오류', '2']);
        expect(JSON.parse(csvRows[index + 1][9])).toEqual(record.detail);
      }
      check(exported, oldestRecords.filter(record => record.gameId === 'number' && record.detail.sessionMode === 'simulation'));
      await expect(data.locator('.data-dialog-notice')).toContainText('연습 요약 24개를 CSV 파일로 내보냈습니다.');
      await page.keyboard.press('Escape');
      await expect(data).toHaveCount(0);
      await expect(opener).toBeFocused();
      await history.getByRole('button', { name: '필터 초기화', exact: true }).press('Enter');
      const reset = await captureHistoryDate(page, testInfo, 'all-filters-reset', errors);
      expect(reset.filters.map(filter => filter.value)).toEqual(['all', 'all', '']);
      check(reset, oracle.records);
      expect(errors).toEqual([]);
    });

    test('완료 날짜는 키보드·좁은 화면·고대비 큰 글자를 지원하고 새로고침하면 표시 필터만 초기화한다', async ({ page }, testInfo) => {
      const errors = watchActivityGoalErrors(page);
      await installHistoryDateFixture(page);
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      const history = page.locator('.history-panel');
      await history.locator('summary').press('Enter');
      const date = history.getByRole('combobox', { name: '완료 날짜', exact: true });
      await expect(date).toBeVisible();
      const oracle = await readHistoryDateOracle(page);
      const initial = await captureHistoryDate(page, testInfo, 'keyboard-initial', errors);
      await history.getByRole('combobox', { name: '게임', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(history.getByRole('combobox', { name: '모드', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      const focused = await captureHistoryDate(page, testInfo, 'keyboard-date-focused', errors);
      expect(focused.date?.focused).toBe(true);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      const selected = await captureHistoryDate(page, testInfo, 'keyboard-selected', errors);
      expect(selected.date?.value).toBe(oracle.dates[0]);
      expect(selected.active.text).toBe('필터 초기화');
      expect(selected.rows).toHaveLength(8);
      expect(selected.status).toBe('저장된 24개 중 10개 일치 · 8개 표시');
      expect(selected.saved.protected).toEqual(initial.saved.protected);

      for (const profile of ['standard', 'high-large'] as const) {
        if (profile === 'high-large') {
          await page.locator('.readiness-banner button').press('Enter');
          const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
          await readiness.getByRole('button', { name: '고대비', exact: true }).press('Enter');
          await readiness.getByRole('button', { name: '큰 글자', exact: true }).press('Enter');
          await page.keyboard.press('Escape');
          await expect(readiness).toHaveCount(0);
          await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
          await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
        }
        for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 360 }]) {
          await page.setViewportSize(viewport);
          await history.getByRole('combobox', { name: '모드', exact: true }).focus();
          await page.keyboard.press('Tab');
          const layout = await captureHistoryDate(page, testInfo, `layout-${profile}-${viewport.width}`, errors);
          expect(layout.date?.value).toBe(oracle.dates[0]);
          expect(layout.date?.focused).toBe(true);
          expect(layout.date?.focusVisible).toBe(true);
          expect(layout.date!.outlineStyle).not.toBe('none');
          expect(layout.date!.outlineWidth).toBeGreaterThanOrEqual(3);
          expect(layout.date!.box.width).toBeGreaterThanOrEqual(44);
          expect(layout.date!.box.height).toBeGreaterThanOrEqual(44);
          expect(layout.date!.box.x).toBeGreaterThanOrEqual(0);
          expect(layout.date!.box.y).toBeGreaterThanOrEqual(0);
          expect(layout.date!.box.right).toBeLessThanOrEqual(viewport.width);
          expect(layout.date!.box.bottom).toBeLessThanOrEqual(viewport.height);
          expect(layout.date!.ratio).toBeGreaterThanOrEqual(4.5);
          expect(layout.date!.images.every(image => image === 'none')).toBe(true);
          expect(layout.date!.opacities.every(opacity => opacity === 1)).toBe(true);
          expect(layout.date!.fontSize).toBeGreaterThanOrEqual(profile === 'high-large' ? 13 : 12);
          expect(layout.panel!.scrollWidth).toBeLessThanOrEqual(layout.panel!.clientWidth);
          expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.clientWidth);
          expect(layout.saved.protected).toEqual(initial.saved.protected);
          if (profile === 'high-large') expect([layout.contrast, layout.textScale]).toEqual(['high', 'large']);
          await expect(date).toHaveAccessibleDescription('브라우저 현지 날짜 기준입니다. 필터는 화면 표시만 바꾸며 백업·활동 집계에는 적용하지 않습니다.');
        }
      }
      const accessibility = (await readActivityGoalStorage(page)).accessibility;
      await page.reload();
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      await history.locator('summary').press('Enter');
      await expect(date).toBeVisible();
      const reloaded = await captureHistoryDate(page, testInfo, 'reloaded-default-filter', errors);
      expect(reloaded.filters.map(filter => filter.value)).toEqual(['all', 'all', '']);
      expect(reloaded.rows).toHaveLength(8);
      expect(reloaded.status).toBe('저장된 24개 중 24개 일치 · 8개 표시');
      expect(reloaded.saved.protected).toEqual(initial.saved.protected);
      expect(reloaded.saved.accessibility).toBe(accessibility);
      expect([reloaded.contrast, reloaded.textScale]).toEqual(['high', 'large']);
      expect(errors).toEqual([]);
    });

    test('다른 탭의 정상 100개 저장과 상한 정리로 선택 날짜가 사라져도 빈 선택·목표·전체삭제를 보존한다', async ({ page, context }, testInfo) => {
      const errors = watchActivityGoalErrors(page);
      await installHistoryDateFixture(page);
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      const oracle = await readHistoryDateOracle(page);
      const history = page.locator('.history-panel');
      await history.locator('summary').press('Enter');
      const date = history.getByRole('combobox', { name: '완료 날짜', exact: true });
      const removedDate = oracle.dates[2];
      await date.selectOption(removedDate);
      await date.focus();
      const before = await captureHistoryDate(page, testInfo, 'peer-selected-date', errors);
      expect(before.date?.value).toBe(removedDate);
      expect(before.rows).toHaveLength(4);
      const peer = await context.newPage();
      const peerErrors = watchActivityGoalErrors(peer);
      await peer.goto('/');
      await expect(peer.locator('#records')).toHaveAttribute('aria-busy', 'false');
      // A normal peer 100-record write prunes the four oldest records in the
      // existing same-generation union. It does not simulate a deletion UI.
      const peerMutation = await peer.evaluate(selectedDate => {
        const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
        if (!generation) throw new Error('Missing history date generation');
        const key = `nineflow-practice-results-v4:${generation}`;
        const raw = localStorage.getItem(key);
        if (!raw) throw new Error('Missing history date envelope');
        const envelope: { version: number; generation: string; results: Array<{ id: string; completedAt: string; [key: string]: unknown }> } = JSON.parse(raw);
        const kept = envelope.results.filter(result => {
          const date = new Date(result.completedAt);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== selectedDate;
        });
        const base = kept[0];
        if (!base) throw new Error('Missing retained history date record');
        const fresh = Array.from({ length: 80 }, (_, index) => ({ ...base, id: `date-peer-fresh-${String(index).padStart(2, '0')}`, completedAt: new Date(Date.parse(base.completedAt) + index + 1).toISOString() }));
        const next = JSON.stringify({ ...envelope, results: [...kept, ...fresh] });
        localStorage.setItem(key, next);
        return { generation, key, beforeRaw: raw, afterRaw: next, retained: kept.length, fresh: fresh.length, freshIds: fresh.map(record => record.id) };
      }, removedDate);
      await captureHistoryDate(page, testInfo, 'peer-hundred-prune-requested', errors, { peerMutation, peerErrors: [...peerErrors] });
      await expect(history.getByRole('status')).toHaveText('저장된 100개 중 0개 일치 · 0개 표시');
      const missing = await captureHistoryDate(page, testInfo, 'peer-hundred-prune-settled', errors, { peerMutation, peerErrors: [...peerErrors] });
      const prunedOracle = await readHistoryDateOracle(page);
      expect(peerMutation.retained).toBe(20);
      expect(peerMutation.fresh).toBe(80);
      expect(new Set(peerMutation.freshIds).size).toBe(80);
      expect(prunedOracle.records).toHaveLength(100);
      expect(prunedOracle.records.every(record => record.date !== removedDate)).toBe(true);
      expect(prunedOracle.records.filter(record => record.id.startsWith('date-peer-fresh-'))).toHaveLength(80);
      expect(prunedOracle.records.filter(record => record.id.startsWith('date-record-'))).toHaveLength(20);
      expect(missing.date?.value).toBe(removedDate);
      expect(missing.date?.focused).toBe(true);
      expect(missing.filters.map(filter => filter.value)).toEqual(['all', 'all', removedDate]);
      expect(missing.filters[2].options).toEqual([{ value: '', text: '모든 날짜' }, { value: removedDate, text: `${removedDate} · 보관 기록 없음` }, ...oracle.dates.slice(0, 2).map(value => ({ value, text: value }))]);
      expect(missing.rows).toEqual([]);
      expect(missing.empty).toBe('이 조건의 기록이 없습니다. 다른 날짜·게임·모드를 선택하거나 필터를 초기화하세요.');
      expect(missing.saved.protected[peerMutation.key]).toBe(peerMutation.afterRaw);
      expect(missing.saved.protected['nineflow-practice-results-generation-v1']).toBe(oracle.generation);
      expect(missing.saved.goal).toBe('3');
      expect(missing.saved.protected['nineflow-practice-config-v1']).toBe(before.saved.protected['nineflow-practice-config-v1']);
      expect(missing.saved.protected['nineflow-game-order-v2']).toBe(before.saved.protected['nineflow-game-order-v2']);
      await history.getByRole('button', { name: '필터 초기화', exact: true }).press('Enter');
      const reset = await captureHistoryDate(page, testInfo, 'peer-pruned-filter-reset', errors);
      expect(reset.filters.map(filter => filter.value)).toEqual(['all', 'all', '']);
      expect(reset.filters[2].options).toEqual([{ value: '', text: '모든 날짜' }, ...oracle.dates.slice(0, 2).map(value => ({ value, text: value }))]);
      expect(reset.status).toBe('저장된 100개 중 100개 일치 · 8개 표시');
      expect(reset.rows).toHaveLength(8);
      expect(reset.saved.protected).toEqual(missing.saved.protected);
      await peer.reload();
      await expect(peer.locator('.header-status b')).toHaveText('100');
      await peer.locator('.records-data-button').press('Enter');
      const data = peer.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
      await data.getByRole('button', { name: '전체 기록 삭제', exact: true }).press('Enter');
      await expect(data).toContainText('100개 기록을 삭제할까요?');
      await expect(data.getByRole('button', { name: '취소', exact: true })).toBeFocused();
      await data.getByRole('button', { name: '삭제 확정', exact: true }).press('Enter');
      await expect(data).toContainText('모두 삭제했습니다');
      await captureHistoryDate(page, testInfo, 'peer-ui-clear-requested', errors, { peerErrors: [...peerErrors] });
      await expect(page.locator('.header-status b')).toHaveText('0');
      const deleted = await captureHistoryDate(page, testInfo, 'peer-ui-clear-settled', errors, { peerErrors: [...peerErrors] });
      expect(deleted.date).toBeNull();
      expect(deleted.rows).toEqual([]);
      expect(deleted.unfiltered.activityDates.map(day => day.count)).toEqual(Array(7).fill('0회'));
      expect(deleted.unfiltered.activity).toContain('완료 세션 0회 · 기록이 있는 날 0일 / 7일 · 내 목표 3일 · 3일 더 활동하면 달성');
      expect(deleted.saved.goal).toBe('3');
      expect(deleted.saved.protected['nineflow-practice-config-v1']).toBe(before.saved.protected['nineflow-practice-config-v1']);
      expect(deleted.saved.protected['nineflow-game-order-v2']).toBe(before.saved.protected['nineflow-game-order-v2']);
      const generation = deleted.saved.protected['nineflow-practice-results-generation-v1'];
      expect(JSON.parse(deleted.saved.protected[`nineflow-practice-results-v4:${generation}`]!)).toEqual({ version: 4, generation, results: [] });
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      expect(peerErrors).toEqual([]);
      await peer.close();
    });
  });
}
