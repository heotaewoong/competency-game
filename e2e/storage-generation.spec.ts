import { expect, test } from '@playwright/test';

const RESULTS_PREFIX = 'nineflow-practice-results-v4:';
const GENERATION_KEY = 'nineflow-practice-results-generation-v1';
const CORRUPT_BACKUP_KEY = 'nineflow-practice-results-corrupt-backup';

const resultsKey = (generation: string) => `${RESULTS_PREFIX}${generation}`;

function result(id: string) {
  return {
    id,
    gameId: 'rps',
    completedAt: '2026-09-10T03:00:00.000Z',
    accuracy: 80,
    medianRt: 720,
    stability: 74,
    errors: 2,
  };
}

test('세대 포인터가 손상돼도 중복을 제거해 v4 세대를 병합 복구하고 원본을 보존한다', async ({ page }) => {
  await page.addInitScript(({ prefix, generationKey, first, second, shared }) => {
    window.localStorage.setItem(generationKey, 'broken pointer value');
    window.localStorage.setItem(`${prefix}orphan-a`, JSON.stringify({
      version: 4,
      generation: 'orphan-a',
      results: [first, shared],
    }));
    window.localStorage.setItem(`${prefix}orphan-b`, JSON.stringify({
      version: 4,
      generation: 'orphan-b',
      results: [second, shared],
    }));
  }, {
    prefix: RESULTS_PREFIX,
    generationKey: GENERATION_KEY,
    first: result('recovered-a'),
    second: result('recovered-b'),
    shared: result('recovered-shared'),
  });

  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('3');
  await expect(page.getByRole('status')).toContainText('저장 위치 정보를 복구');
  await expect.poll(() => page.evaluate(({ prefix, generationKey }) => {
    const generation = window.localStorage.getItem(generationKey);
    const activeRaw = generation ? window.localStorage.getItem(`${prefix}${generation}`) : null;
    const active = activeRaw ? JSON.parse(activeRaw) as { version?: number; generation?: string; results?: Array<{ id?: string }> } : null;
    return {
      pointerIsValid: Boolean(generation && /^[A-Za-z0-9_-]{1,128}$/.test(generation)),
      generationMatches: Boolean(generation && active?.generation === generation),
      ids: active?.results?.map((item) => item.id).sort() ?? [],
      firstOrphanPreserved: Boolean(window.localStorage.getItem(`${prefix}orphan-a`)),
      secondOrphanPreserved: Boolean(window.localStorage.getItem(`${prefix}orphan-b`)),
    };
  }, { prefix: RESULTS_PREFIX, generationKey: GENERATION_KEY })).toEqual({
    pointerIsValid: true,
    generationMatches: true,
    ids: ['recovered-a', 'recovered-b', 'recovered-shared'],
    firstOrphanPreserved: true,
    secondOrphanPreserved: true,
  });
});

test('다른 탭의 삭제 후 늦게 도착한 이전 세대 저장은 기록을 되살리지 않는다', async ({ page, context }) => {
  await page.addInitScript(({ prefix, generationKey, saved }) => {
    if (window.sessionStorage.getItem('stale-write-seed-complete')) return;
    window.sessionStorage.setItem('stale-write-seed-complete', '1');
    window.localStorage.setItem(generationKey, 'generation-old');
    window.localStorage.setItem(`${prefix}generation-old`, JSON.stringify({
      version: 4,
      generation: 'generation-old',
      results: [saved],
    }));
  }, { prefix: RESULTS_PREFIX, generationKey: GENERATION_KEY, saved: result('before-clear') });
  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('1');

  const peer = await context.newPage();
  await peer.goto('/');
  await expect(peer.locator('.header-status')).toContainText('1');

  // 실제 삭제처럼 빈 새 세대를 준비한 뒤 포인터를 커밋한다.
  await peer.evaluate(({ prefix, generationKey }) => {
    window.localStorage.setItem(`${prefix}generation-cleared`, JSON.stringify({
      version: 4,
      generation: 'generation-cleared',
      results: [],
    }));
    window.localStorage.setItem(generationKey, 'generation-cleared');
    window.localStorage.removeItem(`${prefix}generation-old`);
  }, { prefix: RESULTS_PREFIX, generationKey: GENERATION_KEY });
  await expect(page.locator('.header-status')).toContainText('0');

  // 이전 세대를 이미 읽었던 작업이 삭제 완료 뒤 늦게 쓰는 최악 순서다.
  // 세대별 키이므로 current primary를 덮지 못하고 수신 탭이 안전히 청소한다.
  await peer.evaluate(({ prefix, saved }) => {
    window.localStorage.setItem(`${prefix}generation-old`, JSON.stringify({
      version: 4,
      generation: 'generation-old',
      results: [saved],
    }));
  }, { prefix: RESULTS_PREFIX, saved: result('late-old-write') });
  await expect(page.locator('.header-status')).toContainText('0');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), resultsKey('generation-old'))).toBeNull();
  await page.reload();
  await expect(page.locator('.header-status')).toContainText('0');
  await expect.poll(() => page.evaluate(({ activeKey, oldKey, generationKey }) => {
    const envelope = JSON.parse(window.localStorage.getItem(activeKey) ?? '{}') as { generation?: string; results?: unknown[] };
    return {
      generation: window.localStorage.getItem(generationKey),
      envelopeGeneration: envelope.generation,
      resultCount: envelope.results?.length,
      oldGenerationRemoved: window.localStorage.getItem(oldKey) === null,
    };
  }, {
    activeKey: resultsKey('generation-cleared'),
    oldKey: resultsKey('generation-old'),
    generationKey: GENERATION_KEY,
  })).toEqual({
    generation: 'generation-cleared',
    envelopeGeneration: 'generation-cleared',
    resultCount: 0,
    oldGenerationRemoved: true,
  });
  await peer.close();
});

test('지연 포인터와 손상된 active storage 이벤트는 현재 화면을 비우지 않는다', async ({ page }) => {
  await page.addInitScript(({ activeKey, generationKey, saved }) => {
    window.localStorage.setItem(generationKey, 'generation-current');
    window.localStorage.setItem(activeKey, JSON.stringify({
      version: 4,
      generation: 'generation-current',
      results: [saved],
    }));
  }, { activeKey: resultsKey('generation-current'), generationKey: GENERATION_KEY, saved: result('current') });
  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('1');

  await page.evaluate(({ activeKey, stale }) => {
    const staleRaw = JSON.stringify({
      version: 4,
      generation: 'generation-current',
      results: [stale],
    });
    window.dispatchEvent(new StorageEvent('storage', {
      key: activeKey,
      newValue: staleRaw,
      oldValue: null,
      storageArea: window.localStorage,
      url: window.location.href,
    }));
  }, { activeKey: resultsKey('generation-current'), stale: result('stale-event') });

  await expect(page.locator('.header-status')).toContainText('1');
  await expect.poll(() => page.evaluate((activeKey) => {
    const envelope = JSON.parse(window.localStorage.getItem(activeKey) ?? '{}') as { results?: Array<{ id?: string }> };
    return envelope.results?.map((item) => item.id) ?? [];
  }, resultsKey('generation-current'))).toEqual(['current']);

  // 포인터 storage 이벤트가 늦게 도착했더라도 실제 저장소의 현재 포인터와
  // 다르면 이미 더 최신인 화면과 세대를 초기화해서는 안 된다.
  await page.evaluate(({ generationKey }) => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: generationKey,
      newValue: 'generation-stale',
      oldValue: 'generation-current',
      storageArea: window.localStorage,
      url: window.location.href,
    }));
  }, { generationKey: GENERATION_KEY });

  await expect(page.locator('.header-status')).toContainText('1');
  await expect.poll(() => page.evaluate((generationKey) => (
    window.localStorage.getItem(generationKey)
  ), GENERATION_KEY)).toBe('generation-current');

  // 현재 active 키에 실제로 손상값이 기록된 cross-tab 이벤트는 읽지 못해도
  // 이미 렌더링된 정상 메모리 결과를 유지해 사용자가 백업할 수 있어야 한다.
  await page.evaluate(({ activeKey }) => {
    const corruptRaw = '{bad';
    window.localStorage.setItem(activeKey, corruptRaw);
    window.dispatchEvent(new StorageEvent('storage', {
      key: activeKey,
      newValue: corruptRaw,
      oldValue: null,
      storageArea: window.localStorage,
      url: window.location.href,
    }));
  }, { activeKey: resultsKey('generation-current') });

  await expect(page.locator('.header-status')).toContainText('1');
  await expect(page.getByRole('status')).toContainText('현재 화면 기록은 백업할 수 있도록 유지했습니다');
});

test('세대 포인터와 orphan 봉투가 함께 손상돼도 자동 정리하지 않고 관리 경로를 남긴다', async ({ page }) => {
  const corruptKey = resultsKey('orphan-corrupt');
  const corruptRaw = '{unreadable orphan';
  await page.addInitScript(({ generationKey, key, raw }) => {
    window.localStorage.setItem(generationKey, 'broken pointer value');
    window.localStorage.setItem(key, raw);
  }, { generationKey: GENERATION_KEY, key: corruptKey, raw: corruptRaw });

  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('0');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), corruptKey)).toBe(corruptRaw);

  // 정상 bootstrap 세대가 생긴 뒤 다시 로드해도 읽을 수 없는 원본은
  // 사용자의 명시적인 전체 삭제 전까지 그대로 남아야 한다.
  await page.reload();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), corruptKey)).toBe(corruptRaw);
  await page.locator('.records-data-button').click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog.getByRole('button', { name: '저장 데이터 삭제' })).toBeEnabled();
});

test('v4 복습 내부 필드가 손상되면 원본을 보존하고 화면·저장을 정규화하지 않는다', async ({ page }) => {
  const malformed = {
    ...result('malformed-review'),
    review: {
      version: 2,
      gameId: 'rps',
      attempts: [{
        kind: 'generic',
        id: {},
        index: 'bad',
        status: 'error',
        errorCodes: [42],
        title: '손상된 시도',
        prompt: '질문',
        expected: '정답',
        selected: '응답',
        explanation: '설명',
      }],
      summary: {
        attemptedCount: 1,
        correctCount: 0,
        neutralCount: 0,
        reviewPointCount: 1,
        errorCounts: { malformed: 1 },
        omittedDetailCount: 0,
        coverage: 'full',
      },
    },
  };
  const raw = JSON.stringify({ version: 4, generation: 'generation-malformed', results: [malformed] });
  await page.addInitScript(({ activeKey, generationKey, generation, rawValue }) => {
    window.localStorage.setItem(generationKey, generation);
    window.localStorage.setItem(activeKey, rawValue);
  }, {
    activeKey: resultsKey('generation-malformed'),
    generationKey: GENERATION_KEY,
    generation: 'generation-malformed',
    rawValue: raw,
  });
  await page.goto('/');

  await expect(page.locator('.header-status')).toContainText('0');
  await expect(page.getByRole('status')).toContainText('손상된 연습 기록을 감지');
  await expect.poll(() => page.evaluate(({ activeKey, backupKey }) => ({
    primary: window.localStorage.getItem(activeKey),
    backup: window.localStorage.getItem(backupKey),
  }), { activeKey: resultsKey('generation-malformed'), backupKey: CORRUPT_BACKUP_KEY })).toEqual({
    primary: raw,
    backup: raw,
  });

  // 화면에 유효 기록이 0개여도 손상 원본·복구본은 사용자가 직접 지울 수 있어야 한다.
  await page.locator('.records-data-button').click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog.getByRole('button', { name: '저장 데이터 삭제' })).toBeEnabled();
  await dialog.getByRole('button', { name: '저장 데이터 삭제' }).click();
  await dialog.getByRole('button', { name: '삭제 확정' }).click();
  await expect(dialog).toContainText('모두 삭제했습니다');
  await expect.poll(() => page.evaluate(({ prefix, generationKey, oldKey, backupKey }) => {
    const generation = window.localStorage.getItem(generationKey);
    const activeRaw = generation ? window.localStorage.getItem(`${prefix}${generation}`) : null;
    const active = activeRaw ? JSON.parse(activeRaw) as { version?: number; generation?: string; results?: unknown[] } : null;
    return {
      oldPrimary: window.localStorage.getItem(oldKey),
      backup: window.localStorage.getItem(backupKey),
      version: active?.version,
      generationMatches: Boolean(generation && active?.generation === generation),
      resultCount: active?.results?.length,
    };
  }, {
    prefix: RESULTS_PREFIX,
    generationKey: GENERATION_KEY,
    oldKey: resultsKey('generation-malformed'),
    backupKey: CORRUPT_BACKUP_KEY,
  })).toMatchObject({
    oldPrimary: null,
    backup: null,
    version: 4,
    generationMatches: true,
    resultCount: 0,
  });
});

test('새 삭제 세대 준비 쓰기가 실패하면 기존 포인터와 결과를 그대로 유지한다', async ({ page }) => {
  const generation = 'generation-before-failed-clear';
  const activeKey = resultsKey(generation);
  const raw = JSON.stringify({ version: 4, generation, results: [result('preserved-after-failure')] });
  await page.addInitScript(({ generationKey, generationValue, key, rawValue }) => {
    window.localStorage.setItem(generationKey, generationValue);
    window.localStorage.setItem(key, rawValue);
  }, { generationKey: GENERATION_KEY, generationValue: generation, key: activeKey, rawValue: raw });
  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('1');

  await page.evaluate(({ prefix, currentKey }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith(prefix) && key !== currentKey) throw new DOMException('blocked', 'SecurityError');
      return original.call(this, key, value);
    };
  }, { prefix: RESULTS_PREFIX, currentKey: activeKey });

  await page.locator('.records-data-button').click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await dialog.getByRole('button', { name: '전체 기록 삭제' }).click();
  await dialog.getByRole('button', { name: '삭제 확정' }).click();
  await expect(dialog).toContainText('기록을 삭제하지 못했습니다');
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
  await expect(page.locator('.header-status')).toContainText('1');
  await expect.poll(() => page.evaluate(({ generationKey, key }) => ({
    generation: window.localStorage.getItem(generationKey),
    raw: window.localStorage.getItem(key),
  }), { generationKey: GENERATION_KEY, key: activeKey })).toEqual({ generation, raw });
});
