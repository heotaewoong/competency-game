'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { GameThumbnail } from './components/game-thumbnail';
import { games, type GameId, type SessionResult } from './lib/game-data';
import { REVIEW_SCHEMA_VERSION, aggregateReviewErrors, hasReviewData, sanitizeReviewPayload } from './lib/review-data';
import { getStorageSafely, mergeSessionResults, persistSessionResults, type PersistSessionResultsResult } from './lib/result-storage';
import {
  LEGACY_RESULTS_STORAGE_KEY,
  LEGACY_V3_RESULTS_STORAGE_KEY,
  RESULTS_GENERATION_KEY,
  RESULTS_STORAGE_PREFIX,
  createResultsGeneration,
  isResultsGeneration,
  parseLegacyV3ResultsEnvelope,
  parseResultsEnvelope,
  resultsStorageKey,
  serializeResultsEnvelope,
} from './lib/result-envelope';
import { getResultComparisonKey, getResultMode, type ResultMode } from './lib/result-comparison';
import { formatResultScore, resultErrorLabel, resultScoreLabel } from './lib/result-display';
import { isReviewPayloadStructurallyValid } from './lib/practice-backup';
import { resolveReadinessOverall } from './lib/readiness';
import { chooseTrainingRecommendation, type RecommendationReason } from './lib/training-recommendation';
import { AccessibilityBootstrap, ReadinessCenter, READINESS_STORAGE_KEY, captureCurrentReadinessAssessment, parseSavedReadinessSummary, type SavedReadinessSummary } from './components/readiness-center';
import type { DataManagementActionResult } from './components/data-management-dialog';

function StageLoading() {
  return <div className="stage-backdrop"><div className="stage-loading" role="status" aria-live="polite"><i aria-hidden="true" /><b>게임을 준비하고 있습니다.</b></div></div>;
}

const loadGameStage = () => import('./components/game-stage');
const preloadGameStage = () => {
  if (typeof window !== 'undefined') void loadGameStage().catch(() => undefined);
};
const loadDataManagementDialog = () => import('./components/data-management-dialog');
const preloadDataManagementDialog = () => {
  if (typeof window !== 'undefined') void loadDataManagementDialog().catch(() => undefined);
};

const GameStage = dynamic(() => loadGameStage().then((module) => module.GameStage), {
  ssr: false,
  loading: StageLoading,
});
const StrategyGuideDialog = dynamic(() => import('./components/strategy-guide-dialog').then((module) => module.StrategyGuideDialog), { ssr: false });
const ReviewDialog = dynamic(() => import('./components/review-dialog').then((module) => module.ReviewDialog), { ssr: false });
const FeedbackDialog = dynamic(() => import('./components/feedback-dialog').then((module) => module.FeedbackDialog), { ssr: false });
const DataManagementDialog = dynamic(() => loadDataManagementDialog().then((module) => module.DataManagementDialog), { ssr: false });

const FUTURE_REVIEW_BACKUP_KEY = 'nineflow-practice-results-future-backup';
const CORRUPT_RESULTS_BACKUP_KEY = 'nineflow-practice-results-corrupt-backup';
const ORDER_STORAGE_KEY = 'nineflow-game-order-v2';
const DIFFICULTY_SOURCE_URL = 'https://recruit.jobda.im/hubfs/TREND%20REPORT_HR%20%EA%B3%A0%EB%AF%BC%EC%9E%88%EC%8A%B5%EB%8B%88%EB%8B%A4_2%ED%8E%B8.pdf';
const DIFFICULTY_REVIEW_URLS = [
  { label: '상세 후기 1', href: 'https://thswldud.tistory.com/19' },
  { label: '상세 후기 2', href: 'https://ystory.tistory.com/entry/%EC%8B%A0%EC%97%AD%EA%B2%80AI%EC%97%AD%EB%9F%89%EA%B2%80%EC%82%AC-%ED%9B%84%EA%B8%B0-%EB%B0%8F-%EB%85%B8%ED%95%98%EC%9A%B0TIP' },
  { label: '다회 응시 후기', href: 'https://ityunseo.tistory.com/77' },
] as const;
const gameIds = new Set(games.map((game) => game.id));
type GameOrder = 'published' | 'perceived';
const perceivedDifficultyOrder: GameId[] = ['nback', 'potion', 'mouse', 'appointment', 'path', 'rotation', 'count', 'rps', 'number'];
const perceivedDifficultyRank = new Map(perceivedDifficultyOrder.map((gameId, index) => [gameId, index + 1]));
const resultModeLabels: Record<ResultMode, string> = {
  practice: '연습 모드',
  simulation: '실전형 연습',
  unknown: '모드 미상',
};
const recommendationButtonLabels: Record<RecommendationReason, string> = {
  'first-session': '첫 연습 추천',
  unpracticed: '아직 안 해본 게임',
  'recurring-error': '반복 오류 다시 보기',
  'least-recent': '오래 쉰 게임 점검',
};
function revalidateReadinessSummary(saved: SavedReadinessSummary) {
  const currentOverall = captureCurrentReadinessAssessment().overall;
  return { ...saved, overall: resolveReadinessOverall(currentOverall, saved.assetStatus) };
}

function isSessionResult(value: unknown): value is SessionResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SessionResult>;
  const validGameId = typeof item.gameId === 'string' && gameIds.has(item.gameId as GameId);
  const numericValues = [item.accuracy, item.medianRt, item.stability, item.errors];
  const detailIsSafe = item.detail === undefined || (
    Boolean(item.detail)
    && typeof item.detail === 'object'
    && !Array.isArray(item.detail)
    && Object.values(item.detail).every((detailValue) => typeof detailValue === 'string'
      || (typeof detailValue === 'number' && Number.isFinite(detailValue)))
  );
  const review = item.review === undefined ? undefined : sanitizeReviewPayload(item.review);
  const reviewIsSafe = item.review === undefined || Boolean(
    validGameId
    && isReviewPayloadStructurallyValid(item.review, item.gameId as GameId)
    && review
    && review.gameId === item.gameId,
  );
  return typeof item.id === 'string' && item.id.trim().length > 0
    && validGameId
    && typeof item.completedAt === 'string' && Number.isFinite(Date.parse(item.completedAt))
    && numericValues.every((number) => typeof number === 'number' && Number.isFinite(number))
    && detailIsSafe && reviewIsSafe;
}

function hasFutureReviewVersion(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const version = (value as { version?: unknown }).version;
  return typeof version === 'number' && version > REVIEW_SCHEMA_VERSION;
}

function containsFutureReview(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((item) => item && typeof item === 'object' && hasFutureReviewVersion((item as { review?: unknown }).review));
  }
  return hasFutureReviewVersion(value)
    || Boolean(value && typeof value === 'object' && hasFutureReviewVersion((value as { review?: unknown }).review));
}

function normalizeSessionResults(value: unknown) {
  if (!Array.isArray(value)) return [];
  const normalized = value.filter(isSessionResult).map((result) => {
    const review = sanitizeReviewPayload(result.review);
    const matchedReview = review?.gameId === result.gameId ? review : undefined;
    const resultWithoutReview = { ...result };
    delete resultWithoutReview.review;
    return {
      ...resultWithoutReview,
      accuracy: Math.min(100, Math.max(0, Math.round(result.accuracy))),
      stability: Math.min(100, Math.max(0, Math.round(result.stability))),
      medianRt: Math.max(0, Math.round(result.medianRt)),
      errors: Math.max(0, Math.round(result.errors)),
      ...(matchedReview ? { review: matchedReview } : {}),
    };
  });
  return mergeSessionResults(normalized);
}

function normalizeStoredSessionResults(value: unknown): SessionResult[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = normalizeSessionResults(value);
  return normalized.length === value.length ? normalized : null;
}

function getOrCreateResultsGeneration(storage: Storage) {
  const existing = storage.getItem(RESULTS_GENERATION_KEY);
  if (isResultsGeneration(existing)) return { generation: existing, recoveredOrphan: false };
  const recoverableEnvelopes: Array<{ generation: string; results: unknown[] }> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(RESULTS_STORAGE_PREFIX)) continue;
    const generation = key.slice(RESULTS_STORAGE_PREFIX.length);
    if (!isResultsGeneration(generation)) continue;
    const parsed = parseResultsEnvelope(storage.getItem(key), generation);
    if (parsed.ok) recoverableEnvelopes.push({ generation, results: parsed.envelope.results });
  }
  if (recoverableEnvelopes.length > 0) {
    recoverableEnvelopes.sort((left, right) => left.generation.localeCompare(right.generation));
    let recoveredGeneration = recoverableEnvelopes[0].generation;
    if (recoverableEnvelopes.length > 1) {
      const combinedGeneration = createResultsGeneration();
      const combinedResults = recoverableEnvelopes.flatMap((item) => item.results);
      // A normal stale generation can contain the same session ID as the
      // current orphan. Only fully valid current-schema items are safe to
      // normalize and deduplicate; unknown/future items remain byte-preserved.
      const recoveryResults = combinedResults.every(isSessionResult)
        ? normalizeSessionResults(combinedResults)
        : combinedResults;
      try {
        storage.setItem(
          resultsStorageKey(combinedGeneration),
          serializeResultsEnvelope(combinedGeneration, recoveryResults),
        );
        recoveredGeneration = combinedGeneration;
      } catch {
        // If quota prevents a combined recovery copy, keep every orphan in place
        // and surface the largest readable snapshot instead of erasing any key.
        recoveredGeneration = [...recoverableEnvelopes]
          .sort((left, right) => right.results.length - left.results.length || left.generation.localeCompare(right.generation))[0]
          .generation;
      }
    }
    storage.setItem(RESULTS_GENERATION_KEY, recoveredGeneration);
    const confirmed = storage.getItem(RESULTS_GENERATION_KEY);
    return {
      generation: isResultsGeneration(confirmed) ? confirmed : recoveredGeneration,
      recoveredOrphan: true,
    };
  }
  // Every tab must choose the same first generation. A random first value can
  // make two simultaneous first visits invalidate each other's migration. If
  // a fixed-key v3 envelope survived without its tombstone, adopt its own
  // generation; otherwise use one deterministic bootstrap generation.
  const legacyEnvelope = parseLegacyV3ResultsEnvelope(storage.getItem(LEGACY_V3_RESULTS_STORAGE_KEY));
  const bootstrapGeneration = legacyEnvelope.ok ? legacyEnvelope.envelope.generation : 'bootstrap-v4';
  storage.setItem(RESULTS_GENERATION_KEY, bootstrapGeneration);
  const confirmed = storage.getItem(RESULTS_GENERATION_KEY);
  return {
    generation: isResultsGeneration(confirmed) ? confirmed : bootstrapGeneration,
    recoveredOrphan: false,
  };
}

function persistResultsEnvelope(storage: Storage, generation: string, results: readonly SessionResult[]) {
  const storageKey = resultsStorageKey(generation);
  return persistSessionResults({
    setItem: (_key, serializedResults) => {
      const parsed: unknown = JSON.parse(serializedResults);
      if (!Array.isArray(parsed)) throw new TypeError('저장할 연습 기록이 배열이 아닙니다.');
      storage.setItem(storageKey, serializeResultsEnvelope(generation, parsed));
    },
  }, storageKey, results);
}

function cleanInactiveResultEnvelopes(storage: Storage, activeGeneration: string, preserveUnreadable = false) {
  const activeKey = resultsStorageKey(activeGeneration);
  const staleKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(RESULTS_STORAGE_PREFIX) || key === activeKey) continue;
    if (preserveUnreadable) {
      const generation = key.slice(RESULTS_STORAGE_PREFIX.length);
      const parsed = isResultsGeneration(generation)
        ? parseResultsEnvelope(storage.getItem(key), generation)
        : null;
      // Startup cleanup may retire a valid stale snapshot only. Unreadable,
      // partially corrupt, or future-schema artifacts stay available in the
      // data-management dialog until the user explicitly deletes site data.
      if (!parsed?.ok || !parsed.envelope.results.every(isSessionResult)) continue;
    }
    staleKeys.push(key);
  }
  staleKeys.forEach((key) => storage.removeItem(key));
}

function formatCompletedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(timestamp));
}

function summarizeSessions(sessions: SessionResult[]) {
  const latest = sessions[0];
  const mode = latest ? getResultMode(latest) : null;
  const comparisonKey = latest ? getResultComparisonKey(latest) : null;
  const comparableSessions = comparisonKey ? sessions.filter((result) => getResultComparisonKey(result) === comparisonKey) : [];
  return {
    latest,
    mode,
    comparisonAvailable: comparisonKey !== null,
    comparableSessions,
    best: comparableSessions.length ? Math.max(...comparableSessions.map((result) => result.accuracy)) : 0,
  };
}

function storageMessage(outcome: PersistSessionResultsResult) {
  if (!outcome.stored) return '브라우저 저장 공간을 사용할 수 없습니다. 이번 기록은 현재 화면에는 보이지만 새로고침하면 사라질 수 있습니다.';
  if (outcome.sessionsPruned > 0) return `저장 공간을 확보하기 위해 오래된 세션 ${outcome.sessionsPruned}개를 정리했습니다. 가장 최신 기록은 유지됩니다.`;
  if (outcome.summariesPruned > 0) return '저장 공간을 확보하기 위해 오래된 복습 통계를 정리했습니다. 게임 점수 기록은 유지됩니다.';
  if (outcome.detailPruned > 0) return '저장 공간을 확보하기 위해 오래된 문항별 화면만 정리했습니다. 점수와 오류 통계는 유지됩니다.';
  return '';
}

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [gameOrder, setGameOrder] = useState<GameOrder>('published');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [dataManagementOpen, setDataManagementOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessSummary, setReadinessSummary] = useState<SavedReadinessSummary | null>(null);
  const [guideGameId, setGuideGameId] = useState<GameId | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [reviewErrorCode, setReviewErrorCode] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState('');
  const futureSchemaWriteBlockedRef = useRef(false);
  const resultsRef = useRef<SessionResult[]>([]);
  const resultsGenerationRef = useRef<string | null>(null);

  useEffect(() => { resultsRef.current = results; }, [results]);

  useEffect(() => {
    let restored: SavedReadinessSummary | null = null;
    try {
      const saved = parseSavedReadinessSummary(window.localStorage.getItem(READINESS_STORAGE_KEY));
      restored = saved ? revalidateReadinessSummary(saved) : null;
    } catch { /* 점검 기록이 없어도 준비센터는 새로 실행할 수 있다. */ }
    if (!restored) return;
    const frame = window.requestAnimationFrame(() => {
      // 브라우저 전용 점검 결과는 hydration 이후 복원한다.
      setReadinessSummary(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleReadinessChecked = useCallback((summary: SavedReadinessSummary) => setReadinessSummary(summary), []);

  useEffect(() => {
    let resizeTimer: number | null = null;
    const revalidate = () => {
      try {
        const saved = parseSavedReadinessSummary(window.localStorage.getItem(READINESS_STORAGE_KEY));
        if (saved) {
          const next = revalidateReadinessSummary(saved);
          setReadinessSummary((current) => current
            && current.overall === next.overall
            && current.checkedAt === next.checkedAt
            && current.assetStatus === next.assetStatus
            ? current
            : next);
        }
      } catch { /* 준비 상태는 다음 점검에서 다시 계산한다. */ }
    };
    const scheduleResizeRevalidation = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        revalidate();
      }, 150);
    };
    window.addEventListener('resize', scheduleResizeRevalidation);
    window.addEventListener('online', revalidate);
    window.addEventListener('offline', revalidate);
    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', scheduleResizeRevalidation);
      window.removeEventListener('online', revalidate);
      window.removeEventListener('offline', revalidate);
    };
  }, []);

  useEffect(() => {
    let restoredOrder: GameOrder | null = null;
    let restoredResults: SessionResult[] | null = null;
    let restoredNotice = '';
    let rawSavedResults: string | null = null;
    let restoredEnvelopeRaw: string | null = null;
    let restoredGeneration: string | null = null;
    let restoredStorageKey: string | null = null;
    let recoveredOrphanGeneration = false;
    try {
      const storage = window.localStorage;
      const generationResolution = getOrCreateResultsGeneration(storage);
      restoredGeneration = generationResolution.generation;
      recoveredOrphanGeneration = generationResolution.recoveredOrphan;
      resultsGenerationRef.current = restoredGeneration;
      restoredStorageKey = resultsStorageKey(restoredGeneration);
      const savedOrder = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (savedOrder === 'published' || savedOrder === 'perceived') {
        restoredOrder = savedOrder;
      }
      restoredEnvelopeRaw = storage.getItem(restoredStorageKey);
      const parsedEnvelope = parseResultsEnvelope(restoredEnvelopeRaw, restoredGeneration);
      const legacyV3Raw = restoredEnvelopeRaw ? null : storage.getItem(LEGACY_V3_RESULTS_STORAGE_KEY);
      const parsedLegacyV3 = parseLegacyV3ResultsEnvelope(legacyV3Raw);
      const legacyV2Raw = restoredEnvelopeRaw || legacyV3Raw || restoredGeneration !== 'bootstrap-v4'
        ? null
        : storage.getItem(LEGACY_RESULTS_STORAGE_KEY);
      rawSavedResults = restoredEnvelopeRaw ?? legacyV3Raw ?? legacyV2Raw;
      let parsed: unknown;
      let canPersist = true;
      let migratedLegacyKey: string | null = null;
      if (restoredEnvelopeRaw) {
        if (!parsedEnvelope.ok) {
          parsed = [];
          canPersist = false;
          restoredNotice = parsedEnvelope.reason === 'generation-mismatch'
            ? '다른 탭의 삭제와 지연된 저장이 겹쳐 세대가 다른 기록을 무시했습니다.'
            : '저장된 v4 연습 기록을 읽지 못해 원본을 덮어쓰지 않았습니다.';
        } else {
          parsed = parsedEnvelope.envelope.results;
        }
      } else if (legacyV3Raw) {
        if (parsedLegacyV3.ok && parsedLegacyV3.envelope.generation === restoredGeneration) {
          parsed = parsedLegacyV3.envelope.results;
          migratedLegacyKey = LEGACY_V3_RESULTS_STORAGE_KEY;
        } else if (parsedLegacyV3.ok) {
          // A v3 envelope from a generation older than the tombstone is a
          // delayed pre-delete write, not recoverable current data.
          parsed = [];
          migratedLegacyKey = LEGACY_V3_RESULTS_STORAGE_KEY;
        } else {
          parsed = [];
          canPersist = false;
          restoredNotice = '이전 v3 연습 기록을 읽지 못해 원본을 덮어쓰지 않았습니다.';
        }
      } else if (legacyV2Raw) {
        parsed = JSON.parse(legacyV2Raw);
        migratedLegacyKey = LEGACY_RESULTS_STORAGE_KEY;
      } else {
        parsed = [];
      }
      const hasFutureReview = containsFutureReview(parsed);
      let futureDataBackedUp = false;
      if (hasFutureReview && rawSavedResults) {
        try {
          window.localStorage.setItem(FUTURE_REVIEW_BACKUP_KEY, rawSavedResults);
          futureDataBackedUp = true;
        } catch { /* 저장 공간이 잠겨 있으면 아래 쓰기 차단으로 원본을 보호한다. */ }
        // A newer app must continue to find its original primary payload. The backup is
        // additional recovery protection, not permission for this older app to downgrade it.
        futureSchemaWriteBlockedRef.current = true;
      }
      if (Array.isArray(parsed)) {
        const sanitized = normalizeSessionResults(parsed);
        const containsInvalidItems = sanitized.length !== parsed.length;
        // 외부 저장 데이터는 정리·용량 제한을 적용한 뒤 화면 상태와 다시 맞춘다.
        if (hasFutureReview) {
          // 현재 앱이 이해하지 못하는 상세를 별도 키에 먼저 보존한다. 백업조차 쓸 수 없으면
          // 이 탭에서는 새 점수만 보여 주고 기존 저장값을 건드리지 않는다.
          restoredResults = sanitized;
          restoredNotice = futureDataBackedUp
            ? '현재 앱보다 새 형식의 복습 기록을 감지해 원본을 별도 백업했습니다. 원본 보호를 위해 이 탭의 새 결과 저장은 중지됩니다.'
            : '현재 앱보다 새 형식의 복습 기록이 있어 원본 보호를 위해 이 탭의 새 결과 저장을 중지했습니다.';
        } else if (containsInvalidItems || !canPersist) {
          if (rawSavedResults) {
            try { window.localStorage.setItem(CORRUPT_RESULTS_BACKUP_KEY, rawSavedResults); } catch { /* 원본 키는 덮어쓰지 않는다. */ }
          }
          restoredResults = sanitized;
          if (!restoredNotice) restoredNotice = '손상된 연습 기록을 감지해 원본을 덮어쓰지 않았습니다. 정상 항목만 화면에 표시하며, 백업만 가져오기 전에 사이트 저장소를 확인해 주세요.';
        } else {
          const outcome = persistResultsEnvelope(storage, restoredGeneration, sanitized);
          restoredResults = outcome.stored ? outcome.storedResults : sanitized;
          restoredNotice = storageMessage(outcome);
          if (outcome.stored) {
            restoredEnvelopeRaw = storage.getItem(restoredStorageKey);
            const generationStillCurrent = storage.getItem(RESULTS_GENERATION_KEY) === restoredGeneration;
            if (generationStillCurrent && migratedLegacyKey) storage.removeItem(migratedLegacyKey);
            if (generationStillCurrent && !recoveredOrphanGeneration) {
              cleanInactiveResultEnvelopes(storage, restoredGeneration, true);
              // Once a valid v4 generation is active, old fixed-key formats
              // are no longer authoritative and can be safely retired.
              storage.removeItem(LEGACY_V3_RESULTS_STORAGE_KEY);
              storage.removeItem(LEGACY_RESULTS_STORAGE_KEY);
            }
            if (generationStillCurrent && recoveredOrphanGeneration && !restoredNotice) {
              restoredNotice = '저장 위치 정보를 복구해 남아 있던 연습 기록을 다시 연결했습니다. 원본 세대는 안전을 위해 그대로 보존했습니다.';
            }
          }
        }
      } else if (hasFutureReview) {
        restoredResults = [];
        restoredNotice = futureDataBackedUp
          ? '새 형식의 저장 구조 원본을 별도 백업했습니다. 원본 보호를 위해 이 탭의 새 결과 저장은 중지됩니다.'
          : '새 형식의 저장 구조가 있어 원본 보호를 위해 이 탭의 새 결과 저장을 중지했습니다.';
      }
    } catch {
      if (rawSavedResults) {
        try { window.localStorage.setItem(CORRUPT_RESULTS_BACKUP_KEY, rawSavedResults); } catch { /* 원본 키는 그대로 유지한다. */ }
        restoredNotice = '저장된 연습 기록을 읽지 못해 원본을 덮어쓰지 않았습니다. 사이트 저장소를 확인해 주세요.';
      }
    }
    const restoreFrame = window.requestAnimationFrame(() => {
      if (restoredOrder) setGameOrder(restoredOrder);
      try {
        if (restoredGeneration !== window.localStorage.getItem(RESULTS_GENERATION_KEY)) return;
        if (!restoredStorageKey || restoredEnvelopeRaw !== window.localStorage.getItem(restoredStorageKey)) return;
      } catch { return; }
      if (restoredResults) {
        const merged = mergeSessionResults(resultsRef.current, restoredResults);
        resultsRef.current = merged;
        setResults(merged);
      }
      if (restoredNotice) setStorageNotice(restoredNotice);
    });
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  useEffect(() => {
    const syncResultsFromAnotherTab = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === RESULTS_GENERATION_KEY) {
        try {
          // Storage events can arrive after a newer pointer event. Only the
          // value that is still authoritative may reset this tab's view.
          if (event.newValue !== window.localStorage.getItem(RESULTS_GENERATION_KEY)) return;
        } catch { return; }
        resultsGenerationRef.current = isResultsGeneration(event.newValue) ? event.newValue : null;
        futureSchemaWriteBlockedRef.current = false;
        resultsRef.current = [];
        setResults([]);
        setStorageNotice('다른 탭에서 연습 기록 세대가 바뀌어 이전 화면 기록을 비웠습니다.');
        return;
      }
      if (!event.key?.startsWith(RESULTS_STORAGE_PREFIX)) return;
      try {
        const currentGeneration = window.localStorage.getItem(RESULTS_GENERATION_KEY);
        if (!isResultsGeneration(currentGeneration)) return;
        const activeStorageKey = resultsStorageKey(currentGeneration);
        if (event.key !== activeStorageKey) {
          // A stale tab may finish an old write after deletion. Its generation
          // has a different key, so removing it cannot erase current records.
          window.setTimeout(() => {
            try {
              const latestGeneration = window.localStorage.getItem(RESULTS_GENERATION_KEY);
              if (isResultsGeneration(latestGeneration) && event.key !== resultsStorageKey(latestGeneration)) {
                window.localStorage.removeItem(event.key!);
              }
            } catch { /* 다음 로드의 비활성 세대 청소가 다시 처리한다. */ }
          }, 100);
          return;
        }
        const currentRaw = window.localStorage.getItem(activeStorageKey);
        if (event.newValue !== currentRaw) return;
        const generationChanged = currentGeneration !== resultsGenerationRef.current;
        const parsedEnvelope = parseResultsEnvelope(event.newValue, currentGeneration);
        if (!parsedEnvelope.ok) {
          setStorageNotice(parsedEnvelope.reason === 'generation-mismatch'
            ? '삭제 세대와 다른 지연 저장을 무시했습니다.'
            : '다른 탭의 v4 저장 기록을 읽지 못했습니다. 현재 화면 기록은 백업할 수 있도록 유지했습니다.');
          return;
        }
        const parsed = parsedEnvelope.envelope.results;
        if (containsFutureReview(parsed)) {
          futureSchemaWriteBlockedRef.current = true;
          setStorageNotice('다른 탭에서 더 새 형식의 기록을 저장해 원본 보호를 위해 이 탭의 저장을 중지했습니다.');
          return;
        }
        futureSchemaWriteBlockedRef.current = false;
        const remoteResults = normalizeStoredSessionResults(parsed);
        if (!remoteResults) {
          setStorageNotice('다른 탭의 저장 기록이 손상되어 현재 화면과 합치지 않았습니다.');
          return;
        }
        const merged = mergeSessionResults(generationChanged ? [] : resultsRef.current, remoteResults);
        resultsGenerationRef.current = currentGeneration;
        resultsRef.current = merged;
        setResults(merged);
        const remoteIds = remoteResults.map((result) => result.id).join('\u0000');
        const mergedIds = merged.map((result) => result.id).join('\u0000');
        if (mergedIds !== remoteIds) {
          // localStorage writes are not transactional. Rewriting the deterministic union
          // makes simultaneous completions in two tabs converge instead of losing one.
          const outcome = persistResultsEnvelope(window.localStorage, currentGeneration, merged);
          const generationAfterWrite = window.localStorage.getItem(RESULTS_GENERATION_KEY);
          if (generationAfterWrite !== currentGeneration) {
            resultsGenerationRef.current = generationAfterWrite;
            resultsRef.current = [];
            setResults([]);
            try { window.localStorage.removeItem(resultsStorageKey(currentGeneration)); } catch { /* 비활성 세대라 현재 기록에는 영향이 없다. */ }
            setStorageNotice('다른 탭의 전체 삭제를 우선해 지연된 저장 화면을 무시했습니다.');
            return;
          }
          if (outcome.stored) {
            resultsRef.current = outcome.storedResults;
            setResults(outcome.storedResults);
          } else {
            setStorageNotice('다른 탭의 기록과 현재 탭 기록은 화면에서 합쳤지만 브라우저 저장에는 실패했습니다. 새로고침하면 일부 기록이 사라질 수 있습니다.');
          }
        }
      } catch {
        setStorageNotice('다른 탭의 기록을 읽지 못해 현재 화면의 기록을 유지합니다.');
      }
    };
    window.addEventListener('storage', syncResultsFromAnotherTab);
    return () => window.removeEventListener('storage', syncResultsFromAnotherTab);
  }, []);

  function saveResult(result: SessionResult) {
    const keepInMemory = (message: string) => {
      const inMemoryNext = mergeSessionResults([result], resultsRef.current);
      resultsRef.current = inMemoryNext;
      setResults(inMemoryNext);
      setStorageNotice(message);
      return message;
    };
    const storage = getStorageSafely(() => window.localStorage);
    if (!storage) {
      const message = '브라우저 저장소에 접근할 수 없어 이번 결과는 현재 화면에만 표시합니다. 새로고침하면 사라질 수 있습니다.';
      return keepInMemory(message);
    }

    let generationBefore: string;
    let storedSnapshot: SessionResult[] = [];
    try {
      generationBefore = getOrCreateResultsGeneration(storage).generation;
      if (generationBefore !== resultsGenerationRef.current) {
        resultsGenerationRef.current = generationBefore;
        futureSchemaWriteBlockedRef.current = false;
        resultsRef.current = [];
      }
      if (futureSchemaWriteBlockedRef.current) {
        const message = '새 형식의 기존 복습 기록을 보호하기 위해 이번 결과는 현재 화면에만 표시합니다. 새로고침하면 사라질 수 있습니다.';
        return keepInMemory(message);
      }
      const saved = storage.getItem(resultsStorageKey(generationBefore));
      const parsedEnvelope = parseResultsEnvelope(saved, generationBefore);
      if (!parsedEnvelope.ok && parsedEnvelope.reason !== 'missing') {
        const message = '기존 v4 브라우저 기록이 손상되어 원본 보호를 위해 이번 결과를 저장하지 않았습니다.';
        return keepInMemory(message);
      }
      const parsed: unknown = parsedEnvelope.ok ? parsedEnvelope.envelope.results : [];
      if (containsFutureReview(parsed)) {
        futureSchemaWriteBlockedRef.current = true;
        const message = '다른 탭에서 더 새 형식의 기록을 저장해 원본 보호를 위해 이번 결과는 현재 화면에만 표시합니다.';
        return keepInMemory(message);
      }
      const normalizedStored = normalizeStoredSessionResults(parsed);
      if (!normalizedStored) {
        const message = '기존 브라우저 기록에 손상된 항목이 있어 원본 보호를 위해 이번 결과를 저장하지 않았습니다.';
        return keepInMemory(message);
      }
      storedSnapshot = normalizedStored;
    } catch {
      const message = '기존 브라우저 기록을 읽지 못해 원본 보호를 위해 이번 결과를 화면에만 표시합니다.';
      return keepInMemory(message);
    }

    const next = mergeSessionResults([result], resultsRef.current, storedSnapshot);
    const outcome = persistResultsEnvelope(storage, generationBefore, next);
    try {
      const generationAfter = storage.getItem(RESULTS_GENERATION_KEY);
      if (generationAfter !== generationBefore) {
        resultsGenerationRef.current = generationAfter;
        futureSchemaWriteBlockedRef.current = false;
        resultsRef.current = [];
        setResults([]);
        try { storage.removeItem(resultsStorageKey(generationBefore)); } catch { /* 현재 세대와 분리된 키만 정리한다. */ }
        const message = '다른 탭에서 실행된 전체 삭제를 우선해 이번 저장을 적용하지 않았습니다.';
        setStorageNotice(message);
        return message;
      }
    } catch { /* 저장 결과는 아래 outcome으로 안전하게 처리한다. */ }
    resultsRef.current = outcome.stored ? outcome.storedResults : next;
    setResults(resultsRef.current);
    const message = storageMessage(outcome);
    setStorageNotice(message);
    return message;
  }

  function openReview(sessionId = '', errorCode?: string) {
    setReviewErrorCode(errorCode ?? null);
    setReviewSessionId(sessionId);
  }

  function closeReview() {
    setReviewSessionId(null);
    setReviewErrorCode(null);
  }

  const closeActiveGame = useCallback(() => setActiveGame(null), []);
  const openGame = useCallback((gameId: GameId) => {
    preloadGameStage();
    setActiveGame(gameId);
  }, []);
  const switchActiveGame = useCallback((gameId: GameId) => setActiveGame(gameId), []);

  const recentResults = results.slice(0, 8);
  const reviewableResults = results.filter((result) => hasReviewData(result.review));
  const scoredReviewResults = reviewableResults.filter((result) => (result.review?.summary.attemptedCount ?? 0) > 0);
  const recurringErrors = aggregateReviewErrors(scoredReviewResults);
  const practicedGames = games.map((game) => {
    const sessions = results.filter((result) => result.gameId === game.id);
    const summary = summarizeSessions(sessions);
    return {
      game,
      sessions,
      ...summary,
    };
  }).filter((item) => item.sessions.length > 0);
  const lastResult = results[0];
  const lastResultMode = lastResult ? getResultMode(lastResult) : null;
  const lastResultModeLabel = lastResultMode ? resultModeLabels[lastResultMode] : '';
  const recommendation = chooseTrainingRecommendation(results, recurringErrors, games.map((game) => game.id));
  const featuredGame = games.find((game) => game.id === recommendation.gameId) ?? games[0];
  const featuredResult = results.find((result) => result.gameId === featuredGame.id);
  const featuredResultMode = featuredResult ? getResultMode(featuredResult) : null;
  const featuredResultModeLabel = featuredResultMode ? resultModeLabels[featuredResultMode] : '';
  const featuredComparisonKey = featuredResult ? getResultComparisonKey(featuredResult) : null;
  const featuredComparableResults = featuredComparisonKey
    ? results.filter((result) => result.gameId === featuredGame.id && getResultComparisonKey(result) === featuredComparisonKey)
    : [];
  const recommendationTitle = recommendation.reason === 'recurring-error' && recommendation.error
    ? `${featuredGame.title}, 반복된 ${recommendation.error.label}부터 점검해요.`
    : recommendation.reason === 'unpracticed'
      ? `${featuredGame.title}, 아직 만들지 않은 기록을 채워요.`
      : recommendation.reason === 'least-recent'
        ? `${featuredGame.title}, 가장 오래 쉰 감각을 다시 깨워요.`
        : `${featuredGame.title}로 조작부터 익혀요.`;
  const recommendationCopy = recommendation.reason === 'recurring-error' && recommendation.error
    ? `같은 비교 조건에서 ${recommendation.error.sessionCount}개 세션, ${recommendation.error.count}회 확인된 오류입니다. 한 유형만 짧게 다시 풀어보세요.`
    : recommendation.reason === 'unpracticed'
      ? '아직 완료 기록이 없는 게임입니다. 시간 제한 없는 연습으로 조작과 규칙부터 확인하세요.'
      : recommendation.reason === 'least-recent'
        ? '모든 게임을 경험했습니다. 가장 오래 연습하지 않은 게임을 짧게 다시 점검하세요.'
        : '규칙이 단순해 연습 모드와 실전형의 차이를 익히기 좋습니다.';
  const orderedGames = gameOrder === 'perceived'
    ? [...games].sort((a, b) => (perceivedDifficultyRank.get(a.id) ?? 99) - (perceivedDifficultyRank.get(b.id) ?? 99))
    : games;

  function changeGameOrder(next: GameOrder) {
    setGameOrder(next);
    try { window.localStorage.setItem(ORDER_STORAGE_KEY, next); } catch { /* 저장을 쓸 수 없어도 정렬은 유지한다. */ }
  }

  function importBackupResults(imported: SessionResult[]): DataManagementActionResult {
    if (futureSchemaWriteBlockedRef.current) return { ok: false, message: '더 새 형식의 기존 기록을 보호하는 중이라 가져오기를 중지했습니다. 최신 앱에서 다시 시도해 주세요.' };
    const storage = getStorageSafely(() => window.localStorage);
    if (!storage) return { ok: false, message: '브라우저 저장 공간을 사용할 수 없어 기록을 가져오지 못했습니다.' };

    let generationBefore: string;
    let storedSnapshot: SessionResult[] = [];
    let inMemorySnapshot = resultsRef.current;
    try {
      generationBefore = getOrCreateResultsGeneration(storage).generation;
      if (generationBefore !== resultsGenerationRef.current) {
        resultsGenerationRef.current = generationBefore;
        futureSchemaWriteBlockedRef.current = false;
        inMemorySnapshot = [];
        resultsRef.current = [];
      }
      const saved = storage.getItem(resultsStorageKey(generationBefore));
      const parsedEnvelope = parseResultsEnvelope(saved, generationBefore);
      if (!parsedEnvelope.ok && parsedEnvelope.reason !== 'missing') {
        return { ok: false, message: '현재 v4 브라우저 기록이 손상되어 원본 보호를 위해 가져오기를 중지했습니다.' };
      }
      const parsed: unknown = parsedEnvelope.ok ? parsedEnvelope.envelope.results : [];
      if (containsFutureReview(parsed)) {
        futureSchemaWriteBlockedRef.current = true;
        return { ok: false, message: '더 새 형식의 기존 기록을 감지해 가져오기를 중지했습니다. 최신 앱에서 다시 시도해 주세요.' };
      }
      const normalizedStored = normalizeStoredSessionResults(parsed);
      if (!normalizedStored) {
        return { ok: false, message: '현재 브라우저 기록에 손상된 항목이 섞여 있어 원본 보호를 위해 가져오기를 중지했습니다.' };
      }
      storedSnapshot = normalizedStored;
    } catch {
      return { ok: false, message: '현재 브라우저 기록이 손상되어 안전하게 합칠 수 없습니다. 먼저 사이트 저장소를 확인해 주세요.' };
    }

    const existingIds = new Set([...inMemorySnapshot, ...storedSnapshot].map((result) => result.id));
    const uniqueCandidateIds = new Set([...imported, ...inMemorySnapshot, ...storedSnapshot].map((result) => result.id));
    // Restoring a backup adds missing sessions; it must not replace local ones.
    const next = mergeSessionResults(inMemorySnapshot, storedSnapshot, imported);
    const outcome = persistResultsEnvelope(storage, generationBefore, next);
    if (!outcome.stored) return { ok: false, message: '브라우저 저장 공간이 부족하거나 차단되어 기록을 가져오지 못했습니다.' };
    try {
      const generationAfter = storage.getItem(RESULTS_GENERATION_KEY);
      if (generationAfter !== generationBefore) {
        resultsGenerationRef.current = generationAfter;
        resultsRef.current = [];
        setResults([]);
        try { storage.removeItem(resultsStorageKey(generationBefore)); } catch { /* 비활성 세대 키만 정리한다. */ }
        return { ok: false, message: '가져오는 도중 다른 탭에서 전체 삭제가 실행되어 삭제를 우선했습니다. 파일을 다시 확인한 뒤 가져오세요.' };
      }
    } catch { /* outcome.stored가 실제 저장 성공을 증명한다. */ }
    resultsRef.current = outcome.storedResults;
    setResults(outcome.storedResults);
    setStorageNotice(storageMessage(outcome));
    const retainedImported = outcome.storedResults.filter((result) => imported.some((item) => item.id === result.id)).length;
    const newlyAdded = outcome.storedResults.filter((result) => imported.some((item) => item.id === result.id) && !existingIds.has(result.id)).length;
    const excluded = Math.max(0, uniqueCandidateIds.size - outcome.storedResults.length);
    const capNotice = excluded > 0 ? ` 최신 100개 보관 기준에 따라 오래된 기록 ${excluded}개는 제외됐습니다.` : '';
    return { ok: true, message: `백업 기록 ${retainedImported}개를 확인해 기존 기록과 합쳤습니다. 새로 추가 ${newlyAdded}개, 현재 총 ${outcome.storedResults.length}개입니다.${capNotice}` };
  }

  function clearAllResults(): DataManagementActionResult {
    const storage = getStorageSafely(() => window.localStorage);
    if (!storage) return { ok: false, message: '브라우저 저장 공간에 접근하지 못해 기록을 삭제하지 못했습니다.' };
    const clearGeneration = createResultsGeneration();
    const clearStorageKey = resultsStorageKey(clearGeneration);
    try {
      // Prepare the empty generation before the pointer commit. If preparation
      // fails, the previous active generation remains fully readable.
      storage.setItem(clearStorageKey, serializeResultsEnvelope(clearGeneration, []));
    } catch {
      return { ok: false, message: '브라우저가 저장 공간 변경을 차단해 기록을 삭제하지 못했습니다.' };
    }
    try {
      storage.setItem(RESULTS_GENERATION_KEY, clearGeneration);
      if (storage.getItem(RESULTS_GENERATION_KEY) !== clearGeneration) throw new Error('generation-commit-lost');
    } catch {
      try { storage.removeItem(clearStorageKey); } catch { /* 비활성 준비 키는 다음 로드에서 정리한다. */ }
      return { ok: false, message: '다른 탭의 저장 작업과 겹쳐 기록 삭제를 확정하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    resultsGenerationRef.current = clearGeneration;
    futureSchemaWriteBlockedRef.current = false;
    resultsRef.current = [];
    setResults([]);
    setStorageNotice('');
    let cleanupComplete = true;
    try { cleanInactiveResultEnvelopes(storage, clearGeneration); } catch { cleanupComplete = false; }
    for (const key of [LEGACY_V3_RESULTS_STORAGE_KEY, LEGACY_RESULTS_STORAGE_KEY, FUTURE_REVIEW_BACKUP_KEY, CORRUPT_RESULTS_BACKUP_KEY]) {
      try { storage.removeItem(key); } catch { cleanupComplete = false; }
    }
    return cleanupComplete
      ? { ok: true, message: '이 브라우저의 연습 결과와 문항별 복습 기록을 모두 삭제했습니다.' }
      : { ok: true, message: '현재 연습 기록은 삭제했습니다. 이전 버전의 비활성 저장값 정리가 차단되어 브라우저의 사이트 데이터 삭제도 확인해 주세요.' };
  }

  return (
    <main className={`site-shell${activeGame ? ' is-game-open' : ''}`} id="top">
      <AccessibilityBootstrap />
      <a className="skip-link" href="#games">게임 목록으로 건너뛰기</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NINEFLOW LAB 홈">
          <span className="brand-glyph">N</span>
          <span>NINEFLOW <em>LAB</em></span>
        </a>
        <nav aria-label="주요 메뉴"><button type="button" onClick={() => setReadinessOpen(true)}>준비센터</button><a href="#games">게임</a><button type="button" onClick={() => setGuideGameId(featuredGame.id)}>전략 가이드</button><button type="button" onClick={() => openReview()}>복습</button><a href="#records">내 기록</a><button type="button" onClick={() => setFeedbackOpen(true)}>의견</button></nav>
        <a className="header-status" href="#records" aria-label={`완료한 연습 ${results.length}회, 기록으로 이동`}>
          <span>연습</span><b>{results.length}</b>
        </a>
      </header>
      {storageNotice && !activeGame && <div className="storage-notice" role="status" aria-live="polite"><span>{storageNotice}</span><button type="button" aria-label="저장 안내 닫기" onClick={() => setStorageNotice('')}>×</button></div>}

      <section className="practice-head" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">실전 전, 내 방식으로 충분히 연습</p>
          <h1 id="page-title">게임 규칙부터 실수 복습까지,<br />{' '}내 속도로 준비하세요.</h1>
          <p>연습 모드에서는 도움을 켜고 반복하고, 준비되면 실전형으로 흐름을 점검하세요. 끝난 뒤에는 자주 틀린 이유까지 이어서 볼 수 있습니다.</p>
          <div className="hero-trust" aria-label="연습 도구 핵심 특징">
            <span><i aria-hidden="true">✓</i> 연습·실전 분리</span>
            <span><i aria-hidden="true">✓</i> 문항별 복습</span>
            <span><i aria-hidden="true">✓</i> 9가지 게임</span>
          </div>
          <div className="hero-actions">
            <button type="button" className="hero-primary" onPointerEnter={preloadGameStage} onPointerDown={preloadGameStage} onFocus={preloadGameStage} onClick={() => openGame(featuredGame.id)}>
              <span>{recommendationButtonLabels[recommendation.reason]}</span>
              <b>{featuredGame.title}</b><i aria-hidden="true">→</i>
            </button>
            <button type="button" className="hero-guide" onClick={() => setGuideGameId(featuredGame.id)}>공략 보기</button>
            <a href="#games">모든 게임</a>
          </div>
          <details className="simulator-note">
            <summary>이 연습 도구의 범위</summary>
            <p>공개된 게임 구조와 조작 흐름을 바탕으로 만든 독립형 시뮬레이터입니다. 공식 문항·화면·채점을 복제하거나 합격 가능성을 예측하지 않습니다.</p>
            <p>2023 개발사 영상, 2024 공개 기업자료, 2026 과제 설명 화면의 게임별 시간·라운드가 서로 다른 경우가 있습니다. 기업 초대 검사 유형에 따라 게임이 포함되지 않을 수도 있으며, 현행 문항 수·시간·채점식은 비공개이므로 실제 초대 화면의 안내를 가장 먼저 따르세요.</p>
          </details>
        </div>
        <aside className={`hero-rail tone-${featuredGame.tone}`} aria-label="모리의 근거 기반 연습 추천">
          <section className="coach-feature" aria-labelledby="coach-title">
            <div className="coach-feature-copy">
              <span>모리의 오늘 추천</span>
              <h2 id="coach-title">{recommendationTitle}</h2>
              <p>{recommendationCopy}</p>
            </div>
            <div className="coach-glow" aria-hidden="true" />
            <Image className="mori-hero" src="/assets/mori-coach-hero-v2-800.webp" alt="" width={800} height={700} sizes="(max-width: 360px) 116px, (max-width: 620px) 148px, (max-width: 760px) 170px, (max-width: 980px) 160px, 260px" priority />
          </section>
          <article className="continue-card" aria-label={`${featuredGame.title} 추천 요약`}>
            <div className="continue-head"><span>{recommendationButtonLabels[recommendation.reason]}</span><em>{featuredGame.no}</em></div>
            <div className="continue-body">
              <div className="continue-visual"><GameThumbnail gameId={featuredGame.id} /></div>
              <div>
                <small>{featuredGame.skill} · 난이도 {featuredGame.difficulty}{featuredResult ? ` · ${featuredResultModeLabel}` : ''}</small>
                <h2>{featuredGame.title}</h2>
                <p>{featuredGame.rule}</p>
              </div>
            </div>
            {featuredResult ? (
              <dl className="continue-stats"><div><dt>최근 {resultScoreLabel(featuredResult)}</dt><dd>{formatResultScore(featuredResult)}</dd></div><div><dt>최근 {resultErrorLabel(featuredResult)}</dt><dd>{featuredResult.errors}</dd></div><div><dt>동일 설정</dt><dd>{featuredComparisonKey ? `${featuredComparableResults.length}회` : '설정 없음'}</dd></div></dl>
            ) : (
              <div className="continue-tip"><b>처음이라면</b><span>설명을 켠 연습 모드로 시작해 조작부터 익혀보세요.</span></div>
            )}
            <button type="button" className="continue-start" onPointerEnter={preloadGameStage} onPointerDown={preloadGameStage} onFocus={preloadGameStage} onClick={() => openGame(featuredGame.id)}>설정하고 시작 <span aria-hidden="true">→</span></button>
          </article>
        </aside>
      </section>

      <section className={`readiness-banner ${readinessSummary ? `is-${readinessSummary.overall}` : 'is-unchecked'}`} aria-labelledby="readiness-banner-title">
        <div className="readiness-banner-mark" aria-hidden="true">{readinessSummary?.overall === 'ready' ? '✓' : readinessSummary?.overall === 'blocked' ? '!' : '◎'}</div>
        <div className="readiness-banner-copy"><span>10초 응시 준비센터</span><h2 id="readiness-banner-title">화면·입력·기록 저장을 시작 전에 확인하세요.</h2><p>핵심 리소스를 미리 불러오고 클릭·키보드를 직접 시험한 뒤, 고대비·큰 글자·움직임 줄이기도 한곳에서 설정할 수 있습니다.</p></div>
        <dl aria-label="준비센터 점검 항목"><div><dt>자동 점검</dt><dd>화면·온라인 신호·저장</dd></div><div><dt>직접 확인</dt><dd>클릭·터치·키보드</dd></div><div><dt>보기 설정</dt><dd>명암·글자·모션</dd></div></dl>
        <div className="readiness-banner-action"><small>{readinessSummary ? `${readinessSummary.overall === 'ready' ? '준비 완료' : readinessSummary.overall === 'review' ? '확인 필요' : '환경 조정 필요'} · ${formatCompletedAt(readinessSummary.checkedAt)}` : '아직 이 브라우저를 점검하지 않았습니다.'}</small><button type="button" onClick={() => setReadinessOpen(true)}>{readinessSummary ? '다시 점검' : '준비 점검 시작'} <span aria-hidden="true">→</span></button></div>
      </section>

      <section className="game-section" id="games" aria-labelledby="games-title">
        <div className="section-heading">
          <div>
            <span>9가지 훈련</span>
            <h2 id="games-title">연습 게임</h2>
          </div>
          <p>카드를 누르면 규칙을 확인하고 연습 모드 또는 실전형 연습을 선택할 수 있습니다.</p>
        </div>

        <div className="game-order-toolbar">
          <span>정렬</span>
          <div className="game-order-actions" role="group" aria-label="게임 표시 순서">
            <button type="button" aria-pressed={gameOrder === 'published'} onClick={() => changeGameOrder('published')}>2024 공개자료 순서</button>
            <button type="button" aria-pressed={gameOrder === 'perceived'} onClick={() => changeGameOrder('perceived')}>후기 체감순</button>
          </div>
          <details className="difficulty-source"><summary>난이도 기준</summary><div className="difficulty-source-panel"><b>2024 공개자료 등급과 체감 순위를 분리했습니다.</b><p>카드의 상·중·하는 2024 JAINWON 공개 기업자료 기준입니다. 현행 기업 초대의 등급이나 공식 1~9위는 공개되지 않았으며, 체감 순서는 여러 공개 후기에 반복된 경향을 합친 연습 우선순위라 개인차가 있습니다.</p><div><a href={DIFFICULTY_SOURCE_URL} target="_blank" rel="noreferrer">2024 공개자료 등급 ↗</a>{DIFFICULTY_REVIEW_URLS.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div></div></details>
          <button type="button" className="guide-library-button" onClick={() => setGuideGameId(orderedGames[0]?.id ?? 'rotation')}>규칙·예시·팁 전체 보기 <span>→</span></button>
          <p className="sr-only" aria-live="polite">{gameOrder === 'perceived' ? '비공식 수험자 후기의 체감 난이도가 높은 순으로 배열했습니다.' : '2024 공개 기업자료에 나온 순서로 배열했습니다.'}</p>
        </div>

        <div className="game-grid">
          {orderedGames.map((game) => {
            const sessions = results.filter((result) => result.gameId === game.id);
            const { latest: last, mode, comparisonAvailable, comparableSessions, best } = summarizeSessions(sessions);
            const modeLabel = mode ? resultModeLabels[mode] : '';
            const summaryId = `${game.id}-summary`;
            return (
              <article className={`game-card tone-${game.tone}`} key={game.id}>
                <div className="game-card-content">
                  <div className="card-top">
                    <span>{game.no} · 전략게임</span>
                    <div className="card-badges"><span className="perceived-rank">후기 체감 {perceivedDifficultyRank.get(game.id)}위</span><em className={`difficulty-badge difficulty-${game.difficulty === '상' ? 'high' : game.difficulty === '중' ? 'mid' : 'low'}`}>2024 자료 {game.difficulty}</em></div>
                  </div>
                  <GameThumbnail gameId={game.id} />
                  <div className="card-copy">
                    <span>{game.skill}</span>
                    <h3>{game.title}</h3>
                    <p id={summaryId}>{game.rule}</p>
                  </div>
                  <dl className="card-record" aria-label={last ? (comparisonAvailable ? `${modeLabel} 안에서 비교한 이 게임의 기록` : `${modeLabel}, 비교할 설정 정보가 없는 이전 기록`) : '이 게임의 기록 없음'}>
                    <div><dt>{last ? `${modeLabel} 최근 ${resultScoreLabel(last)}` : '최근'}</dt><dd>{last ? formatResultScore(last) : '—'}</dd></div>
                    <div><dt>{last ? `${modeLabel} 최고` : '최고'}</dt><dd>{last && comparisonAvailable ? `${best}%` : '—'}</dd></div>
                    <div><dt>{last ? '동일 설정 횟수' : '횟수'}</dt><dd>{last && comparisonAvailable ? `${comparableSessions.length}회` : (last ? '설정 없음' : '0회')}</dd></div>
                  </dl>
                  <div className="card-action">
                    <span>{game.time}</span>
                    <b>설정 후 시작 <i aria-hidden="true">→</i></b>
                  </div>
                </div>
                <button className="game-card-hitarea" type="button" onPointerEnter={preloadGameStage} onPointerDown={preloadGameStage} onFocus={preloadGameStage} onClick={() => openGame(game.id)} aria-label={`${game.title}, 난이도 ${game.difficulty}, 설정 열기`} aria-describedby={summaryId}><span className="sr-only">{game.title} 설정 열기</span></button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="records-section" id="records" aria-labelledby="records-title">
        <div className="records-heading"><div><span>나의 훈련 기록</span><h2 id="records-title">내 연습 기록</h2></div><p>최근 기록과 모드·분량·속도·집중·접근성 표시 설정이 같은 세션끼리만 최고 점수를 비교합니다.</p><button type="button" className="records-data-button" onPointerEnter={preloadDataManagementDialog} onPointerDown={preloadDataManagementDialog} onFocus={preloadDataManagementDialog} onClick={() => setDataManagementOpen(true)}>백업·복원</button></div>
        {recentResults.length ? <>
          <section className="home-review-center" aria-labelledby="home-review-title">
            <div className="home-review-heading"><div><span>틀린 이유 복습</span><h3 id="home-review-title">무엇을 반복해서 틀리는지 확인하세요.</h3><p>{scoredReviewResults.length ? `게임별 가장 최근 비교 문맥에서만 반복 횟수와 오류율을 계산합니다.${reviewableResults.length > scoredReviewResults.length ? ` 무응답 구간이 남은 세션 ${reviewableResults.length - scoredReviewResults.length}개도 문항별로 열 수 있습니다.` : scoredReviewResults.length < 5 ? ' 아직 표본이 적어 약점으로 단정하지 않습니다.' : ''}` : reviewableResults.length ? `${reviewableResults.length}개 세션의 무응답 구간이 복습에 남아 있습니다. 제출 전 놓친 문제부터 확인하세요.` : '이전 기록에는 문항별 데이터가 없습니다. 새 연습부터 자동으로 쌓입니다.'}</p></div><button type="button" onClick={() => openReview()}>복습 센터 열기 <span>→</span></button></div>
            {recurringErrors.length > 0 ? <div className="home-review-ranking">{recurringErrors.slice(0, 3).map((summary, index) => { const game = games.find((item) => item.id === summary.gameId)!; return <button type="button" key={`${summary.gameId}-${summary.contextKey}-${summary.errorCode}`} onClick={() => openReview(summary.representativeSessionId, summary.errorCode)}><span>{index + 1}</span><div><small>{game.title} · {summary.contextLabel} · {summary.count}/{summary.attemptedCount}회 · {summary.sessionCount}개 세션</small><b>{summary.label}</b><p>{summary.tip}</p></div><em>{summary.rate}%</em></button>; })}</div> : <div className="home-review-empty"><b>반복 오류가 아직 없습니다.</b><span>게임을 완료하면 오답뿐 아니라 비효율 조작과 확률 판단도 분리해 기록합니다.</span></div>}
          </section>
          <div className="record-summary"><article><span>저장된 최근 연습</span><b>{results.length}회</b></article><article><span>최근 기록 게임</span><b>{practicedGames.length}<small>/ 9종</small></b></article><article><span>{lastResultModeLabel} 마지막 {resultScoreLabel(lastResult)}</span><b>{formatResultScore(lastResult)}</b></article></div>
          <div className="game-record-grid" aria-label="게임별 기록">
            {practicedGames.map(({ game, latest, mode, comparisonAvailable, comparableSessions, best }) => <article key={game.id} className={`tone-${game.tone}`}>
              <div><span>{game.no}</span><div><small>{game.skill}</small><b>{game.title}</b></div></div>
              <dl aria-label={comparisonAvailable ? `${resultModeLabels[mode ?? 'unknown']}의 동일 설정 안에서 비교한 기록` : '비교할 설정 정보가 없는 이전 기록'}><div><dt>{resultModeLabels[mode ?? 'unknown']} 최근 {resultScoreLabel(latest)}</dt><dd>{formatResultScore(latest)}</dd></div><div><dt>동일 설정 최고</dt><dd>{comparisonAvailable ? `${best}%` : '—'}</dd></div><div><dt>동일 설정 횟수</dt><dd>{comparisonAvailable ? `${comparableSessions.length}회` : '설정 없음'}</dd></div></dl>
              <div className="game-record-actions">{hasReviewData(latest.review) ? <button type="button" onClick={() => openReview(latest.id)} aria-label={`${game.title} 최근 세션 복습`}>{latest.review?.attempts.length ? '복습' : '통계'}</button> : <span>복습 기록 없음</span>}<button type="button" onPointerEnter={preloadGameStage} onPointerDown={preloadGameStage} onFocus={preloadGameStage} onClick={() => openGame(game.id)} aria-label={`${game.title} 다시 연습`}>다시 연습 <span aria-hidden="true">→</span></button></div>
            </article>)}
          </div>
          <details className="history-panel">
            <summary>최근 세션 상세 보기 <span>{recentResults.length}개</span></summary>
            <div className="record-list">{recentResults.map((result) => { const game = games.find((item) => item.id === result.gameId)!; const modeLabel = resultModeLabels[getResultMode(result)]; return <article key={result.id}><div><span>{game.no}</span><b>{game.title}</b><small>{formatCompletedAt(result.completedAt)} · {modeLabel}</small></div><dl><div><dt>{resultScoreLabel(result)}</dt><dd>{formatResultScore(result)}</dd></div><div><dt>{result.gameId === 'path' ? '경로 연결 중앙시간' : '중앙 반응'}</dt><dd>{result.medianRt ? `${result.medianRt}ms` : '—'}</dd></div><div><dt>{resultErrorLabel(result)}</dt><dd>{result.errors}</dd></div></dl>{hasReviewData(result.review) ? <button type="button" onClick={() => openReview(result.id)}>{result.review?.attempts.length ? '문항별 복습' : '오류 통계'}</button> : <small className="legacy-review-label">복습 데이터 없음</small>}</article>; })}</div>
          </details>
        </> : <div className="records-empty"><Image className="records-empty-coach" src="/assets/mori-coach-hero-v2-800.webp" alt="" width={800} height={700} sizes="(max-width: 620px) 66px, 86px" /><div><b>첫 기록을 만들어 볼까요?</b><span>게임 하나를 끝내면 최근 점수와 자주 틀린 이유를 여기서 확인할 수 있어요.</span><button type="button" onPointerEnter={preloadGameStage} onPointerDown={preloadGameStage} onFocus={preloadGameStage} onClick={() => openGame(featuredGame.id)}>추천 게임 시작</button></div></div>}
      </section>

      <footer>
        <div><b>NINEFLOW LAB</b><span>내 속도로 익히고, 틀린 이유까지 돌아보는 전략게임 연습 도구</span></div>
        <div className="footer-links">
          <button type="button" onClick={() => setGuideGameId(featuredGame.id)}>9개 게임 전략 가이드</button>
          <button type="button" onClick={() => openReview()}>내 실수 복습</button>
          <button type="button" onClick={() => setReadinessOpen(true)}>응시 준비센터</button>
          <button type="button" onPointerEnter={preloadDataManagementDialog} onPointerDown={preloadDataManagementDialog} onFocus={preloadDataManagementDialog} onClick={() => setDataManagementOpen(true)}>기록 백업·복원</button>
          <button type="button" onClick={() => setFeedbackOpen(true)}>의견 보내기</button>
          <a href="https://www.jobda.im/acc/tutorial" target="_blank" rel="noreferrer">JOBDA 구 역량검사 연습 ↗</a>
          <a href="https://github.com/twitter/twemoji" target="_blank" rel="noreferrer">손동작 이미지: Twemoji · CC BY 4.0</a>
        </div>
      </footer>

      <button type="button" className="feedback-fab" onClick={() => setFeedbackOpen(true)}><span aria-hidden="true">✦</span> 의견 보내기</button>
      <nav className="mobile-dock" aria-label="빠른 메뉴">
        <a href="#games"><span aria-hidden="true">◇</span><b>게임</b></a>
        <button type="button" onClick={() => setReadinessOpen(true)}><span aria-hidden="true">◎</span><b>준비</b></button>
        <button type="button" onClick={() => setGuideGameId(featuredGame.id)}><span aria-hidden="true">?</span><b>가이드</b></button>
        <button type="button" onClick={() => openReview()}><span aria-hidden="true">↺</span><b>복습</b></button>
        <a href="#records"><span aria-hidden="true">▥</span><b>기록</b></a>
      </nav>
      {readinessOpen && <ReadinessCenter onClose={() => setReadinessOpen(false)} onChecked={handleReadinessChecked} />}
      {dataManagementOpen && <DataManagementDialog results={results} onImport={importBackupResults} onClear={clearAllResults} onClose={() => setDataManagementOpen(false)} />}
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
      {guideGameId && <StrategyGuideDialog initialGameId={guideGameId} onClose={() => setGuideGameId(null)} onStartGame={(gameId) => { setGuideGameId(null); openGame(gameId); }} />}
      {reviewSessionId !== null && <ReviewDialog results={results} initialSessionId={reviewSessionId || undefined} initialErrorCode={reviewErrorCode || undefined} onClose={closeReview} onPracticeGame={(gameId) => { closeReview(); openGame(gameId); }} />}
      {activeGame && (
        <GameStage key={activeGame} gameId={activeGame} onClose={closeActiveGame} onSwitch={switchActiveGame} onSave={saveResult} onReadinessChecked={handleReadinessChecked} />
      )}
    </main>
  );
}
