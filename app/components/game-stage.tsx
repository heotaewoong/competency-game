'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { FeedbackDialog } from './feedback-dialog';
import { StrategyGuideDialog } from './strategy-guide-dialog';
import { CognitiveGlyph, glyphDefaultMnemonics, glyphShapeNames } from './cognitive-glyph';
import { PotionFlask, PotionIngredientGlyph } from './potion-visuals';
import { CatMarker, MouseMarker } from './mouse-visuals';
import { NBackIntroDiagram, NBackLagRail, NBackSimulationDiagram } from './nback-visuals';
import { RPS_ASSET_PATHS } from '../lib/essential-assets';
import { RuleCheck } from './rule-check';
import { ReadinessCenter, currentAccessibilityProfile, type SavedReadinessSummary } from './readiness-center';
import { games, getGame, type GameId, type SessionResult } from '../lib/game-data';
import {
  NBACK_GROUP_COUNT,
  NBACK_SIMULATION_N2_PROBLEM_COUNT,
  NBACK_SIMULATION_N23_PROBLEM_COUNT,
  buildNBackSession,
  scoreNBackResponse,
  selectNBackRoundGroups,
  type NBackDecision,
  type NBackTask,
  type NBackTrial,
  type NBackTrialOutcome,
} from '../lib/nback-game';
import {
  IDENTITY_MATRIX,
  ROTATION_LETTERS,
  ROTATION_PHASE_END_MIN_EXPOSURE_MS,
  ROTATION_TRANSFORM_IDS,
  buildRotationPuzzles,
  canonicalRotationLetters,
  canonicalRotationTransformIds,
  matrixForRotationSequence,
  rotationCssMatrix,
  rotationMatrixDescription,
  rotationOperation,
  rotationOperations,
  rotationSequenceFrames,
  rotationShapeMatches,
  shortestRotationCorrection,
  shouldScoreRotationPhaseEnd,
  rotationTransformDefinition,
  rotationTransformDefinitions,
  rotationTransformGroup,
  rotationTransformGroups,
  type RotationContentMode,
  type RotationMatrix,
  type RotationOpId,
  type RotationPuzzle,
  type RotationTransformGroupId,
  type RotationTransformId,
} from '../lib/rotation-game';
import { rotationGuideExamples, rotationGuideTips, type RotationGuideExample } from '../lib/rotation-guide';
import { normalizeGlyphMnemonic, normalizeGlyphMnemonics } from '../lib/glyph-mnemonics';
import { buildRpsTrials, type RpsChoice, type RpsFocus } from '../lib/rps-game';
import { MOUSE_DECISION_OPTIONS, buildMouseTrials, type MouseLoad } from '../lib/mouse-game';
import { COUNT_WORD_PAIRS, buildCountTrials, type CountFocus } from '../lib/count-game';
import {
  APPOINTMENT_FOODS,
  APPOINTMENT_KIND_ORDER,
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_ROUNDS,
  APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND,
  APPOINTMENT_SIMULATION_TOTAL_QUESTIONS,
  APPOINTMENT_WEEKDAYS,
  buildAppointmentTrials,
  type AppointmentKind,
  type AppointmentTrial,
} from '../lib/appointment-game';
import { buildPathPuzzles, createPathSessionScore, finalizePathTrialScore, nextFenceValue, pathPuzzleMeta, simulatePath, type Fence, type PathFocus, type Side, type Vehicle } from '../lib/path-game';
import { buildPotionTrials, evaluatePotionEvidenceDecision, POTION_INGREDIENTS, POTION_RECIPE_COMBOS, recordVisiblePotionOutcome, summarizePotionPerformance, type PotionComboSize } from '../lib/potion-game';
import { buildNumberRounds, classifyNumberInputError, numberExpected, type NumberFocus } from '../lib/number-game';
import {
  compactReviewPayload,
  hasReviewData,
  type GenericReviewAttempt,
  type RotationReviewAttempt,
  type RotationReviewAction,
  type RotationReviewEvent,
} from '../lib/review-data';
import { lockDocumentScroll } from '../lib/scroll-lock';
import { readStoredBooleanField, upsertPracticeConfig, upsertStoredObjectField } from '../lib/practice-config-storage';
import { SIMULATION_PRESET_VERSION } from '../lib/result-comparison';
import {
  activeElapsedTime,
  createActiveElapsed,
  createPausableTimer,
  pauseActiveElapsed,
  pausePausableTimer,
  remainingPausableTime,
  resumeActiveElapsed,
  resumePausableTimer,
  type ActiveElapsedState,
  type PausableTimerState,
} from '../lib/pausable-timer';

type RawResult = Omit<SessionResult, 'id' | 'completedAt'>;
type GameProps = { onFinish: (result: RawResult) => void; onClose: () => void };
const ReviewDialog = dynamic(() => import('./review-dialog').then((module) => module.ReviewDialog), { ssr: false });

function shouldIgnoreGameShortcut(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  // Clicking a choice disables the focused button. Browsers then move focus to body;
  // keep the next timed round keyboard-operable while the game dialog is still active.
  if (target === document.body) return false;
  if (!target.closest('.game-workspace')) return true;
  return Boolean(target.closest('a, input, textarea, select, [contenteditable="true"], [data-game-shortcut-ignore]'));
}

function restoreGameShortcutFocus(target: HTMLElement) {
  window.requestAnimationFrame(() => target.closest<HTMLElement>('.game-workspace')?.focus({ preventScroll: true }));
}

function resetWorkspaceScroll(element: HTMLElement | null) {
  element?.closest<HTMLElement>('.workspace-body')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

const officialInfo: Record<GameId, string> = {
  rps: '335', rotation: '336', appointment: '337', path: '338', potion: '339',
  number: '340', nback: '341', mouse: '342', count: '343',
};
const reviewAdvice: Record<GameId, string> = {
  rps: '물음표가 나인지 상대인지 먼저 고정한 뒤, 이기는 관계를 한 번만 변환하세요.',
  rotation: '비대칭 특징 두 곳을 고정해 45° 눈금과 거울상 여부를 확인하고, 과정 재생으로 처음 틀어진 단계를 찾으세요.',
  appointment: '요일·장소·메뉴는 교집합만 남기고, 버스는 본 번호를 누적해 제외하세요.',
  path: '교차×1+평행×2로 B를 계산해 T와 비교하고, 복합판에서는 평행 경로부터 고정하세요.',
  potion: '직전 결과 하나보다 같은 조합의 누적 비율을 기준으로 판단하세요.',
  nback: '도형의 한 글자 이름을 소리 없이 갱신하며 2칸·3칸 큐를 분리하세요.',
  number: '현재 숫자를 누르기 전에 다음 숫자 위치를 먼저 찾고 예외 규칙을 끝까지 유지하세요.',
  count: '글자 크기와 뜻을 읽지 말고 좌우의 밀도와 빈 공간 비율만 비교하세요.',
  mouse: '생쥐 위치와 고양이 위치를 같은 6×6 좌표로 겹쳐 보고, 판단과 확신을 분리하세요.',
};
const GLYPH_NAME_STORAGE_KEY = 'nineflow-glyph-mnemonics-v1';
const PRACTICE_CONFIG_STORAGE_KEY = 'nineflow-practice-config-v1';
const PRACTICE_PACING_STORAGE_KEY = 'nineflow-practice-pacing-v1';
const GLYPH_VISIBILITY_STORAGE_KEY = 'nineflow-show-glyph-names-v1';
const ROTATION_PREFERENCES_STORAGE_KEY = 'nineflow-rotation-preferences-v1';
const NBACK_PREFERENCES_STORAGE_KEY = 'nineflow-nback-preferences-v1';
const APPOINTMENT_PREFERENCES_STORAGE_KEY = 'nineflow-appointment-preferences-v1';
const FOCUSED_PRACTICE_STORAGE_KEY = 'nineflow-focused-practice-v1';

type PracticeConfig = { quantity: number; paceMs: number };
type SessionMode = 'practice' | 'simulation';
type NBackPreferences = {
  task: NBackTask;
  group: number | null;
  progression: 'fixed' | 'fast';
};
type RotationPreferences = {
  contentMode: RotationContentMode;
  selectedLetters: string[];
  selectedTransforms: RotationTransformId[];
  showPreview: boolean;
};
type AppointmentPreferences = { selectedRounds: AppointmentKind[] };
type PotionPracticePreferences = { comboSize: 'all' | PotionComboSize; showEvidence: boolean };
type FocusedPracticePreferences = {
  rps: RpsFocus;
  path: PathFocus;
  potion: PotionPracticePreferences;
  number: NumberFocus;
  count: CountFocus;
  mouse: MouseLoad;
};
const DEFAULT_ROTATION_PREFERENCES: RotationPreferences = {
  contentMode: 'mixed',
  selectedLetters: [...ROTATION_LETTERS],
  selectedTransforms: [...ROTATION_TRANSFORM_IDS],
  showPreview: false,
};
const ROTATION_CONTENT_OPTIONS: ReadonlyArray<{ id: RotationContentMode; label: string; description: string }> = [
  { id: 'letters', label: '알파벳', description: '선택한 글자만 반복' },
  { id: 'tiles', label: '격자 도형', description: '4×4 패턴 집중' },
  { id: 'mixed', label: '혼합', description: '두 유형 번갈아 출제' },
];
const ROTATION_ONLY_TRANSFORMS = rotationTransformDefinitions.filter((definition) => definition.groupId.startsWith('turn-')).map((definition) => definition.id);
const REFLECTION_ONLY_TRANSFORMS = rotationTransformDefinitions.filter((definition) => definition.groupId.startsWith('mirror-')).map((definition) => definition.id);
const THREE_CLICK_TRANSFORMS = rotationTransformDefinitions.filter((definition) => definition.sequence.length === 3).map((definition) => definition.id);
const DEFAULT_NBACK_PREFERENCES: NBackPreferences = {
  task: 'n2',
  group: null,
  progression: 'fixed',
};
const DEFAULT_APPOINTMENT_PREFERENCES: AppointmentPreferences = { selectedRounds: [...APPOINTMENT_KIND_ORDER] };
let appointmentFoodAtlas: HTMLImageElement | null = null;

function preloadAppointmentFoodAtlas() {
  if (typeof window === 'undefined' || appointmentFoodAtlas) return;
  const image = new window.Image();
  image.decoding = 'async';
  image.onerror = () => {
    if (appointmentFoodAtlas === image) appointmentFoodAtlas = null;
  };
  image.src = '/assets/appointment/food-sprite-v1.webp';
  appointmentFoodAtlas = image;
}

const DEFAULT_FOCUSED_PRACTICE: FocusedPracticePreferences = {
  rps: 'full',
  path: 'all',
  potion: { comboSize: 'all', showEvidence: true },
  number: 'full',
  count: 'progressive',
  mouse: 'progressive',
};
const SessionModeContext = createContext({ mode: 'practice' as SessionMode, showGlyphNames: true });
const GamePauseContext = createContext(false);
const GuidedPacingContext = createContext(false);
const StageActionsContext = createContext({ openGameSwitcher: () => {}, openFeedback: () => {} });
const FocusedPracticeContext = createContext<FocusedPracticePreferences>(DEFAULT_FOCUSED_PRACTICE);
type PracticeSpec = {
  quantityLabel: string; quantityMin: number; quantityMax: number; quantityStep: number; quantityDefault: number;
  paceLabel: string; paceMin: number; paceMax: number; paceStep: number; paceDefault: number;
};

const practiceSpecs: Record<GameId, PracticeSpec> = {
  rps: { quantityLabel:'문제 수', quantityMin:9, quantityMax:30, quantityStep:3, quantityDefault:15, paceLabel:'문제 제한', paceMin:2500, paceMax:8000, paceStep:500, paceDefault:4500 },
  rotation: { quantityLabel:'문제 수', quantityMin:1, quantityMax:30, quantityStep:1, quantityDefault:10, paceLabel:'문제 제한', paceMin:15000, paceMax:90000, paceStep:5000, paceDefault:30000 },
  appointment: { quantityLabel:'라운드당 문항', quantityMin:1, quantityMax:8, quantityStep:1, quantityDefault:3, paceLabel:'한 사람 제시', paceMin:1500, paceMax:6000, paceStep:500, paceDefault:3000 },
  path: { quantityLabel:'문제 수', quantityMin:3, quantityMax:12, quantityStep:1, quantityDefault:3, paceLabel:'문제 제한', paceMin:30000, paceMax:120000, paceStep:10000, paceDefault:60000 },
  potion: { quantityLabel:'시행 수', quantityMin:28, quantityMax:84, quantityStep:14, quantityDefault:42, paceLabel:'응답 제한', paceMin:3000, paceMax:12000, paceStep:1000, paceDefault:7000 },
  nback: { quantityLabel:'문제 수', quantityMin:1, quantityMax:100, quantityStep:1, quantityDefault:20, paceLabel:'문제 간격', paceMin:3000, paceMax:6000, paceStep:500, paceDefault:3000 },
  number: { quantityLabel:'문제 수', quantityMin:5, quantityMax:20, quantityStep:5, quantityDefault:10, paceLabel:'문제 제한', paceMin:10000, paceMax:60000, paceStep:5000, paceDefault:20000 },
  count: { quantityLabel:'문제 수', quantityMin:5, quantityMax:50, quantityStep:5, quantityDefault:15, paceLabel:'단어 제시', paceMin:500, paceMax:2500, paceStep:100, paceDefault:1000 },
  mouse: { quantityLabel:'라운드 수', quantityMin:3, quantityMax:15, quantityStep:1, quantityDefault:5, paceLabel:'생쥐 제시', paceMin:700, paceMax:3000, paceStep:100, paceDefault:1000 },
};
const APPOINTMENT_SIMULATION_PERSON_MS = 2200;
const APPOINTMENT_SIMULATION_ANSWER_MS = 6500;
const PRESENTATION_ADVANCE_LOCK_MS = 320;
const ROUND_INPUT_SETTLE_MS = 320;
const MOUSE_DECISION_TRANSITION_MS = 420;
const PRACTICE_FEEDBACK_DWELL_MS = 1000;

function defaultPracticeConfig(gameId: GameId): PracticeConfig {
  const spec = practiceSpecs[gameId];
  return { quantity: spec.quantityDefault, paceMs: spec.paceDefault };
}

// 공개된 라운드 순서와 대략적인 소요 흐름을 재현하기 위한 독립 훈련값이다.
// 실제 문항 수와 채점식은 공개되지 않았으므로 공식값으로 표시하지 않는다.
const simulationConfigs: Record<GameId, PracticeConfig> = {
  rps: { quantity: 30, paceMs: 4500 },
  rotation: { quantity: 10, paceMs: 30000 },
  appointment: { quantity: APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND, paceMs: APPOINTMENT_SIMULATION_PERSON_MS },
  path: { quantity: 4, paceMs: 60000 },
  potion: { quantity: 42, paceMs: 7000 },
  nback: { quantity: NBACK_SIMULATION_N2_PROBLEM_COUNT + NBACK_SIMULATION_N23_PROBLEM_COUNT, paceMs: 3000 },
  number: { quantity: 12, paceMs: 20000 },
  count: { quantity: 40, paceMs: 1000 },
  mouse: { quantity: 15, paceMs: 1000 },
};
function simulationConfig(gameId: GameId) {
  return simulationConfigs[gameId];
}

function formatPace(milliseconds: number) {
  return `${Number.isInteger(milliseconds / 1000) ? milliseconds / 1000 : (milliseconds / 1000).toFixed(1)}초`;
}

function DeadlineBar({ duration, label, className = '', active = true }: { duration: number; label: string; className?: string; active?: boolean }) {
  const isPaused = useContext(GamePauseContext);
  const [remaining, setRemaining] = useState(duration);
  const clockRef = useRef<PausableTimerState>(createPausableTimer(duration));
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    clockRef.current = createPausableTimer(duration);
    // A new deadline intentionally starts at its full duration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemaining(duration);
  }, [active, duration]);

  useEffect(() => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (!active) return;
    const now = performance.now();
    if (isPaused) {
      clockRef.current = pausePausableTimer(clockRef.current, now);
      setRemaining(clockRef.current.remainingMs);
      return;
    }
    clockRef.current = resumePausableTimer(clockRef.current, now);
    const update = () => {
      const next = remainingPausableTime(clockRef.current, performance.now());
      setRemaining(next);
      if (next === 0 && timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    };
    update();
    timerRef.current = window.setInterval(update, 100);
    return () => { if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; } };
  }, [active, duration, isPaused]);
  return <div className={`time-strip ${active ? '' : 'is-settling'} ${className}`.trim()} role="progressbar" aria-label={active ? label : `${label} · 입력 준비 중`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(remaining)} aria-valuetext={active ? `${(remaining / 1000).toFixed(1)}초 남음` : '입력 준비 중'} data-deadline-active={active ? 'true' : 'false'}><span className="time-track" aria-hidden="true"><i style={{ animation: 'none', transform: `scaleX(${duration > 0 ? remaining / duration : 0})` }} /></span><span className="deadline-text" aria-hidden="true">{active ? `${(remaining / 1000).toFixed(1)}초` : '준비'}</span></div>;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

function newSessionSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function newSessionResultId(gameId: GameId) {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${gameId}-${randomId}`;
}

function seededShuffle<T>(items: readonly T[], seed: number) {
  const next = [...items];
  let state = seed || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function resultFor(gameId: GameId, correct: number, total: number, rts: number[], errors: number, detail?: Record<string, number | string>, review?: SessionResult['review']): RawResult {
  const mean = rts.length ? rts.reduce((sum, value) => sum + value, 0) / rts.length : 0;
  const variance = rts.length ? rts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rts.length : 0;
  const stability = rts.length >= 2 && mean ? Math.max(0, Math.round(100 - Math.min(100, (Math.sqrt(variance) / mean) * 100))) : 0;
  return { gameId, accuracy: Math.round((correct / Math.max(total, 1)) * 100), medianRt: median(rts), stability, errors, detail: { ...detail, correctCount: correct, trialCount: total, responseCount: rts.length }, review };
}

function genericReviewAttempt(input: Omit<GenericReviewAttempt, 'kind' | 'id'> & { id?: string }): GenericReviewAttempt {
  return {
    kind: 'generic',
    ...(input.scored === false ? { scored: false as const } : {}),
    id: input.id ?? `attempt-${input.index}`,
    index: input.index,
    status: input.status,
    errorCodes: input.errorCodes,
    title: input.title,
    prompt: input.prompt,
    expected: input.expected,
    selected: input.selected,
    explanation: input.explanation,
    ...(input.rtMs === undefined ? {} : { rtMs: input.rtMs }),
    ...(input.facts ? { facts: input.facts } : {}),
  };
}

type ManagedTimer = { handle: number | null; clock: PausableTimerState; callback: () => void };

function useManagedTimeout() {
  const isPaused = useContext(GamePauseContext);
  const pausedRef = useRef(isPaused);
  const timers = useRef<Map<number, ManagedTimer>>(new Map());
  const nextId = useRef(1);
  const arm = useCallback((id: number, timer: ManagedTimer) => {
    if (timer.handle !== null || timer.clock.remainingMs <= 0) return;
    const now = performance.now();
    timer.clock = resumePausableTimer(timer.clock, now);
    timer.handle = window.setTimeout(() => {
      timers.current.delete(id);
      timer.handle = null;
      timer.clock = pausePausableTimer(timer.clock, performance.now());
      timer.callback();
    }, timer.clock.remainingMs);
  }, []);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    const now = performance.now();
    timers.current.forEach((timer, id) => {
      if (isPaused) {
        if (timer.handle !== null) window.clearTimeout(timer.handle);
        timer.handle = null;
        timer.clock = pausePausableTimer(timer.clock, now);
      } else arm(id, timer);
    });
  }, [arm, isPaused]);

  useEffect(() => () => {
    timers.current.forEach((timer) => { if (timer.handle !== null) window.clearTimeout(timer.handle); });
    timers.current.clear();
  }, []);
  return useCallback((callback: () => void, delay: number) => {
    const id = nextId.current++;
    const timer: ManagedTimer = { handle: null, clock: createPausableTimer(delay), callback };
    timers.current.set(id, timer);
    if (!pausedRef.current) arm(id, timer);
    return () => {
      const current = timers.current.get(id);
      if (current && current.handle !== null) window.clearTimeout(current.handle);
      timers.current.delete(id);
    };
  }, [arm]);
}

function usePausableTimeout(callback: () => void, delay: number, enabled: boolean, resetKey: string | number, pausedOverride?: boolean) {
  const contextPaused = useContext(GamePauseContext);
  const isPaused = pausedOverride ?? contextPaused;
  const callbackRef = useRef(callback);
  const pausedRef = useRef(isPaused);
  const enabledRef = useRef(enabled);
  const clockRef = useRef<PausableTimerState>(createPausableTimer(delay));
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    callbackRef.current = callback;
    pausedRef.current = isPaused;
    enabledRef.current = enabled;
  }, [callback, enabled, isPaused]);
  const clear = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const arm = useCallback(() => {
    if (!enabledRef.current || pausedRef.current || timerRef.current !== null || clockRef.current.remainingMs <= 0) return;
    clockRef.current = resumePausableTimer(clockRef.current, performance.now());
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      clockRef.current = pausePausableTimer(clockRef.current, performance.now());
      callbackRef.current();
    }, clockRef.current.remainingMs);
  }, []);

  useEffect(() => {
    clear();
    clockRef.current = createPausableTimer(delay);
    arm();
    return clear;
  }, [arm, clear, delay, resetKey]);

  useEffect(() => {
    if (!enabled) { clear(); return; }
    if (isPaused) {
      if (timerRef.current !== null) {
        clear();
        clockRef.current = pausePausableTimer(clockRef.current, performance.now());
      }
    } else arm();
  }, [arm, clear, enabled, isPaused]);
}

function useActiveElapsedClock() {
  const isPaused = useContext(GamePauseContext);
  const pausedRef = useRef(false);
  const initializedRef = useRef(false);
  const clockRef = useRef<ActiveElapsedState>({ startedAtMs: 0, pausedAtMs: null, pausedTotalMs: 0 });

  useEffect(() => {
    const now = performance.now();
    pausedRef.current = isPaused;
    if (!initializedRef.current) {
      clockRef.current = createActiveElapsed(now, isPaused);
      initializedRef.current = true;
      return;
    }
    clockRef.current = isPaused ? pauseActiveElapsed(clockRef.current, now) : resumeActiveElapsed(clockRef.current, now);
  }, [isPaused]);

  const restart = useCallback(() => {
    clockRef.current = createActiveElapsed(performance.now(), pausedRef.current);
    initializedRef.current = true;
  }, []);
  const elapsed = useCallback(() => activeElapsedTime(clockRef.current, performance.now()), []);
  return useMemo(() => ({ restart, elapsed }), [elapsed, restart]);
}

function GameSwitcher({ currentGameId, sessionWasStopped, onSelect, onClose }: { currentGameId: GameId; sessionWasStopped: boolean; onSelect: (gameId: GameId) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const switcherRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(switcherRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.cancelAnimationFrame(focusFrame); window.removeEventListener('keydown', onKey, true); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return (
    <div className="game-switcher-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={switcherRef} className="game-switcher" role="dialog" aria-modal="true" aria-labelledby="game-switcher-title">
        <header><div><span>GAME LIBRARY</span><h2 id="game-switcher-title">다른 게임 선택</h2><p>{sessionWasStopped ? '현재 세션을 종료했습니다. 선택한 게임의 설정 화면에서 다시 시작합니다.' : '게임을 선택하면 해당 게임의 설정 화면으로 이동합니다.'}</p></div><button ref={closeRef} type="button" aria-label="게임 선택 닫기" onClick={onClose}>×</button></header>
        <div className="game-switcher-grid">{games.map((game) => <button type="button" className={game.id === currentGameId ? 'is-current' : ''} aria-current={game.id === currentGameId ? 'true' : undefined} key={game.id} onClick={() => onSelect(game.id)}><span>{game.no}</span><b>{game.title}</b><small>{game.skill} · 2024 공개자료 {game.difficulty}</small>{game.id === currentGameId && <em>현재 게임</em>}</button>)}</div>
        <footer><button type="button" onClick={onClose}>현재 게임 설정으로 돌아가기</button></footer>
      </section>
    </div>
  );
}

type PendingSessionAction = 'close' | 'switch' | 'feedback';

function SessionActionConfirmation({ action, onCancel, onConfirm }: { action: PendingSessionAction; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  const copy = action === 'close'
    ? { title: '이번 세션을 종료할까요?', body: '종료하면 진행 기록은 저장되지 않습니다. 계속 연습하려면 취소하세요.', confirm: '연습창 닫기' }
    : action === 'switch'
      ? { title: '현재 세션을 종료하고 게임을 바꿀까요?', body: '게임을 바꾸면 진행 기록은 저장되지 않습니다.', confirm: '게임 선택 열기' }
      : { title: '현재 세션을 종료하고 의견을 작성할까요?', body: '의견 화면을 열면 현재 진행 기록은 저장되지 않습니다.', confirm: '의견 작성 열기' };

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.cancelAnimationFrame(focusFrame); window.removeEventListener('keydown', onKey, true); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  return (
    <div className="session-confirm-backdrop" role="presentation">
      <section ref={dialogRef} className="session-confirm" role="alertdialog" aria-modal="true" aria-labelledby="session-confirm-title" aria-describedby="session-confirm-description">
        <span aria-hidden="true">!</span>
        <h2 id="session-confirm-title">{copy.title}</h2>
        <p id="session-confirm-description">{copy.body}</p>
        <div><button ref={cancelRef} type="button" onClick={onCancel}>계속 연습</button><button type="button" className="confirm-danger" onClick={onConfirm}>{copy.confirm}</button></div>
      </section>
    </div>
  );
}

function VisibilityPauseDialog({ count, onResume }: { count: number; onResume: () => void }) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => resumeRef.current?.focus());
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      resumeRef.current?.focus();
    };
    window.addEventListener('keydown', keepFocus, true);
    return () => { window.cancelAnimationFrame(focusFrame); window.removeEventListener('keydown', keepFocus, true); };
  }, []);
  return (
    <div className="session-confirm-backdrop visibility-pause-backdrop" role="presentation">
      <section className="session-confirm visibility-pause-dialog" role="alertdialog" aria-modal="true" aria-labelledby="visibility-pause-title" aria-describedby="visibility-pause-description">
        <span aria-hidden="true">Ⅱ</span>
        <h2 id="visibility-pause-title">연습을 잠시 멈췄습니다</h2>
        <p id="visibility-pause-description">다른 탭에 있던 시간은 제한시간과 반응시간에서 제외했습니다. 화면과 조작 위치를 다시 확인한 뒤 이어가세요.</p>
        <small>이번 세션 탭 이탈 {count}회 · 결과는 참고용으로 저장됩니다</small>
        <div><button ref={resumeRef} type="button" className="confirm-resume" onClick={onResume}>준비됐어요 · 계속하기</button></div>
      </section>
    </div>
  );
}

function progressUnitForGame(gameId: GameId, mode: SessionMode) {
  if (gameId === 'rotation' && mode === 'simulation') return '단계';
  if (gameId === 'appointment') return '문항';
  if (gameId === 'potion') return '시행';
  if (gameId === 'mouse') return '라운드';
  if (gameId === 'nback' || gameId === 'rps' || gameId === 'count') return '문항';
  return '문제';
}

export function GameStage({ gameId, onClose, onSwitch, onSave, onReadinessChecked }: { gameId: GameId; onClose: () => void; onSwitch: (gameId: GameId) => void; onSave: (result: SessionResult) => string; onReadinessChecked?: (summary: SavedReadinessSummary) => void }) {
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [result, setResult] = useState<SessionResult | null>(null);
  const [run, setRun] = useState(0);
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherEndedSession, setSwitcherEndedSession] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [strategyGuideOpen, setStrategyGuideOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingSessionAction | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>('practice');
  const [guidedPacing, setGuidedPacing] = useState(false);
  const [visibilityPaused, setVisibilityPaused] = useState(false);
  const [visibilityPauseCount, setVisibilityPauseCount] = useState(0);
  const [ruleCheckComplete, setRuleCheckComplete] = useState(false);
  const [glyphMnemonics, setGlyphMnemonics] = useState<string[]>([...glyphDefaultMnemonics]);
  const [showGlyphNames, setShowGlyphNames] = useState(true);
  const [practiceConfig, setPracticeConfig] = useState<PracticeConfig>(() => defaultPracticeConfig(gameId));
  const [nbackPreferences, setNBackPreferences] = useState<NBackPreferences>(DEFAULT_NBACK_PREFERENCES);
  const [rotationPreferences, setRotationPreferences] = useState<RotationPreferences>(DEFAULT_ROTATION_PREFERENCES);
  const [appointmentPreferences, setAppointmentPreferences] = useState<AppointmentPreferences>(DEFAULT_APPOINTMENT_PREFERENCES);
  const [focusedPractice, setFocusedPractice] = useState<FocusedPracticePreferences>(DEFAULT_FOCUSED_PRACTICE);
  const panelRef = useRef<HTMLElement>(null);
  const finishedRun = useRef(false);
  const phaseRef = useRef(phase);
  const onCloseRef = useRef(onClose);
  const onSwitchRef = useRef(onSwitch);
  const overlayWasOpenRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const visibilityPausedRef = useRef(false);
  const game = getGame(gameId);
  const overlayOpen = switcherOpen || feedbackOpen || strategyGuideOpen || reviewOpen || readinessOpen || pendingAction !== null || visibilityPaused;
  const sessionPaused = overlayOpen;

  usePausableTimeout(
    () => setPrepCountdown((value) => value === 1 ? null : (value ?? 1) - 1),
    1000,
    phase === 'play' && prepCountdown !== null,
    `prep-${run}-${prepCountdown ?? 'done'}`,
    sessionPaused,
  );

  useEffect(() => {
    const pauseHiddenSession = () => {
      if (document.visibilityState === 'visible' || phaseRef.current !== 'play' || finishedRun.current) return;
      setVisibilityPauseCount((value) => value + 1);
      if (overlayOpenRef.current || visibilityPausedRef.current) return;
      visibilityPausedRef.current = true;
      setVisibilityPaused(true);
    };
    document.addEventListener('visibilitychange', pauseHiddenSession);
    return () => document.removeEventListener('visibilitychange', pauseHiddenSession);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FOCUSED_PRACTICE_STORAGE_KEY) ?? 'null') as Partial<FocusedPracticePreferences> | null;
      if (!saved) return;
      const potion = saved.potion;
      const normalized: FocusedPracticePreferences = {
        rps: saved.rps && ['full', 'player', 'opponent', 'mixed'].includes(saved.rps) ? saved.rps : 'full',
        path: saved.path && ['all', 'base', 'shared', 'detour', 'crossing-only', 'parallel-only', 'mixed-pairs', 'parallel-first'].includes(saved.path) ? saved.path : 'all',
        potion: {
          comboSize: potion?.comboSize === 1 || potion?.comboSize === 2 || potion?.comboSize === 3 ? potion.comboSize : 'all',
          showEvidence: typeof potion?.showEvidence === 'boolean' ? potion.showEvidence : true,
        },
        number: saved.number && ['full', 'flash', 'rules'].includes(saved.number) ? saved.number : 'full',
        count: saved.count && ['progressive', 'foundation', 'precision'].includes(saved.count) ? saved.count : 'progressive',
        mouse: saved.mouse && ['progressive', 'foundation', 'challenge'].includes(saved.mouse) ? saved.mouse : 'progressive',
      };
      // 저장된 게임별 집중 연습값을 최초 1회 복원한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedPractice(normalized);
    } catch { /* 잘못된 설정은 검증된 기본값으로 복구한다. */ }
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onSwitchRef.current = onSwitch; }, [onSwitch]);
  useEffect(() => { overlayOpenRef.current = overlayOpen; }, [overlayOpen]);

  const stopActiveSession = useCallback(() => {
    visibilityPausedRef.current = false;
    setVisibilityPaused(false);
    setVisibilityPauseCount(0);
    setPrepCountdown(null);
    setPhase('intro');
    setResult(null);
    setRun((value) => value + 1);
  }, []);

  const resumeVisibilityPause = useCallback(() => {
    visibilityPausedRef.current = false;
    setVisibilityPaused(false);
    window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('.game-workspace')?.focus({ preventScroll: true }));
  }, []);

  const requestClose = useCallback(() => {
    if (phaseRef.current === 'play' && !finishedRun.current) { setPendingAction('close'); return; }
    onCloseRef.current();
  }, []);

  const openGameSwitcher = useCallback(() => {
    if (phaseRef.current === 'play' && !finishedRun.current) { setPendingAction('switch'); return; }
    setSwitcherEndedSession(false);
    setSwitcherOpen(true);
  }, []);

  const openFeedback = useCallback(() => {
    if (phaseRef.current === 'play' && !finishedRun.current) { setPendingAction('feedback'); return; }
    setFeedbackOpen(true);
  }, []);

  const confirmPendingAction = useCallback(() => {
    const action = pendingAction;
    if (!action) return;
    if (phaseRef.current === 'play' && !finishedRun.current) stopActiveSession();
    setPendingAction(null);
    if (action === 'close') { onCloseRef.current(); return; }
    if (action === 'switch') { setSwitcherEndedSession(true); setSwitcherOpen(true); }
    if (action === 'feedback') setFeedbackOpen(true);
  }, [pendingAction, stopActiveSession]);

  useEffect(() => {
    const releaseScrollLock = lockDocumentScroll();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = panelRef.current?.parentElement;
    const siblings = backdrop?.parentElement ? Array.from(backdrop.parentElement.children).filter((element) => element !== backdrop) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => element.offsetParent !== null && !element.closest('[inert]'));
    const onKey = (event: KeyboardEvent) => {
      if (overlayOpenRef.current) return;
      if (event.key === 'Escape') { requestClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = items[0]; const last = items.at(-1)!;
      if (!items.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const focusFrame = window.requestAnimationFrame(() => { if (!overlayOpenRef.current) (focusable()[0] ?? panelRef.current)?.focus(); });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
      siblingState.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden); });
      previousFocus?.focus();
    };
  }, [requestClose]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
    panelRef.current?.querySelector<HTMLElement>('.stage-intro')?.scrollTo({ top: 0 });
    const focusFrame = window.requestAnimationFrame(() => {
      if (phase === 'play' && prepCountdown === null) {
        const workspace = panelRef.current?.querySelector<HTMLElement>('.game-workspace');
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (workspace && (!active || !workspace.contains(active) || active === workspace)) workspace.focus();
      }
      if (phase === 'result') panelRef.current?.querySelector<HTMLElement>('.stage-result')?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [phase, prepCountdown, run]);

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 620px)');
    const resetChangedScrollContainer = () => {
      panelRef.current?.scrollTo({ top: 0 });
      panelRef.current?.querySelector<HTMLElement>('.stage-intro')?.scrollTo({ top: 0 });
    };
    compactLayout.addEventListener('change', resetChangedScrollContainer);
    return () => compactLayout.removeEventListener('change', resetChangedScrollContainer);
  }, []);

  useEffect(() => {
    const wasOpen = overlayWasOpenRef.current;
    overlayWasOpenRef.current = overlayOpen;
    if (!wasOpen || overlayOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (phaseRef.current === 'play') {
        const workspace = panel?.querySelector<HTMLElement>('.game-workspace');
        if (workspace) {
          workspace.focus({ preventScroll: true });
          return;
        }
      }
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (panel && active && panel.contains(active) && active !== panel && !active.closest('[inert]')) return;
      const fallback = Array.from(panel?.querySelectorAll<HTMLElement>('.stage-content button:not(:disabled), .stage-content a[href], .stage-content summary, .stage-content [tabindex]:not([tabindex="-1"])') ?? []).find((element) => element.offsetParent !== null && !element.closest('[inert]'));
      (fallback ?? panel)?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [overlayOpen]);

  useEffect(() => {
    if (phase !== 'play' || finishedRun.current) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [phase]);

  useEffect(() => {
    if (gameId !== 'nback') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(GLYPH_NAME_STORAGE_KEY) ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.length === glyphDefaultMnemonics.length) {
        const normalized = normalizeGlyphMnemonics(saved, glyphDefaultMnemonics);
        // 로컬 설정을 최초 1회 복원한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGlyphMnemonics(normalized);
      }
    } catch { /* 손상된 암기명은 기본 이름으로 복구하고 다른 설정은 계속 읽는다. */ }
    try {
      const savedVisibility = window.localStorage.getItem(GLYPH_VISIBILITY_STORAGE_KEY);
      if (savedVisibility === 'false') setShowGlyphNames(false);
    } catch { /* 표시 설정 접근이 막혀도 나머지 N-back 설정은 계속 읽는다. */ }
    try {
      const savedPreferences = JSON.parse(window.localStorage.getItem(NBACK_PREFERENCES_STORAGE_KEY) ?? 'null') as Partial<NBackPreferences> | null;
      if (savedPreferences) {
        const task = savedPreferences.task === 'n23' ? 'n23' : 'n2';
        const group = savedPreferences.group === null || (Number.isInteger(savedPreferences.group) && Number(savedPreferences.group) >= 0 && Number(savedPreferences.group) < NBACK_GROUP_COUNT)
          ? savedPreferences.group ?? null
          : null;
        const progression = savedPreferences.progression === 'fast' ? 'fast' : 'fixed';
        // 저장된 도형 순서 연습값을 최초 1회 복원한다.
        setNBackPreferences({ task, group, progression });
      }
    } catch { /* 잘못된 N-back 설정만 사용자 기본값으로 복구한다. */ }
  }, [gameId]);

  useEffect(() => {
    if (gameId !== 'rotation') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(ROTATION_PREFERENCES_STORAGE_KEY) ?? 'null') as Partial<RotationPreferences> | null;
      if (!saved) return;
      const contentMode = saved.contentMode && ['letters', 'tiles', 'mixed'].includes(saved.contentMode) ? saved.contentMode : DEFAULT_ROTATION_PREFERENCES.contentMode;
      const selectedLetters = Array.isArray(saved.selectedLetters)
        ? canonicalRotationLetters(saved.selectedLetters)
        : [...ROTATION_LETTERS];
      const selectedTransforms = Array.isArray(saved.selectedTransforms)
        ? canonicalRotationTransformIds(saved.selectedTransforms)
        : [...ROTATION_TRANSFORM_IDS];
      // 저장된 도형 회전 연습값을 최초 1회 복원한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRotationPreferences({
        contentMode,
        selectedLetters: selectedLetters.length ? selectedLetters : [...ROTATION_LETTERS],
        selectedTransforms: selectedTransforms.length ? selectedTransforms : [...ROTATION_TRANSFORM_IDS],
        showPreview: typeof saved.showPreview === 'boolean' ? saved.showPreview : DEFAULT_ROTATION_PREFERENCES.showPreview,
      });
    } catch { /* 잘못된 설정은 검증된 기본값으로 복구한다. */ }
  }, [gameId]);

  useEffect(() => {
    if (gameId !== 'appointment') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(APPOINTMENT_PREFERENCES_STORAGE_KEY) ?? 'null') as Partial<AppointmentPreferences> | null;
      const selectedRounds = Array.isArray(saved?.selectedRounds)
        ? APPOINTMENT_KIND_ORDER.filter((kind) => saved.selectedRounds?.includes(kind))
        : [];
      if (selectedRounds.length) {
        // 저장된 약속 정하기 라운드 선택을 최초 1회 복원한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAppointmentPreferences({ selectedRounds });
      }
    } catch { /* 잘못된 설정은 네 라운드 전체 선택으로 복구한다. */ }
  }, [gameId]);

  useEffect(() => {
    try {
      const all = JSON.parse(window.localStorage.getItem(PRACTICE_CONFIG_STORAGE_KEY) ?? '{}') as Record<string, Partial<PracticeConfig>>;
      const saved = all[gameId];
      const spec = practiceSpecs[gameId];
      if (saved) {
        const defaults = defaultPracticeConfig(gameId);
        const snapToStep = (raw: unknown, minimum: number, maximum: number, step: number, fallback: number) => {
          if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
          const clamped = Math.min(maximum, Math.max(minimum, raw));
          return Math.min(maximum, Math.max(minimum, minimum + Math.round((clamped - minimum) / step) * step));
        };
        const normalized = {
          quantity: snapToStep(saved.quantity, spec.quantityMin, spec.quantityMax, spec.quantityStep, defaults.quantity),
          paceMs: snapToStep(saved.paceMs, spec.paceMin, spec.paceMax, spec.paceStep, defaults.paceMs),
        };
        // 저장된 게임별 연습값을 최초 1회 복원한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPracticeConfig(normalized);
      }
    } catch { /* 저장 설정이 깨졌다면 공개형식 기본값으로 계속한다. */ }
  }, [gameId]);

  useLayoutEffect(() => {
    let saved = false;
    try { saved = readStoredBooleanField(window.localStorage.getItem(PRACTICE_PACING_STORAGE_KEY), gameId); } catch { /* 저장소 접근 실패 시 시간 제한 기본값을 유지한다. */ }
    // 저장된 게임별 접근성 설정을 최초 1회 복원한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuidedPacing(saved);
  }, [gameId]);

  function saveGlyphMnemonics(next: string[]) {
    setGlyphMnemonics(next);
    try { window.localStorage.setItem(GLYPH_NAME_STORAGE_KEY, JSON.stringify(next)); } catch { /* 저장이 막혀도 현재 세션에는 적용한다. */ }
  }

  function saveGlyphVisibility(next: boolean) {
    setShowGlyphNames(next);
    try { window.localStorage.setItem(GLYPH_VISIBILITY_STORAGE_KEY, String(next)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function savePracticeConfig(next: PracticeConfig) {
    setPracticeConfig(next);
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(PRACTICE_CONFIG_STORAGE_KEY); } catch { /* 읽기가 막혀도 새 스냅샷 저장을 시도한다. */ }
    try { window.localStorage.setItem(PRACTICE_CONFIG_STORAGE_KEY, upsertPracticeConfig(raw, gameId, next)); } catch { /* 저장이 막혀도 현재 세션에는 적용한다. */ }
  }

  function saveGuidedPacing(next: boolean) {
    setGuidedPacing(next);
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(PRACTICE_PACING_STORAGE_KEY); } catch { /* 읽기가 막혀도 현재 게임 설정 저장을 시도한다. */ }
    try { window.localStorage.setItem(PRACTICE_PACING_STORAGE_KEY, upsertStoredObjectField(raw, gameId, next)); } catch { /* 저장이 막혀도 현재 세션에는 적용한다. */ }
  }

  function saveNBackPreferences(next: NBackPreferences) {
    setNBackPreferences(next);
    try { window.localStorage.setItem(NBACK_PREFERENCES_STORAGE_KEY, JSON.stringify(next)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function saveRotationPreferences(next: RotationPreferences) {
    const selectedLetters = canonicalRotationLetters(next.selectedLetters);
    const selectedTransforms = canonicalRotationTransformIds(next.selectedTransforms);
    const normalized = {
      ...next,
      selectedLetters: selectedLetters.length ? selectedLetters : [...ROTATION_LETTERS],
      selectedTransforms: selectedTransforms.length ? selectedTransforms : [...ROTATION_TRANSFORM_IDS],
    };
    setRotationPreferences(normalized);
    try { window.localStorage.setItem(ROTATION_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function saveAppointmentPreferences(next: AppointmentPreferences) {
    const selectedRounds = APPOINTMENT_KIND_ORDER.filter((kind) => next.selectedRounds.includes(kind));
    if (!selectedRounds.length) return;
    const normalized = { selectedRounds };
    setAppointmentPreferences(normalized);
    try { window.localStorage.setItem(APPOINTMENT_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function saveFocusedPractice(next: FocusedPracticePreferences) {
    setFocusedPractice(next);
    const key = gameId as keyof FocusedPracticePreferences;
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(FOCUSED_PRACTICE_STORAGE_KEY); } catch { /* 읽기가 막혀도 현재 게임 설정 저장을 시도한다. */ }
    try { window.localStorage.setItem(FOCUSED_PRACTICE_STORAGE_KEY, upsertStoredObjectField(raw, key, next[key])); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function finish(raw: RawResult) {
    if (finishedRun.current) return;
    finishedRun.current = true;
    const activeSessionConfig = sessionMode === 'practice' ? practiceConfig : simulationConfig(gameId);
    const practiceDetail: Record<string, string | number> = {
      quantity: activeSessionConfig.quantity,
      paceMs: activeSessionConfig.paceMs,
      ...(sessionMode === 'simulation' ? { simulationPresetVersion: SIMULATION_PRESET_VERSION } : {}),
    };
    const rawPreviewUsed = raw.detail?.previewUsed;
    const rotationDetail: Record<string, string | number> = gameId === 'rotation'
      ? sessionMode === 'simulation'
        ? { rotationContent: '알파벳 → 격자 도형', rotationLetters: '전체', rotationTargets: '전체 15유형', rotationTargetIds: 'simulation-all', previewUsed: '숨김' }
        : {
            rotationContent: rotationPreferences.contentMode,
            rotationLetters: rotationPreferences.contentMode === 'tiles' ? 'N/A' : ROTATION_LETTERS.filter((letter) => rotationPreferences.selectedLetters.includes(letter)).join(''),
            rotationTargets: `${rotationPreferences.selectedTransforms.length}/15유형`,
            rotationTargetIds: ROTATION_TRANSFORM_IDS.filter((id) => rotationPreferences.selectedTransforms.includes(id)).join(','),
            previewUsed: typeof rawPreviewUsed === 'string' ? rawPreviewUsed : rotationPreferences.showPreview ? '사용' : '숨김',
          }
      : {};
    const appointmentDetail: Record<string, string | number> = gameId === 'appointment' ? { appointmentRounds: sessionMode === 'simulation' ? '1→2→3→4 고정' : appointmentPreferences.selectedRounds.map((kind) => APPOINTMENT_ROUNDS.find((round) => round.kind === kind)?.number).join('→') } : {};
    const guidedPacingDetail: Record<string, string | number> = sessionMode === 'practice'
      ? { guidedPacing: guidedPacing ? '제한시간 없음' : '설정 제한시간 적용' }
      : {};
    const focusDetail: Record<string, string | number> = sessionMode === 'practice' && gameId in focusedPractice
      ? gameId === 'potion'
        ? { practiceFocus: focusedPractice.potion.comboSize === 'all' ? '전체 14개 조합' : `재료 ${focusedPractice.potion.comboSize}개 조합`, evidenceHint: focusedPractice.potion.showEvidence ? '표시' : '숨김' }
        : { practiceFocus: focusedPractice[gameId as keyof Omit<FocusedPracticePreferences, 'potion'>] as string }
      : {};
    const rawNBackGroup = raw.detail?.nbackGroup;
    const nbackDetail: Record<string, string | number> = gameId === 'nback' ? {
      nbackTask: sessionMode === 'simulation' ? '2-back → 2·3-back' : nbackPreferences.task,
      nbackGroup: typeof rawNBackGroup === 'number' || typeof rawNBackGroup === 'string' ? rawNBackGroup : nbackPreferences.group === null ? '자동 선택' : nbackPreferences.group + 1,
      nbackGroupSetting: sessionMode === 'simulation' ? 'simulation-preset' : nbackPreferences.group === null ? 'auto' : `fixed-${nbackPreferences.group}`,
      nbackProgression: sessionMode === 'simulation' ? '고정' : nbackPreferences.progression,
    } : {};
    const rawNBackNameLabels = raw.detail?.nbackNameLabels;
    const rawNBackMnemonics = raw.detail?.nbackMnemonics;
    const nbackAssistanceDetail: Record<string, string | number> = gameId === 'nback' && sessionMode === 'practice'
      ? {
          nbackNameLabels: typeof rawNBackNameLabels === 'string' ? rawNBackNameLabels : showGlyphNames ? '표시' : '숨김',
          nbackMnemonics: typeof rawNBackMnemonics === 'string' ? rawNBackMnemonics : showGlyphNames ? glyphMnemonics.join('·') : '숨김',
        }
      : {};
    const visibilityDetail: Record<string, string | number> = visibilityPauseCount > 0
      ? { visibilityPauses: visibilityPauseCount, comparisonStatus: '탭 이탈로 참고용' }
      : { visibilityPauses: 0 };
    const completed: SessionResult = { ...raw, detail: { ...raw.detail, ...practiceDetail, ...rotationDetail, ...appointmentDetail, ...guidedPacingDetail, ...focusDetail, ...nbackDetail, ...nbackAssistanceDetail, ...visibilityDetail, accessibilityProfile: currentAccessibilityProfile(), ruleCheckStatus: ruleCheckComplete ? '완료' : '미완료', sessionMode: sessionMode === 'practice' ? '연습 모드' : '실전형 연습' }, id: newSessionResultId(gameId), completedAt: new Date().toISOString() };
    visibilityPausedRef.current = false;
    setVisibilityPaused(false);
    setResult(completed);
    try {
      setSaveNotice(onSave(completed));
    } catch {
      setSaveNotice('결과 저장 중 오류가 발생했지만 이번 결과 화면은 유지합니다.');
    }
    setPhase('result');
  }

  function restart(nextMode: SessionMode = sessionMode) {
    visibilityPausedRef.current = false;
    setVisibilityPaused(false);
    setVisibilityPauseCount(0);
    finishedRun.current = false;
    setSaveNotice('');
    setResult(null);
    setSessionMode(nextMode);
    setRun((value) => value + 1);
    setPrepCountdown(gameId === 'nback' ? null : 3);
    setPhase('play');
  }

  function startSession(nextMode: SessionMode = sessionMode) {
    if (gameId === 'appointment' && (nextMode === 'simulation' || appointmentPreferences.selectedRounds.includes('food'))) {
      preloadAppointmentFoodAtlas();
    }
    visibilityPausedRef.current = false;
    setVisibilityPaused(false);
    setVisibilityPauseCount(0);
    finishedRun.current = false;
    setSaveNotice('');
    setSessionMode(nextMode);
    setPrepCountdown(gameId === 'nback' ? null : 3);
    setPhase('play');
  }

  const selectedAppointmentRounds = APPOINTMENT_ROUNDS.filter((round) => appointmentPreferences.selectedRounds.includes(round.kind));
  const appointmentPracticeSummary = `선택: ${selectedAppointmentRounds.map((round) => round.kind === 'bus' ? round.label : round.shortLabel).join(' · ')} · 총 ${selectedAppointmentRounds.length * practiceConfig.quantity}문항`;

  function focusPracticeSettings() {
    const selector = sessionMode === 'simulation'
      ? '.simulation-preset'
      : gameId === 'appointment'
        ? '.appointment-practice-options'
        : '.session-settings';
    const target = panelRef.current?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }

  return (
    <div className="stage-backdrop" role="presentation">
      <section ref={panelRef} className="stage-panel" data-game={gameId} role={overlayOpen ? undefined : 'dialog'} aria-modal={overlayOpen ? undefined : true} aria-label={overlayOpen ? undefined : `${game.title} ${sessionMode === 'practice' ? '연습' : '실전형 연습'}`} tabIndex={-1}>
        <div className="stage-content" inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen ? true : undefined}>
        {phase === 'intro' && (
          <>
            <div className="stage-intro-toolbar"><div><button className="stage-tool-switch" type="button" aria-label="게임 바꾸기" onClick={openGameSwitcher}>게임 바꾸기</button><button className="stage-tool-guide" type="button" aria-label={`${game.title} 공략 보기`} onClick={() => setStrategyGuideOpen(true)}>공략 보기</button><button className="stage-tool-ready" type="button" aria-label="응시 준비센터 열기" onClick={() => setReadinessOpen(true)}>준비 점검</button><button className="stage-tool-report" type="button" aria-label="문제 신고" onClick={openFeedback}>문제 신고</button></div><button className="stage-close session-close" aria-label={`${sessionMode === 'practice' ? '연습' : '실전형 연습'} 닫기`} onClick={requestClose}>×</button></div>
            <div className="stage-intro">
              <div className="intro-heading">
                <div><p>{game.no} · {game.skill}</p><h2>{game.title}</h2><span>{game.rounds}</span></div>
              </div>
              <button className="intro-settings-shortcut" type="button" onClick={focusPracticeSettings}>
                <span><b>내 연습 설정 바로가기</b><small>{gameId === 'appointment' && sessionMode === 'practice' ? appointmentPracticeSummary : sessionMode === 'practice' ? '분량·속도·세부 훈련 설정 확인' : '현재 게임의 실전형 고정 설정 확인'}</small></span>
                <em>설정 확인 <i aria-hidden="true">↓</i></em>
              </button>
              <ol className="intro-flow" aria-label="시작 전 확인 순서">
                <li><span>1</span><div><b>과제 이해</b><small>목표·조작 확인</small></div></li>
                <li><span>2</span><div><b>무점수 예제</b><small>규칙 2문항 확인</small></div></li>
                <li><span>3</span><div><b>방식 선택</b><small>맞춤 또는 실전형</small></div></li>
                <li><span>4</span><div><b>훈련 시작</b><small>결과·복습 저장</small></div></li>
              </ol>
              <div className={`intro-config-grid ${gameId === 'nback' ? 'has-nback-map' : ''}`.trim()}>
                <div className="intro-config-main">
                  <section className="intro-rule" aria-labelledby={`${gameId}-task-goal`}>
                    <div className="intro-rule-head"><b id={`${gameId}-task-goal`}>과제 목표</b><span>공개 구조 기반</span></div>
                    <p>{game.rule}</p>
                    <dl className="intro-task-brief">
                      <div><dt>응답 방식</dt><dd>{game.input}</dd></div>
                      <div><dt>진행 순서</dt><dd>{game.rounds}</dd></div>
                      <div><dt>연습 기준</dt><dd>{game.focus}</dd></div>
                    </dl>
                  </section>
                  <details className="intro-details">
                    <summary>공개 근거와 시간 보기</summary>
                    <dl className="stage-meta">
                      <div><dt>공개 시간 자료</dt><dd>{game.time}</dd></div>
                      <div><dt>규칙 근거</dt><dd>2023 개발사 공개 해설</dd></div>
                      <div><dt>화면 흐름</dt><dd>2026 설명·연습 분리 구조</dd></div>
                      <div><dt>최종 기준</dt><dd>기업 초대 화면 안내</dd></div>
                    </dl>
                  </details>
                  <RuleCheck gameId={gameId} onCompletionChange={setRuleCheckComplete} />
                  <ModeSelector mode={sessionMode} onChange={setSessionMode} />
                  {sessionMode === 'practice'
                    ? <>
                        <SessionSettings gameId={gameId} value={practiceConfig} onChange={savePracticeConfig} guidedPacing={guidedPacing} onGuidedPacingChange={saveGuidedPacing} />
                        {gameId === 'appointment' && <AppointmentPracticeOptions value={appointmentPreferences} questionsPerRound={practiceConfig.quantity} onChange={saveAppointmentPreferences} />}
                        {gameId !== 'appointment' && <details className="advanced-settings practice-advanced-settings"><summary><span><b>세부 훈련 설정</b><small>유형·힌트·난이도를 더 정교하게 조절합니다</small></span><em>설정 열기</em></summary><div className="advanced-settings-content"><FocusedPracticeOptions gameId={gameId} value={focusedPractice} onChange={saveFocusedPractice} />{gameId === 'rotation' && <RotationPracticeOptions value={rotationPreferences} onChange={saveRotationPreferences} />}{gameId === 'nback' && <NBackPracticeOptions value={nbackPreferences} onChange={saveNBackPreferences} />}</div></details>}
                      </>
                    : <SimulationPreset gameId={gameId} />}
                </div>
                {gameId === 'nback' && <aside className="nback-intro-column">{sessionMode === 'simulation' ? <NBackSimulationDiagram /> : <NBackIntroDiagram task={nbackPreferences.task} />}</aside>}
              </div>
              {gameId === 'nback' && sessionMode === 'practice' && <details className="advanced-settings"><summary><span><b>도형 이름표 설정</b><small>한 글자 암기명 15개와 표시 여부</small></span><em>설정 열기</em></summary><GlyphNameLegend names={glyphMnemonics} onChange={saveGlyphMnemonics} showDuringPlay={showGlyphNames} onShowDuringPlayChange={saveGlyphVisibility} /></details>}
              <aside className="intro-evidence-boundary" aria-label="공식 자료와 독립 훈련의 경계"><b>{sessionMode === 'practice' ? '맞춤 연습' : '독립 실전형 프리셋'}</b><p>{sessionMode === 'practice' ? '공개된 과제 목표와 조작을 익히는 모드입니다. 분량·속도·힌트는 이 앱의 연습 설정입니다.' : '2023 개발사 공개 레거시 흐름을 바탕으로 재구성했습니다. 비공개 문항·타이밍·채점식과 동일함을 뜻하지 않습니다.'} 실제 응시에서는 기업 초대 화면을 우선하세요.</p></aside>
            </div>
            <div className="intro-actions">
              <a href={`https://www.jobda.im/info/${officialInfo[gameId]}`} target="_blank" rel="noreferrer"><span>공식 공개 해설</span><small>2023 레거시 ↗</small></a>
              <div className="intro-start-options" aria-label="시작 방식 바로 선택">
                <button className={`stage-start stage-start-practice ${sessionMode === 'practice' ? 'is-selected' : ''}`.trim()} type="button" onPointerEnter={() => gameId === 'appointment' && appointmentPreferences.selectedRounds.includes('food') && preloadAppointmentFoodAtlas()} onFocus={() => gameId === 'appointment' && appointmentPreferences.selectedRounds.includes('food') && preloadAppointmentFoodAtlas()} onClick={() => startSession('practice')}><span>설명·연습 시작</span><small>{gameId === 'appointment' ? appointmentPracticeSummary : sessionMode === 'practice' ? '선택한 내 설정으로 시작' : '맞춤 연습으로 바로 전환'}</small></button>
                <button className={`stage-start stage-start-simulation ${sessionMode === 'simulation' ? 'is-selected' : ''}`.trim()} type="button" onPointerEnter={() => gameId === 'appointment' && preloadAppointmentFoodAtlas()} onFocus={() => gameId === 'appointment' && preloadAppointmentFoodAtlas()} onClick={() => startSession('simulation')}><span>실전형 연습 시작</span><small>{ruleCheckComplete ? '규칙 확인 완료 · 고정 프리셋' : sessionMode === 'simulation' ? '무점수 예제는 선택 사항입니다' : '실전형으로 바로 전환'}</small></button>
              </div>
            </div>
          </>
        )}
        {phase === 'play' && <GamePauseContext.Provider value={sessionPaused}><SessionModeContext.Provider value={{ mode: sessionMode, showGlyphNames }}><GuidedPacingContext.Provider value={sessionMode === 'practice' && guidedPacing}><FocusedPracticeContext.Provider value={sessionMode === 'practice' ? focusedPractice : DEFAULT_FOCUSED_PRACTICE}><StageActionsContext.Provider value={{ openGameSwitcher, openFeedback }}>{prepCountdown !== null ? <GamePreparation gameId={gameId} countdown={prepCountdown} total={gameId === 'rotation' && sessionMode === 'simulation' ? 2 : gameId === 'appointment' ? (sessionMode === 'simulation' ? APPOINTMENT_SIMULATION_TOTAL_QUESTIONS : practiceConfig.quantity * appointmentPreferences.selectedRounds.length) : (sessionMode === 'practice' ? practiceConfig : simulationConfig(gameId)).quantity} onClose={requestClose} /> : <GameRouter key={`${gameId}-${run}`} gameId={gameId} config={sessionMode === 'practice' ? practiceConfig : simulationConfig(gameId)} glyphMnemonics={glyphMnemonics} nbackPreferences={nbackPreferences} rotationPreferences={rotationPreferences} appointmentPreferences={appointmentPreferences} onRotationPreviewChange={(showPreview) => saveRotationPreferences({ ...rotationPreferences, showPreview })} onFinish={finish} onClose={requestClose} />}</StageActionsContext.Provider></FocusedPracticeContext.Provider></GuidedPacingContext.Provider></SessionModeContext.Provider></GamePauseContext.Provider>}
        {phase === 'result' && result && <ResultView result={result} mode={sessionMode} storageNotice={saveNotice} onClose={requestClose} onRestart={() => restart()} onOpenGuide={() => setStrategyGuideOpen(true)} onReview={() => setReviewOpen(true)} />}
        </div>
        {switcherOpen && <GameSwitcher currentGameId={gameId} sessionWasStopped={switcherEndedSession} onClose={() => setSwitcherOpen(false)} onSelect={(nextGameId) => { setSwitcherOpen(false); if (nextGameId !== gameId) onSwitchRef.current(nextGameId); }} />}
        {feedbackOpen && <FeedbackDialog initialGameId={gameId} sessionMode={sessionMode === 'practice' ? '연습 모드' : '실전형 연습'} nested onClose={() => setFeedbackOpen(false)} />}
        {strategyGuideOpen && <StrategyGuideDialog initialGameId={gameId} nested onClose={() => setStrategyGuideOpen(false)} />}
        {reviewOpen && result && <ReviewDialog results={[result]} initialSessionId={result.id} nested onClose={() => setReviewOpen(false)} onPracticeGame={() => { setReviewOpen(false); restart('practice'); }} />}
        {readinessOpen && <ReadinessCenter gameId={gameId} onChecked={onReadinessChecked} onClose={() => setReadinessOpen(false)} />}
        {pendingAction && <SessionActionConfirmation action={pendingAction} onCancel={() => setPendingAction(null)} onConfirm={confirmPendingAction} />}
        {visibilityPaused && <VisibilityPauseDialog count={visibilityPauseCount} onResume={resumeVisibilityPause} />}
      </section>
    </div>
  );
}

function ModeSelector({ mode, onChange }: { mode: SessionMode; onChange: (mode: SessionMode) => void }) {
  const practiceRef = useRef<HTMLButtonElement>(null);
  const simulationRef = useRef<HTMLButtonElement>(null);
  function select(next: SessionMode) {
    onChange(next);
    (next === 'practice' ? practiceRef : simulationRef).current?.focus();
  }
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>) {
    let next: SessionMode;
    if (event.key === 'Home') next = 'practice';
    else if (event.key === 'End') next = 'simulation';
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = mode === 'practice' ? 'simulation' : 'practice';
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = mode === 'simulation' ? 'practice' : 'simulation';
    else return;
    event.preventDefault();
    select(next);
  }
  return (
    <section className="mode-selector" aria-label="진행 모드 선택" tabIndex={-1}>
      <div><b>진행 모드</b><small>시작 전에 연습 또는 실전형 연습을 선택하세요</small></div>
      <div className="mode-options" role="radiogroup" aria-label="진행 방식">
        <button ref={practiceRef} type="button" role="radio" aria-checked={mode === 'practice'} tabIndex={mode === 'practice' ? 0 : -1} className={mode === 'practice' ? 'active' : ''} onKeyDown={navigate} onClick={() => onChange('practice')}>
          <span>연습 모드</span><b>내 설정으로 반복</b><small>분량·속도 조절 · 이름표 · 학습 도움</small>
        </button>
        <button ref={simulationRef} type="button" role="radio" aria-checked={mode === 'simulation'} tabIndex={mode === 'simulation' ? 0 : -1} className={mode === 'simulation' ? 'active' : ''} onKeyDown={navigate} onClick={() => onChange('simulation')}>
          <span>실전형 연습</span><b>고정 설정으로 집중</b><small>앱 자체 고정값 · 이름표/정오 피드백 숨김</small>
        </button>
      </div>
    </section>
  );
}

type FocusOption = { value: string; label: string; description: string };
const focusedOptionSets: Partial<Record<GameId, { title: string; description: string; options: FocusOption[] }>> = {
  rps: {
    title: '연습할 라운드', description: '2023 공개 순서의 1→2→3라운드 전체 흐름 또는 취약 관점만 반복합니다.',
    options: [
      { value: 'full', label: '전체 흐름', description: '내 패 → 상대 패 → 관점 혼합' },
      { value: 'player', label: '1R · 내 패', description: '내가 낼 패만 반복' },
      { value: 'opponent', label: '2R · 상대 패', description: '상대가 낼 패만 반복' },
      { value: 'mixed', label: '3R · 혼합', description: '물음표 위치가 계속 전환' },
    ],
  },
  path: {
    title: '길 만들기 집중 유형', description: 'T(목표 울타리)와 B(각 경로 기본값), 교차·평행 조합을 기준으로 골라 연습합니다.',
    options: [
      { value: 'all', label: '전체 혼합', description: '모든 T/B·경로 조합' },
      { value: 'base', label: '기본형 · T=B', description: '기본 울타리 수 그대로' },
      { value: 'shared', label: '공유형 · T<B', description: '한 울타리를 여러 경로가 공유' },
      { value: 'detour', label: '우회형 · T>B', description: '간섭을 피해 추가 우회' },
      { value: 'crossing-only', label: '교차쌍 집중', description: '쌍마다 기본 1회전' },
      { value: 'parallel-only', label: '평행쌍 집중', description: '쌍마다 기본 2회전' },
      { value: 'mixed-pairs', label: '교차+평행', description: '두 관계가 섞인 복합판' },
      { value: 'parallel-first', label: '평행 먼저', description: '평행 경로를 먼저 고정하는 꼬인 판' },
    ],
  },
  potion: {
    title: '레시피 범위', description: '재료 수별 조합을 먼저 익힌 뒤 전체 14개 조합으로 확장합니다.',
    options: [
      { value: 'all', label: '전체 14개', description: '1·2·3개 재료 조합' },
      { value: '1', label: '재료 1개', description: '4개 레시피 집중' },
      { value: '2', label: '재료 2개', description: '6개 레시피 집중' },
      { value: '3', label: '재료 3개', description: '4개 레시피 집중' },
    ],
  },
  number: {
    title: '연습할 라운드', description: '점등 반응과 예외 규칙을 따로 익히거나 2023 공개 순서대로 이어갑니다.',
    options: [
      { value: 'full', label: '전체 흐름', description: '점등 숫자 → 예외 순서' },
      { value: 'flash', label: '1R · 점등', description: '배열이 바뀌는 판에서 반응' },
      { value: 'rules', label: '2R · 규칙', description: '건너뛰기·두 번 누르기' },
    ],
  },
  count: {
    title: '개수 차이', description: '큰 차이부터 익히거나 비슷한 개수만 집중 비교합니다.',
    options: [
      { value: 'progressive', label: '점진 상승', description: '명확한 차이 → 근소한 차이' },
      { value: 'foundation', label: '기초', description: '큰 차이·낮은 밀도' },
      { value: 'precision', label: '정밀', description: '2~4개 차이 집중' },
    ],
  },
  mouse: {
    title: '기억 부하', description: '생쥐·고양이 수를 선택해 위치 기억과 확신 판단을 분리 훈련합니다.',
    options: [
      { value: 'progressive', label: '점진 상승', description: '6개에서 10개까지 증가' },
      { value: 'foundation', label: '기초', description: '6~7개 위치' },
      { value: 'challenge', label: '고부하', description: '9~10개 위치' },
    ],
  },
};

function FocusedPracticeOptions({ gameId, value, onChange }: { gameId: GameId; value: FocusedPracticePreferences; onChange: (value: FocusedPracticePreferences) => void }) {
  const definition = focusedOptionSets[gameId];
  if (!definition) return null;
  const options = definition.options;
  const selected = gameId === 'potion' ? String(value.potion.comboSize) : String(value[gameId as keyof Omit<FocusedPracticePreferences, 'potion'>]);
  function select(next: string) {
    if (gameId === 'potion') {
      const comboSize = next === 'all' ? 'all' : Number(next) as PotionComboSize;
      onChange({ ...value, potion: { ...value.potion, comboSize } });
      return;
    }
    if (gameId === 'rps') onChange({ ...value, rps: next as RpsFocus });
    if (gameId === 'path') onChange({ ...value, path: next as PathFocus });
    if (gameId === 'number') onChange({ ...value, number: next as NumberFocus });
    if (gameId === 'count') onChange({ ...value, count: next as CountFocus });
    if (gameId === 'mouse') onChange({ ...value, mouse: next as MouseLoad });
  }
  function navigateOption(event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const lastIndex = options.length - 1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;
    event.preventDefault();
    select(options[nextIndex].value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    window.requestAnimationFrame(() => buttons?.[nextIndex]?.focus());
  }
  return (
    <section className="focused-practice-options" aria-labelledby={`${gameId}-focus-title`}>
      <header><div><b id={`${gameId}-focus-title`}>{definition.title}</b><small>{definition.description}</small></div><button type="button" onClick={() => onChange({ ...value, [gameId]: DEFAULT_FOCUSED_PRACTICE[gameId as keyof FocusedPracticePreferences] })}>기본값</button></header>
      <div className="focused-practice-grid" role="radiogroup" aria-label={definition.title}>
        {options.map((option, index) => <button type="button" role="radio" aria-checked={selected === option.value} tabIndex={selected === option.value ? 0 : -1} className={selected === option.value ? 'active' : ''} key={option.value} onClick={() => select(option.value)} onKeyDown={(event) => navigateOption(event, index)}><b>{option.label}</b><small>{option.description}</small></button>)}
      </div>
      {gameId === 'path' && <div className="path-focus-formula" aria-label="길 만들기 유형 계산법"><span><b>T = B</b><small>기본형</small></span><span><b>T &lt; B</b><small>공유형</small></span><span><b>T &gt; B</b><small>우회형</small></span><p><b>B 계산</b> 교차쌍 × 1 + 평행쌍 × 2 · 직진쌍 × 0</p><p><b>조작 수</b> 공개 화면에는 클릭 가능 횟수가 있지만 정확한 차감·복원 규칙은 확인되지 않아, 이 도구는 제한 대신 실제 조작 수를 기록합니다.</p></div>}
      {gameId === 'path' && <details className="path-type-index"><summary><span><b>12개 대표 조합표</b><small>비공식 개인 공략의 유형을 독립 훈련용으로 정리</small></span><i aria-hidden="true" /></summary><div>
        <section><b>기본 · T=B</b><p><span>C3 · T3</span><span>P2 · T4</span><span>C1P2 · T5</span><span>C2P1 · T4</span></p></section>
        <section><b>공유 · T&lt;B</b><p><span>C2P1 · T2</span><span>C2P1 · T3</span><span>P3 · T5</span><span>C1P2 · T3</span></p></section>
        <section><b>추가 · T&gt;B</b><p><span>C2 · T3</span><span>P2 · T5</span></p></section>
        <section><b>평행 먼저</b><p><span>C1P1 · T5</span><span>C1P1 · T4</span></p></section>
        <footer><span>C=교차쌍 · P=평행쌍 · T=목표 울타리</span><a href="https://www.youtube.com/watch?v=UDYLBG__Jeg" target="_blank" rel="noreferrer">비공식 참고 영상 ↗</a></footer>
      </div></details>}
      {gameId === 'potion' && <label className="focused-practice-toggle"><span><b>누적 근거 힌트</b><small>연습 중 같은 조합의 파랑·빨강 관찰 횟수를 표시합니다.</small></span><input type="checkbox" checked={value.potion.showEvidence} onChange={(event) => onChange({ ...value, potion: { ...value.potion, showEvidence: event.target.checked } })} /><i aria-hidden="true" /></label>}
    </section>
  );
}

function SimulationPreset({ gameId }: { gameId: GameId }) {
  if (gameId === 'rotation') {
    return (
      <section className="simulation-preset rotation-simulation-preset" aria-label="도형 회전 실전형 연습 고정 설정" tabIndex={-1}>
        <div><span><b>실전형 흐름 고정 설정</b><small>세션 시작 후 변경할 수 없습니다</small></span><em>훈련용 6 MIN</em></div>
        <dl>
          <div><dt>1단계</dt><dd>알파벳 · 3분</dd></div>
          <div><dt>2단계</dt><dd>4×4 격자 · 3분</dd></div>
          <div><dt>도움 표시</dt><dd>미리보기·정오 숨김</dd></div>
        </dl>
        <p>2023 개발사 영상은 약 6분, 2024 JAINWON 공개 기업자료는 4분으로 서로 다릅니다. 이 도구는 공개 영상의 두 단계 흐름을 연습하도록 6분을 쓰며, 문항마다 다시 주어지는 20회 조작 한도는 범위가 공개되지 않은 독립 훈련값입니다. 실제 응시에서는 기업 초대 안내를 우선하세요.</p>
      </section>
    );
  }
  if (gameId === 'nback') {
    return (
      <section className="simulation-preset nback-simulation-preset" aria-label="도형 순서 실전형 연습 고정 설정" tabIndex={-1}>
        <div><span><b>실전형 흐름 고정 설정</b><small>세션 시작 시 5개 고정 묶음 중 하나를 고르고 두 라운드에서 유지합니다</small></span><em>훈련용 {NBACK_SIMULATION_N2_PROBLEM_COUNT + NBACK_SIMULATION_N23_PROBLEM_COUNT}문항</em></div>
        <dl>
          <div><dt>출제 도형</dt><dd>선택된 한 묶음의 3개 도형</dd></div>
          <div><dt>도형 간격</dt><dd>3초</dd></div>
          <div><dt>라운드</dt><dd>2-back {NBACK_SIMULATION_N2_PROBLEM_COUNT} → 2·3-back {NBACK_SIMULATION_N23_PROBLEM_COUNT}</dd></div>
          <div><dt>도움 표시</dt><dd>이름표·정오 피드백 숨김</dd></div>
        </dl>
        <p>공개 개발사 영상은 5개 묶음 중 한 묶음을 사용한다고만 안내합니다. 라운드별 재추첨 근거가 없어 보수적으로 같은 묶음을 유지하며, 문항 수와 시간은 독립 훈련값입니다.</p>
      </section>
    );
  }
  if (gameId === 'appointment') {
    return (
      <section className="simulation-preset appointment-simulation-preset" aria-label="약속 정하기 실전형 연습 고정 설정" tabIndex={-1}>
        <div><span><b>4라운드 고정 흐름</b><small>요일 → 위치 → 메뉴 → 미탑승 버스</small></span><em>2024 자료 · 4 MIN</em></div>
        <dl>
          {APPOINTMENT_ROUNDS.map((round) => <div key={round.kind}><dt>{round.number}라운드</dt><dd>{round.shortLabel}</dd></div>)}
          <div><dt>앱 자체 분량</dt><dd>라운드당 {APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND}문항</dd></div>
          <div><dt>진행</dt><dd>자동 제시 · 정오 피드백 숨김</dd></div>
        </dl>
        <p>JOBDA 공개 레거시 가이드에서 확인되는 네 라운드 순서와 약 4분 흐름을 적용합니다. 기업별 문항 수·노출시간은 비공개이므로 분량과 시간은 훈련용 고정값입니다.</p>
      </section>
    );
  }
  const spec = practiceSpecs[gameId];
  const config = simulationConfig(gameId);
  const publicFlow = gameId === 'rps' ? '내 패 → 상대 패 → 관점 혼합'
    : gameId === 'path' ? '최소 울타리 계획 → 경로 제출'
    : gameId === 'potion' ? '4가지 재료 조합 반복 → 성공·실패 피드백'
    : gameId === 'number' ? '점등 숫자 → 건너뛰기·두 번 누르기'
    : gameId === 'count' ? '좌우 단어 개수 비교'
    : gameId === 'mouse' ? '생쥐 → 고양이 → 빨강 → 파랑'
    : '';
  const publicDuration = '2024 공개 기업자료상 4분(현행 보장 아님)';
  return (
    <section className="simulation-preset" aria-label="실전형 연습 고정 설정" tabIndex={-1}>
      <div><span><b>실전형 연습 고정 설정</b><small>세션 시작 후 변경할 수 없습니다</small></span><em>고정</em></div>
      <dl>
        <div><dt>{spec.quantityLabel}</dt><dd>{config.quantity}</dd></div>
        <div><dt>{spec.paceLabel}</dt><dd>{formatPace(config.paceMs)}</dd></div>
        <div><dt>공개 진행 순서</dt><dd>{publicFlow}</dd></div>
        <div><dt>자료상 시간</dt><dd>{publicDuration}</dd></div>
        {gameId === 'count' && <div><dt>훈련용 응답 제한</dt><dd>{formatPace(Math.max(2500, config.paceMs * 3))}</dd></div>}
        {gameId === 'mouse' && <><div><dt>훈련용 중간 제시</dt><dd>빈칸 0.5초 · 고양이 1.2초 · 색 0.9초</dd></div><div><dt>훈련용 응답 제한</dt><dd>색마다 {formatPace(Math.max(4000, config.paceMs * 4))}</dd></div></>}
        <div><dt>도움 표시</dt><dd>숨김</dd></div>
      </dl>
      {gameId === 'path' && <p>2023 개발사 영상은 경로가 맞더라도 목표보다 많은 울타리를 쓰면 감점된다고 설명합니다. 비공개 감점식은 흥내 내지 않고 경로 성공과 목표 울타리 일치를 별도 기록하며, 클릭 제한 대신 전체 조작 수를 남깁니다.</p>}
      <p>공개된 라운드·판정·조작 순서는 유지하되, 공개되지 않은 문항 수와 채점식은 독립 훈련값을 사용합니다. JOBDA 공식 모의검사나 동일 문항을 뜻하지 않습니다.</p>
    </section>
  );
}

function NBackGroupPreview({ group }: { group: number | null }) {
  if (group === null) return <span className="nback-group-preview nback-random-preview" aria-hidden="true"><span>1 / 5</span></span>;
  const variants = Array.from({ length: 3 }, (_, index) => group * 3 + index);
  return <span className="nback-group-preview" aria-hidden="true">{variants.map((variant) => <CognitiveGlyph key={variant} variant={variant} size={28} color="#237b76" label={glyphShapeNames[variant]} />)}</span>;
}

function NBackGroupPicker({ value, onChange, label }: { value: number | null; onChange: (group: number | null) => void; label: string }) {
  const options = [null, ...Array.from({ length: NBACK_GROUP_COUNT }, (_, index) => index)];
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget.parentElement;
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + direction + options.length) % options.length;
    onChange(options[nextIndex]);
    window.requestAnimationFrame(() => group?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus());
  }
  return (
    <fieldset className="nback-group-picker">
      <legend>{label}</legend>
      <div className="rotation-mode-options nback-group-options" role="radiogroup" aria-label={label}>
        {options.map((group, index) => {
          const active = value === group;
          return <button type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} className={active ? 'active' : ''} key={group ?? 'random'} onKeyDown={(event) => navigate(event, index)} onClick={() => onChange(group)}><b>{group === null ? '자동 선택' : `묶음 ${group + 1}`}</b><NBackGroupPreview group={group} /><small>{group === null ? '5개 고정 묶음 중 1개' : glyphDefaultMnemonics.slice(group * 3, group * 3 + 3).join(' · ')}</small></button>;
        })}
      </div>
    </fieldset>
  );
}

function NBackPracticeOptions({ value, onChange }: { value: NBackPreferences; onChange: (value: NBackPreferences) => void }) {
  const tasks: NBackTask[] = ['n2', 'n23'];
  const progressions: NBackPreferences['progression'][] = ['fixed', 'fast'];
  function navigateOption<T>(event: React.KeyboardEvent<HTMLButtonElement>, index: number, options: readonly T[], select: (option: T) => void) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget.parentElement;
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + direction + options.length) % options.length;
    select(options[nextIndex]);
    window.requestAnimationFrame(() => group?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus());
  }
  return (
    <section className="rotation-practice-options nback-practice-options" aria-labelledby="nback-options-title">
      <header><div><b id="nback-options-title">도형 순서 세부 설정</b><small>난이도·도형 묶음·응답 후 진행 방식을 선택하세요</small></div><button type="button" onClick={() => onChange(DEFAULT_NBACK_PREFERENCES)}>기본값</button></header>
      <fieldset className="nback-difficulty-picker">
        <legend>난이도</legend>
        <div className="rotation-mode-options nback-difficulty-options" role="radiogroup" aria-label="도형 순서 난이도">
          <button type="button" role="radio" aria-checked={value.task === 'n2'} tabIndex={value.task === 'n2' ? 0 : -1} className={value.task === 'n2' ? 'active' : ''} onKeyDown={(event) => navigateOption(event, 0, tasks, (task) => onChange({ ...value, task }))} onClick={() => onChange({ ...value, task: 'n2' })}><b>2-back</b><small>2번째 전과 같음 / 다름</small></button>
          <button type="button" role="radio" aria-checked={value.task === 'n23'} tabIndex={value.task === 'n23' ? 0 : -1} className={value.task === 'n23' ? 'active' : ''} onKeyDown={(event) => navigateOption(event, 1, tasks, (task) => onChange({ ...value, task }))} onClick={() => onChange({ ...value, task: 'n23' })}><b>2·3-back</b><small>2번째 전 / 3번째 전 / 둘 다 다름</small></button>
        </div>
      </fieldset>
      <NBackGroupPicker value={value.group} onChange={(group) => onChange({ ...value, group })} label="출제 도형 묶음" />
      <fieldset className="nback-progression-picker">
        <legend>진행 방식</legend>
        <div className="rotation-mode-options nback-progression-options" role="radiogroup" aria-label="도형 순서 진행 방식">
          <button type="button" role="radio" aria-checked={value.progression === 'fixed'} tabIndex={value.progression === 'fixed' ? 0 : -1} className={value.progression === 'fixed' ? 'active' : ''} onKeyDown={(event) => navigateOption(event, 0, progressions, (progression) => onChange({ ...value, progression }))} onClick={() => onChange({ ...value, progression: 'fixed' })}><b>고정 간격</b><small>응답해도 설정한 시간이 끝난 뒤 전환</small></button>
          <button type="button" role="radio" aria-checked={value.progression === 'fast'} tabIndex={value.progression === 'fast' ? 0 : -1} className={value.progression === 'fast' ? 'active' : ''} onKeyDown={(event) => navigateOption(event, 1, progressions, (progression) => onChange({ ...value, progression }))} onClick={() => onChange({ ...value, progression: 'fast' })}><b>정답 빠른 전환</b><small>정답이면 약 0.3초 뒤 다음 도형</small></button>
        </div>
      </fieldset>
    </section>
  );
}

function RotationPracticeOptions({ value, onChange }: { value: RotationPreferences; onChange: (value: RotationPreferences) => void }) {
  const selectedSet = new Set(value.selectedTransforms);
  function toggleLetter(letter: string) {
    const selected = value.selectedLetters.includes(letter);
    if (selected && value.selectedLetters.length === 1) return;
    onChange({ ...value, selectedLetters: selected ? value.selectedLetters.filter((item) => item !== letter) : [...value.selectedLetters, letter] });
  }
  function replaceTransforms(selectedTransforms: readonly RotationTransformId[]) {
    const normalized = ROTATION_TRANSFORM_IDS.filter((id) => selectedTransforms.includes(id));
    if (!normalized.length) return;
    onChange({ ...value, selectedTransforms: normalized });
  }
  function toggleTransform(transformId: RotationTransformId) {
    const next = selectedSet.has(transformId)
      ? value.selectedTransforms.filter((id) => id !== transformId)
      : [...value.selectedTransforms, transformId];
    replaceTransforms(next);
  }
  function toggleTransformGroup(groupId: RotationTransformGroupId) {
    const groupTransforms = rotationTransformDefinitions.filter((definition) => definition.groupId === groupId).map((definition) => definition.id);
    const allSelected = groupTransforms.every((id) => selectedSet.has(id));
    replaceTransforms(allSelected ? value.selectedTransforms.filter((id) => !groupTransforms.includes(id)) : [...value.selectedTransforms, ...groupTransforms]);
  }
  function navigateMode(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? ROTATION_CONTENT_OPTIONS.length - 1 : (index + direction + ROTATION_CONTENT_OPTIONS.length) % ROTATION_CONTENT_OPTIONS.length;
    const group = event.currentTarget.parentElement;
    onChange({ ...value, contentMode: ROTATION_CONTENT_OPTIONS[nextIndex].id });
    window.requestAnimationFrame(() => group?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus());
  }
  return (
    <section className="rotation-practice-options" aria-labelledby="rotation-options-title">
      <header><div><b id="rotation-options-title">도형 회전 연습 설정</b><small>문제 유형과 학습 보조를 선택하세요</small></div><button type="button" onClick={() => onChange(DEFAULT_ROTATION_PREFERENCES)}>기본값</button></header>
      <div className="rotation-mode-options" role="radiogroup" aria-label="도형 회전 문제 유형">
        {ROTATION_CONTENT_OPTIONS.map((item, index) => <button type="button" role="radio" aria-checked={value.contentMode === item.id} tabIndex={value.contentMode === item.id ? 0 : -1} className={value.contentMode === item.id ? 'active' : ''} key={item.id} onKeyDown={(event) => navigateMode(event, index)} onClick={() => onChange({ ...value, contentMode: item.id })}><b>{item.label}</b><small>{item.description}</small></button>)}
      </div>
      {value.contentMode !== 'tiles' && (
        <div className="rotation-letter-picker">
          <div><b>연습할 알파벳</b><small>{value.selectedLetters.length}개 선택</small></div>
          <div role="group" aria-label="연습할 알파벳 선택">{ROTATION_LETTERS.map((letter) => { const selected = value.selectedLetters.includes(letter); const lastSelected = selected && value.selectedLetters.length === 1; return <button type="button" aria-pressed={selected} disabled={lastSelected} title={lastSelected ? '알파벳을 최소 1개 선택해야 합니다.' : undefined} className={selected ? 'active' : ''} key={letter} onClick={() => toggleLetter(letter)}>{letter}</button>; })}</div>
        </div>
      )}
      <fieldset className="rotation-transform-picker">
        <legend><span><b>연습할 변환 유형</b><small>8개 훈련군 · 정확한 목표 상태 15개</small></span><em aria-live="polite">{value.selectedTransforms.length} / 15 선택</em></legend>
        <div className="rotation-transform-presets" role="group" aria-label="도형 회전 변환 빠른 선택">
          <button type="button" className={value.selectedTransforms.length === 15 ? 'active' : ''} aria-pressed={value.selectedTransforms.length === 15} onClick={() => replaceTransforms(ROTATION_TRANSFORM_IDS)}>전체 15</button>
          <button type="button" className={ROTATION_ONLY_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === ROTATION_ONLY_TRANSFORMS.length ? 'active' : ''} aria-pressed={ROTATION_ONLY_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === ROTATION_ONLY_TRANSFORMS.length} onClick={() => replaceTransforms(ROTATION_ONLY_TRANSFORMS)}>회전 7</button>
          <button type="button" className={REFLECTION_ONLY_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === REFLECTION_ONLY_TRANSFORMS.length ? 'active' : ''} aria-pressed={REFLECTION_ONLY_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === REFLECTION_ONLY_TRANSFORMS.length} onClick={() => replaceTransforms(REFLECTION_ONLY_TRANSFORMS)}>반전 8</button>
          <button type="button" className={THREE_CLICK_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === THREE_CLICK_TRANSFORMS.length ? 'active' : ''} aria-pressed={THREE_CLICK_TRANSFORMS.every((id) => selectedSet.has(id)) && value.selectedTransforms.length === THREE_CLICK_TRANSFORMS.length} onClick={() => replaceTransforms(THREE_CLICK_TRANSFORMS)}>3클릭 4</button>
        </div>
        <div className="rotation-transform-group-grid" role="group" aria-label="도형 회전 훈련군 선택">
          {rotationTransformGroups.map((group) => {
            const transforms = rotationTransformDefinitions.filter((definition) => definition.groupId === group.id);
            const selectedCount = transforms.filter((definition) => selectedSet.has(definition.id)).length;
            const allSelected = selectedCount === transforms.length;
            return (
              <button type="button" className={allSelected ? 'active' : selectedCount ? 'partial' : ''} aria-pressed={allSelected ? true : selectedCount ? 'mixed' : false} disabled={allSelected && selectedSet.size === transforms.length} title={allSelected && selectedSet.size === transforms.length ? '변환 유형을 최소 1개 선택해야 합니다.' : undefined} key={group.id} onClick={() => toggleTransformGroup(group.id)}>
                <span><b>{group.label}</b><em>{selectedCount}/{transforms.length}</em></span>
                <small>{group.description}</small>
                <i>{transforms.map((definition) => definition.compact).join(' · ')}</i>
              </button>
            );
          })}
        </div>
        <details className="rotation-transform-exact">
          <summary><span><b>15개 목표 상태 직접 선택</b><small>왼쪽·오른쪽 또는 반전 순서까지 나눠 집중 연습</small></span><i aria-hidden="true" /></summary>
          <div>
            {rotationTransformDefinitions.map((definition) => (
              <button type="button" aria-pressed={selectedSet.has(definition.id)} disabled={selectedSet.has(definition.id) && selectedSet.size === 1} title={selectedSet.has(definition.id) && selectedSet.size === 1 ? '변환 유형을 최소 1개 선택해야 합니다.' : undefined} className={selectedSet.has(definition.id) ? 'active' : ''} key={definition.id} onClick={() => toggleTransform(definition.id)}>
                <span><b>{definition.label}</b><em>{definition.sequence.length}클릭</em></span>
                <small>{definition.formula}</small>
              </button>
            ))}
          </div>
        </details>
        <p><b>표기</b> L/R = 왼쪽/오른쪽 45° 회전, LR/UD = 좌우/상하 반전. 알파벳·격자 혼합은 같은 변환을 두 문제씩 짝지어 순환합니다. 선택한 {value.selectedTransforms.length}개 변환을 두 형식에서 모두 보려면 최소 {value.selectedTransforms.length * 2}문항을 설정하세요. 마지막 1개 유형은 해제되지 않습니다.</p>
      </fieldset>
      <label className="rotation-preview-setting"><span><b>단계별 과정 미리보기</b><small>각 조작 뒤의 모양을 저장하고 앞뒤 이동·자동 재생으로 확인합니다</small></span><input type="checkbox" checked={value.showPreview} onChange={(event) => onChange({ ...value, showPreview: event.target.checked })} /><i aria-hidden="true" /></label>
      <RotationStrategyGuide />
    </section>
  );
}

function RotationGuideExampleCard({ example }: { example: RotationGuideExample }) {
  const shape = { kind: example.kind, letter: example.letter, pattern: example.pattern };
  const target = matrixForRotationSequence(example.sequence);
  return (
    <article className="rotation-guide-example-card">
      <header><b>{example.title}</b><span>{example.sequence.map((id) => rotationOperation(id).short).join(' ')}</span></header>
      <div className="rotation-guide-example-visual">
        <div><small>시작</small><RotationShape puzzle={shape} matrix={IDENTITY_MATRIX} label={`${example.title} 시작 모양`} /></div>
        <i aria-hidden="true">→</i>
        <div><small>변환 후</small><RotationShape puzzle={shape} matrix={target} label={`${example.title} 변환 후 모양`} /></div>
      </div>
      <p>{example.caption}</p>
    </article>
  );
}

function RotationStrategyGuide() {
  return (
    <details className="rotation-strategy-guide">
      <summary><span><b>도형 회전 전체 규칙·공략</b><small>알파벳·격자 공통 · 8개 훈련군 · 목표 상태 15개</small></span><i aria-hidden="true" /></summary>
      <div className="rotation-guide-body">
        <p className="rotation-guide-formula"><b>한 줄 공식</b><span>회전/거울상 판별 → 45° 눈금 수 → 축 또는 순서 → 1~3클릭 공식</span><small>문자와 격자는 같은 변환을 사용합니다. 글자를 읽지 말고 꼬리·외딴 칸처럼 비대칭 특징 두 곳을 추적하세요.</small></p>
        <section className="rotation-guide-correction" aria-labelledby="rotation-correction-title">
          <span>분류 정정</span>
          <div><b id="rotation-correction-title">‘8개 공식’이 아니라 15개 목표 상태입니다.</b><p>4개 조작이 만드는 상태는 시작을 포함해 16개이며, 시작과 같은 항등을 빼면 회전 7개와 반전 8개가 남습니다. 아래 8개는 이를 외우기 쉽게 묶은 이 연습장의 훈련 분류입니다.</p></div>
          <p><b>P형·b형은 별도 수학적 변환이 아닙니다.</b> 글자의 외관만 다를 뿐 대각선 반전은 ↗축·↘축 두 상태입니다. 글자별 훈련 사례로는 나눌 수 있지만, 45°·135° 회전과 네 개의 기울어진 반전을 빠뜨리면 전체 변환을 연습할 수 없습니다.</p>
        </section>
        <section className="rotation-transform-atlas" aria-labelledby="rotation-atlas-title">
          <header><div><b id="rotation-atlas-title">전체 변환 공식표</b><small>이 연습장의 4개 조작을 수학적으로 전개한 자체 학습 분류 · 모든 공식은 최소 3클릭 이내</small></div><em>15 states</em></header>
          <div>
            {rotationTransformGroups.map((group) => {
              const definitions = rotationTransformDefinitions.filter((definition) => definition.groupId === group.id);
              return (
                <article key={group.id}>
                  <header><span>{group.compact}</span><div><b>{group.label}</b><small>{group.description}</small></div><em>{definitions.length}개</em></header>
                  <ul>{definitions.map((definition) => <li key={definition.id}><span><b>{definition.label}</b><small>{definition.formula}{definition.alternateFormula ? ` = ${definition.alternateFormula}` : ''}</small></span><em>{definition.sequence.length}클릭</em></li>)}</ul>
                  <p>{group.tip}</p>
                </article>
              );
            })}
          </div>
          <p className="rotation-symbol-key"><b>L/R</b> 왼쪽/오른쪽 45° 회전 <span>·</span> <b>LR/UD</b> 좌우/상하 반전 <span>·</span> 화살표 순서대로 입력</p>
        </section>
        <section className="rotation-guide-examples" aria-labelledby="rotation-guide-example-title">
          <header><div><b id="rotation-guide-example-title">공개 형식 기반 자체 제작 예시</b><small>공식 문제·이미지를 복제하지 않고 같은 조작 원리로 새로 구성했습니다.</small></div></header>
          <div>{rotationGuideExamples.map((example) => <RotationGuideExampleCard example={example} key={example.id} />)}</div>
        </section>
        <section className="rotation-tip-grid" aria-label="도형 회전 유형별 풀이 팁">
          {rotationGuideTips.map((tip, index) => (
            <article key={tip.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><b>{tip.title}</b><i>{tip.badge}</i></header>
              <dl>
                <div><dt>판단 기준</dt><dd>{tip.criterion}</dd></div>
                <div><dt>흔한 실수</dt><dd>{tip.mistake}</dd></div>
                <div><dt>실행 순서</dt><dd>{tip.steps}</dd></div>
              </dl>
              <p>{tip.example}</p>
            </article>
          ))}
        </section>
        <p className="rotation-guide-source-note"><b>근거 구분</b> 45° 단위 회전·반전 조작, 클릭 제한, 특징점 추적은 2023 JOBDA 공개 레거시 자료를 기준으로 했습니다. 8개 훈련군·15개 상태와 공식표는 그 조작을 빠짐없이 연습하기 위해 수학적으로 정리한 자체 분류이며 비공개 출제·채점식을 뜻하지 않습니다.</p>
      </div>
    </details>
  );
}

function AppointmentPracticeOptions({ value, questionsPerRound, onChange }: { value: AppointmentPreferences; questionsPerRound: number; onChange: (value: AppointmentPreferences) => void }) {
  const selected = new Set(value.selectedRounds);
  const selectedLabels = APPOINTMENT_ROUNDS
    .filter((round) => selected.has(round.kind))
    .map((round) => round.kind === 'bus' ? round.label : round.shortLabel);
  function toggle(kind: AppointmentKind) {
    const next = selected.has(kind) ? value.selectedRounds.filter((item) => item !== kind) : [...value.selectedRounds, kind];
    if (next.length) onChange({ selectedRounds: APPOINTMENT_KIND_ORDER.filter((item) => next.includes(item)) });
  }
  return (
    <section className="appointment-practice-options" aria-labelledby="appointment-round-picker-title" tabIndex={-1}>
      <header>
        <span><i>맞춤 연습 필수 설정</i><b id="appointment-round-picker-title">연습할 게임 선택</b><small>요일·위치·메뉴·미탑승 버스 중 원하는 유형만 고르세요. 최소 1개는 유지됩니다.</small></span>
        <div><em>{value.selectedRounds.length} / 4 선택</em><button type="button" onClick={() => onChange(DEFAULT_APPOINTMENT_PREFERENCES)}>전체 4개</button></div>
      </header>
      <div className="appointment-round-picker" role="group" aria-label="약속 정하기 연습 유형">
        {APPOINTMENT_ROUNDS.map((round) => (
          <article className={selected.has(round.kind) ? 'is-selected' : ''} key={round.kind}>
            <label>
              <input type="checkbox" aria-label={`${round.kind === 'bus' ? round.label : round.shortLabel} 연습 포함`} checked={selected.has(round.kind)} disabled={selected.size === 1 && selected.has(round.kind)} title={selected.size === 1 && selected.has(round.kind) ? '연습 유형을 최소 1개 선택해야 합니다.' : undefined} onChange={() => toggle(round.kind)} />
              <span><small>ROUND {round.number}</small><b>{round.kind === 'bus' ? round.label : round.shortLabel}</b><em>{round.answerRule === 'common' ? '세 사람의 공통 항목' : '한 번도 안 나온 번호'}</em></span>
            </label>
            <button type="button" aria-label={`${round.number}라운드 ${round.kind === 'bus' ? round.label : round.shortLabel}만 연습`} onClick={() => onChange({ selectedRounds: [round.kind] })}>이것만 연습</button>
          </article>
        ))}
      </div>
      <p aria-live="polite"><span><b>선택: {selectedLabels.join(' · ')}</b><small>여러 개를 고르면 1→2→3→4 공식 순서로 진행합니다.</small></span><em>총 {value.selectedRounds.length * questionsPerRound}문항</em></p>
    </section>
  );
}

function SessionSettings({ gameId, value, onChange, guidedPacing, onGuidedPacingChange }: { gameId: GameId; value: PracticeConfig; onChange: (value: PracticeConfig) => void; guidedPacing: boolean; onGuidedPacingChange: (enabled: boolean) => void }) {
  const spec = practiceSpecs[gameId];
  function change(field: keyof PracticeConfig, delta: number) {
    const min = field === 'quantity' ? spec.quantityMin : spec.paceMin;
    const max = field === 'quantity' ? spec.quantityMax : spec.paceMax;
    onChange({ ...value, [field]: Math.min(max, Math.max(min, value[field] + delta)) });
  }
  return (
    <section className="session-settings" aria-label="연습 세션 설정" tabIndex={-1}>
      <div><span><b>세션 설정</b><small>공개 형식 기반 연습값 · 언제든 변경 가능</small></span><button type="button" onClick={() => onChange(defaultPracticeConfig(gameId))}>기본값</button></div>
      <div className="session-steppers">
        <div className="session-stepper" role="group" aria-labelledby={`${gameId}-quantity-label`}><span id={`${gameId}-quantity-label`}>{spec.quantityLabel}</span><div><button type="button" aria-label={`${spec.quantityLabel} 줄이기`} onClick={() => change('quantity', -spec.quantityStep)}>−</button><output aria-live="polite" aria-label={`${spec.quantityLabel} 현재 값`}>{value.quantity}</output><button type="button" aria-label={`${spec.quantityLabel} 늘리기`} onClick={() => change('quantity', spec.quantityStep)}>＋</button></div></div>
        <div className="session-stepper" role="group" aria-labelledby={`${gameId}-pace-label`}><span id={`${gameId}-pace-label`}>{spec.paceLabel}</span><div><button type="button" aria-label={`${spec.paceLabel} 줄이기`} onClick={() => change('paceMs', -spec.paceStep)}>−</button><output aria-live="polite" aria-label={`${spec.paceLabel} 현재 값`}>{formatPace(value.paceMs)}</output><button type="button" aria-label={`${spec.paceLabel} 늘리기`} onClick={() => change('paceMs', spec.paceStep)}>＋</button></div></div>
      </div>
      {gameId === 'mouse' && <p><b>색별 응답 제한 {formatPace(Math.max(4000, value.paceMs * 4))}</b> · 생쥐 제시 속도에 맞춰 함께 조절됩니다.</p>}
      {gameId === 'count' && <p><b>판단 응답 제한 {formatPace(Math.max(2500, value.paceMs * 3))}</b> · 제시가 끝난 뒤 이 시간 안에 더 많았던 쪽을 선택합니다.</p>}
      {gameId === 'appointment' && <p><b>선택 응답 제한 {formatPace(Math.max(5000, value.paceMs * 2))}</b> · 세 사람의 정보 제시가 끝난 뒤 이 시간 안에 답을 선택합니다.</p>}
      <label className="rotation-preview-setting accessible-pacing-setting"><span><b>시간 제한 없이 연습</b><small>{gameId === 'nback' ? '도형을 충분히 확인하고 기억·응답을 마친 뒤 직접 다음 도형으로 이동합니다' : gameId === 'appointment' || gameId === 'count' || gameId === 'mouse' ? '제시·응답 제한시간을 끄고 내용을 다 들은 뒤 직접 이동합니다' : '문제 응답 제한시간을 끄고 준비가 끝났을 때 직접 제출합니다'}</small></span><input type="checkbox" checked={guidedPacing} onChange={(event) => onGuidedPacingChange(event.target.checked)} /><i aria-hidden="true" /></label>
      <p>정확한 최신 문항 수·노출시간은 공개되지 않아 조절값으로 제공합니다. 게임 구조와 조작은 2023 JOBDA 공개 레거시 해설을 기준으로 했습니다.</p>
    </section>
  );
}

function GlyphNameLegend({ names, onChange, showDuringPlay, onShowDuringPlayChange }: { names: string[]; onChange: (names: string[]) => void; showDuringPlay: boolean; onShowDuringPlayChange: (show: boolean) => void }) {
  function update(index: number, raw: string) {
    const value = normalizeGlyphMnemonic(raw, glyphDefaultMnemonics[index]);
    const next = [...names]; next[index] = value; onChange(next);
  }
  return (
    <section className="glyph-legend" aria-labelledby="glyph-legend-title">
      <header className="glyph-legend-head">
        <div><h3 id="glyph-legend-title">내 한 글자 이름표</h3><p>한 행이 한 묶음입니다. 도형 3개를 왼쪽부터 묶어서 외우세요.</p></div>
        <div className="glyph-legend-tools">
          <label className="glyph-visibility"><input type="checkbox" checked={showDuringPlay} onChange={(event) => onShowDuringPlayChange(event.target.checked)} /><i aria-hidden="true" /><span>연습 중 이름 표시</span></label>
          <button type="button" onClick={() => onChange([...glyphDefaultMnemonics])}>기본값 복원</button>
        </div>
      </header>
      <div className="glyph-set-list">
        {Array.from({ length: 5 }, (_, setIndex) => (
          <section className="glyph-set" role="group" aria-labelledby={`glyph-set-${setIndex + 1}`} key={setIndex}>
            <h4 id={`glyph-set-${setIndex + 1}`}><span>묶음</span><b>{setIndex + 1}</b></h4>
            <div className="glyph-set-grid">
              {names.slice(setIndex * 3, setIndex * 3 + 3).map((name, itemIndex) => {
                const index = setIndex * 3 + itemIndex;
                return (
                  <label className="glyph-card" key={index}>
                    <span className="glyph-order" aria-hidden="true">{itemIndex + 1}</span>
                    <span className="glyph-visual" aria-hidden="true"><CognitiveGlyph variant={index} size={48} color="#237b76" label={glyphShapeNames[index]} /></span>
                    <span className="glyph-card-copy"><small>{glyphShapeNames[index]}</small><span>암기명</span></span>
                    <input aria-label={`${setIndex + 1}행 ${itemIndex + 1}열 ${glyphShapeNames[index]} 암기명`} inputMode="text" maxLength={2} value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => update(index, event.target.value)} />
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="glyph-legend-note">긴 이름은 모양을 구분하기 위한 설명이며 공식 명칭이 아닙니다. 입력한 한 글자는 이 브라우저에 저장됩니다.</p>
    </section>
  );
}

function GameRouter({ gameId, glyphMnemonics, nbackPreferences, rotationPreferences, appointmentPreferences, onRotationPreviewChange, config, ...props }: GameProps & { gameId: GameId; glyphMnemonics: string[]; nbackPreferences: NBackPreferences; rotationPreferences: RotationPreferences; appointmentPreferences: AppointmentPreferences; onRotationPreviewChange: (showPreview: boolean) => void; config: PracticeConfig }) {
  if (gameId === 'rps') return <RpsGame {...props} config={config} />;
  if (gameId === 'rotation') return <RotationGame {...props} config={config} preferences={rotationPreferences} onPreviewChange={onRotationPreviewChange} />;
  if (gameId === 'appointment') return <AppointmentGame {...props} config={config} preferences={appointmentPreferences} />;
  if (gameId === 'path') return <PathGame {...props} config={config} />;
  if (gameId === 'potion') return <PotionGame {...props} config={config} />;
  if (gameId === 'nback') return <NBackGame {...props} config={config} glyphMnemonics={glyphMnemonics} preferences={nbackPreferences} />;
  if (gameId === 'number') return <NumberGame {...props} config={config} />;
  if (gameId === 'count') return <CountGame {...props} config={config} />;
  return <MouseGame {...props} config={config} />;
}

function GameFrame({ gameId, current, total, children, helper, simulationHelper, feedback, statusMessage, showFeedbackInSimulation = false, bodyFocusable = false, onClose, progressUnit, zeroLabel = '시작 전' }: { gameId: GameId; current: number; total: number; children: ReactNode; helper: string; simulationHelper?: string; feedback?: string; statusMessage?: string; showFeedbackInSimulation?: boolean; bodyFocusable?: boolean; onClose: () => void; progressUnit?: string; zeroLabel?: string }) {
  const game = getGame(gameId);
  const { mode } = useContext(SessionModeContext);
  const { openGameSwitcher, openFeedback } = useContext(StageActionsContext);
  const bodyRef = useRef<HTMLDivElement>(null);
  const unit = progressUnit ?? progressUnitForGame(gameId, mode);
  const visibleFeedback = mode === 'practice' || showFeedbackInSimulation ? feedback ?? '' : '';
  const feedbackTone = /^(정답|성공|경로 성공)/.test(visibleFeedback)
    ? 'is-success'
    : /^(오답|시간|20회|모양|물음표|정답은|모든|경로는|순서)/.test(visibleFeedback) ? 'is-error' : '';
  const liveDetail = visibleFeedback || statusMessage;
  const progressText = current === 0 ? `${total}${unit} 중 ${zeroLabel}` : `${total}${unit} 중 ${current}번째`;
  const liveMessage = `${progressText}${liveDetail ? `. ${liveDetail}` : ''}`;
  const footerHelper = mode === 'practice' ? helper : simulationHelper ?? '피드백 없이 고정 설정으로 진행 중';
  useLayoutEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [current, gameId]);
  return (
    <div className={`game-workspace game-${gameId}`} data-mode={mode} role="region" aria-labelledby={`${gameId}-workspace-title`} tabIndex={-1}>
      <header className="workspace-head">
        <div><p>{game.no} · {game.skill} <span className="mode-chip">{mode === 'practice' ? '연습' : '실전형 연습'}</span></p><h2 id={`${gameId}-workspace-title`}>{game.title}</h2></div>
        <div className="workspace-progress"><span>{current} / {total} {unit}</span><i role="progressbar" aria-label={`${unit} 진행률`} aria-valuemin={current === 0 ? 0 : 1} aria-valuemax={total} aria-valuenow={current} aria-valuetext={progressText}><b style={{ width: `${Math.round((current / total) * 100)}%` }} /></i></div>
        <div className="workspace-actions"><button type="button" data-game-shortcut-ignore className="workspace-switch" aria-label="게임 바꾸기" onClick={openGameSwitcher}>게임 바꾸기</button><button type="button" data-game-shortcut-ignore className="workspace-report" aria-label="문제 신고" onClick={openFeedback}>문제 신고</button><button data-game-shortcut-ignore className="session-close" aria-label={`${mode === 'practice' ? '연습' : '실전형 연습'} 닫기`} onClick={onClose}>×</button></div>
      </header>
      <div ref={bodyRef} className="workspace-body" tabIndex={bodyFocusable ? 0 : undefined} aria-label={bodyFocusable ? `${game.title} 문제와 응답 영역` : undefined}>{children}</div>
      <footer className="workspace-foot"><span>{footerHelper}</span><b className={feedbackTone}>{visibleFeedback}</b><span className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</span></footer>
    </div>
  );
}

function GamePreparation({ gameId, countdown, total, onClose }: { gameId: GameId; countdown: number; total: number; onClose: () => void }) {
  return (
    <GameFrame gameId={gameId} current={0} total={total} zeroLabel="시작 전" helper="화면과 조작 위치를 확인한 뒤 시작하세요." onClose={onClose}>
      <div className="game-preparation" role="timer" aria-live="polite" aria-label={`${countdown}초 뒤 ${getGame(gameId).title} 시작`}><span>READY</span><b>{countdown}</b><h3>{getGame(gameId).title}</h3><p>첫 문제는 카운트다운이 끝난 뒤 시작됩니다.</p></div>
    </GameFrame>
  );
}

function ResultView({ result, mode, storageNotice, onClose, onRestart, onOpenGuide, onReview }: { result: SessionResult; mode: SessionMode; storageNotice?: string; onClose: () => void; onRestart: () => void; onOpenGuide: () => void; onReview: () => void }) {
  const game = getGame(result.gameId);
  const visibilityPauses = typeof result.detail?.visibilityPauses === 'number' ? result.detail.visibilityPauses : 0;
  const trialCount = typeof result.detail?.trialCount === 'number' ? result.detail.trialCount : 0;
  const responseCount = typeof result.detail?.responseCount === 'number' ? result.detail.responseCount : result.medianRt ? trialCount : 0;
  const rotationDetail = result.gameId === 'rotation' ? [
    ['풀이 수', result.detail?.attemptCount ?? 0],
    ['조작 효율', result.detail?.clickEfficiency ?? '—'],
    ['평균 추가 단계', result.detail?.averageExtraClicks === '—' ? '—' : `${result.detail?.averageExtraClicks ?? 0}회`],
    ['알파벳 정확도', result.detail?.letterAccuracy ?? '—'],
    ['격자 정확도', result.detail?.tileAccuracy ?? '—'],
    ['취약 훈련군', result.detail?.weakestTransform ?? '—'],
    ['취약 세부 유형', result.detail?.weakestExactTransform ?? '—'],
  ] : [];
  const percentMetric = (value: unknown) => typeof value === 'number' ? `${value}%` : '—';
  const nbackDetail = result.gameId === 'nback' ? ([
    ['최고 연속 정답', result.detail?.bestStreak ?? 0],
    ['놓친 표적', result.detail?.misses ?? 0],
    ['시간 초과', result.detail?.omissions ?? 0],
    ['오경보', result.detail?.falseAlarms ?? 0],
    ['간격 혼동', result.detail?.wrongLag ?? 0],
    ['2-back 정확도', percentMetric(result.detail?.n2Accuracy)],
    ['2·3-back 정확도', percentMetric(result.detail?.n23Accuracy)],
    ['2번째 전 정확도', percentMetric(result.detail?.secondAccuracy)],
    ['3번째 전 정확도', percentMetric(result.detail?.thirdAccuracy)],
    ['다름 판단 정확도', percentMetric(result.detail?.neitherAccuracy)],
  ] as Array<[string, string | number]>).filter(([, value]) => value !== '—') : [];
  const potionDetail = result.gameId === 'potion' ? [
    ['누적 근거 일치율', result.detail?.evidenceDecisionRate ?? '—'],
    ['근거 판정 가능 시행', `${result.detail?.evidenceTrials ?? 0} / ${result.detail?.totalTrials ?? trialCount}`],
    ['실제 색 적중률(참고)', result.detail?.outcomeAccuracy ?? '—'],
    ['근거는 맞고 결과만 빗나감', result.detail?.stochasticMisses ?? 0],
    ['시간 초과', result.detail?.timeouts ?? 0],
  ] : [];
  const pathDetail = result.gameId === 'path' ? [
    ['경로 연결 완료', `${result.detail?.functionalCompleted ?? 0} / ${trialCount}`],
    ['수정 후 최대득점', result.detail?.correctedAfterRetry ?? 0],
    ['중간 오답 제출', result.detail?.attemptErrors ?? 0],
    ['전체 조작', result.detail?.clicks ?? 0],
  ] : [];
  const mouseDetail = result.gameId === 'mouse' ? [
    ['위치 판단 정확도', `${result.accuracy}%`],
    ['평균 확신도', result.detail?.averageConfidence === '—' ? '—' : `${result.detail?.averageConfidence ?? '—'} / 4`],
    ['확신 응답', `${result.detail?.confidenceResponses ?? 0} / ${trialCount}`],
    ['고확신 오답', result.review?.summary.errorCounts['mouse-overconfidence'] ?? 0],
  ] : [];
  const hasReview = hasReviewData(result.review);
  const hasActionableReview = Boolean(result.review?.attempts.some((attempt) => attempt.errorCodes.length > 0));
  const potionEvidenceTrials = typeof result.detail?.evidenceTrials === 'number' ? result.detail.evidenceTrials : 0;
  const potionEvidenceRate = typeof result.detail?.evidenceDecisionRate === 'string' ? Number.parseInt(result.detail.evidenceDecisionRate, 10) : 0;
  const potionUsesEvidenceScore = result.gameId === 'potion' && result.detail?.scoringVersion === 'potion-evidence-v1';
  const accuracyLabel = potionUsesEvidenceScore ? '근거 정렬률' : result.gameId === 'potion' ? '결과 적중률' : result.gameId === 'path' ? '첫 제출 최대득점률' : '정확도';
  const errorLabel = potionUsesEvidenceScore ? '근거 반대·무응답' : result.gameId === 'potion' ? '결과 미적중' : result.gameId === 'path' ? '최대득점 미달' : '오류';
  const responseTimeLabel = result.gameId === 'path' ? '경로 연결 중앙시간' : '중앙 반응';
  const coachTitle = hasActionableReview
    ? '틀린 이유가 보였어요. 지금 복습하면 더 빨리 익숙해집니다.'
    : result.gameId === 'potion' && potionEvidenceTrials === 0
      ? '아직 비교할 누적 근거가 적습니다. 관찰을 더 쌓아 보세요.'
      : result.gameId === 'potion' && potionEvidenceRate >= 85
        ? '실제 색과 별개로, 누적 근거에 맞춰 안정적으로 판단했습니다.'
    : result.accuracy >= 85
      ? '흐름을 안정적으로 마쳤어요. 같은 감각을 한 번 더 이어가 보세요.'
      : '한 세션을 끝낸 것부터 좋은 출발이에요. 다음에는 한 가지 기준만 더 선명하게 잡아보세요.';
  const coachCopy = hasActionableReview
    ? reviewAdvice[result.gameId]
    : result.gameId === 'potion'
      ? '확률적 결과 적중률보다 같은 조합의 누적 우세색과 판단이 일치했는지를 먼저 확인하세요.'
    : mode === 'practice'
      ? '같은 설정으로 다시 연습하거나, 준비됐다면 실전형 흐름으로 넘어가도 좋습니다.'
      : '문항별 기록을 확인한 뒤 필요한 유형만 연습 모드에서 짧게 반복해 보세요.';
  return (
    <section className="stage-result" role="region" aria-labelledby="result-title" tabIndex={-1}>
      <span className="result-check" aria-hidden="true">✓</span><p>{mode === 'practice' ? '연습 모드' : '실전형 연습'} 완료 · {game.no}</p><h2 id="result-title">{game.title} 결과</h2>
      <aside className="result-coach" aria-label="모리의 다음 연습 안내">
        <Image src="/assets/mori-coach-hero-v2-800.webp" alt="" width={800} height={700} sizes="(max-width: 620px) 62px, 82px" />
        <div><span>모리의 한 줄 코칭</span><b>{coachTitle}</b><p>{coachCopy}</p></div>
      </aside>
      <div className="result-metrics">
        <article><span>{accuracyLabel}</span><b>{potionUsesEvidenceScore && potionEvidenceTrials === 0 ? '—' : `${result.accuracy}%`}</b></article>
        <article><span>{responseTimeLabel}</span><b>{result.medianRt ? `${result.medianRt}ms` : '—'}</b></article>
        <article><span>일관성</span><b>{responseCount >= 2 ? `${result.stability}%` : '—'}</b></article>
        <article><span>{errorLabel}</span><b>{result.errors}</b></article>
      </div>
      {rotationDetail.length > 0 && <aside className="rotation-result-detail" aria-label="도형 회전 상세 결과"><b>도형 회전 상세</b><dl>{rotationDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>조작 효율은 정답 문제의 최소 단계 수를 회전·반전·지움·초기화에 실제 사용한 조작 수로 나눈 연습 지표입니다.</p></aside>}
      {nbackDetail.length > 0 && <aside className="rotation-result-detail nback-result-detail" aria-label="도형 순서 상세 결과"><b>도형 순서 상세</b><dl>{nbackDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>정확도는 선택한 기억 간격과 응답 유형별 채점 문항을 기준으로 계산합니다.</p></aside>}
      {potionDetail.length > 0 && <aside className="rotation-result-detail potion-result-detail" aria-label="마법약 판단 상세 결과"><b>판단 품질과 실제 결과를 분리했습니다</b><dl>{potionDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>낮은 확률의 결과가 나온 것은 판단 오류가 아닙니다. 복습에서는 선택 당시 누적 관찰과 일치했는지를 따로 확인합니다.</p></aside>}
      {pathDetail.length > 0 && <aside className="rotation-result-detail path-result-detail" aria-label="길 만들기 상세 결과"><b>첫 제출과 최종 해결을 분리했습니다</b><dl>{pathDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>첫 제출 최대득점률은 첫 확인에서 모든 차량이 도착하고 목표 울타리 수도 맞은 문제만 계산합니다. 연습에서 고쳐 푼 문제는 경로 연결 완료와 수정 후 최대득점에 따로 남깁니다.</p></aside>}
      {mouseDetail.length > 0 && <aside className="rotation-result-detail mouse-result-detail" aria-label="고양이 술래잡기 상세 결과"><b>판단과 확신을 함께 확인하세요</b><dl>{mouseDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>확신도가 높은 것 자체는 점수가 아닙니다. 고확신 오답이 있다면 복습에서 해당 위치 판단을 먼저 확인하세요.</p></aside>}
      {visibilityPauses > 0 && <aside className="result-storage-notice result-comparison-notice" role="status"><b>탭 이탈 {visibilityPauses}회 · 참고용 기록</b><p>다른 탭에 있던 시간은 제외했으며, 공정한 비교를 위해 이 결과는 동일 설정 최고 기록 계산에 포함하지 않습니다.</p></aside>}
      {storageNotice && <aside className="result-storage-notice" role="status"><b>기록 저장 안내</b><p>{storageNotice}</p></aside>}
      {hasActionableReview && <aside className="result-review"><b>이번 세션 복습 포인트</b><p>{reviewAdvice[result.gameId]}</p></aside>}
      <div className="result-actions"><button onClick={onRestart}>{mode === 'practice' ? '다시 연습' : '실전형으로 다시 하기'}</button>{hasReview && <button className="result-review-button" onClick={onReview}>문항별 복습</button>}<button className="result-guide" onClick={onOpenGuide}>공략 복습</button><button className="stage-start" onClick={onClose}>게임 목록 <span>→</span></button></div>
      <small>개인 연습 기록이며 실제 역량검사 점수나 채용 결과가 아닙니다.</small>
    </section>
  );
}

const rpsChoices = [
  { id: 'scissors', label: '가위', key: '←', image: RPS_ASSET_PATHS.scissors },
  { id: 'rock', label: '바위', key: '↓', image: RPS_ASSET_PATHS.rock },
  { id: 'paper', label: '보', key: '→', image: RPS_ASSET_PATHS.paper },
] as const;
const rpsChoiceLabels: Record<RpsChoice, string> = { scissors: '가위', rock: '바위', paper: '보' };
function RpsGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { mode } = useContext(SessionModeContext);
  const { rps: focus } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => buildRpsTrials(config.quantity, seed, focus), [config.quantity, focus, seed]);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const resolvedRef = useRef(false);
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const schedule = useManagedTimeout();
  const item = trials[round];

  function choose(choice: RpsChoice | null) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    setLocked(true);
    const ok = choice === item.answer;
    const rt = Math.round(responseClock.elapsed());
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = choice === null ? rts : [...rts, rt];
    const errorCodes = ok ? [] : choice === null ? ['timeout'] : choice === item.shown ? ['rps-tie'] : ['rps-loss'];
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: round,
      status: ok ? 'correct' : 'error',
      errorCodes,
      title: `${round + 1}번 · ${item.phase}`,
      prompt: `${item.unknown === 'player' ? '내 패' : '상대 패'}가 물음표, 보이는 패는 ${rpsChoiceLabels[item.shown]}`,
      expected: rpsChoiceLabels[item.answer],
      selected: choice === null ? '응답 없음' : rpsChoiceLabels[choice],
      explanation: ok ? '내가 이기는 관계를 완성했습니다.' : choice === null ? '제한시간 안에 응답하지 못했습니다.' : choice === item.shown ? '보이는 패와 같은 패를 골라 비기는 관계가 됐습니다.' : '선택한 패에서는 내가 지는 관계가 됐습니다.',
      rtMs: rt,
    }));
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    setFeedback(choice === null ? '시간 초과' : ok ? '정답' : '물음표 위치를 먼저 확인하세요.');
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('rps', nextCorrect, trials.length, nextRts, nextErrors, undefined, compactReviewPayload('rps', reviewAttemptsRef.current)));
      else {
        schedule(() => {
          resolvedRef.current = false;
          setRound(round + 1);
          setFeedback('');
          setLocked(false);
        }, ROUND_INPUT_SETTLE_MS);
      }
    }, mode === 'practice' ? 1000 : 420);
  }

  useLayoutEffect(() => {
    if (locked) return;
    resolvedRef.current = false;
    responseClock.restart();
  }, [locked, responseClock, round]);
  usePausableTimeout(() => choose(null), config.paceMs, !locked && !guidedPacing, round);

  useEffect(() => {
    if (locked || isPaused) return;
    const frame = window.requestAnimationFrame(() => firstChoiceRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, locked, round]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaused || event.repeat || shouldIgnoreGameShortcut(event)) return;
      if (['ArrowLeft','ArrowDown','ArrowRight'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft') choose('scissors');
      if (event.key === 'ArrowDown') choose('rock');
      if (event.key === 'ArrowRight') choose('paper');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = rpsChoices.find((choice) => choice.id === item.shown)!;
  const phaseNumber = item.phase === '내 패 찾기' ? 1 : item.phase === '상대 패 찾기' ? 2 : 3;
  const statusMessage = `${item.phase}. ${item.unknown === 'player' ? '내 패' : '상대 패'}가 물음표이고, 보이는 패는 ${shown.label}입니다. 내가 이기는 관계를 선택하세요.`;
  return (
    <GameFrame gameId="rps" current={round + 1} total={trials.length} helper="← 가위 · ↓ 바위 · → 보" feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      <div className="round-label"><span>단계 {phaseNumber} / 3</span><b>{item.phase}</b></div>
      {guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 준비되면 답을 선택하세요</p> : <DeadlineBar key={round} duration={config.paceMs} label="문제 제한시간" active={!locked} />}
      <div className="rps-board">
        <article><span>나</span>{item.unknown === 'player' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
        <div><b>VS</b><span>내가 이기는 관계</span></div>
        <article><span>상대</span>{item.unknown === 'opponent' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
      </div>
      <div className="rps-actions">{rpsChoices.map((choice, index) => <button ref={index === 0 ? firstChoiceRef : undefined} key={choice.id} disabled={locked} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose(choice.id); }}><Image src={choice.image} alt="" width={42} height={42} /><span>{choice.key}</span><b>{choice.label}</b></button>)}</div>
    </GameFrame>
  );
}

type RotationAttempt = {
  kind: RotationPuzzle['kind'];
  transformId: RotationTransformId;
  correct: boolean;
  used: number;
  edits: number;
  optimal: number;
  extra: number;
  rt: number;
  responded: boolean;
};
type RotationReview = RotationAttempt & { timedOut?: boolean; budgetExhausted?: boolean };
type RotationReplaySource = 'mine' | 'optimal';
const ROTATION_PHASE_MS = 180_000;

function RotationShape({ puzzle, matrix, label }: { puzzle: Pick<RotationPuzzle, 'kind' | 'letter' | 'pattern'>; matrix: RotationMatrix; label: string }) {
  return (
    <div className="rotation-shape-wrap" role="img" aria-label={label}>
      <div className={`rotation-shape ${puzzle.kind}`} style={{ transform: rotationCssMatrix(matrix) }} aria-hidden="true">
        {puzzle.kind === 'letter' ? <b>{puzzle.letter}</b> : <div className="rotation-tile-grid">{puzzle.pattern!.map((cell, index) => <i className={cell ? 'filled' : ''} key={index} />)}</div>}
      </div>
    </div>
  );
}

function rotationSequenceText(sequence: readonly RotationOpId[]) {
  return sequence.length ? sequence.map((id) => rotationOperation(id).short).join('  ') : '입력 없음';
}

function RotationProcessPreview({ puzzle, sequence, frames, currentStep, playing, source, canShowOptimal, reducedMotion, onStepChange, onPlayingChange, onSourceChange }: {
  puzzle: RotationPuzzle;
  sequence: readonly RotationOpId[];
  frames: readonly RotationMatrix[];
  currentStep: number;
  playing: boolean;
  source: RotationReplaySource;
  canShowOptimal: boolean;
  reducedMotion: boolean;
  onStepChange: (step: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSourceChange: (source: RotationReplaySource) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentCardRef = useRef<HTMLButtonElement | null>(null);
  const operation = currentStep > 0 ? rotationOperation(sequence[currentStep - 1]) : null;
  const status = sequence.length === 0
    ? '조작을 입력하면 단계별 변화가 여기에 쌓입니다.'
    : currentStep === 0
      ? `0 / ${sequence.length} · 시작 모양`
      : `${currentStep} / ${sequence.length} · ${operation?.label ?? '변환'} 적용`;

  useEffect(() => {
    const track = trackRef.current;
    const card = currentCardRef.current;
    if (!track || !card) return;
    const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left) });
  }, [currentStep, sequence.length]);

  function move(step: number) {
    onPlayingChange(false);
    onStepChange(Math.max(0, Math.min(step, sequence.length)));
  }

  return (
    <section className="rotation-process-preview" aria-labelledby="rotation-process-title">
      <header className="rotation-process-head">
        <div><b id="rotation-process-title">{canShowOptimal ? '풀이 과정 비교' : '내 입력 과정'}</b><small>{canShowOptimal ? '내 풀이와 채점 후 공개된 최소 조작 과정을 비교합니다.' : '정답은 공개하지 않고 현재 입력한 순서만 재생합니다.'}</small></div>
        {canShowOptimal && (
          <div className="rotation-replay-source" role="group" aria-label="재생할 풀이 선택">
            <button type="button" data-game-shortcut-ignore aria-pressed={source === 'mine'} onClick={() => onSourceChange('mine')}>내 풀이</button>
            <button type="button" data-game-shortcut-ignore aria-pressed={source === 'optimal'} onClick={() => onSourceChange('optimal')}>최소 조작</button>
          </div>
        )}
      </header>
      <div className="rotation-process-status" aria-live="polite" aria-atomic="true"><span>{source === 'optimal' ? '최소 과정' : '현재 풀이'}</span><b>{status}</b></div>
      <div className="rotation-process-controls" role="group" aria-label="과정 재생 조작">
        <button type="button" data-game-shortcut-ignore onClick={() => move(0)} disabled={currentStep === 0 || sequence.length === 0}><span aria-hidden="true">|‹</span><b>처음</b></button>
        <button type="button" data-game-shortcut-ignore onClick={() => move(currentStep - 1)} disabled={currentStep === 0 || sequence.length === 0}><span aria-hidden="true">‹</span><b>이전</b></button>
        <button type="button" data-game-shortcut-ignore className="is-play" aria-pressed={playing} title={reducedMotion ? '움직임 줄이기 설정에 따라 자동 재생을 끄며, 이전·다음 단계는 수동으로 확인할 수 있습니다.' : undefined} onClick={() => onPlayingChange(!playing)} disabled={sequence.length === 0 || reducedMotion}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span><b>{reducedMotion ? '재생 꺼짐' : playing ? '일시정지' : currentStep >= sequence.length ? '다시 재생' : '재생'}</b></button>
        <button type="button" data-game-shortcut-ignore onClick={() => move(currentStep + 1)} disabled={currentStep >= sequence.length}><span aria-hidden="true">›</span><b>다음</b></button>
        <button type="button" data-game-shortcut-ignore onClick={() => move(sequence.length)} disabled={currentStep >= sequence.length}><span aria-hidden="true">›|</span><b>끝</b></button>
      </div>
      <div ref={trackRef} className="rotation-process-track" tabIndex={0} aria-label="시작부터 8단계까지의 도형 변화. 가로로 스크롤할 수 있습니다.">
        <ol>
          {Array.from({ length: 9 }, (_, index) => {
            const available = index <= sequence.length;
            const active = index === currentStep;
            const stepOperation = index > 0 && available ? rotationOperation(sequence[index - 1]) : null;
            return (
              <li key={index}>
                <button
                  type="button"
                  data-game-shortcut-ignore
                  ref={active ? currentCardRef : undefined}
                  className={active ? 'is-current' : ''}
                  aria-current={active ? 'step' : undefined}
                  aria-label={available ? index === 0 ? '시작 모양 보기' : `${index}단계 ${stepOperation?.label} 적용 모양 보기` : `${index}단계 비어 있음`}
                  disabled={!available}
                  onClick={() => move(index)}
                >
                  <span>{index === 0 ? '시작' : `${index}단계`}</span>
                  {available ? <RotationShape puzzle={puzzle} matrix={frames[index]} label={index === 0 ? '과정 시작 모양' : `${index}단계 누적 변환 모양`} /> : <i aria-hidden="true">{index}</i>}
                  <small>{index === 0 ? '원본' : stepOperation ? `${stepOperation.short} ${stepOperation.label.replace(' 45°', '')}` : '대기'}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="rotation-process-note">과정 재생은 조작 20회에 포함되지 않지만 문제 제한시간은 계속 흐릅니다.</p>
    </section>
  );
}

function RotationGame({ onFinish, onClose, config, preferences, onPreviewChange }: GameProps & { config: PracticeConfig; preferences: RotationPreferences; onPreviewChange: (showPreview: boolean) => void }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const [seed] = useState(newSessionSeed);
  const [simulationPhase, setSimulationPhase] = useState<'letters' | 'tiles'>('letters');
  const contentMode = mode === 'simulation' ? simulationPhase : preferences.contentMode;
  const selectedLetters = mode === 'simulation' ? ROTATION_LETTERS : preferences.selectedLetters;
  const selectedTransforms = mode === 'simulation' ? ROTATION_TRANSFORM_IDS : preferences.selectedTransforms;
  const puzzleCount = mode === 'simulation' ? 120 : config.quantity;
  const puzzles = useMemo(
    () => buildRotationPuzzles(puzzleCount, seed + (simulationPhase === 'tiles' ? 73_001 : 0), contentMode, selectedLetters, selectedTransforms),
    [contentMode, puzzleCount, seed, selectedLetters, selectedTransforms, simulationPhase],
  );
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<RotationOpId[]>([]);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [previewSource, setPreviewSource] = useState<RotationReplaySource>('mine');
  const [clicks, setClicks] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [review, setReview] = useState<RotationReview | null>(null);
  const [locked, setLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const resolvedRef = useRef(false);
  const finishedRef = useRef(false);
  const attemptsRef = useRef<RotationAttempt[]>([]);
  const reviewAttemptsRef = useRef<RotationReviewAttempt[]>([]);
  const sequenceRef = useRef<RotationOpId[]>([]);
  const clicksRef = useRef(0);
  const eventTraceRef = useRef<RotationReviewEvent[]>([]);
  const previewUsedRef = useRef(mode === 'practice' && preferences.showPreview);
  const nextRoundRef = useRef<HTMLButtonElement>(null);
  const puzzle = puzzles[round % puzzles.length];
  const puzzleId = puzzle.id;
  const puzzleOptimalLength = puzzle.optimal.length;
  const puzzleRef = useRef(puzzle);
  const roundRef = useRef(round);
  const remaining = Math.max(0, 20 - clicks);
  const processPreviewEnabled = mode === 'practice' && (preferences.showPreview || Boolean(review));
  const replaySequence = review && previewSource === 'optimal' ? puzzle.optimal : sequence;
  const replayFrames = useMemo(() => rotationSequenceFrames(replaySequence), [replaySequence]);
  const boundedPreviewStep = Math.min(previewStep, replaySequence.length);
  const previewMatrix = processPreviewEnabled ? replayFrames[boundedPreviewStep] : IDENTITY_MATRIX;

  function resultFromAttempts() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const attempts = attemptsRef.current;
    const correctAttempts = attempts.filter((attempt) => attempt.correct);
    const letters = attempts.filter((attempt) => attempt.kind === 'letter');
    const tiles = attempts.filter((attempt) => attempt.kind === 'tiles');
    const optimalTotal = correctAttempts.reduce((sum, attempt) => sum + attempt.optimal, 0);
    const editTotal = correctAttempts.reduce((sum, attempt) => sum + attempt.edits, 0);
    const averageExtra = correctAttempts.length ? correctAttempts.reduce((sum, attempt) => sum + attempt.extra, 0) / correctAttempts.length : 0;
    const typeAccuracy = (items: RotationAttempt[]) => items.length ? Math.round((items.filter((item) => item.correct).length / items.length) * 100) : '—';
    const transformStats = rotationTransformGroups.flatMap((group) => {
      const items = attempts.filter((attempt) => rotationTransformDefinition(attempt.transformId).groupId === group.id);
      return items.length ? [{ label: group.label, attempts: items.length, accuracy: Number(typeAccuracy(items)) }] : [];
    }).sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts);
    const weakestTransform = transformStats[0];
    const exactTransformStats = rotationTransformDefinitions.flatMap((definition) => {
      const items = attempts.filter((attempt) => attempt.transformId === definition.id);
      return items.length ? [{ label: definition.label, attempts: items.length, accuracy: Number(typeAccuracy(items)) }] : [];
    }).sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts);
    const weakestExactTransform = exactTransformStats[0];
    onFinish(resultFor('rotation', correctAttempts.length, attempts.length, attempts.filter((attempt) => attempt.responded).map((attempt) => attempt.rt), attempts.length - correctAttempts.length, {
      attemptCount: attempts.length,
      clickEfficiency: editTotal ? `${Math.round((optimalTotal / editTotal) * 100)}%` : '—',
      averageExtraClicks: correctAttempts.length ? averageExtra.toFixed(1) : '—',
      letterAccuracy: typeof typeAccuracy(letters) === 'number' ? `${typeAccuracy(letters)}%` : '—',
      tileAccuracy: typeof typeAccuracy(tiles) === 'number' ? `${typeAccuracy(tiles)}%` : '—',
      weakestTransform: weakestTransform ? `${weakestTransform.label} ${weakestTransform.accuracy}% (${weakestTransform.attempts}문제)` : '—',
      weakestExactTransform: weakestExactTransform ? `${weakestExactTransform.label} ${weakestExactTransform.accuracy}% (${weakestExactTransform.attempts}문제)` : '—',
      ...(mode === 'practice' ? { previewUsed: previewUsedRef.current ? '사용' : '숨김' } : {}),
    }, compactReviewPayload('rotation', reviewAttemptsRef.current)));
  }

  function clearRoundState() {
    setSequence([]);
    sequenceRef.current = [];
    setPreviewStep(0);
    setPreviewPlaying(false);
    setPreviewSource('mine');
    setClicks(0);
    clicksRef.current = 0;
    eventTraceRef.current = [];
    setFeedback('');
    setAnnouncement('');
    setReview(null);
    setLocked(false);
  }

  function advanceRound() {
    if (mode === 'practice' && round >= puzzles.length - 1) { resultFromAttempts(); return; }
    clearRoundState();
    setRound((value) => value + 1);
  }

  function createRotationEvent(action: RotationReviewAction, nextSequence: readonly RotationOpId[], chargedClicks: number): RotationReviewEvent {
    const currentPuzzle = puzzleRef.current;
    const correction = shortestRotationCorrection(currentPuzzle, matrixForRotationSequence(nextSequence), currentPuzzle.target);
    const eventIndex = eventTraceRef.current.length;
    return {
      index: eventIndex,
      action,
      elapsedMs: Math.round(responseClock.elapsed()),
      chargedClicks,
      remainingOptimal: correction.length,
      inefficient: action !== 'start' && chargedClicks + correction.length > currentPuzzle.optimal.length,
    };
  }

  function appendRotationEvent(action: RotationReviewAction, nextSequence = sequenceRef.current, chargedClicks = clicksRef.current) {
    const event = createRotationEvent(action, nextSequence, chargedClicks);
    eventTraceRef.current = [...eventTraceRef.current, event];
    return event;
  }

  function recordAttempt(ok: boolean, timedOut = false, usedOverride?: number, editsOverride?: number, includeInScore = true, phaseEnded = false) {
    if (resolvedRef.current) return null;
    resolvedRef.current = true;
    const currentPuzzle = puzzleRef.current;
    const currentRound = roundRef.current;
    const reviewIndex = reviewAttemptsRef.current.length;
    const finalSequence = [...sequenceRef.current];
    const used = usedOverride ?? finalSequence.length;
    const optimal = currentPuzzle.optimal.length;
    const attempt: RotationAttempt = {
      kind: currentPuzzle.kind,
      transformId: currentPuzzle.transformId,
      correct: ok,
      used,
      edits: editsOverride ?? clicksRef.current,
      optimal,
      extra: ok ? Math.max(0, used - optimal) : 0,
      rt: phaseEnded
        ? Math.round(responseClock.elapsed())
        : timedOut ? (mode === 'simulation' ? ROTATION_PHASE_MS : config.paceMs) : Math.round(responseClock.elapsed()),
      responded: !timedOut,
    };
    if (includeInScore) attemptsRef.current.push(attempt);
    const correction = shortestRotationCorrection(currentPuzzle, matrixForRotationSequence(finalSequence), currentPuzzle.target);
    const errorCodes: string[] = [];
    // 실전형 구간 끝의 마지막 문제는 노출 시간에 따라 채점 여부를 나눈다.
    // 방금 열린 문제는 복습 문맥만 남기고, 충분히 노출된 미응답은 시간 초과로 집계한다.
    const terminalAction = eventTraceRef.current.at(-1)?.action;
    if (phaseEnded && includeInScore) errorCodes.push('timeout');
    if (!phaseEnded) {
      if (timedOut) errorCodes.push('timeout');
      if (terminalAction === 'budget') errorCodes.push('rotation-budget');
      if (!ok && !timedOut && terminalAction !== 'budget') {
        const hasRotation = correction.some((operation) => operation === 'left' || operation === 'right');
        const hasReflection = correction.some((operation) => operation === 'flip-x' || operation === 'flip-y');
        errorCodes.push(hasRotation && hasReflection ? 'rotation-mixed' : hasReflection ? 'rotation-reflection' : 'rotation-angle');
      }
      if (ok && used > optimal) errorCodes.push('rotation-redundant');
      if (eventTraceRef.current.some((event) => event.action === 'undo' || event.action === 'reset')) errorCodes.push('rotation-editing');
    }
    const status = phaseEnded ? includeInScore ? 'error' : 'neutral' : ok ? errorCodes.length ? 'neutral' : 'correct' : 'error';
    const explanation = phaseEnded
      ? includeInScore
        ? `구간 종료까지 ${ROTATION_PHASE_END_MIN_EXPOSURE_MS / 1000}초 이상 노출되었지만 제출되지 않아 시간 초과로 집계했습니다. 당시 모양에서 목표까지 최소 ${correction.length}회 보정이 남아 있었습니다.`
        : `구간 종료 직전에 열려 충분히 노출되지 않은 마지막 문제입니다. 복습 문맥만 남기고 점수에서는 제외했습니다.`
      : timedOut
      ? `시간 종료 시점의 모양에서 목표까지 최소 ${correction.length}회 보정이 필요했습니다.`
      : terminalAction === 'budget'
        ? `20회 조작을 사용한 시점의 모양에서 목표까지 최소 ${correction.length}회 보정이 필요했습니다.`
        : ok && errorCodes.includes('rotation-redundant')
          ? `모양은 맞았지만 최소 조작 예시보다 ${used - optimal}단계 더 사용했습니다.`
          : ok
            ? '목표 모양을 최소 조작 수로 완성했습니다.'
            : `최종 모양에서 목표까지 가능한 최소 보정 예시는 ${rotationSequenceText(correction)}입니다.`;
    reviewAttemptsRef.current.push({
      kind: 'rotation',
      id: `rotation-${simulationPhase}-${currentRound}`,
      index: reviewIndex,
      status,
      errorCodes: [...new Set(errorCodes)],
      title: `${currentPuzzle.kind === 'letter' ? '알파벳' : '4×4 격자'} ${currentRound + 1}번 · ${rotationTransformGroup(rotationTransformDefinition(currentPuzzle.transformId).groupId).label}`,
      prompt: `${currentPuzzle.kind === 'letter' ? `알파벳 ${currentPuzzle.letter}` : '4×4 격자 도형'} · ${rotationTransformDefinition(currentPuzzle.transformId).label}`,
      expected: `최소 조작 예시 ${rotationSequenceText(currentPuzzle.optimal)}`,
      selected: rotationSequenceText(finalSequence),
      explanation,
      rtMs: attempt.rt,
      ...(phaseEnded ? includeInScore ? { phaseEnded: true } : { phaseEnded: true, scored: false as const } : {}),
      puzzle: {
        kind: currentPuzzle.kind,
        baseId: currentPuzzle.baseId,
        transformId: currentPuzzle.transformId,
        ...(currentPuzzle.letter ? { letter: currentPuzzle.letter } : {}),
        ...(currentPuzzle.pattern ? { pattern: [...currentPuzzle.pattern] } : {}),
        target: [...currentPuzzle.target] as RotationMatrix,
        optimal: [...currentPuzzle.optimal],
      },
      submitted: finalSequence,
      correction,
      events: eventTraceRef.current.map((event) => ({ ...event })),
      firstInefficientEvent: eventTraceRef.current.find((event) => event.inefficient)?.index ?? null,
    });
    return attempt;
  }

  function resolveAnswer(ok: boolean, timedOut = false, options?: { used?: number; edits?: number; budgetExhausted?: boolean }) {
    const terminalAction: RotationReviewAction = options?.budgetExhausted ? 'budget' : timedOut ? 'timeout' : 'submit';
    if (eventTraceRef.current.at(-1)?.action !== terminalAction) appendRotationEvent(terminalAction);
    const attempt = recordAttempt(ok, timedOut, options?.used, options?.edits);
    if (!attempt) return;
    setPreviewPlaying(false);
    if (mode === 'simulation') { advanceRound(); return; }
    setLocked(true);
    const message = options?.budgetExhausted
      ? '20회 조작을 모두 사용해 빈 답안이 되었습니다. 최소 조작 순서를 확인하세요.'
      : timedOut
      ? '시간이 끝났습니다. 최소 조작 순서를 확인하세요.'
      : ok && attempt.extra === 0
        ? `정답 · 최소 ${attempt.optimal}회로 해결했습니다.`
        : ok
          ? `정답 · 최소보다 ${attempt.extra}회 더 사용했습니다.`
          : '모양이 다릅니다. 기준점과 반전 방향을 다시 확인하세요.';
    setFeedback(message);
    setPreviewSource('optimal');
    setPreviewStep(0);
    setReview({ ...attempt, timedOut, budgetExhausted: options?.budgetExhausted });
  }

  useLayoutEffect(() => {
    puzzleRef.current = puzzle;
  }, [puzzle]);

  useLayoutEffect(() => {
    roundRef.current = round;
    responseClock.restart();
    // 이전 문제의 제출과 구간 타이머가 같은 순간 겹쳐도, 새 문제가 실제 렌더된 뒤에만 다시 미해결 상태가 된다.
    resolvedRef.current = false;
    sequenceRef.current = [];
    clicksRef.current = 0;
    eventTraceRef.current = [{ index: 0, action: 'start', elapsedMs: 0, chargedClicks: 0, remainingOptimal: puzzleOptimalLength, inefficient: false }];
  }, [mode, puzzleId, puzzleOptimalLength, responseClock, round, simulationPhase]);
  usePausableTimeout(() => resolveAnswer(false, true), config.paceMs, mode === 'practice' && !locked && !guidedPacing, `practice-${round}-${puzzle.id}`);

  usePausableTimeout(() => {
      if (!resolvedRef.current) {
        appendRotationEvent('timeout');
        const includeInScore = shouldScoreRotationPhaseEnd(responseClock.elapsed());
        recordAttempt(false, true, undefined, undefined, includeInScore, true);
      }
      if (simulationPhase === 'letters') {
        setSimulationPhase('tiles');
        setRound(0);
        clearRoundState();
      } else resultFromAttempts();
  }, ROTATION_PHASE_MS, mode === 'simulation', `simulation-${simulationPhase}`);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => {
      const reduced = query.matches || document.documentElement.dataset.motion === 'reduce';
      setReducedMotion(reduced);
      if (reduced) setPreviewPlaying(false);
    };
    const update = () => applyPreference();
    const preferenceObserver = new MutationObserver(applyPreference);
    const frame = window.requestAnimationFrame(applyPreference);
    query.addEventListener('change', update);
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      window.cancelAnimationFrame(frame);
      query.removeEventListener('change', update);
      preferenceObserver.disconnect();
    };
  }, []);

  usePausableTimeout(() => {
    const nextStep = boundedPreviewStep + 1;
    setPreviewStep(nextStep);
    if (nextStep >= replaySequence.length) setPreviewPlaying(false);
  }, 700, !reducedMotion && previewPlaying && processPreviewEnabled && boundedPreviewStep < replaySequence.length, `replay-${previewSource}-${boundedPreviewStep}-${replaySequence.length}`);

  useEffect(() => {
    if (!review || isPaused) return;
    const frame = window.requestAnimationFrame(() => nextRoundRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, review]);

  function addOperation(id: RotationOpId) {
    const currentSequence = sequenceRef.current;
    const currentClicks = clicksRef.current;
    if (locked || resolvedRef.current || currentClicks >= 20 || currentSequence.length >= 8) return;
    const nextSequence = [...currentSequence, id];
    const nextLength = nextSequence.length;
    const nextClicks = currentClicks + 1;
    sequenceRef.current = nextSequence;
    clicksRef.current = nextClicks;
    appendRotationEvent(id, nextSequence, nextClicks);
    setSequence(nextSequence);
    setPreviewSource('mine');
    setPreviewStep(nextLength);
    setPreviewPlaying(false);
    setClicks(nextClicks);
    setAnnouncement(`${rotationOperation(id).label} 추가, ${nextLength}단계 입력, ${20 - nextClicks}회 남음${nextLength === 8 ? '. 입력 8칸이 모두 찼습니다. 한 단계를 지우거나 제출하세요.' : ''}`);
  }
  function undoOperation() {
    const currentSequence = sequenceRef.current;
    const currentClicks = clicksRef.current;
    if (!currentSequence.length || locked || resolvedRef.current || currentClicks >= 20) return;
    const nextSequence = currentSequence.slice(0, -1);
    const nextClicks = currentClicks + 1;
    sequenceRef.current = nextSequence;
    clicksRef.current = nextClicks;
    appendRotationEvent('undo', nextSequence, nextClicks);
    setSequence(nextSequence);
    setPreviewSource('mine');
    setPreviewStep(nextSequence.length);
    setPreviewPlaying(false);
    setClicks(nextClicks);
    setAnnouncement(`마지막 조작 삭제, ${nextSequence.length}단계 입력, ${20 - nextClicks}회 남음`);
    if (nextClicks === 20 && nextSequence.length === 0) resolveAnswer(false, false, { used: 0, edits: nextClicks, budgetExhausted: true });
  }
  function resetOperations() {
    const currentSequence = sequenceRef.current;
    const currentClicks = clicksRef.current;
    if (!currentSequence.length || locked || resolvedRef.current || currentClicks >= 20) return;
    const nextClicks = currentClicks + 1;
    sequenceRef.current = [];
    clicksRef.current = nextClicks;
    appendRotationEvent('reset', [], nextClicks);
    setSequence([]);
    setPreviewSource('mine');
    setPreviewStep(0);
    setPreviewPlaying(false);
    setClicks(nextClicks);
    setAnnouncement(`전체 입력 초기화, ${20 - nextClicks}회 남음`);
    if (nextClicks === 20) resolveAnswer(false, false, { used: 0, edits: nextClicks, budgetExhausted: true });
  }
  function submit() {
    if (!sequenceRef.current.length || locked || resolvedRef.current) return;
    resolveAnswer(rotationShapeMatches(puzzle, sequenceRef.current));
  }

  const onRotationKey = useEffectEvent((event: KeyboardEvent) => {
    if (isPaused || event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-game-shortcut-ignore]')) return;
    if (target?.closest('button')) return;
    if (event.key === 'Enter' && target?.closest('.session-close, a, input, textarea, select')) return;
    const operation = rotationOperations.find((item) => item.key === event.key);
    if (operation) { event.preventDefault(); addOperation(operation.id); return; }
    if (event.key === 'Backspace') { event.preventDefault(); undoOperation(); return; }
    if (event.key === 'Delete') { event.preventDefault(); resetOperations(); return; }
    if (event.key === 'Enter') { event.preventDefault(); if (review) advanceRound(); else submit(); }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onRotationKey(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentPhase = simulationPhase === 'letters' ? '알파벳' : '4×4 격자 도형';
  const sequenceStatus = `${sequence.length}/8단계 · ${remaining}/20회 남음`;
  function changePreviewSource(source: RotationReplaySource) {
    setPreviewSource(source);
    setPreviewStep(0);
    setPreviewPlaying(false);
  }
  function changePreviewPlaying(playing: boolean) {
    if (!playing) { setPreviewPlaying(false); return; }
    if (reducedMotion) return;
    if (!replaySequence.length) return;
    if (boundedPreviewStep >= replaySequence.length) setPreviewStep(0);
    setPreviewPlaying(true);
  }
  function toggleProcessPreview() {
    const next = !preferences.showPreview;
    if (next) previewUsedRef.current = true;
    setPreviewPlaying(false);
    setPreviewSource('mine');
    setPreviewStep(next ? sequence.length : 0);
    onPreviewChange(next);
    setAnnouncement(next ? '단계별 과정 예시를 켰습니다.' : '단계별 과정 예시를 숨겼습니다. 제출 후 최소 풀이 예시는 계속 표시됩니다.');
  }
  const accessibleRotationStatus = announcement || `${mode === 'simulation' ? currentPhase : `${round + 1}번 문제`} 시작. ${puzzle.kind === 'letter' ? `알파벳 ${puzzle.letter}` : '4×4 격자 도형'}, 목표 방향은 ${rotationMatrixDescription(puzzle.target)}`;
  return (
    <GameFrame gameId="rotation" current={mode === 'simulation' ? (simulationPhase === 'letters' ? 1 : 2) : round + 1} total={mode === 'simulation' ? 2 : puzzles.length} helper="1·2 회전 · 3·4 반전 · Backspace 지움 · Delete 초기화 · Enter 제출" feedback={feedback} statusMessage={accessibleRotationStatus} onClose={onClose}>
      <div className="rotation-stage-layout">
        {mode === 'simulation' ? <div className="rotation-phase-banner"><span>실전형 단계 {simulationPhase === 'letters' ? '1' : '2'} / 2</span><b>{currentPhase}</b><small>3분 훈련 구간 · 문항별 20회는 앱 자체 한도</small></div> : <div className="rotation-practice-banner"><b>{puzzle.kind === 'letter' ? '알파벳' : '4×4 격자 도형'}</b>{review ? <span className="rotation-review-preview-label">제출 후 최소 풀이 예시</span> : <button type="button" data-game-shortcut-ignore aria-pressed={preferences.showPreview} onClick={(event) => { toggleProcessPreview(); restoreGameShortcutFocus(event.currentTarget); }}><span>조작 과정 예시</span><b>{preferences.showPreview ? '켜짐' : '꺼짐'}</b></button>}<small>비대칭 특징 2곳 → 45° 눈금 → 거울상</small></div>}
      {!review && (guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 조작을 확인한 뒤 직접 제출하세요</p> : <DeadlineBar key={mode === 'simulation' ? simulationPhase : round} duration={mode === 'simulation' ? ROTATION_PHASE_MS : config.paceMs} label={mode === 'simulation' ? `${currentPhase} 단계 남은 시간` : '문제 제한시간'} />)}
      <div className="rotation-comparison">
        <article className={processPreviewEnabled ? 'is-preview' : ''}><span>{processPreviewEnabled ? `${previewSource === 'optimal' ? '최소 과정' : '현재 풀이'} · ${boundedPreviewStep}/${replaySequence.length}` : '시작'}</span><RotationShape puzzle={puzzle} matrix={previewMatrix} label={`${processPreviewEnabled ? `${boundedPreviewStep}단계 누적 조작이 반영된` : '시작'} ${puzzle.kind === 'letter' ? `알파벳 ${puzzle.letter}` : '4×4 격자 도형'}. 현재 방향은 ${rotationMatrixDescription(previewMatrix)}`} /></article>
        <b aria-hidden="true">→</b>
        <article><span>목표</span><RotationShape puzzle={puzzle} matrix={puzzle.target} label={`목표 ${puzzle.kind === 'letter' ? `알파벳 ${puzzle.letter}` : '4×4 격자 도형'}. 목표 방향은 ${rotationMatrixDescription(puzzle.target)}`} /></article>
      </div>
      <div className="rotation-controls">
        <div className="rotation-control-head"><div><b>변환 선택</b><small>최대 8단계 · 앱 훈련값은 문항마다 조작 20회</small></div><span className={remaining <= 5 ? 'is-low' : ''}>{sequenceStatus}</span></div>
        <div className="rotation-op-grid">{rotationOperations.map((operation) => <button type="button" key={operation.id} disabled={locked || remaining === 0 || sequence.length >= 8} onClick={(event) => { addOperation(operation.id); restoreGameShortcutFocus(event.currentTarget); }} aria-label={`${operation.key}번 ${operation.label}`}><kbd>{operation.key}</kbd><b aria-hidden="true">{operation.short}</b><span>{operation.label}</span></button>)}</div>
        {processPreviewEnabled ? (
          <RotationProcessPreview
            puzzle={puzzle}
            sequence={replaySequence}
            frames={replayFrames}
            currentStep={boundedPreviewStep}
            playing={previewPlaying}
            source={previewSource}
            canShowOptimal={Boolean(review)}
            reducedMotion={reducedMotion}
            onStepChange={setPreviewStep}
            onPlayingChange={changePreviewPlaying}
            onSourceChange={changePreviewSource}
          />
        ) : <div className="operation-sequence"><span>입력 순서</span><ol aria-label="입력한 변환 순서">{Array.from({ length: 8 }, (_, index) => <li className={sequence[index] ? 'filled' : ''} key={index}><span>{index + 1}</span><b>{sequence[index] ? rotationOperation(sequence[index]).short : ''}</b><small>{sequence[index] ? rotationOperation(sequence[index]).label.replace(' 45°', '') : '비어 있음'}</small></li>)}</ol></div>}
        <div className="rotation-click-meter" role="progressbar" aria-label="남은 조작 기회" aria-valuemin={0} aria-valuemax={20} aria-valuenow={remaining} aria-valuetext={`20회 중 ${remaining}회 남음`}><i style={{ width: `${remaining * 5}%` }} /></div>
        <div className="rotation-submit-row"><span>남은 조작 <b>{remaining}</b><small>/ 20</small></span><button type="button" onClick={(event) => { undoOperation(); restoreGameShortcutFocus(event.currentTarget); }} disabled={!sequence.length || locked || remaining <= 0}>하나 지움 <kbd>⌫</kbd></button><button type="button" onClick={(event) => { resetOperations(); restoreGameShortcutFocus(event.currentTarget); }} disabled={!sequence.length || locked || remaining <= 0}>전체 초기화 <kbd>Del</kbd></button><button type="button" className="primary-submit" onClick={submit} disabled={!sequence.length || locked}>답안 제출 <kbd>Enter</kbd></button></div>
      </div>
      {review && (
        <section className={`rotation-review ${review.correct ? 'is-correct' : 'is-wrong'}`} aria-label="문제 풀이 결과">
          <header><div><span>{review.correct ? '정답' : review.timedOut ? '시간 초과' : review.budgetExhausted ? '조작 소진' : '오답'}</span><b>{review.correct ? `모양 일치 · 최소보다 +${review.extra}회` : '목표 모양과 불일치'}</b></div><dl><div><dt>최소</dt><dd>{review.optimal}회</dd></div><div><dt>최종 단계</dt><dd>{review.used}회</dd></div><div><dt>편집 조작</dt><dd>{review.edits}회</dd></div></dl></header>
          <div className="rotation-answer-compare"><div><span>내 입력</span><b>{rotationSequenceText(sequence)}</b></div><div><span>최소 조작 예시</span><b>{rotationSequenceText(puzzle.optimal)}</b></div></div>
          <button ref={nextRoundRef} type="button" className="primary-submit" onClick={advanceRound}>{round >= puzzles.length - 1 ? '결과 보기' : '다음 문제'} <span>→</span></button>
        </section>
      )}
      </div>
    </GameFrame>
  );
}

const personNames = ['친구 1', '친구 2', '친구 3'];
const foodSpritePosition = new Map<string, { column: number; row: number }>(APPOINTMENT_FOODS.map((food, index) => [food, { column: index % 6, row: Math.floor(index / 6) }]));

function FoodStimulus({ value }: { value: string }) {
  const position = foodSpritePosition.get(value) ?? { column: 0, row: 0 };
  const style = { '--food-x': `${(position.column / 5) * 100}%`, '--food-y': `${(position.row / 3) * 100}%` } as CSSProperties;
  return <span className="food-sprite" style={style} aria-hidden="true" />;
}

function BusStimulus({ value }: { value: string }) {
  return <span className="bus-stimulus" aria-hidden="true"><i className="bus-window" /><i className="bus-door" /><b>{value}</b><i className="bus-wheel bus-wheel-left" /><i className="bus-wheel bus-wheel-right" /></span>;
}

function PersonMemory({ trial, person }: { trial: AppointmentTrial; person: number }) {
  const values = trial.people[person];
  if (trial.kind === 'location') return <div className="location-memory" role="img" aria-label={`선호 위치 ${values.join(', ')}`}>{APPOINTMENT_LOCATIONS.map((id, index) => <i aria-hidden="true" className={values.includes(id) ? 'selected' : ''} key={id}><span>{Math.floor(index / 4) + 1}행 {(index % 4) + 1}열</span></i>)}</div>;
  if (trial.kind === 'food') return <div className="food-memory" role="img" aria-label={`선호 메뉴 ${values.join(', ')}`}>{values.map((value) => <span className="food-card" key={value}><FoodStimulus value={value} /><b>{value}</b></span>)}</div>;
  if (trial.kind === 'bus') return <div className="bus-memory" role="img" aria-label={`탑승 버스 ${values.join(', ')}번`}>{values.map((value) => <span className="bus-card" key={value}><BusStimulus value={value} /><b>{value}번</b></span>)}</div>;
  return <div className="day-memory" role="img" aria-label={`가능한 요일 ${values.join(', ')}`}>{APPOINTMENT_WEEKDAYS.map((value) => <span className={values.includes(value) ? 'selected' : ''} key={value}><small>{value}</small><b aria-hidden="true">{values.includes(value) ? '✓' : ''}</b></span>)}</div>;
}

function AppointmentRoundRail({ currentRound, selectedRounds }: { currentRound: number; selectedRounds: readonly AppointmentKind[] }) {
  return (
    <ol className="appointment-round-rail" aria-label={`현재 ${currentRound}라운드`}>
      {APPOINTMENT_ROUNDS.map((round) => {
        const selected = selectedRounds.includes(round.kind);
        const stateClass = round.number === currentRound ? 'is-current' : selected && round.number < currentRound ? 'is-done' : '';
        return <li className={`${stateClass} ${selected ? 'is-selected' : 'is-skipped'}`.trim()} key={round.kind}><span>{round.number}</span><b>{round.shortLabel}</b></li>;
      })}
    </ol>
  );
}

function AppointmentChoices({ trial, locked, showNumberShortcuts, onChoose }: { trial: AppointmentTrial; locked: boolean; showNumberShortcuts: boolean; onChoose: (value: string) => void }) {
  function moveLocationFocus(event: ReactKeyboardEvent<HTMLFieldSetElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const current = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('button') : null;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = current ? buttons.indexOf(current) : -1;
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -4 : 4;
    const next = index + delta;
    if (next < 0 || next >= buttons.length || (Math.abs(delta) === 1 && Math.floor(next / 4) !== Math.floor(index / 4))) return;
    buttons[next].focus();
  }
  if (trial.kind === 'location') return <fieldset className="appointment-choice-grid location-choice-grid" onKeyDown={moveLocationFocus}><legend className="sr-only">세 사람에게 공통된 위치 선택. 방향키로 격자를 이동하고 Enter로 선택합니다.</legend>{trial.choices.map((value, index) => <button type="button" disabled={locked} aria-label={`${Math.floor(index / 4) + 1}행 ${(index % 4) + 1}열`} onClick={() => onChoose(value)} key={value}><span aria-hidden="true" /></button>)}</fieldset>;
  return (
    <fieldset className={`appointment-choice-grid ${trial.kind}-choice-grid`}>
      <legend className="sr-only">{trial.title}</legend>
      {trial.choices.map((value, index) => <button type="button" disabled={locked} onClick={() => onChoose(value)} key={value}>{showNumberShortcuts && <small>{index + 1}</small>}{trial.kind === 'food' && <FoodStimulus value={value} />}{trial.kind === 'bus' && <BusStimulus value={value} />}<b>{trial.kind === 'bus' ? `${value}번` : value}</b></button>)}
    </fieldset>
  );
}

function AppointmentGame({ onFinish, onClose, config, preferences }: GameProps & { config: PracticeConfig; preferences: AppointmentPreferences }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const [seed] = useState(newSessionSeed);
  const selectedRounds = mode === 'simulation' ? APPOINTMENT_KIND_ORDER : preferences.selectedRounds;
  const questionsPerRound = mode === 'simulation' ? APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND : config.quantity;
  const trials = useMemo(() => buildAppointmentTrials(questionsPerRound, seed, selectedRounds), [questionsPerRound, seed, selectedRounds]);
  const [trialIndex, setTrialIndex] = useState(0);
  const [person, setPerson] = useState(0);
  const [phase, setPhase] = useState<'roundIntro' | 'stimulus' | 'answer'>('roundIntro');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const [presentationAdvanceLocked, setPresentationAdvanceLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const answerResolvedRef = useRef(false);
  const personAdvanceRef = useRef('');
  const presentationAdvanceLockRef = useRef(false);
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const phaseContainerRef = useRef<HTMLDivElement>(null);
  const schedule = useManagedTimeout();
  const trial = trials[trialIndex];
  const presentationMs = mode === 'simulation' ? APPOINTMENT_SIMULATION_PERSON_MS : config.paceMs;
  const answerLimit = mode === 'simulation' ? APPOINTMENT_SIMULATION_ANSWER_MS : Math.max(5000, config.paceMs * 2);

  function beginRound() {
    personAdvanceRef.current = '';
    presentationAdvanceLockRef.current = false;
    setPerson(0);
    setFeedback('');
    setLocked(false);
    setPresentationAdvanceLocked(false);
    setPhase('stimulus');
  }

  function nextPerson() {
    if (phase !== 'stimulus' || locked || presentationAdvanceLockRef.current) return;
    const transitionKey = `${trialIndex}-${person}`;
    if (personAdvanceRef.current === transitionKey) return;
    personAdvanceRef.current = transitionKey;
    presentationAdvanceLockRef.current = true;
    setPresentationAdvanceLocked(true);
    schedule(() => {
      presentationAdvanceLockRef.current = false;
      setPresentationAdvanceLocked(false);
    }, PRESENTATION_ADVANCE_LOCK_MS);
    if (person < 2) setPerson((value) => value + 1);
    else {
      answerResolvedRef.current = false;
      responseClock.restart();
      setPhase('answer');
    }
  }

  usePausableTimeout(beginRound, 1600, phase === 'roundIntro' && mode === 'simulation', `round-${trialIndex}`);
  usePausableTimeout(nextPerson, presentationMs, phase === 'stimulus' && !locked && !guidedPacing, `person-${trialIndex}-${person}`);
  useEffect(() => {
    if (phase !== 'answer') return;
    answerResolvedRef.current = false;
  }, [phase, trialIndex]);
  usePausableTimeout(() => choose(null), answerLimit, phase === 'answer' && !locked && !guidedPacing, `answer-${trialIndex}`);

  useEffect(() => {
    if (isPaused) return;
    const frame = window.requestAnimationFrame(() => {
      resetWorkspaceScroll(phaseContainerRef.current);
      const selector = phase === 'answer'
        ? '.appointment-choice-grid button:not(:disabled)'
        : mode === 'practice'
          ? '.single-action'
          : 'section[tabindex="-1"]';
      phaseContainerRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, mode, person, phase, trialIndex]);

  function choose(value: string | null) {
    if (phase !== 'answer' || locked || answerResolvedRef.current) return;
    answerResolvedRef.current = true;
    setLocked(true);
    const ok = value === trial.answer;
    const rt = Math.round(responseClock.elapsed());
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = value === null ? rts : [...rts, rt];
    const errorCodes = ok ? [] : value === null ? ['timeout'] : trial.kind === 'bus' && trial.people.flat().includes(value) ? ['appointment-seen-bus'] : ['appointment-not-common'];
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: trialIndex,
      status: ok ? 'correct' : 'error',
      errorCodes,
      title: `${trial.round}라운드 ${trial.questionInRound}번 · ${trial.kind === 'bus' ? 'NOT' : 'AND'}`,
      prompt: trial.title,
      expected: trial.answer,
      selected: value ?? '응답 없음',
      explanation: ok ? '세 사람의 조건을 정확히 적용했습니다.' : value === null ? '응답 제한시간이 끝났습니다.' : trial.kind === 'bus' ? `선택한 ${value}번은 제시 정보에 등장했습니다.` : `선택한 ${value}은(는) 세 사람 모두에게 공통되지 않습니다.`,
      rtMs: rt,
      facts: {
        라운드: `${trial.round} · ${trial.roundLabel}`,
        유형: trial.kind === 'bus' ? '아무도 이용하지 않은 항목' : '세 사람 공통 항목',
        첫번째사람: trial.people[0],
        두번째사람: trial.people[1],
        세번째사람: trial.people[2],
        선택지: trial.choices,
      },
    }));
    setCorrect(nextCorrect);
    setErrors(nextErrors);
    setRts(nextRts);
    setFeedback(value === null ? '시간 초과' : ok ? '정답' : `정답은 ${trial.answer}`);
    schedule(() => {
      if (trialIndex === trials.length - 1) {
        onFinish(resultFor('appointment', nextCorrect, trials.length, nextRts, nextErrors, { completedRounds: selectedRounds.length }, compactReviewPayload('appointment', reviewAttemptsRef.current)));
        return;
      }
      const nextIndex = trialIndex + 1;
      const roundChanged = trials[nextIndex].kind !== trial.kind;
      answerResolvedRef.current = false;
      setTrialIndex(nextIndex);
      setPerson(0);
      setPhase(roundChanged ? 'roundIntro' : 'stimulus');
      setFeedback('');
      setLocked(false);
    }, mode === 'practice' ? 900 : 300);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaused || mode !== 'practice' || event.repeat || shouldIgnoreGameShortcut(event) || phase !== 'answer' || trial.kind === 'location') return;
      const choiceIndex = Number(event.key) - 1;
      if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= trial.choices.length) return;
      event.preventDefault();
      choose(trial.choices[choiceIndex]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const helper = mode === 'simulation'
    ? `${trial.round}라운드 · ${trial.title}`
    : `${trial.kind === 'bus' ? '본 번호를 누적해 선택지에서 제외하세요.' : '첫 두 사람의 교집합만 남겨 셋째와 비교하세요.'}${trial.kind === 'location' ? ' 위치는 마우스로 선택합니다.' : ' 숫자키로도 응답할 수 있습니다.'}`;
  const appointmentItemLabel = (value: string) => {
    if (trial.kind === 'location') {
      const index = APPOINTMENT_LOCATIONS.indexOf(value);
      return index >= 0 ? `${Math.floor(index / 4) + 1}행 ${(index % 4) + 1}열` : value;
    }
    if (trial.kind === 'day') return `${value}요일`;
    if (trial.kind === 'bus') return `${value}번`;
    return value;
  };
  const statusMessage = phase === 'roundIntro'
    ? `${trial.round}라운드 준비`
    : phase === 'stimulus'
      ? `${personNames[person]} 정보. ${trial.people[person].map(appointmentItemLabel).join(', ')}`
      : `정답 선택 중. ${trial.title}`;

  return (
    <GameFrame gameId="appointment" current={trialIndex + 1} total={trials.length} helper={helper} feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      <div className="appointment-shell" ref={phaseContainerRef}>
        <AppointmentRoundRail currentRound={trial.round} selectedRounds={selectedRounds} />
        {phase === 'roundIntro' && <section className="appointment-round-intro" tabIndex={-1} aria-labelledby="appointment-round-title"><span>ROUND {trial.round} / 4</span><h3 id="appointment-round-title">{trial.roundLabel}</h3><p>{trial.title}</p><div><b>{trial.kind === 'bus' ? '제외 규칙' : '공통 규칙'}</b><small>{trial.kind === 'bus' ? '세 사람에게 한 번도 나오지 않은 번호' : '첫 사람 → 둘째 → 셋째의 교집합'}</small></div>{mode === 'practice' ? <button type="button" className="single-action" onClick={beginRound}>이 라운드 시작 <i>→</i></button> : <p className="auto-next">잠시 후 자동으로 시작합니다.</p>}</section>}
        {phase === 'stimulus' && <section className="appointment-stimulus" tabIndex={-1}>{guidedPacing ? <p className="guided-pacing-note" role="status">음성 안내 직접 진행 중 · 제한시간 없음</p> : <DeadlineBar key={`${trialIndex}-${person}`} duration={presentationMs} label={`${personNames[person]} 정보 제시시간`} />}<div className="appointment-phase-meta"><span>{personNames[person]}</span><b>{person + 1} / 3</b><small>{trial.questionInRound} / {trial.questionsInRound}문항</small></div><h3>{trial.kind === 'bus' ? '이 친구가 이용한 버스를 기억하세요' : '이 친구가 고른 항목을 기억하세요'}</h3><PersonMemory trial={trial} person={person} />{mode === 'practice' ? <button type="button" className="single-action" aria-disabled={presentationAdvanceLocked} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; nextPerson(); }}>{guidedPacing ? '내용을 들었어요 · ' : ''}{person < 2 ? '다음 친구' : '질문 보기'} <i>→</i></button> : <p className="auto-next">제시시간이 끝나면 자동으로 이동합니다.</p>}</section>}
        {phase === 'answer' && <section className="appointment-question" tabIndex={-1}>{guidedPacing ? <p className="guided-pacing-note" role="status">음성 안내 직접 진행 중 · 응답 제한시간 없음</p> : <DeadlineBar key={`${trialIndex}-answer`} duration={answerLimit} label="응답 제한시간" />}<div className="appointment-phase-meta"><span>{trial.kind === 'bus' ? '한 번도 안 나온 것' : '세 사람의 공통 항목'}</span><b>QUESTION</b><small>{trial.questionInRound} / {trial.questionsInRound}문항</small></div><h3>{trial.title}</h3><AppointmentChoices trial={trial} locked={locked} showNumberShortcuts={mode === 'practice'} onChoose={choose} /></section>}
      </div>
    </GameFrame>
  );
}

function EdgeMarker({ side, index, vehicles }: { side: Side; index: number; vehicles: Vehicle[] }) {
  const start = vehicles.find((vehicle) => vehicle.start.side === side && vehicle.start.index === index);
  const goal = vehicles.find((vehicle) => vehicle.goal.side === side && vehicle.goal.index === index);
  return <div className="edge-marker">{start && <span className="vehicle" style={{ '--marker': start.color } as CSSProperties}>{start.icon}<b>{start.id}</b></span>}{goal && <span className="passenger" style={{ '--marker': goal.color } as CSSProperties}>●<b>{goal.id}</b></span>}</div>;
}

const edgeSideLabel: Record<Side, string> = { top: '위쪽', right: '오른쪽', bottom: '아래쪽', left: '왼쪽' };
function pathVehicleSummary(vehicle: Vehicle) {
  return `${vehicle.id} 차량은 ${edgeSideLabel[vehicle.start.side]} ${vehicle.start.index + 1}번에서 출발해 ${edgeSideLabel[vehicle.goal.side]} ${vehicle.goal.index + 1}번으로 이동`;
}

function PathGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { path: focus } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const puzzles = useMemo(() => buildPathPuzzles(config.quantity, seed, focus), [config.quantity, focus, seed]);
  const [round, setRound] = useState(0);
  const [fences, setFences] = useState<Record<string, Fence>>({});
  const [clicks, setClicks] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pathGridFocus, setPathGridFocus] = useState<{ index: number; orientation: Fence }>({ index: 0, orientation: 'slash' });
  const responseClock = useActiveElapsedClock();
  const resolvedRef = useRef(false);
  const hadErrorRef = useRef(false);
  const functionalReachedRef = useRef(false);
  const functionalRtRef = useRef<number | null>(null);
  const interactionClicksRef = useRef(0);
  const fencesRef = useRef<Record<string, Fence>>({});
  const roundClicksRef = useRef(0);
  const scoreRef = useRef(createPathSessionScore());
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const pathGridRef = useRef<HTMLDivElement>(null);
  const schedule = useManagedTimeout();
  const puzzle = puzzles[round];
  const puzzleMeta = pathPuzzleMeta(puzzle);

  function recordPathReview(success: boolean, errorCode: string | null, selected: string, explanation: string) {
    const placedFences = Object.entries(fencesRef.current).sort(([left], [right]) => left.localeCompare(right)).map(([cell, fence]) => `${cell} ${fence === 'slash' ? '/' : '\\'}`);
    const answerExample = Object.entries(puzzle.correct).sort(([left], [right]) => left.localeCompare(right)).map(([cell, fence]) => `${cell} ${fence === 'slash' ? '/' : '\\'}`);
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: reviewAttemptsRef.current.length,
      status: success ? 'correct' : 'error',
      errorCodes: errorCode ? [errorCode] : [],
      title: `${round + 1}번 · ${reviewAttemptsRef.current.filter((attempt) => attempt.title.startsWith(`${round + 1}번`)).length + 1}차 확인`,
      prompt: `${puzzle.vehicles.map(pathVehicleSummary).join(' · ')} · 목표 울타리 ${puzzle.target}개`,
      expected: `모든 차량 목표 도착 · 울타리 ${puzzle.target}개`,
      selected,
      explanation,
      rtMs: Math.round(responseClock.elapsed()),
      facts: {
        울타리수: Object.keys(fencesRef.current).length,
        조작수: roundClicksRef.current,
        내배치: placedFences.length ? placedFences : ['배치 없음'],
        정답배치예시: answerExample,
        차량조건: puzzle.vehicles.map(pathVehicleSummary),
      },
    }));
  }

  function advanceRound(success: boolean, message: string, review?: { errorCode: string | null; selected: string; explanation: string }) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    setLocked(true); setFeedback(message);
    if (review) recordPathReview(success, review.errorCode, review.selected, review.explanation);
    const responseTime = Math.round(responseClock.elapsed());
    scoreRef.current = finalizePathTrialScore(scoreRef.current, {
      success,
      hadError: hadErrorRef.current,
      functionalReached: functionalReachedRef.current || review?.errorCode === 'path-fence-count',
      functionalRtMs: functionalRtRef.current,
      responseTimeMs: responseTime,
      clicks: interactionClicksRef.current,
    });
    schedule(() => {
      if (round === puzzles.length - 1) {
        const score = scoreRef.current;
        onFinish(resultFor('path', score.correct, puzzles.length, score.rts, score.errors, { clicks: score.clicks, attemptErrors: score.attemptErrors, functionalCompleted: score.functionalCompleted, correctedAfterRetry: score.correctedAfterRetry }, compactReviewPayload('path', reviewAttemptsRef.current)));
      } else { resolvedRef.current = false; hadErrorRef.current = false; functionalReachedRef.current = false; functionalRtRef.current = null; fencesRef.current = {}; roundClicksRef.current = 0; setRound((value) => value + 1); setFences({}); setClicks(0); setFeedback(''); setChecking(false); setLocked(false); }
    }, mode === 'practice' ? 1000 : 550);
  }

  useLayoutEffect(() => {
    resolvedRef.current = false;
    responseClock.restart();
  }, [responseClock, round]);
  useEffect(() => {
    if (locked || isPaused) return;
    const frame = window.requestAnimationFrame(() => {
      const choice = pathGridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${pathGridFocus.index}"][data-orientation="${pathGridFocus.orientation}"]`);
      const cycle = pathGridRef.current?.querySelector<HTMLButtonElement>(`[data-cycle-cell="${pathGridFocus.index}"]`);
      (choice && choice.offsetParent !== null ? choice : cycle)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, locked, pathGridFocus.index, pathGridFocus.orientation, round]);
  usePausableTimeout(() => advanceRound(false, '시간 초과 · 다음 문제로 이동합니다.', { errorCode: 'timeout', selected: `울타리 ${Object.keys(fencesRef.current).length}개 배치`, explanation: '제한시간 안에 경로 확인을 완료하지 못했습니다.' }), config.paceMs, !locked && !guidedPacing, round);

  function commitCellFence(row: number, col: number, value: Fence | null) {
    if (isPaused || locked) return;
    const key = `${row}-${col}`;
    const next = { ...fencesRef.current };
    if (value) next[key] = value; else delete next[key];
    fencesRef.current = next;
    setFences(next);
    const nextClicks = roundClicksRef.current + 1;
    setClicks(nextClicks);
    roundClicksRef.current = nextClicks;
    interactionClicksRef.current += 1;
  }

  function toggleCellFence(row: number, col: number, orientation: Fence) {
    const key = `${row}-${col}`;
    commitCellFence(row, col, nextFenceValue(fencesRef.current[key], orientation) ?? null);
  }

  function cycleCellFence(row: number, col: number) {
    const current = fencesRef.current[`${row}-${col}`];
    commitCellFence(row, col, current === 'slash' ? 'backslash' : current === 'backslash' ? null : 'slash');
  }
  function submit() {
    if (isPaused || locked || checking) return;
    setChecking(true);
    const currentFences = fencesRef.current;
    const count = Object.keys(currentFences).length;
    const routes = puzzle.vehicles.map((vehicle) => ({ vehicle, exit: simulatePath(vehicle.start, currentFences) }));
    const routesOk = routes.every(({ vehicle, exit }) => exit?.side === vehicle.goal.side && exit.index === vehicle.goal.index);
    const routeSummary = routes.map(({ vehicle, exit }) => `${vehicle.id}→${exit ? `${edgeSideLabel[exit.side]} ${exit.index + 1}번` : '경로 반복·중단'}`).join(' · ');
    if (!routesOk) {
      const review = { errorCode: 'path-route', selected: `${routeSummary} · 울타리 ${count}개`, explanation: '한 개 이상의 차량이 지정된 목표와 다른 위치에 도착했습니다.' };
      if (mode === 'simulation') { advanceRound(false, '', review); return; }
      hadErrorRef.current = true;
      scoreRef.current.attemptErrors += 1;
      recordPathReview(false, review.errorCode, review.selected, review.explanation);
      setFeedback('모든 교통수단의 도착 위치를 다시 확인하세요.');
      schedule(() => setChecking(false), 180);
      return;
    }
    if (!functionalReachedRef.current) {
      functionalReachedRef.current = true;
      functionalRtRef.current = Math.round(responseClock.elapsed());
    }
    const maximumScore = count === puzzle.target;
    const usesExtraFences = count > puzzle.target;
    const review = {
      errorCode: maximumScore ? null : 'path-fence-count',
      selected: `${routeSummary} · 울타리 ${count}개`,
      explanation: maximumScore ? '모든 차량의 도착 위치와 울타리 수 조건이 일치했습니다.' : usesExtraFences ? `경로 연결에는 성공했지만 목표 ${puzzle.target}개보다 ${count - puzzle.target}개 많아 공개 레거시 규칙의 감점 조건입니다.` : `경로는 연결됐지만 울타리 수가 목표 ${puzzle.target}개와 달랐습니다.`,
    };
    if (!maximumScore) {
      if (mode === 'simulation') { advanceRound(false, usesExtraFences ? '경로 성공 · 울타리 초과로 감점' : '경로 성공 · 목표 울타리 수 미달', review); return; }
      hadErrorRef.current = true;
      scoreRef.current.attemptErrors += 1;
      recordPathReview(false, review.errorCode, review.selected, review.explanation);
      setFeedback(usesExtraFences ? `경로는 맞지만 울타리 초과는 감점 조건입니다. ${puzzle.target}개로 줄여 최대득점을 완성하세요.` : `경로는 맞습니다. 울타리를 ${puzzle.target}개로 조정한 뒤 다시 확인하세요.`);
      schedule(() => setChecking(false), 180);
      return;
    }
    advanceRound(true, '경로 성공 · 정답 울타리 수 일치', review);
  }

  function resetPath() {
    if (locked) return;
    fencesRef.current = {};
    setFences({});
    const nextClicks = roundClicksRef.current + 1;
    roundClicksRef.current = nextClicks;
    interactionClicksRef.current += 1;
    setClicks(nextClicks);
    setFeedback('배치를 초기화했습니다. 누적 조작 기록은 유지됩니다.');
  }

  function navigatePathGrid(event: React.KeyboardEvent<HTMLButtonElement>, index: number, orientation: Fence) {
    let nextIndex = index;
    let nextOrientation = orientation;
    if (event.key === '/' || event.code === 'Slash') nextOrientation = 'slash';
    else if (event.key === '\\' || event.code === 'Backslash') nextOrientation = 'backslash';
    else if (event.key === 'Home') nextIndex = event.ctrlKey ? 0 : index - (index % 5);
    else if (event.key === 'End') nextIndex = event.ctrlKey ? 24 : index + (4 - (index % 5));
    else {
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      nextIndex = index + move;
      if (nextIndex < 0 || nextIndex >= 25 || (event.key === 'ArrowLeft' && index % 5 === 0) || (event.key === 'ArrowRight' && index % 5 === 4)) return;
    }
    event.preventDefault();
    setPathGridFocus({ index: nextIndex, orientation: nextOrientation });
    const grid = event.currentTarget.closest('.path-grid');
    window.requestAnimationFrame(() => grid?.querySelector<HTMLButtonElement>(`[data-cell="${nextIndex}"][data-orientation="${nextOrientation}"]`)?.focus());
  }

  function navigatePathCycleGrid(event: React.KeyboardEvent<HTMLButtonElement>, index: number, row: number, col: number) {
    if (event.key === '/' || event.code === 'Slash') {
      event.preventDefault();
      toggleCellFence(row, col, 'slash');
      return;
    }
    if (event.key === '\\' || event.code === 'Backslash') {
      event.preventDefault();
      toggleCellFence(row, col, 'backslash');
      return;
    }
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = event.ctrlKey ? 0 : index - (index % 5);
    else if (event.key === 'End') nextIndex = event.ctrlKey ? 24 : index + (4 - (index % 5));
    else {
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
      const move = moves[event.key];
      if (!move) return;
      nextIndex = index + move;
      if (nextIndex < 0 || nextIndex >= 25 || (event.key === 'ArrowLeft' && index % 5 === 0) || (event.key === 'ArrowRight' && index % 5 === 4)) {
        event.preventDefault();
        return;
      }
    }
    event.preventDefault();
    setPathGridFocus({ index: nextIndex, orientation: 'slash' });
    const grid = event.currentTarget.closest('.path-grid');
    window.requestAnimationFrame(() => grid?.querySelector<HTMLButtonElement>(`[data-cycle-cell="${nextIndex}"]`)?.focus());
  }

  const interactionLabel = puzzleMeta.interaction === 'base' ? '기본형' : puzzleMeta.interaction === 'shared' ? '공유형' : '우회형';
  const comparison = puzzle.target === puzzleMeta.baseFenceCount ? '=' : puzzle.target < puzzleMeta.baseFenceCount ? '<' : '>';
  const pairLabel = [puzzleMeta.crossingCount ? `교차 ${puzzleMeta.crossingCount}쌍` : '', puzzleMeta.parallelCount ? `평행 ${puzzleMeta.parallelCount}쌍` : ''].filter(Boolean).join(' · ');
  const statusMessage = `${puzzle.vehicles.map(pathVehicleSummary).join('. ')}. 목표 울타리 ${puzzle.target}개.`;

  return (
    <GameFrame gameId="path" current={round + 1} total={puzzles.length} helper="넓은 화면에서는 / 또는 \\ 방향을 직접 선택하고, 작은 화면에서는 칸 전체를 눌러 없음 → / → \\ 순서로 바꿉니다." feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      {guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 경로를 완성한 뒤 직접 확인하세요</p> : <DeadlineBar key={round} duration={config.paceMs} label="문제 제한시간" />}
      <section className="path-control-panel" aria-label="길 만들기 풀이 상태와 제출">
        <header><span>PUZZLE CONTROL</span><b>울타리 계획</b><p>같은 색의 차량과 손님을 연결한 뒤, 목표 울타리 수에 맞춰 확인하세요.</p></header>
        <div className="path-toolbar"><span>현재 조작 기록 <b>{clicks}</b></span><span>정답 울타리 수 <b>{puzzle.target}</b></span>{mode === 'practice' && <span className={`path-type-chip ${puzzleMeta.interaction}`}><b>{interactionLabel}</b> T {puzzle.target} {comparison} B {puzzleMeta.baseFenceCount}<small>{pairLabel}{puzzleMeta.orderHint === 'parallel-first' ? ' · 평행 먼저' : ''}</small></span>}<button disabled={locked} onClick={resetPath}>전체 초기화</button></div>
        <button className="path-submit primary-submit" disabled={locked || checking} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; submit(); }}>{checking ? '경로 확인 중…' : '경로 확인'}</button>
      </section>
      <p className="sr-only">{puzzle.vehicles.map(pathVehicleSummary).join('. ')}</p>
      <p id="path-keyboard-help" className="sr-only">Tab 키로 격자에 한 번 진입한 뒤 방향키로 칸을 이동합니다. 슬래시 키와 백슬래시 키로 울타리 방향을 바꾸고 Enter 또는 Space로 선택합니다. Home과 End는 행의 처음과 끝, Control Home과 Control End는 격자의 처음과 끝으로 이동합니다.</p>
      <div className="path-shell">
        <div className="edge-row top">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="top" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="edge-column left">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="left" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div ref={pathGridRef} className="path-grid" role="group" aria-label="울타리 배치 격자" aria-describedby="path-keyboard-help">{Array.from({ length: 25 }, (_, index) => {
          const row = Math.floor(index / 5);
          const col = index % 5;
          const fence = fences[`${row}-${col}`];
          const currentLabel = fence === 'slash' ? '/ 울타리' : fence === 'backslash' ? '\\ 울타리' : '울타리 없음';
          return <div className="path-cell" data-fence={fence ?? 'empty'} role="group" aria-label={`${row + 1}행 ${col + 1}열, 현재 ${currentLabel}`} key={index}>
            <button type="button" className="path-fence-choice is-slash" data-cell={index} data-orientation="slash" aria-label={`${row + 1}행 ${col + 1}열 / 울타리 ${fence === 'slash' ? '제거' : '선택'}`} aria-pressed={fence === 'slash'} tabIndex={pathGridFocus.index === index && pathGridFocus.orientation === 'slash' ? 0 : -1} disabled={locked} onFocus={() => setPathGridFocus({ index, orientation: 'slash' })} onKeyDown={(event) => navigatePathGrid(event, index, 'slash')} onClick={() => toggleCellFence(row, col, 'slash')}><span aria-hidden="true">/</span></button>
            <button type="button" className="path-fence-choice is-backslash" data-cell={index} data-orientation="backslash" aria-label={`${row + 1}행 ${col + 1}열 \\ 울타리 ${fence === 'backslash' ? '제거' : '선택'}`} aria-pressed={fence === 'backslash'} tabIndex={pathGridFocus.index === index && pathGridFocus.orientation === 'backslash' ? 0 : -1} disabled={locked} onFocus={() => setPathGridFocus({ index, orientation: 'backslash' })} onKeyDown={(event) => navigatePathGrid(event, index, 'backslash')} onClick={() => toggleCellFence(row, col, 'backslash')}><span aria-hidden="true">\\</span></button>
            <button type="button" className="path-fence-cycle" data-cycle-cell={index} aria-label={`${row + 1}행 ${col + 1}열, 현재 ${currentLabel}. 누르면 다음 상태로 변경`} tabIndex={pathGridFocus.index === index ? 0 : -1} disabled={locked} onFocus={() => setPathGridFocus({ index, orientation: 'slash' })} onKeyDown={(event) => navigatePathCycleGrid(event, index, row, col)} onClick={() => cycleCellFence(row, col)}><span aria-hidden="true">{fence === 'slash' ? '/' : fence === 'backslash' ? '\\' : '+'}</span></button>
            <i className={`path-fence-line ${fence ?? ''}`} aria-hidden="true" />
          </div>;
        })}</div>
        <div className="edge-column right">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="right" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="edge-row bottom">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="bottom" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
      </div>
    </GameFrame>
  );
}

function PotionGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { potion: preferences } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const comboSizes = useMemo<readonly PotionComboSize[]>(() => preferences.comboSize === 'all' ? [1, 2, 3] : [preferences.comboSize], [preferences.comboSize]);
  const recipeCount = POTION_RECIPE_COMBOS.filter((combo) => comboSizes.includes(combo.length as PotionComboSize)).length;
  const trials = useMemo(() => buildPotionTrials(config.quantity, seed, comboSizes), [comboSizes, config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [history, setHistory] = useState<Record<string, { red: number; blue: number }>>({});
  const [feedback, setFeedback] = useState('');
  const [selectedPrediction, setSelectedPrediction] = useState<'red' | 'blue' | null>(null);
  const [locked, setLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const resolvedRef = useRef(false);
  const evidenceScoreRef = useRef({ aligned: 0, total: 0, stochasticMisses: 0, timeouts: 0, evidenceTimeouts: 0 });
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const key = trial.combo.join('-');
  const observed = history[key] ?? { red: 0, blue: 0 };
  useLayoutEffect(() => {
    if (locked) return;
    resolvedRef.current = false;
    responseClock.restart();
  }, [locked, responseClock, round]);
  usePausableTimeout(() => choose(null), config.paceMs, !locked && !guidedPacing, round);

  useEffect(() => {
    if (locked || isPaused) return;
    const frame = window.requestAnimationFrame(() => firstChoiceRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, locked, round]);

  function choose(prediction: 'red' | 'blue' | null) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    setLocked(true);
    setSelectedPrediction(prediction);
    const ok = prediction === trial.outcome;
    const evidenceDecision = evaluatePotionEvidenceDecision(observed, prediction, trial.outcome);
    const evidencePreferred = evidenceDecision.preferred;
    const evidenceAligned = evidenceDecision.aligned;
    const rt = Math.round(responseClock.elapsed());
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = prediction === null ? rts : [...rts, rt];
    const outcomeWasVisible = mode === 'practice' || prediction !== null;
    const nextHistory = recordVisiblePotionOutcome(history, key, trial.outcome, outcomeWasVisible);
    if (evidenceDecision.opportunity) {
      evidenceScoreRef.current.total += 1;
      if (evidenceAligned === true) evidenceScoreRef.current.aligned += 1;
      if (evidenceDecision.stochasticMiss) evidenceScoreRef.current.stochasticMisses += 1;
      if (evidenceDecision.evidenceTimeout) evidenceScoreRef.current.evidenceTimeouts += 1;
    }
    if (prediction === null) evidenceScoreRef.current.timeouts += 1;
    const status = prediction === null ? 'error' : evidenceAligned === null ? 'neutral' : evidenceAligned ? 'correct' : 'error';
    const errorCodes = prediction === null ? ['timeout'] : evidenceAligned === false ? ['potion-evidence-opposed'] : [];
    const observedText = `파랑 ${observed.blue}회 · 빨강 ${observed.red}회`;
    const explanation = prediction === null
      ? mode === 'simulation'
        ? '응답 제한시간이 끝나 실제 결과를 공개하지 않았고, 이후 판단의 누적 근거에도 포함하지 않았습니다.'
        : '응답 제한시간이 끝났지만 실제 결과를 공개하고 새 관찰값으로 기록했습니다.'
      : evidencePreferred === null
        ? `선택 당시 ${observedText}로 우세색을 정할 근거가 없었습니다. 이번 결과는 다음 판단의 근거가 됩니다.`
        : evidenceAligned && ok
          ? `누적 우세색과 실제 결과가 모두 ${evidencePreferred === 'blue' ? '파랑' : '빨강'}이었습니다.`
          : evidenceAligned
            ? `누적 근거에는 맞는 선택이었지만 이번 실제 결과는 반대였습니다. 판단 오류가 아닌 확률적 미적중입니다.`
            : `선택 당시 누적 우세색은 ${evidencePreferred === 'blue' ? '파랑' : '빨강'}이었지만 반대색을 선택했습니다.`;
    reviewAttemptsRef.current.push(genericReviewAttempt({
      ...(evidenceAligned === null && prediction !== null ? { scored: false as const } : {}),
      index: round,
      status,
      errorCodes,
      title: `${round + 1}번 · 레시피 ${trial.recipe + 1}`,
      prompt: `재료 ${trial.combo.map((index) => String.fromCharCode(65 + index)).join('+')} · 이전 관찰 ${observedText}`,
      expected: evidencePreferred === null ? '누적 근거 없음' : `근거상 ${evidencePreferred === 'blue' ? '파란 약' : '빨간 약'}`,
      selected: prediction === null ? '응답 없음' : prediction === 'blue' ? '파란 약' : '빨간 약',
      explanation,
      rtMs: rt,
      facts: mode === 'simulation' && prediction === null
        ? { 실제결과: '비공개', 응답결과: '시간 초과', 근거정렬: '판정 보류' }
        : { 실제결과: trial.outcome === 'blue' ? '파란 약' : '빨간 약', 결과적중: ok, 근거정렬: evidenceAligned === null ? '판정 보류' : evidenceAligned },
    }));
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setHistory(nextHistory);
    setFeedback(mode === 'simulation'
      ? prediction === null ? '시간 초과' : ok ? '예측 성공' : '예측 실패'
      : `${prediction === null ? '시간 초과 · ' : ''}실제 결과: ${trial.outcome === 'blue' ? '파란 약' : '빨간 약'}`);
    schedule(() => {
      if (round === trials.length - 1) {
        const evidenceScore = evidenceScoreRef.current;
        const performance = summarizePotionPerformance({ evidenceAligned: evidenceScore.aligned, evidenceTotal: evidenceScore.total, outcomeHits: nextCorrect, trialCount: trials.length });
        onFinish(resultFor('potion', evidenceScore.aligned, evidenceScore.total, nextRts, performance.evidenceErrors + (evidenceScore.timeouts - evidenceScore.evidenceTimeouts), {
          scoringVersion: 'potion-evidence-v1',
          probabilityProfile: 'seeded-session-v1',
          totalTrials: trials.length,
          outcomeHits: nextCorrect,
          outcomeMisses: performance.outcomeMisses,
          outcomeAccuracy: `${performance.outcomeAccuracy}%`,
          recipes: Object.keys(nextHistory).length,
          evidenceDecisionRate: performance.evidenceAccuracy === null ? '—' : `${performance.evidenceAccuracy}%`,
          evidenceTrials: evidenceScore.total,
          timeouts: evidenceScore.timeouts,
          stochasticMisses: evidenceScore.stochasticMisses,
        }, compactReviewPayload('potion', reviewAttemptsRef.current)));
      }
      else {
        schedule(() => {
          resolvedRef.current = false;
          setRound(round + 1);
          setFeedback('');
          setSelectedPrediction(null);
          setLocked(false);
        }, ROUND_INPUT_SETTLE_MS);
      }
    }, mode === 'practice' ? 1000 : 600);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
    if (isPaused || event.repeat || shouldIgnoreGameShortcut(event)) return;
      if (event.key === 'ArrowLeft' || event.key === '1') { event.preventDefault(); choose('blue'); }
      if (event.key === 'ArrowRight' || event.key === '2') { event.preventDefault(); choose('red'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ingredientSummary = trial.combo.map((index) => POTION_INGREDIENTS[index].label).join(', ');
  const statusMessage = mode === 'practice' && preferences.showEvidence
    ? `이번 재료는 ${ingredientSummary}. 이 조합의 이전 관찰은 파랑 ${observed.blue}회, 빨강 ${observed.red}회입니다. 결과 색을 예측하세요.`
    : `이번 재료는 ${ingredientSummary}. 결과 색을 예측하세요.`;

  return (
    <GameFrame gameId="potion" current={round + 1} total={trials.length} helper={`${recipeCount}개 독립 레시피의 결과를 갱신합니다. ←/1 파랑 · →/2 빨강`} simulationHelper="근거 해설 없이 진행 · 선택 후 성공·실패만 공개" feedback={feedback} statusMessage={statusMessage} showFeedbackInSimulation onClose={onClose}>
      <div className="potion-layout">
        {guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 누적 근거를 확인한 뒤 예측하세요</p> : <DeadlineBar key={round} duration={config.paceMs} label="응답 제한시간" active={!locked} />}
        <div className="potion-workbench">
          <section className="potion-recipe-board" aria-labelledby="potion-recipe-title">
            <header><span>이번 레시피</span><b id="potion-recipe-title">밝은 재료만 사용합니다</b></header>
            <div className="ingredient-cards" role="list">
              {POTION_INGREDIENTS.map((ingredient, index) => {
                const selected = trial.combo.includes(index);
                return (
                  <article className={selected ? 'is-selected' : ''} aria-label={`${ingredient.label} · ${selected ? '이번 조합에 사용' : '이번 조합에서 제외'}`} role="listitem" key={ingredient.id}>
                    <span className="potion-ingredient-code">{ingredient.code}</span>
                    <PotionIngredientGlyph ingredientIndex={index} />
                    <b>{ingredient.label}</b>
                  </article>
                );
              })}
            </div>
          </section>
          <span className="potion-workbench-arrow" aria-hidden="true">→</span>
          <section className={`potion-result-preview ${locked ? 'is-revealed' : ''}`} aria-label="가능한 마법약 결과">
            <header><span>결과 후보</span><b>{locked ? mode === 'practice' ? '실제 결과 공개' : '예측 판정 공개' : '둘 중 하나를 예측'}</b></header>
            <div>
              <article className={locked && mode === 'practice' ? trial.outcome === 'blue' ? 'blue is-result' : 'blue is-muted' : 'blue'}><PotionFlask outcome="blue" /><b>파란 약</b></article>
              <article className={locked && mode === 'practice' ? trial.outcome === 'red' ? 'red is-result' : 'red is-muted' : 'red'}><PotionFlask outcome="red" /><b>빨간 약</b></article>
            </div>
            <small>{locked
              ? mode === 'practice'
                ? `실제 결과는 ${trial.outcome === 'blue' ? '파란 약' : '빨간 약'}입니다.`
                : selectedPrediction === null
                  ? '응답 시간이 끝났습니다.'
                  : selectedPrediction === trial.outcome ? '예측 성공입니다.' : '예측 실패입니다.'
              : mode === 'practice' ? '선택하면 실제 색이 공개됩니다.' : '선택하면 성공·실패만 공개됩니다.'}</small>
          </section>
        </div>
        <div className="potion-block-progress"><span>레시피 학습 블록</span><b>{(round % recipeCount) + 1} / {recipeCount}</b></div>{mode === 'practice' && preferences.showEvidence && <div className="potion-observation"><span>이 조합의 이전 실제 결과 · 연습 힌트</span><div><b className="blue">파랑 {observed.blue}</b><b className="red">빨강 {observed.red}</b></div></div>}
        <h3>어떤 색의 약이 나올 가능성이 높을까요?</h3>
        <div className="potion-actions"><button ref={firstChoiceRef} className="blue" disabled={locked} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose('blue'); }}><PotionFlask outcome="blue" compact /><span><b>파란 약</b><small>← · 1</small></span></button><button className="red" disabled={locked} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose('red'); }}><PotionFlask outcome="red" compact /><span><b>빨간 약</b><small>→ · 2</small></span></button></div>
      </div>
    </GameFrame>
  );
}

type NBackScoreState = {
  correct: number;
  errors: number;
  misses: number;
  omissions: number;
  falseAlarms: number;
  wrongLag: number;
  streak: number;
  bestStreak: number;
  rts: number[];
  tasks: Record<NBackTask, { correct: number; total: number }>;
  decisions: Record<NBackDecision, { correct: number; total: number }>;
  outcomes: Record<NBackTrialOutcome, number>;
};

function newNBackScore(): NBackScoreState {
  return {
    correct: 0,
    errors: 0,
    misses: 0,
    omissions: 0,
    falseAlarms: 0,
    wrongLag: 0,
    streak: 0,
    bestStreak: 0,
    rts: [],
    tasks: { n2: { correct: 0, total: 0 }, n23: { correct: 0, total: 0 } },
    decisions: { second: { correct: 0, total: 0 }, third: { correct: 0, total: 0 }, neither: { correct: 0, total: 0 } },
    outcomes: { warmup: 0, hit: 0, 'correct-rejection': 0, miss: 0, 'false-alarm': 0, 'wrong-lag': 0, omission: 0 },
  };
}

function nbackAccuracy({ correct, total }: { correct: number; total: number }) {
  return total ? Math.round((correct / total) * 100) : '—';
}

function nbackDecisionLabel(decision: NBackDecision | null, task: NBackTask) {
  if (decision === null) return '응답 없음';
  if (decision === 'second') return '2번째 전과 같음';
  if (decision === 'third') return '3번째 전과 같음';
  return task === 'n2' ? '2번째 전과 다름' : '둘 다 다름';
}

function NBackGame({ onFinish, onClose, glyphMnemonics, config, preferences }: GameProps & { glyphMnemonics: string[]; config: PracticeConfig; preferences: NBackPreferences }) {
  const { mode, showGlyphNames } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const [seed] = useState(newSessionSeed);
  const [groups] = useState(() => selectNBackRoundGroups(seed, mode === 'simulation' ? null : preferences.group, false));
  const trials = useMemo(() => buildNBackSession({
    mode: mode === 'simulation' ? 'real' : preferences.task,
    group: groups[0],
    ...(mode === 'simulation' ? { round2Group: groups[1] } : {}),
    seed,
    ...(mode === 'practice' ? { problemCount: config.quantity } : {}),
  }), [config.quantity, groups, mode, preferences.task, seed]);
  const scoredTotal = useMemo(() => trials.filter((item) => !item.warmup).length, [trials]);
  const paceMs = mode === 'simulation' ? 3000 : config.paceMs;
  const progression = mode === 'practice' ? preferences.progression : 'fixed';
  const [countdown, setCountdown] = useState<number | null>(3);
  const [index, setIndex] = useState(0);
  const [showName, setShowName] = useState(mode === 'practice' && showGlyphNames);
  const nameLabelUsageRef = useRef({ shown: mode === 'practice' && showGlyphNames, hidden: mode !== 'practice' || !showGlyphNames });
  const [selected, setSelected] = useState<NBackDecision | null>(null);
  const [feedback, setFeedback] = useState('');
  const [earlyAdvancePending, setEarlyAdvancePending] = useState(false);
  const [inputSettling, setInputSettling] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const responseClock = useActiveElapsedClock();
  const answerRef = useRef<NBackDecision | null>(null);
  const responseRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const scoreRef = useRef<NBackScoreState>(newNBackScore());
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const trial = trials[index];
  const completedScored = trials.slice(0, index).filter((item) => !item.warmup).length;
  const scoredProgress = trials.slice(0, index + 1).filter((item) => !item.warmup).length;

  usePausableTimeout(() => setCountdown((value) => value === 1 ? null : (value ?? 1) - 1), 1000, countdown !== null, `nback-countdown-${index}-${countdown ?? 'done'}`);

  const scoreTrial = useCallback((currentTrial: NBackTrial) => {
    const score = scoreNBackResponse(currentTrial, answerRef.current, responseRef.current);
    if (!score.scored || currentTrial.answer === null) return scoreRef.current;
    const previous = scoreRef.current;
    const nextStreak = score.correct ? previous.streak + 1 : 0;
    const task = previous.tasks[currentTrial.task];
    const decision = previous.decisions[currentTrial.answer];
    const missedTarget = score.outcome === 'miss';
    const next: NBackScoreState = {
      ...previous,
      correct: previous.correct + (score.correct ? 1 : 0),
      errors: previous.errors + (score.correct ? 0 : 1),
      misses: previous.misses + (missedTarget ? 1 : 0),
      omissions: previous.omissions + (score.outcome === 'omission' ? 1 : 0),
      falseAlarms: previous.falseAlarms + (score.outcome === 'false-alarm' ? 1 : 0),
      wrongLag: previous.wrongLag + (score.outcome === 'wrong-lag' ? 1 : 0),
      streak: nextStreak,
      bestStreak: Math.max(previous.bestStreak, nextStreak),
      rts: score.responseTimeMs === null ? previous.rts : [...previous.rts, score.responseTimeMs],
      tasks: { ...previous.tasks, [currentTrial.task]: { correct: task.correct + (score.correct ? 1 : 0), total: task.total + 1 } },
      decisions: { ...previous.decisions, [currentTrial.answer]: { correct: decision.correct + (score.correct ? 1 : 0), total: decision.total + 1 } },
      outcomes: { ...previous.outcomes, [score.outcome]: previous.outcomes[score.outcome] + 1 },
    };
    scoreRef.current = next;
    const errorCode = score.outcome === 'miss' ? 'nback-miss'
      : score.outcome === 'false-alarm' ? 'nback-false-alarm'
      : score.outcome === 'wrong-lag' ? 'nback-wrong-lag'
      : score.outcome === 'omission' ? 'timeout'
      : null;
    const sequenceLength = currentTrial.task === 'n2' ? 3 : 4;
    const recentTrials = trials.slice(Math.max(0, index - (sequenceLength - 1)), index + 1)
      .filter((item) => item.round === currentTrial.round);
    const recentSequence = recentTrials.map((item) => glyphMnemonics[item.variant] || glyphShapeNames[item.variant]);
    const sequenceLabels = currentTrial.task === 'n2' ? ['N-2', 'N-1', 'N'] : ['N-3', 'N-2', 'N-1', 'N'];
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: reviewAttemptsRef.current.length,
      status: score.correct ? 'correct' : 'error',
      errorCodes: errorCode ? [errorCode] : [],
      title: `${reviewAttemptsRef.current.length + 1}번 · ${currentTrial.task === 'n2' ? '2-back' : '2·3-back'}`,
      prompt: `${sequenceLabels.slice(-recentSequence.length).join(' → ')} · ${recentSequence.join(' → ')}`,
       expected: nbackDecisionLabel(currentTrial.answer, currentTrial.task),
       selected: answerRef.current === null ? '응답 없음' : nbackDecisionLabel(answerRef.current, currentTrial.task),
      explanation: score.correct ? '지정된 기억 간격과 현재 도형을 정확히 비교했습니다.' : score.outcome === 'wrong-lag' ? '일치 여부는 찾았지만 2번째 전과 3번째 전 위치를 바꿔 선택했습니다.' : score.outcome === 'miss' ? '일치하는 표적이 있었지만 둘 다 다름을 선택했습니다.' : score.outcome === 'false-alarm' ? '지정된 위치와 다르지만 일치 응답을 선택했습니다.' : '응답 제한시간 안에 선택하지 못했습니다.',
      ...(score.responseTimeMs === null ? {} : { rtMs: score.responseTimeMs }),
      facts: {
        현재도형: glyphMnemonics[currentTrial.variant] || glyphShapeNames[currentTrial.variant],
        최근도형ID: recentTrials.map((item) => item.variant),
        최근도형명: recentSequence,
        비교유형: currentTrial.task,
        결과코드: score.outcome,
      },
    }));
    return next;
  }, [glyphMnemonics, index, trials]);

  const finishCurrentTrial = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setEarlyAdvancePending(false);
    const score = scoreTrial(trial);
    if (index === trials.length - 1) {
      const nameLabelUsage = nameLabelUsageRef.current;
      const nameLabelMode = nameLabelUsage.shown && nameLabelUsage.hidden ? '일부 표시' : nameLabelUsage.shown ? '표시' : '숨김';
      onFinish(resultFor('nback', score.correct, scoredTotal, score.rts, score.errors, {
        nbackGroup: groups[0] === groups[1] ? `묶음 ${groups[0] + 1}` : `1R 묶음 ${groups[0] + 1} · 2R 묶음 ${groups[1] + 1}`,
        misses: score.misses,
        omissions: score.omissions,
        falseAlarms: score.falseAlarms,
        wrongLag: score.wrongLag,
        bestStreak: score.bestStreak,
        n2Accuracy: nbackAccuracy(score.tasks.n2),
        n23Accuracy: nbackAccuracy(score.tasks.n23),
        secondAccuracy: nbackAccuracy(score.decisions.second),
        thirdAccuracy: nbackAccuracy(score.decisions.third),
        neitherAccuracy: nbackAccuracy(score.decisions.neither),
        ...(mode === 'practice' ? {
          nbackNameLabels: nameLabelMode,
          nbackMnemonics: nameLabelUsage.shown ? glyphMnemonics.join('·') : '숨김',
        } : {}),
      }, compactReviewPayload('nback', reviewAttemptsRef.current)));
      return;
    }
    answerRef.current = null;
    responseRef.current = null;
    if (guidedPacing) {
      setInputSettling(true);
      return;
    }
    if (trials[index + 1]?.round !== trial.round) setCountdown(3);
    setIndex((value) => value + 1);
    setSelected(null);
    setFeedback('');
  }, [glyphMnemonics, groups, guidedPacing, index, mode, onFinish, scoreTrial, scoredTotal, trial, trials]);

  function toggleNameLabels() {
    setShowName((current) => {
      const next = !current;
      if (next) nameLabelUsageRef.current.shown = true;
      else nameLabelUsageRef.current.hidden = true;
      return next;
    });
  }

  useLayoutEffect(() => {
    if (countdown !== null || inputSettling) return;
    resolvedRef.current = false;
    answerRef.current = null;
    responseRef.current = null;
    responseClock.restart();
    const focusFrame = window.requestAnimationFrame(() => {
      resetWorkspaceScroll(stageRef.current);
      stageRef.current?.closest<HTMLElement>('.game-workspace')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [countdown, index, inputSettling, responseClock]);
  usePausableTimeout(finishCurrentTrial, paceMs, countdown === null && !inputSettling && !guidedPacing, `nback-deadline-${index}`);
  usePausableTimeout(finishCurrentTrial, 300, earlyAdvancePending && !guidedPacing, `nback-fast-${index}`);
  usePausableTimeout(() => {
    if (trials[index + 1]?.round !== trial.round) setCountdown(3);
    setIndex((value) => value + 1);
    setSelected(null);
    setFeedback('');
    setInputSettling(false);
  }, ROUND_INPUT_SETTLE_MS, inputSettling && countdown === null, `nback-input-settle-${index}`);

  function choose(answer: NBackDecision) {
    if (isPaused || inputSettling || countdown !== null || trial.warmup || resolvedRef.current || answerRef.current !== null) return;
    answerRef.current = answer;
    responseRef.current = Math.round(responseClock.elapsed());
    setSelected(answer);
    const score = scoreNBackResponse(trial, answer, responseRef.current);
    if (mode === 'practice') setFeedback(score.correct ? '정답 · 응답 저장됨' : `오답 · 정답은 ${nbackDecisionLabel(trial.answer, trial.task)}입니다.`);
    if (!guidedPacing && progression === 'fast' && score.correct) {
      setEarlyAdvancePending(true);
    }
  }

  const onNBackKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isPaused || !target?.closest('.game-workspace.game-nback') || target.closest('button') || shouldIgnoreGameShortcut(event)) return;
    if (!['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat || countdown !== null || trial.warmup || answerRef.current !== null) return;
    if (event.code === 'ArrowLeft') choose('second');
    else if (event.code === 'ArrowRight' && trial.task === 'n23') choose('third');
    else if (event.code === 'Space') choose('neither');
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onNBackKey(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const taskLabel = trial.task === 'n2' ? '2-back' : '2·3-back';
  const roundLabel = mode === 'practice' ? 'PRACTICE' : `ROUND ${trial.round}`;
  const helper = trial.task === 'n2' ? '← 2번째 전과 같음 · Space 2번째 전과 다름' : '← 2번째 전과 같음 · → 3번째 전과 같음 · Space 둘 다 다름';
  const spokenGlyph = mode === 'practice' && showName ? `${glyphShapeNames[trial.variant]}, 암기명 ${glyphMnemonics[trial.variant]}` : glyphShapeNames[trial.variant];
  const statusMessage = countdown !== null ? `${countdown}초 뒤 시작합니다.` : trial.warmup ? `현재 도형 ${spokenGlyph}. 입력 없이 기억하세요.${guidedPacing ? ' 기억한 뒤 다음 도형 버튼을 누르세요.' : ''}` : selected ? `현재 도형 ${spokenGlyph}. 응답 저장됨.${guidedPacing ? ' 다음 도형 버튼을 누르세요.' : ''}` : `현재 도형 ${spokenGlyph}. 지금 분류하세요.`;
  const answerClass = (decision: NBackDecision) => {
    const classes = selected === decision ? ['selected'] : [];
    if (mode === 'practice' && selected !== null) {
      if (trial.answer === decision) classes.push('correct');
      else if (selected === decision) classes.push('wrong');
    }
    return classes.join(' ');
  };

  return (
    <GameFrame gameId="nback" current={countdown !== null ? completedScored : scoredProgress} total={scoredTotal} zeroLabel="기억 구간" helper={helper} feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      <div className="nback-stage" ref={stageRef}>
        {countdown !== null ? (
          <div className="nback-countdown" role="timer" aria-live="polite" aria-label={`${countdown}초 뒤 도형 순서 게임 시작`}><span>{roundLabel} · {taskLabel}</span><b>{countdown}</b><small>{helper}</small></div>
        ) : (
          <>
            <div className="nback-status"><div><span>{roundLabel} · 묶음 {trial.group + 1}</span><b>{taskLabel}{trial.warmup ? ' · 기억 준비' : ' · 비교 판단'}</b></div>{mode === 'practice' && <button type="button" onClick={(event) => { toggleNameLabels(); restoreGameShortcutFocus(event.currentTarget); }}>이름표 {showName ? '숨기기' : '보기'}</button>}</div>
            {guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 기억·응답 후 직접 다음 도형으로 이동하세요</p> : <DeadlineBar key={`deadline-${trial.id}`} duration={paceMs} label="도형 제시시간" className="nback-time" active={!inputSettling} />}
            <NBackLagRail task={trial.task} warmup={trial.warmup} position={trial.position} />
            <div className="nback-stimulus" key={`stimulus-${trial.id}`}><span className="nback-now-chip">NOW · N</span><CognitiveGlyph variant={trial.variant} size={240} color="#237b76" label={glyphShapeNames[trial.variant]} /></div>
            {mode === 'practice' && showName && <p className="nback-name"><span>{glyphShapeNames[trial.variant]}</span><b>암기명 {glyphMnemonics[trial.variant]}</b></p>}
            {trial.warmup ? (
              guidedPacing
                ? <button type="button" className="single-action accessible-next-action" disabled={inputSettling} onClick={finishCurrentTrial}>기억했어요 · 다음 도형 <i>→</i></button>
                : <p className="auto-next nback-warmup"><b>입력하지 않습니다.</b><span>{taskLabel === '2-back' ? '2개' : '3개'}의 도형을 먼저 기억하면 비교가 시작됩니다.</span></p>
            ) : (
              <>
                <div className={`nback-actions ${trial.task === 'n23' ? 'three-options' : 'two-options'}`}><button type="button" aria-pressed={selected === 'second'} className={answerClass('second')} disabled={inputSettling || selected !== null} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose('second'); }}><b>{nbackDecisionLabel('second', trial.task)}</b><span>←</span></button>{trial.task === 'n23' && <button type="button" aria-pressed={selected === 'third'} className={answerClass('third')} disabled={inputSettling || selected !== null} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose('third'); }}><b>{nbackDecisionLabel('third', trial.task)}</b><span>→</span></button>}<button type="button" aria-pressed={selected === 'neither'} className={answerClass('neither')} disabled={inputSettling || selected !== null} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; choose('neither'); }}><b>{nbackDecisionLabel('neither', trial.task)}</b><span>Space</span></button></div>
                {guidedPacing && <button type="button" className="single-action accessible-next-action" disabled={selected === null || inputSettling} onClick={finishCurrentTrial}>응답 완료 · 다음 도형 <i>→</i></button>}
              </>
            )}
          </>
        )}
      </div>
    </GameFrame>
  );
}

function NumberGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { number: focus } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const rounds = useMemo(() => buildNumberRounds(config.quantity, seed, focus), [config.quantity, focus, seed]);
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [passed, setPassed] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const resolvedRef = useRef(false);
  const inputRef = useRef<number[]>([]);
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const schedule = useManagedTimeout();
  const roundConfig = rounds[round];
  const expected = numberExpected(roundConfig);

  function finishRound(success: boolean, message: string, errorCode: string | null = null, errorPosition = inputRef.current.length) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    setLocked(true);
    const rt = Math.round(responseClock.elapsed());
    const nextPassed = passed + (success ? 1 : 0);
    const nextErrors = errors + (success ? 0 : 1);
    const nextRts = errorCode === 'timeout' ? rts : [...rts, rt];
    const explanation = success ? roundConfig.mode === 'flash' ? '불이 들어온 숫자 하나를 정확히 선택했습니다.' : '예외 규칙을 포함한 전체 순서를 정확히 입력했습니다.'
      : errorCode === 'timeout' ? `제한시간이 끝났습니다. 다음 입력은 ${expected[Math.min(errorPosition, expected.length - 1)] ?? '완료'}이었습니다.`
      : errorCode === 'number-skip' ? '건너뛰기로 지정된 숫자를 선택했습니다.'
      : errorCode === 'number-double-miss' ? '두 번 눌러야 하는 숫자의 두 번째 입력을 생략했습니다.'
      : errorCode === 'number-extra' ? '두 번 누르기 규칙이 끝난 숫자를 한 번 더 선택했습니다.'
      : `기대 순서 ${expected[Math.min(errorPosition, expected.length - 1)]} 대신 다른 숫자를 선택했습니다.`;
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: round,
      status: success ? 'correct' : 'error',
      errorCodes: errorCode ? [errorCode] : [],
      title: `${round + 1}번 · ${roundConfig.mode === 'flash' ? '점등 숫자' : '예외 규칙'}`,
      prompt: roundConfig.mode === 'flash' ? '불이 들어온 숫자 선택' : `건너뛰기 ${roundConfig.skip} · 두 번 ${roundConfig.double.join('·')}`,
      expected: expected.join(' → '),
      selected: inputRef.current.length ? inputRef.current.join(' → ') : '응답 없음',
      explanation,
      rtMs: rt,
      facts: { 최초확인지점: Math.min(errorPosition + 1, expected.length), 전체정답수: expected.length },
    }));
    setPassed(nextPassed); setErrors(nextErrors); setRts(nextRts); setFeedback(message);
    schedule(() => {
      if (round === rounds.length - 1) onFinish(resultFor('number', nextPassed, rounds.length, nextRts, nextErrors, undefined, compactReviewPayload('number', reviewAttemptsRef.current)));
      else {
        schedule(() => {
          resolvedRef.current = false;
          inputRef.current = [];
          setRound((value) => value + 1);
          setCursor(0);
          setFeedback('');
          setLocked(false);
        }, ROUND_INPUT_SETTLE_MS);
      }
    }, mode === 'practice' ? 1000 : 420);
  }

  useLayoutEffect(() => {
    if (locked) return;
    resolvedRef.current = false;
    responseClock.restart();
  }, [locked, responseClock, round]);
  usePausableTimeout(() => finishRound(false, '시간 초과 · 다음 문제로 이동합니다.', 'timeout', inputRef.current.length), config.paceMs, !locked && !guidedPacing, round);

  useEffect(() => {
    if (locked || isPaused) return;
    const frame = window.requestAnimationFrame(() => boardRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, locked, round]);

  function choose(value: number) {
    if (isPaused || locked) return;
    const position = inputRef.current.length;
    inputRef.current = [...inputRef.current, value];
    if (value !== expected[position]) {
      const errorCode = classifyNumberInputError(roundConfig, expected, position, value);
      finishRound(false, '순서 오류 · 이 문제는 여기서 종료됩니다.', errorCode, position); return;
    }
    const next = position + 1;
    if (next === expected.length) finishRound(true, '정답');
    else setCursor(next);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaused || event.repeat || shouldIgnoreGameShortcut(event) || !/^[1-9]$/.test(event.key)) return;
      event.preventDefault();
      choose(Number(event.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const statusMessage = roundConfig.mode === 'flash'
    ? `점등 숫자 문제. 현재 목표 숫자는 ${expected[cursor]}입니다.`
    : `예외 규칙 문제. ${roundConfig.skip}은 건너뛰고 ${roundConfig.double.join('과 ')}은 두 번 누릅니다. 현재 ${cursor}/${expected.length}개 입력했습니다.`;

  return (
    <GameFrame gameId="number" current={round + 1} total={rounds.length} helper={`${roundConfig.mode === 'flash' ? 'ROUND 1 · 배열이 바뀌면 불이 들어온 숫자 하나를 누릅니다.' : `ROUND 2 · 건너뛰기 ${roundConfig.skip} · 두 번 누르기 ${roundConfig.double.join('·')}`} 숫자키 1~9 사용 가능`} feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      <div className="number-layout">
        {guidedPacing ? <p className="guided-pacing-note" role="status">시간 제한 없이 연습 중 · 규칙을 확인한 뒤 순서대로 누르세요</p> : <DeadlineBar key={round} duration={config.paceMs} label="라운드 제한시간" active={!locked} />}
        <div className="number-rule">{roundConfig.mode === 'flash' ? <span className="basic">불이 들어온 숫자를 누르세요</span> : <><span>건너뛰기 <b>{roundConfig.skip}</b></span><span>두 번 누르기 <b>{roundConfig.double.join(' · ')}</b></span></>}<em>입력 {cursor} / {expected.length}</em></div>
        {roundConfig.mode === 'flash' && <p className="sr-only" aria-live="polite" aria-atomic="true">현재 목표 숫자 {expected[cursor]}</p>}
        <div ref={boardRef} className="number-board-pro" tabIndex={-1} aria-label="1부터 9까지의 숫자 입력판">{roundConfig.board.map((value) => { const currentTarget = roundConfig.mode === 'flash' && value === expected[cursor]; return <button className={currentTarget ? 'target' : ''} aria-current={currentTarget ? 'step' : undefined} aria-label={currentTarget ? `${value}, 현재 목표` : String(value)} disabled={locked} key={value} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={() => choose(value)}>{value}</button>; })}</div>
      </div>
    </GameFrame>
  );
}

const COUNT_BLANK_MS = 350;
function CountCloud({ word, count, offset }: { word: string; count: number; offset: number }) {
  return <div className="word-cloud">{Array.from({ length: count }, (_, index) => <span key={index} style={{ left: `${6 + ((index * 37 + offset * 11) % 82)}%`, top: `${7 + ((index * 29 + offset * 17) % 82)}%`, fontSize: `${11 + ((index * 7 + offset) % 5) * 3}px`, fontWeight: 500 + ((index + offset) % 3) * 150 }}>{word}</span>)}</div>;
}

function CountGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { count: focus } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const specs = useMemo(() => buildCountTrials(config.quantity, seed, focus), [config.quantity, focus, seed]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'blank' | 'show' | 'answer'>('blank');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState('');
  const responseClock = useActiveElapsedClock();
  const answerResolvedRef = useRef(false);
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const countStageRef = useRef<HTMLDivElement>(null);
  const schedule = useManagedTimeout();
  const spec = specs[round]; const pair = seededShuffle(COUNT_WORD_PAIRS, seed + round)[0];
  const answerLimit = Math.max(2500, config.paceMs * 3);

  function beginCountAnswer() {
    answerResolvedRef.current = false;
    setPhase('answer');
    responseClock.restart();
  }

  usePausableTimeout(() => setPhase('show'), COUNT_BLANK_MS, phase === 'blank', `count-blank-${round}`);
  usePausableTimeout(beginCountAnswer, config.paceMs, phase === 'show' && !guidedPacing, `count-show-${round}`);
  useEffect(() => {
    if (isPaused) return;
    const selector = guidedPacing && phase === 'show'
      ? '.accessible-next-action'
      : phase === 'answer'
        ? '.count-board button:not(:disabled)'
        : '';
    if (!selector) return;
    const frame = window.requestAnimationFrame(() => {
      resetWorkspaceScroll(countStageRef.current);
      const target = countStageRef.current?.querySelector<HTMLButtonElement>(selector);
      if (!target) return;
      if (guidedPacing && phase === 'show') {
        target.focus();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [guidedPacing, isPaused, phase, round]);
  useEffect(() => {
    if (phase !== 'answer') return;
    answerResolvedRef.current = false;
  }, [phase, round]);

  function choose(side: 'left' | 'right' | null) {
    if (locked || phase !== 'answer' || answerResolvedRef.current) return;
    answerResolvedRef.current = true;
    setLocked(true);
    const target = spec.left > spec.right ? 'left' : 'right';
    const ok = side === target;
    const targetLabel = `${target === 'left' ? '왼쪽' : '오른쪽'} ${Math.max(spec.left, spec.right)}개`;
    const rt = Math.round(responseClock.elapsed());
    const nextCorrect = correct + (ok ? 1 : 0); const nextErrors = errors + (ok ? 0 : 1); const nextRts = side === null ? rts : [...rts, rt];
    reviewAttemptsRef.current.push(genericReviewAttempt({
      index: round,
      status: ok ? 'correct' : 'error',
      errorCodes: ok ? [] : [side === null ? 'timeout' : 'count-side'],
      title: `${round + 1}번 · 개수 차이 ${Math.abs(spec.left - spec.right)}`,
      prompt: `왼쪽 ${pair[0]} · 오른쪽 ${pair[1]}`,
      expected: `${target === 'left' ? '왼쪽' : '오른쪽'} (${Math.max(spec.left, spec.right)}개)`,
      selected: side === null ? '응답 없음' : side === 'left' ? '왼쪽' : '오른쪽',
      explanation: ok ? `실제 개수 ${spec.left} 대 ${spec.right}를 정확히 비교했습니다.` : side === null ? '응답 제한시간 안에 선택하지 못했습니다.' : `실제 개수는 왼쪽 ${spec.left}개, 오른쪽 ${spec.right}개였습니다.`,
      rtMs: rt,
      facts: { 왼쪽개수: spec.left, 오른쪽개수: spec.right, 차이: Math.abs(spec.left - spec.right) },
    }));
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    setFeedback(side === null ? `시간 초과 · 정답은 ${targetLabel}` : ok ? `정답 · ${targetLabel}` : `오답 · 정답은 ${targetLabel}`);
    schedule(() => { if (round === specs.length - 1) onFinish(resultFor('count', nextCorrect, specs.length, nextRts, nextErrors, undefined, compactReviewPayload('count', reviewAttemptsRef.current))); else { answerResolvedRef.current = false; setFeedback(''); setPhase('blank'); setLocked(false); setRound(round + 1); } }, mode === 'practice' ? PRACTICE_FEEDBACK_DWELL_MS : 150);
  }
  usePausableTimeout(() => choose(null), answerLimit, phase === 'answer' && !locked && !guidedPacing, `count-answer-${round}`);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (isPaused || event.repeat || shouldIgnoreGameShortcut(event)) return; if (['ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault(); if (event.key === 'ArrowLeft') choose('left'); if (event.key === 'ArrowRight') choose('right'); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const phaseMessage = phase === 'blank'
    ? '시선을 가운데에 둡니다.'
    : phase === 'show'
      ? guidedPacing ? '양쪽 내용을 다 들은 뒤 응답으로 이동하세요.' : `${formatPace(config.paceMs)} 동안 양쪽의 개수만 비교합니다.`
      : '단어가 사라졌습니다. 더 많았던 쪽을 선택하세요.';
  const leftTokens = Array.from({ length: spec.left }, () => pair[0]).join(' ');
  const rightTokens = Array.from({ length: spec.right }, () => pair[1]).join(' ');
  const accessiblePhaseMessage = phase === 'show' ? `왼쪽 자극: ${leftTokens}. 오른쪽 자극: ${rightTokens}.` : phaseMessage;
  return <GameFrame gameId="count" current={round + 1} total={specs.length} helper={phaseMessage} feedback={feedback} statusMessage={accessiblePhaseMessage} bodyFocusable onClose={onClose}>
    <div className="count-stage-shell" ref={countStageRef}><div className="stage-sequence" aria-label={`현재 ${phaseMessage}`}><span className={phase === 'blank' ? 'active' : 'done'}>준비</span><span className={phase === 'show' ? 'active' : phase === 'answer' ? 'done' : ''}>제시</span><span className={phase === 'answer' ? 'active' : ''}>응답</span></div>{phase === 'blank' ? <div className="count-fixation" aria-label="다음 문제 준비">＋</div> : <div className={`count-wrap phase-${phase}`}>{guidedPacing && (phase === 'show' || phase === 'answer') ? <p className="guided-pacing-note" role="status">음성 안내 직접 진행 중 · {phase === 'show' ? '제시' : '응답'} 제한시간 없음</p> : (phase === 'show' || phase === 'answer') && <DeadlineBar key={`${round}-${phase}`} duration={phase === 'show' ? config.paceMs : answerLimit} label={phase === 'show' ? '단어 제시시간' : '응답 제한시간'} />}<div className="count-board"><button disabled={phase !== 'answer' || locked} aria-label={phase === 'show' ? `왼쪽 자극: ${leftTokens}` : '왼쪽 선택'} onClick={() => choose('left')}>{phase === 'show' ? <CountCloud word={pair[0]} count={spec.left} offset={round} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '← 왼쪽' : ' '}</span></button><i /><button disabled={phase !== 'answer' || locked} aria-label={phase === 'show' ? `오른쪽 자극: ${rightTokens}` : '오른쪽 선택'} onClick={() => choose('right')}>{phase === 'show' ? <CountCloud word={pair[1]} count={spec.right} offset={round + 3} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '오른쪽 →' : ' '}</span></button></div>{phase === 'show' && guidedPacing && <button type="button" className="single-action accessible-next-action" onClick={beginCountAnswer}>내용을 들었어요 · 응답으로 이동 <i>→</i></button>}</div>}</div>
  </GameFrame>;
}

const MOUSE_BLANK_MS = 450;
const MOUSE_CATS_MS = 1200;
const MOUSE_HIGHLIGHT_MS = 850;
function MouseGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const isPaused = useContext(GamePauseContext);
  const guidedPacing = useContext(GuidedPacingContext);
  const { mouse: load } = useContext(FocusedPracticeContext);
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => buildMouseTrials(config.quantity, seed, load), [config.quantity, load, seed]);
  const decisionMs = Math.max(4000, config.paceMs * 4);
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<'memory' | 'blank' | 'cats' | 'highlight' | 'red' | 'blue'>('memory');
  const [redAnswer, setRedAnswer] = useState<boolean | null>(null);
  const [redConfidence, setRedConfidence] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [confidenceTotal, setConfidenceTotal] = useState(0);
  const [confidenceResponses, setConfidenceResponses] = useState(0);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [presentationAdvanceLocked, setPresentationAdvanceLocked] = useState(false);
  const responseClock = useActiveElapsedClock();
  const redRt = useRef(0);
  const decisionResolvedRef = useRef(false);
  const presentationAdvanceLockRef = useRef(false);
  const reviewAttemptsRef = useRef<GenericReviewAttempt[]>([]);
  const presentationRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const catCells = [trial.red, trial.blue, ...trial.cats];

  function advanceMousePresentation() {
    if (presentationAdvanceLockRef.current) return;
    presentationAdvanceLockRef.current = true;
    setPresentationAdvanceLocked(true);
    schedule(() => {
      presentationAdvanceLockRef.current = false;
      setPresentationAdvanceLocked(false);
    }, PRESENTATION_ADVANCE_LOCK_MS);
    if (stage === 'memory') setStage('blank');
    else if (stage === 'blank') setStage('cats');
    else if (stage === 'cats') setStage('highlight');
    else if (stage === 'highlight') { setStage('red'); responseClock.restart(); }
  }

  usePausableTimeout(() => setStage('blank'), config.paceMs, stage === 'memory' && !guidedPacing, `mouse-memory-${round}`);
  usePausableTimeout(() => setStage('cats'), MOUSE_BLANK_MS, stage === 'blank' && !guidedPacing, `mouse-blank-${round}`);
  usePausableTimeout(() => setStage('highlight'), MOUSE_CATS_MS, stage === 'cats' && !guidedPacing, `mouse-cats-${round}`);
  usePausableTimeout(() => { setStage('red'); responseClock.restart(); }, MOUSE_HIGHLIGHT_MS, stage === 'highlight' && !guidedPacing, `mouse-highlight-${round}`);
  useEffect(() => {
    if (!guidedPacing || (stage !== 'memory' && stage !== 'blank' && stage !== 'cats' && stage !== 'highlight')) return;
    const frame = window.requestAnimationFrame(() => presentationRef.current?.querySelector<HTMLButtonElement>('.accessible-next-action')?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [guidedPacing, round, stage]);
  useEffect(() => {
    if (isPaused || (stage !== 'red' && stage !== 'blue')) return;
    const frame = window.requestAnimationFrame(() => decisionRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isPaused, round, stage]);

  function finishDecision(caught: boolean | null, confidence: number) {
    if (isPaused || locked || decisionResolvedRef.current || (stage !== 'red' && stage !== 'blue')) return;
    decisionResolvedRef.current = true;
    if (stage === 'red') {
      setLocked(true);
      const redOk = caught !== null && caught === trial.redCaught;
      const redExpected = trial.redCaught ? '찾았다' : '놓쳤다';
      setFeedback(caught === null ? `시간 초과 · 빨간 고양이는 ${redExpected}` : redOk ? `정답 · 빨간 고양이는 ${redExpected}` : `오답 · 빨간 고양이는 ${redExpected}`);
      setRedAnswer(caught); setRedConfidence(confidence); redRt.current = Math.round(responseClock.elapsed());
      schedule(() => {
        decisionResolvedRef.current = false;
        setFeedback(''); setStage('blue'); setLocked(false); responseClock.restart();
      }, mode === 'practice' ? PRACTICE_FEEDBACK_DWELL_MS : MOUSE_DECISION_TRANSITION_MS);
      return;
    }
    if (stage !== 'blue') return;
    setLocked(true);
    const redCorrect = redAnswer !== null && redAnswer === trial.redCaught; const blueCorrect = caught !== null && caught === trial.blueCaught;
    const blueExpected = trial.blueCaught ? '찾았다' : '놓쳤다';
    setFeedback(caught === null ? `시간 초과 · 파란 고양이는 ${blueExpected}` : blueCorrect ? `정답 · 파란 고양이는 ${blueExpected}` : `오답 · 파란 고양이는 ${blueExpected}`);
    const points = (redCorrect ? 1 : 0) + (blueCorrect ? 1 : 0);
    const blueRt = Math.round(responseClock.elapsed());
    const nextCorrect = correct + points; const nextErrors = errors + (2 - points); const nextRts = [...rts, ...(redAnswer === null ? [] : [redRt.current]), ...(caught === null ? [] : [blueRt])]; const nextConfidence = confidenceTotal + redConfidence + confidence; const nextConfidenceResponses = confidenceResponses + (redAnswer === null ? 0 : 1) + (caught === null ? 0 : 1);
    const pushColorReview = (color: 'red' | 'blue', answer: boolean | null, expected: boolean, answerConfidence: number, rtMs: number, cell: number) => {
      const answerCorrect = answer !== null && answer === expected;
      const errorCodes: string[] = [];
      if (answer === null) errorCodes.push('timeout');
      if (answer !== null && !answerCorrect) errorCodes.push(expected ? 'mouse-miss' : 'mouse-false-alarm');
      if (!answerCorrect && answerConfidence >= 3) errorCodes.push('mouse-overconfidence');
      reviewAttemptsRef.current.push(genericReviewAttempt({
        index: reviewAttemptsRef.current.length,
        status: answerCorrect ? 'correct' : 'error',
        errorCodes,
        title: `${round + 1}라운드 · ${color === 'red' ? '빨간' : '파란'} 고양이`,
        prompt: `${Math.floor(cell / 6) + 1}행 ${(cell % 6) + 1}열 고양이가 생쥐를 찾았는지 판단`,
        expected: expected ? '찾았다' : '놓쳤다',
        selected: answer === null ? '판단 응답 없음' : `${answer ? '찾았다' : '놓쳤다'} · 확신 ${answerConfidence || '미응답'}`,
        explanation: answer === null ? '찾았다·놓쳤다와 확신도를 제한시간 안에 선택하지 못했습니다.' : answerCorrect ? '생쥐 기억 위치와 고양이 위치를 정확히 대조했습니다.' : expected ? '생쥐가 있던 칸의 고양이를 놓쳤다고 판단했습니다.' : '생쥐가 없던 칸의 고양이가 찾았다고 판단했습니다.',
        rtMs,
        facts: { 고양이칸: cell, 고양이색: color, 생쥐위치: trial.mice, 확신도: answerConfidence },
      }));
    };
    pushColorReview('red', redAnswer, trial.redCaught, redConfidence, redRt.current || decisionMs, trial.red);
    pushColorReview('blue', caught, trial.blueCaught, confidence, blueRt, trial.blue);
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setConfidenceTotal(nextConfidence); setConfidenceResponses(nextConfidenceResponses);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('mouse', nextCorrect, trials.length * 2, nextRts, nextErrors, { averageConfidence: nextConfidenceResponses ? (nextConfidence / nextConfidenceResponses).toFixed(1) : '—', confidenceResponses: nextConfidenceResponses }, compactReviewPayload('mouse', reviewAttemptsRef.current)));
      else { presentationAdvanceLockRef.current = false; setPresentationAdvanceLocked(false); setFeedback(''); setStage('memory'); setRedAnswer(null); setRedConfidence(0); setLocked(false); redRt.current = 0; setRound((value) => value + 1); }
    }, mode === 'practice' ? PRACTICE_FEEDBACK_DWELL_MS : 180);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaused || event.repeat || shouldIgnoreGameShortcut(event) || (stage !== 'red' && stage !== 'blue')) return;
      const option = MOUSE_DECISION_OPTIONS.find((item) => item.key === event.key);
      if (!option) return;
      event.preventDefault();
      finishDecision(option.caught, option.confidence);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (stage !== 'red' && stage !== 'blue') return;
    decisionResolvedRef.current = false;
  }, [stage]);
  usePausableTimeout(() => finishDecision(null, 0), decisionMs, (stage === 'red' || stage === 'blue') && !locked && !guidedPacing, `mouse-decision-${round}-${stage}`);

  const stageMessage = stage === 'memory' ? '생쥐 위치를 기억하세요.' : stage === 'blank' ? '빈 격자에서도 위치를 유지하세요.' : stage === 'cats' ? '고양이 위치를 확인하세요.' : stage === 'highlight' ? '빨강과 파랑 고양이 위치를 대조하세요.' : `${stage === 'red' ? '빨간' : '파란'} 고양이의 찾았다·놓쳤다와 확신도를 선택하세요.`;
  const presentationStep = stage === 'memory' ? 1 : stage === 'blank' ? 2 : stage === 'cats' ? 3 : 4;
  const presentationDuration = stage === 'memory' ? config.paceMs : stage === 'blank' ? MOUSE_BLANK_MS : stage === 'cats' ? MOUSE_CATS_MS : MOUSE_HIGHLIGHT_MS;
  const coordinates = (cells: readonly number[]) => cells.map((cell) => `${Math.floor(cell / 6) + 1}행 ${(cell % 6) + 1}열`).join(', ');
  const boardLabel = stage === 'memory'
    ? `6×6 생쥐 위치 기억 격자. 생쥐 위치: ${coordinates(trial.mice)}`
    : stage === 'blank'
      ? '6×6 빈 기억 격자'
      : stage === 'highlight'
      ? `6×6 고양이 격자. 빨간 고양이 ${coordinates([trial.red])}, 파란 고양이 ${coordinates([trial.blue])}`
        : `6×6 고양이 위치 확인 격자. 고양이 위치: ${coordinates(catCells)}`;
  const accessibleStageMessage = stage === 'memory' || stage === 'blank' || stage === 'cats' || stage === 'highlight'
    ? `${stageMessage} ${boardLabel}`
    : stageMessage;

  return (
    <GameFrame gameId="mouse" current={round + 1} total={trials.length} helper={mode === 'practice' ? '생쥐 → 빈 격자 → 고양이 → 색 표식 · 응답은 1~8' : '위치를 빠르게 기억하고 빨강부터 판단하세요.'} feedback={feedback} statusMessage={accessibleStageMessage} onClose={onClose}>
      {stage === 'memory' || stage === 'blank' || stage === 'cats' || stage === 'highlight' ? <div className="mouse-layout" ref={presentationRef}>
        {mode === 'practice' && <div className="stage-sequence" aria-label={`위치 확인 단계 ${presentationStep} / 4`}><span className={presentationStep === 1 ? 'active' : presentationStep > 1 ? 'done' : ''}>생쥐</span><span className={presentationStep === 2 ? 'active' : presentationStep > 2 ? 'done' : ''}>기억</span><span className={presentationStep === 3 ? 'active' : presentationStep > 3 ? 'done' : ''}>고양이</span><span className={presentationStep === 4 ? 'active' : ''}>색 표식</span></div>}
        {guidedPacing ? <p className="guided-pacing-note" role="status">음성 안내 직접 진행 중 · 제한시간 없음</p> : <DeadlineBar key={`${round}-${stage}`} duration={presentationDuration} label={`${stageMessage} 제시시간`} />}
        <div className="mouse-board-pro" role="img" aria-label={boardLabel}>{Array.from({ length: 36 }, (_, cell) => {
          const mouse = stage === 'memory' && trial.mice.includes(cell);
          const cat = (stage === 'cats' || stage === 'highlight') && catCells.includes(cell);
          const red = stage === 'highlight' && cell === trial.red;
          const blue = stage === 'highlight' && cell === trial.blue;
          return <div aria-hidden="true" className={`${mouse ? 'mouse' : ''} ${red ? 'red' : ''} ${blue ? 'blue' : ''} ${cat && !red && !blue ? 'cat' : ''}`} key={cell}>{mouse ? <MouseMarker /> : cat ? <CatMarker tone={red ? 'red' : blue ? 'blue' : 'neutral'} /> : null}</div>;
        })}</div>
        {mode === 'practice' && <div className="mouse-actions">
          <div className={`mouse-stage-actor is-${stage}`}>
            {stage === 'memory' ? <MouseMarker size="hero" /> : stage === 'blank' ? <span className="memory-hold-mark">●<i /><i /><i /></span> : stage === 'cats' ? <span className="cat-pair"><CatMarker size="hero" /><CatMarker size="hero" /></span> : <span className="cat-pair"><CatMarker tone="red" size="hero" /><CatMarker tone="blue" size="hero" /></span>}
          </div>
          <span>{stage === 'memory' ? '위치 기억' : stage === 'blank' ? '기억 유지' : stage === 'cats' ? '고양이 확인' : '색 표식 확인'}</span>
          <h3>{stage === 'memory' ? '생쥐가 있던 칸을 기억하세요.' : stage === 'blank' ? '빈 격자에서도 위치를 유지하세요.' : stage === 'cats' ? '같은 수의 고양이 위치를 확인하세요.' : '빨강·파랑 고양이 위치를 대조하세요.'}</h3>
          {guidedPacing ? <button type="button" className="single-action accessible-next-action" aria-disabled={presentationAdvanceLocked} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; advanceMousePresentation(); }}>내용을 들었어요 · 다음 단계 <i>→</i></button> : <p className="auto-next">잠시 후 자동으로 다음 단계로 이동합니다.</p>}
          <div className="mouse-actor-key" aria-label="등장 캐릭터 안내"><span><MouseMarker size="compact" />생쥐</span><span><CatMarker tone="red" size="compact" />빨강</span><span><CatMarker tone="blue" size="compact" />파랑</span></div>
        </div>}
      </div> : <div className={`cat-decision ${stage}`} ref={decisionRef}>
        {guidedPacing ? <p className="guided-pacing-note" role="status">음성 안내 직접 진행 중 · 응답 제한시간 없음</p> : <DeadlineBar key={`${round}-${stage}`} duration={decisionMs} label={`${stage === 'red' ? '빨간' : '파란'} 고양이 판단 제한시간`} className="decision-time" />}
        <div className="target-cat"><span>{stage === 'red' ? '빨간 고양이' : '파란 고양이'}</span><div><CatMarker tone={stage} size="hero" /></div><h3>생쥐를 찾았나요? 확신도까지 선택하세요.</h3></div>
        <div className="decision-groups" role="group" aria-label={`${stage === 'red' ? '빨간' : '파란'} 고양이의 찾았다·놓쳤다와 확신도`}>
          <section><b>놓쳤다</b><div>{MOUSE_DECISION_OPTIONS.filter((option) => !option.caught).map((option) => <button className="missed" disabled={locked} aria-label={`놓쳤다, ${option.label}, 단축키 ${option.key}`} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; finishDecision(false, option.confidence); }} key={option.key}><b>{option.label}</b><span>{option.key}</span></button>)}</div></section>
          <section><b>찾았다</b><div>{MOUSE_DECISION_OPTIONS.filter((option) => option.caught).map((option) => <button className="caught" disabled={locked} aria-label={`찾았다, ${option.label}, 단축키 ${option.key}`} onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }} onClick={(event) => { if (event.detail > 1) return; finishDecision(true, option.confidence); }} key={option.key}><b>{option.label}</b><span>{option.key}</span></button>)}</div></section>
        </div>
      </div>}
    </GameFrame>
  );
}
