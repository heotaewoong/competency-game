'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import { CognitiveGlyph, glyphDefaultMnemonics, glyphShapeNames } from './cognitive-glyph';
import { getGame, type GameId, type SessionResult } from '../lib/game-data';
import {
  NBACK_GROUP_COUNT,
  NBACK_REAL_N2_PROBLEM_COUNT,
  NBACK_REAL_N23_PROBLEM_COUNT,
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
  buildRotationPuzzles,
  matrixForRotationSequence,
  rotationCssMatrix,
  rotationOperation,
  rotationOperations,
  rotationShapeMatches,
  type RotationContentMode,
  type RotationMatrix,
  type RotationOpId,
  type RotationPuzzle,
} from '../lib/rotation-game';
import { buildRpsTrials, type RpsChoice } from '../lib/rps-game';
import { buildMouseTrials } from '../lib/mouse-game';
import { buildCountTrials } from '../lib/count-game';
import { buildAppointmentTrials, type AppointmentTrial } from '../lib/appointment-game';
import { buildPathPuzzles, simulatePath, type Fence, type Side, type Vehicle } from '../lib/path-game';

type RawResult = Omit<SessionResult, 'id' | 'completedAt'>;
type GameProps = { onFinish: (result: RawResult) => void; onClose: () => void };

function shouldIgnoreGameShortcut(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.closest('.game-workspace')) return true;
  return Boolean(target.closest('a, input, textarea, select, [contenteditable="true"]'));
}

const officialInfo: Record<GameId, string> = {
  rps: '335', rotation: '336', appointment: '337', path: '338', potion: '339',
  number: '340', nback: '341', mouse: '342', count: '343',
};
const reviewAdvice: Record<GameId, string> = {
  rps: '물음표가 나인지 상대인지 먼저 고정한 뒤, 이기는 관계를 한 번만 변환하세요.',
  rotation: '특징점 하나를 기준으로 회전부터 맞추고, 마지막에 거울 반전 여부를 확인하세요.',
  appointment: '요일·장소·메뉴는 교집합만 남기고, 버스는 본 번호를 누적해 제외하세요.',
  path: '차량의 출발 방향에서 역으로 추적하고, 경로 성공 뒤 울타리 목표 수를 따로 확인하세요.',
  potion: '직전 결과 하나보다 같은 조합의 누적 비율을 기준으로 판단하세요.',
  nback: '도형의 한 글자 이름을 소리 없이 갱신하며 2칸·3칸 큐를 분리하세요.',
  number: '현재 숫자를 누르기 전에 다음 숫자 위치를 먼저 찾고 예외 규칙을 끝까지 유지하세요.',
  count: '글자 크기와 뜻을 읽지 말고 좌우의 밀도와 빈 공간 비율만 비교하세요.',
  mouse: '생쥐 위치와 고양이 위치를 같은 6×6 좌표로 겹쳐 보고, 판단과 확신을 분리하세요.',
};
const GLYPH_NAME_STORAGE_KEY = 'nineflow-glyph-mnemonics-v1';
const PRACTICE_CONFIG_STORAGE_KEY = 'nineflow-practice-config-v1';
const GLYPH_VISIBILITY_STORAGE_KEY = 'nineflow-show-glyph-names-v1';
const ROTATION_PREFERENCES_STORAGE_KEY = 'nineflow-rotation-preferences-v1';
const NBACK_PREFERENCES_STORAGE_KEY = 'nineflow-nback-preferences-v1';

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
  showPreview: boolean;
};
const DEFAULT_ROTATION_PREFERENCES: RotationPreferences = {
  contentMode: 'mixed',
  selectedLetters: [...ROTATION_LETTERS],
  showPreview: false,
};
const DEFAULT_NBACK_PREFERENCES: NBackPreferences = {
  task: 'n2',
  group: null,
  progression: 'fixed',
};
const SessionModeContext = createContext({ mode: 'practice' as SessionMode, showGlyphNames: true });
type PracticeSpec = {
  quantityLabel: string; quantityMin: number; quantityMax: number; quantityStep: number; quantityDefault: number;
  paceLabel: string; paceMin: number; paceMax: number; paceStep: number; paceDefault: number;
};

const practiceSpecs: Record<GameId, PracticeSpec> = {
  rps: { quantityLabel:'문제 수', quantityMin:9, quantityMax:30, quantityStep:3, quantityDefault:15, paceLabel:'문제 제한', paceMin:2500, paceMax:8000, paceStep:500, paceDefault:4500 },
  rotation: { quantityLabel:'문제 수', quantityMin:1, quantityMax:30, quantityStep:1, quantityDefault:10, paceLabel:'문제 제한', paceMin:15000, paceMax:90000, paceStep:5000, paceDefault:30000 },
  appointment: { quantityLabel:'세트 수', quantityMin:4, quantityMax:12, quantityStep:4, quantityDefault:4, paceLabel:'정보 제시', paceMin:1500, paceMax:6000, paceStep:500, paceDefault:3000 },
  path: { quantityLabel:'문제 수', quantityMin:3, quantityMax:12, quantityStep:1, quantityDefault:3, paceLabel:'문제 제한', paceMin:30000, paceMax:120000, paceStep:10000, paceDefault:60000 },
  potion: { quantityLabel:'시행 수', quantityMin:28, quantityMax:84, quantityStep:14, quantityDefault:42, paceLabel:'응답 제한', paceMin:3000, paceMax:12000, paceStep:1000, paceDefault:7000 },
  nback: { quantityLabel:'문제 수', quantityMin:1, quantityMax:100, quantityStep:1, quantityDefault:20, paceLabel:'문제 간격', paceMin:3000, paceMax:6000, paceStep:500, paceDefault:3000 },
  number: { quantityLabel:'문제 수', quantityMin:5, quantityMax:20, quantityStep:5, quantityDefault:10, paceLabel:'문제 제한', paceMin:10000, paceMax:60000, paceStep:5000, paceDefault:20000 },
  count: { quantityLabel:'문제 수', quantityMin:5, quantityMax:40, quantityStep:5, quantityDefault:10, paceLabel:'단어 제시', paceMin:500, paceMax:2500, paceStep:100, paceDefault:1000 },
  mouse: { quantityLabel:'라운드 수', quantityMin:3, quantityMax:15, quantityStep:1, quantityDefault:5, paceLabel:'생쥐 제시', paceMin:700, paceMax:3000, paceStep:100, paceDefault:1000 },
};

function defaultPracticeConfig(gameId: GameId): PracticeConfig {
  const spec = practiceSpecs[gameId];
  return { quantity: spec.quantityDefault, paceMs: spec.paceDefault };
}

function formatPace(milliseconds: number) {
  return `${Number.isInteger(milliseconds / 1000) ? milliseconds / 1000 : (milliseconds / 1000).toFixed(1)}초`;
}

function DeadlineBar({ duration, label, className = '' }: { duration: number; label: string; className?: string }) {
  const [remaining, setRemaining] = useState(duration);
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, duration - (performance.now() - startedAt));
      setRemaining(next);
      if (next === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [duration]);
  return <div className={`time-strip ${className}`.trim()} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(remaining)} aria-valuetext={`${(remaining / 1000).toFixed(1)}초 남음`}><i style={{ '--duration': `${duration}ms` } as CSSProperties} /><span className="deadline-text" aria-hidden="true">{(remaining / 1000).toFixed(1)}초</span></div>;
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

function resultFor(gameId: GameId, correct: number, total: number, rts: number[], errors: number, detail?: Record<string, number | string>): RawResult {
  const mean = rts.length ? rts.reduce((sum, value) => sum + value, 0) / rts.length : 0;
  const variance = rts.length ? rts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rts.length : 0;
  const stability = rts.length >= 2 && mean ? Math.max(0, Math.round(100 - Math.min(100, (Math.sqrt(variance) / mean) * 100))) : 0;
  return { gameId, accuracy: Math.round((correct / Math.max(total, 1)) * 100), medianRt: median(rts), stability, errors, detail: { ...detail, correctCount: correct, trialCount: total } };
}

function useManagedTimeout() {
  const timers = useRef<Set<number>>(new Set());
  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);
  return (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
    return timer;
  };
}

export function GameStage({ gameId, onClose, onSave }: { gameId: GameId; onClose: () => void; onSave: (result: SessionResult) => void }) {
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [result, setResult] = useState<SessionResult | null>(null);
  const [run, setRun] = useState(0);
  const [sessionMode, setSessionMode] = useState<SessionMode>('practice');
  const [glyphMnemonics, setGlyphMnemonics] = useState<string[]>([...glyphDefaultMnemonics]);
  const [showGlyphNames, setShowGlyphNames] = useState(true);
  const [practiceConfig, setPracticeConfig] = useState<PracticeConfig>(() => defaultPracticeConfig(gameId));
  const [nbackPreferences, setNBackPreferences] = useState<NBackPreferences>(DEFAULT_NBACK_PREFERENCES);
  const [rotationPreferences, setRotationPreferences] = useState<RotationPreferences>(DEFAULT_ROTATION_PREFERENCES);
  const panelRef = useRef<HTMLElement>(null);
  const finishedRun = useRef(false);
  const phaseRef = useRef(phase);
  const onCloseRef = useRef(onClose);
  const game = getGame(gameId);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const requestClose = useCallback(() => {
    if (phaseRef.current === 'play' && !finishedRun.current && !window.confirm('진행 중인 연습을 종료할까요? 현재 문제의 진행 내용은 저장되지 않습니다.')) return;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = panelRef.current?.parentElement;
    const siblings = backdrop?.parentElement ? Array.from(backdrop.parentElement.children).filter((element) => element !== backdrop) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => element.offsetParent !== null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { requestClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = items[0]; const last = items.at(-1)!;
      if (!items.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const focusFrame = window.requestAnimationFrame(() => (focusable()[0] ?? panelRef.current)?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      siblingState.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden); });
      previousFocus?.focus();
    };
  }, [requestClose]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
    const focusFrame = window.requestAnimationFrame(() => {
      if (phase === 'play') panelRef.current?.querySelector<HTMLElement>('.game-workspace')?.focus();
      if (phase === 'result') panelRef.current?.querySelector<HTMLElement>('.stage-result')?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [phase, run]);

  useEffect(() => {
    if (gameId !== 'nback') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(GLYPH_NAME_STORAGE_KEY) ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.length === glyphDefaultMnemonics.length && saved.every((value) => typeof value === 'string' && Array.from(value).length === 1)) {
        // 로컬 설정을 최초 1회 복원한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGlyphMnemonics(saved as string[]);
      }
      const savedVisibility = window.localStorage.getItem(GLYPH_VISIBILITY_STORAGE_KEY);
      if (savedVisibility === 'false') setShowGlyphNames(false);
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
    } catch { /* 잘못된 설정은 사용자 기본값으로 복구한다. */ }
  }, [gameId]);

  useEffect(() => {
    if (gameId !== 'rotation') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(ROTATION_PREFERENCES_STORAGE_KEY) ?? 'null') as Partial<RotationPreferences> | null;
      if (!saved) return;
      const contentMode = saved.contentMode && ['letters', 'tiles', 'mixed'].includes(saved.contentMode) ? saved.contentMode : DEFAULT_ROTATION_PREFERENCES.contentMode;
      const selectedLetters = Array.isArray(saved.selectedLetters)
        ? saved.selectedLetters.filter((letter): letter is string => typeof letter === 'string' && ROTATION_LETTERS.some((item) => item === letter))
        : [...ROTATION_LETTERS];
      // 저장된 도형 회전 연습값을 최초 1회 복원한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRotationPreferences({ contentMode, selectedLetters: selectedLetters.length ? selectedLetters : [...ROTATION_LETTERS], showPreview: saved.showPreview === true });
    } catch { /* 잘못된 설정은 검증된 기본값으로 복구한다. */ }
  }, [gameId]);

  useEffect(() => {
    try {
      const all = JSON.parse(window.localStorage.getItem(PRACTICE_CONFIG_STORAGE_KEY) ?? '{}') as Record<string, Partial<PracticeConfig>>;
      const saved = all[gameId];
      const spec = practiceSpecs[gameId];
      if (saved && typeof saved.quantity === 'number' && typeof saved.paceMs === 'number') {
        const normalized = {
          quantity: Math.min(spec.quantityMax, Math.max(spec.quantityMin, saved.quantity)),
          paceMs: Math.min(spec.paceMax, Math.max(spec.paceMin, saved.paceMs)),
        };
        // 저장된 게임별 연습값을 최초 1회 복원한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPracticeConfig(normalized);
      }
    } catch { /* 저장 설정이 깨졌다면 공개형식 기본값으로 계속한다. */ }
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
    try {
      const all = JSON.parse(window.localStorage.getItem(PRACTICE_CONFIG_STORAGE_KEY) ?? '{}') as Record<string, PracticeConfig>;
      window.localStorage.setItem(PRACTICE_CONFIG_STORAGE_KEY, JSON.stringify({ ...all, [gameId]: next }));
    } catch { /* 저장이 막혀도 현재 세션에는 적용한다. */ }
  }

  function saveNBackPreferences(next: NBackPreferences) {
    setNBackPreferences(next);
    try { window.localStorage.setItem(NBACK_PREFERENCES_STORAGE_KEY, JSON.stringify(next)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function saveRotationPreferences(next: RotationPreferences) {
    setRotationPreferences(next);
    try { window.localStorage.setItem(ROTATION_PREFERENCES_STORAGE_KEY, JSON.stringify(next)); } catch { /* 현재 세션에는 적용한다. */ }
  }

  function finish(raw: RawResult) {
    if (finishedRun.current) return;
    finishedRun.current = true;
    const practiceDetail: Record<string, string | number> = sessionMode === 'practice' ? { quantity: practiceConfig.quantity, paceMs: practiceConfig.paceMs } : {};
    const rotationDetail: Record<string, string | number> = gameId === 'rotation' ? { rotationContent: rotationPreferences.contentMode, rotationLetters: rotationPreferences.selectedLetters.join(''), previewUsed: rotationPreferences.showPreview ? '사용' : '숨김' } : {};
    const rawNBackGroup = raw.detail?.nbackGroup;
    const nbackDetail: Record<string, string | number> = gameId === 'nback' ? { nbackTask: sessionMode === 'simulation' ? '2-back → 2·3-back' : nbackPreferences.task, nbackGroup: typeof rawNBackGroup === 'number' || typeof rawNBackGroup === 'string' ? rawNBackGroup : nbackPreferences.group === null ? '자동 선택' : nbackPreferences.group + 1, nbackProgression: sessionMode === 'simulation' ? '고정' : nbackPreferences.progression } : {};
    const completed: SessionResult = { ...raw, detail: { ...raw.detail, ...practiceDetail, ...rotationDetail, ...nbackDetail, sessionMode: sessionMode === 'practice' ? '연습 모드' : '실전형 연습' }, id: `${gameId}-${Date.now()}`, completedAt: new Date().toISOString() };
    setResult(completed);
    onSave(completed);
    setPhase('result');
  }

  function restart() {
    finishedRun.current = false;
    setResult(null);
    setRun((value) => value + 1);
    setPhase('play');
  }

  return (
    <div className="stage-backdrop" role="presentation">
      <section ref={panelRef} className="stage-panel" data-game={gameId} role="dialog" aria-modal="true" aria-label={`${game.title} ${sessionMode === 'practice' ? '연습' : '실전형 연습'}`} tabIndex={-1}>
        {phase === 'intro' && (
          <>
            <div className="stage-intro-toolbar"><button className="stage-close session-close" aria-label={`${sessionMode === 'practice' ? '연습' : '실전형 연습'} 닫기`} onClick={requestClose}>×</button></div>
            <div className="stage-intro">
              <div className="intro-heading">
                <div><p>{game.no} · {game.skill}</p><h2>{game.title}</h2><span>{game.rounds}</span></div>
              </div>
              <div className="intro-config-grid">
                <div className="intro-config-main">
                  <div className="intro-rule"><b>연습 규칙</b><p>{game.rule}</p></div>
                  <details className="intro-details">
                    <summary>게임 정보 더 보기</summary>
                    <dl className="stage-meta">
                      <div><dt>조작</dt><dd>{game.input}</dd></div>
                      <div><dt>유형</dt><dd>{game.rounds}</dd></div>
                      <div><dt>연습 포인트</dt><dd>{game.focus}</dd></div>
                      <div><dt>예상 시간</dt><dd>{game.time}</dd></div>
                    </dl>
                  </details>
                  <ModeSelector mode={sessionMode} onChange={setSessionMode} />
                  {sessionMode === 'practice'
                    ? <><SessionSettings gameId={gameId} value={practiceConfig} onChange={savePracticeConfig} />{gameId === 'nback' && <NBackPracticeOptions value={nbackPreferences} onChange={saveNBackPreferences} />}</>
                    : <SimulationPreset gameId={gameId} />}
                </div>
              </div>
              <div className="intro-actions">
                <a href={`https://www.jobda.im/info/${officialInfo[gameId]}`} target="_blank" rel="noreferrer">공식 해설 확인 ↗</a>
                <button className="stage-start" onClick={() => setPhase('play')}>{sessionMode === 'practice' ? '연습 시작' : '실전형 연습 시작'} <span>→</span></button>
              </div>
              {gameId === 'rotation' && sessionMode === 'practice' && <details className="advanced-settings"><summary><span><b>도형 회전 세부 설정</b><small>알파벳·격자 유형, 글자 선택, 미리보기</small></span><em>설정 열기</em></summary><RotationPracticeOptions value={rotationPreferences} onChange={saveRotationPreferences} /></details>}
              {gameId === 'nback' && sessionMode === 'practice' && <details className="advanced-settings"><summary><span><b>도형 이름표 설정</b><small>한 글자 암기명 15개와 표시 여부</small></span><em>설정 열기</em></summary><GlyphNameLegend names={glyphMnemonics} onChange={saveGlyphMnemonics} showDuringPlay={showGlyphNames} onShowDuringPlayChange={saveGlyphVisibility} /></details>}
              <small>{sessionMode === 'practice' ? '속도·분량·이름표를 조절하며 익히는 모드입니다.' : '공개 튜토리얼의 조작 흐름을 고정 적용한 시뮬레이션입니다. 비공개 문항·타이밍·채점식과 동일함을 뜻하지 않습니다.'}</small>
            </div>
          </>
        )}
        {phase === 'play' && <SessionModeContext.Provider value={{ mode: sessionMode, showGlyphNames }}><GameRouter key={`${gameId}-${run}`} gameId={gameId} config={sessionMode === 'practice' ? practiceConfig : defaultPracticeConfig(gameId)} glyphMnemonics={glyphMnemonics} nbackPreferences={nbackPreferences} rotationPreferences={rotationPreferences} onFinish={finish} onClose={requestClose} /></SessionModeContext.Provider>}
        {phase === 'result' && result && <ResultView result={result} mode={sessionMode} onClose={requestClose} onRestart={restart} />}
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
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 'practice' : 'simulation');
  }
  return (
    <section className="mode-selector" aria-label="진행 모드 선택">
      <div><b>진행 모드</b><small>시작 전에 연습 또는 실전형 연습을 선택하세요</small></div>
      <div className="mode-options" role="radiogroup" aria-label="진행 방식">
        <button ref={practiceRef} type="button" role="radio" aria-checked={mode === 'practice'} tabIndex={mode === 'practice' ? 0 : -1} className={mode === 'practice' ? 'active' : ''} onKeyDown={navigate} onClick={() => onChange('practice')}>
          <span>연습 모드</span><b>내 설정으로 반복</b><small>분량·속도 조절 · 이름표 · 학습 도움</small>
        </button>
        <button ref={simulationRef} type="button" role="radio" aria-checked={mode === 'simulation'} tabIndex={mode === 'simulation' ? 0 : -1} className={mode === 'simulation' ? 'active' : ''} onKeyDown={navigate} onClick={() => onChange('simulation')}>
          <span>실전형 연습</span><b>고정 설정으로 집중</b><small>권장 고정값 · 이름표/정오 피드백 숨김</small>
        </button>
      </div>
    </section>
  );
}

function SimulationPreset({ gameId }: { gameId: GameId }) {
  if (gameId === 'rotation') {
    return (
      <section className="simulation-preset rotation-simulation-preset" aria-label="도형 회전 실전형 연습 고정 설정">
        <div><span><b>실전형 흐름 고정 설정</b><small>세션 시작 후 변경할 수 없습니다</small></span><em>6 MIN</em></div>
        <dl>
          <div><dt>1단계</dt><dd>알파벳 · 3분</dd></div>
          <div><dt>2단계</dt><dd>격자 도형 · 3분</dd></div>
          <div><dt>도움 표시</dt><dd>미리보기·정오 숨김</dd></div>
        </dl>
        <p>공개된 연습 흐름을 바탕으로 최대 8단계·20회 조작을 적용한 비공식 시뮬레이션입니다. 실제 비공개 문항과 채점식을 복제하거나 동일함을 보장하지 않습니다.</p>
      </section>
    );
  }
  if (gameId === 'nback') {
    return (
      <section className="simulation-preset nback-simulation-preset" aria-label="도형 순서 실전형 연습 고정 설정">
        <div><span><b>실전형 흐름 고정 설정</b><small>각 라운드에서 5개 고정 묶음 중 하나를 자동 선택합니다</small></span><em>{NBACK_REAL_N2_PROBLEM_COUNT + NBACK_REAL_N23_PROBLEM_COUNT}문항</em></div>
        <dl>
          <div><dt>출제 도형</dt><dd>선택된 한 묶음의 3개 도형</dd></div>
          <div><dt>도형 간격</dt><dd>3초</dd></div>
          <div><dt>라운드</dt><dd>2-back {NBACK_REAL_N2_PROBLEM_COUNT} → 2·3-back {NBACK_REAL_N23_PROBLEM_COUNT}</dd></div>
          <div><dt>도움 표시</dt><dd>이름표·정오 피드백 숨김</dd></div>
        </dl>
        <p>15개 전체가 뒤섞이지 않습니다. 라운드마다 3개씩 구성된 묶음 하나를 뽑고, 선택된 3개 도형만 무작위 순서로 등장합니다.</p>
      </section>
    );
  }
  const spec = practiceSpecs[gameId];
  const config = defaultPracticeConfig(gameId);
  return (
    <section className="simulation-preset" aria-label="실전형 연습 고정 설정">
      <div><span><b>실전형 연습 고정 설정</b><small>세션 시작 후 변경할 수 없습니다</small></span><em>고정</em></div>
      <dl>
        <div><dt>{spec.quantityLabel}</dt><dd>{config.quantity}</dd></div>
        <div><dt>{spec.paceLabel}</dt><dd>{formatPace(config.paceMs)}</dd></div>
        <div><dt>도움 표시</dt><dd>숨김</dd></div>
      </dl>
      <p>현재 공개된 JOBDA 튜토리얼은 정확한 최신 문항 수·자극 시간·채점식을 모두 공개하지 않습니다. 따라서 공개된 조작 순서를 유지한 권장 고정값으로 진행합니다.</p>
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
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + direction + options.length) % options.length;
    onChange(options[nextIndex]);
    window.requestAnimationFrame(() => event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus());
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
  return (
    <section className="rotation-practice-options nback-practice-options" aria-labelledby="nback-options-title">
      <header><div><b id="nback-options-title">도형 순서 세부 설정</b><small>난이도·도형 묶음·응답 후 진행 방식을 선택하세요</small></div><button type="button" onClick={() => onChange(DEFAULT_NBACK_PREFERENCES)}>기본값</button></header>
      <fieldset className="nback-difficulty-picker">
        <legend>난이도</legend>
        <div className="rotation-mode-options nback-difficulty-options" role="radiogroup" aria-label="도형 순서 난이도">
          <button type="button" role="radio" aria-checked={value.task === 'n2'} className={value.task === 'n2' ? 'active' : ''} onClick={() => onChange({ ...value, task: 'n2' })}><b>2-back</b><small>2번째 전과 같음 / 다름</small></button>
          <button type="button" role="radio" aria-checked={value.task === 'n23'} className={value.task === 'n23' ? 'active' : ''} onClick={() => onChange({ ...value, task: 'n23' })}><b>2·3-back</b><small>2번째 전 / 3번째 전 / 둘 다 다름</small></button>
        </div>
      </fieldset>
      <NBackGroupPicker value={value.group} onChange={(group) => onChange({ ...value, group })} label="출제 도형 묶음" />
      <fieldset className="nback-progression-picker">
        <legend>진행 방식</legend>
        <div className="rotation-mode-options nback-progression-options" role="radiogroup" aria-label="도형 순서 진행 방식">
          <button type="button" role="radio" aria-checked={value.progression === 'fixed'} className={value.progression === 'fixed' ? 'active' : ''} onClick={() => onChange({ ...value, progression: 'fixed' })}><b>고정 간격</b><small>응답해도 설정한 시간이 끝난 뒤 전환</small></button>
          <button type="button" role="radio" aria-checked={value.progression === 'fast'} className={value.progression === 'fast' ? 'active' : ''} onClick={() => onChange({ ...value, progression: 'fast' })}><b>정답 빠른 전환</b><small>정답이면 약 0.3초 뒤 다음 도형</small></button>
        </div>
      </fieldset>
    </section>
  );
}

function RotationPracticeOptions({ value, onChange }: { value: RotationPreferences; onChange: (value: RotationPreferences) => void }) {
  const modes: Array<{ id: RotationContentMode; label: string; description: string }> = [
    { id: 'letters', label: '알파벳', description: '선택한 글자만 반복' },
    { id: 'tiles', label: '격자 도형', description: '4×4 패턴 집중' },
    { id: 'mixed', label: '혼합', description: '두 유형 번갈아 출제' },
  ];
  function toggleLetter(letter: string) {
    const selected = value.selectedLetters.includes(letter);
    if (selected && value.selectedLetters.length === 1) return;
    onChange({ ...value, selectedLetters: selected ? value.selectedLetters.filter((item) => item !== letter) : [...value.selectedLetters, letter] });
  }
  function navigateMode(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : (index + direction + modes.length) % modes.length;
    onChange({ ...value, contentMode: modes[nextIndex].id });
    window.requestAnimationFrame(() => event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus());
  }
  return (
    <section className="rotation-practice-options" aria-labelledby="rotation-options-title">
      <header><div><b id="rotation-options-title">도형 회전 연습 설정</b><small>문제 유형과 학습 보조를 선택하세요</small></div><button type="button" onClick={() => onChange(DEFAULT_ROTATION_PREFERENCES)}>기본값</button></header>
      <div className="rotation-mode-options" role="radiogroup" aria-label="도형 회전 문제 유형">
        {modes.map((item, index) => <button type="button" role="radio" aria-checked={value.contentMode === item.id} tabIndex={value.contentMode === item.id ? 0 : -1} className={value.contentMode === item.id ? 'active' : ''} key={item.id} onKeyDown={(event) => navigateMode(event, index)} onClick={() => onChange({ ...value, contentMode: item.id })}><b>{item.label}</b><small>{item.description}</small></button>)}
      </div>
      {value.contentMode !== 'tiles' && (
        <div className="rotation-letter-picker">
          <div><b>연습할 알파벳</b><small>{value.selectedLetters.length}개 선택</small></div>
          <div role="group" aria-label="연습할 알파벳 선택">{ROTATION_LETTERS.map((letter) => <button type="button" aria-pressed={value.selectedLetters.includes(letter)} className={value.selectedLetters.includes(letter) ? 'active' : ''} key={letter} onClick={() => toggleLetter(letter)}>{letter}</button>)}</div>
        </div>
      )}
      <label className="rotation-preview-setting"><span><b>현재 모양 미리보기</b><small>버튼을 누를 때 시작 모양에 변환을 즉시 반영합니다</small></span><input type="checkbox" checked={value.showPreview} onChange={(event) => onChange({ ...value, showPreview: event.target.checked })} /><i aria-hidden="true" /></label>
    </section>
  );
}

function SessionSettings({ gameId, value, onChange }: { gameId: GameId; value: PracticeConfig; onChange: (value: PracticeConfig) => void }) {
  const spec = practiceSpecs[gameId];
  function change(field: keyof PracticeConfig, delta: number) {
    const min = field === 'quantity' ? spec.quantityMin : spec.paceMin;
    const max = field === 'quantity' ? spec.quantityMax : spec.paceMax;
    onChange({ ...value, [field]: Math.min(max, Math.max(min, value[field] + delta)) });
  }
  return (
    <section className="session-settings" aria-label="연습 세션 설정">
      <div><span><b>세션 설정</b><small>공개 형식 기반 연습값 · 언제든 변경 가능</small></span><button type="button" onClick={() => onChange(defaultPracticeConfig(gameId))}>기본값</button></div>
      <div className="session-steppers">
        <div className="session-stepper" role="group" aria-labelledby={`${gameId}-quantity-label`}><span id={`${gameId}-quantity-label`}>{spec.quantityLabel}</span><div><button type="button" aria-label={`${spec.quantityLabel} 줄이기`} onClick={() => change('quantity', -spec.quantityStep)}>−</button><output aria-live="polite" aria-label={`${spec.quantityLabel} 현재 값`}>{value.quantity}</output><button type="button" aria-label={`${spec.quantityLabel} 늘리기`} onClick={() => change('quantity', spec.quantityStep)}>＋</button></div></div>
        <div className="session-stepper" role="group" aria-labelledby={`${gameId}-pace-label`}><span id={`${gameId}-pace-label`}>{spec.paceLabel}</span><div><button type="button" aria-label={`${spec.paceLabel} 줄이기`} onClick={() => change('paceMs', -spec.paceStep)}>−</button><output aria-live="polite" aria-label={`${spec.paceLabel} 현재 값`}>{formatPace(value.paceMs)}</output><button type="button" aria-label={`${spec.paceLabel} 늘리기`} onClick={() => change('paceMs', spec.paceStep)}>＋</button></div></div>
      </div>
      <p>정확한 최신 문항 수·노출시간은 공개되지 않아 조절값으로 제공합니다. 게임 구조와 조작은 JOBDA 공개 튜토리얼 기준입니다.</p>
    </section>
  );
}

function GlyphNameLegend({ names, onChange, showDuringPlay, onShowDuringPlayChange }: { names: string[]; onChange: (names: string[]) => void; showDuringPlay: boolean; onShowDuringPlayChange: (show: boolean) => void }) {
  function update(index: number, raw: string) {
    const value = Array.from(raw.trim()).at(-1) ?? '';
    const next = [...names]; next[index] = value; onChange(next);
  }
  return (
    <section className="glyph-legend" aria-labelledby="glyph-legend-title">
      <header className="glyph-legend-head">
        <div><h3 id="glyph-legend-title">내 한 글자 이름표</h3><p>한 행이 한 세트입니다. 도형 3개를 왼쪽부터 묶어서 외우세요.</p></div>
        <div className="glyph-legend-tools">
          <label className="glyph-visibility"><input type="checkbox" checked={showDuringPlay} onChange={(event) => onShowDuringPlayChange(event.target.checked)} /><i aria-hidden="true" /><span>연습 중 이름 표시</span></label>
          <button type="button" onClick={() => onChange([...glyphDefaultMnemonics])}>기본값 복원</button>
        </div>
      </header>
      <div className="glyph-set-list">
        {Array.from({ length: 5 }, (_, setIndex) => (
          <section className="glyph-set" role="group" aria-labelledby={`glyph-set-${setIndex + 1}`} key={setIndex}>
            <h4 id={`glyph-set-${setIndex + 1}`}><span>세트</span><b>{setIndex + 1}</b></h4>
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

function GameRouter({ gameId, glyphMnemonics, nbackPreferences, rotationPreferences, config, ...props }: GameProps & { gameId: GameId; glyphMnemonics: string[]; nbackPreferences: NBackPreferences; rotationPreferences: RotationPreferences; config: PracticeConfig }) {
  if (gameId === 'rps') return <RpsGame {...props} config={config} />;
  if (gameId === 'rotation') return <RotationGame {...props} config={config} preferences={rotationPreferences} />;
  if (gameId === 'appointment') return <AppointmentGame {...props} config={config} />;
  if (gameId === 'path') return <PathGame {...props} config={config} />;
  if (gameId === 'potion') return <PotionGame {...props} config={config} />;
  if (gameId === 'nback') return <NBackGame {...props} config={config} glyphMnemonics={glyphMnemonics} preferences={nbackPreferences} />;
  if (gameId === 'number') return <NumberGame {...props} config={config} />;
  if (gameId === 'count') return <CountGame {...props} config={config} />;
  return <MouseGame {...props} config={config} />;
}

function GameFrame({ gameId, current, total, children, helper, feedback, statusMessage, showFeedbackInSimulation = false, onClose }: { gameId: GameId; current: number; total: number; children: ReactNode; helper: string; feedback?: string; statusMessage?: string; showFeedbackInSimulation?: boolean; onClose: () => void }) {
  const game = getGame(gameId);
  const { mode } = useContext(SessionModeContext);
  const visibleFeedback = mode === 'practice' || showFeedbackInSimulation ? feedback ?? '' : '';
  const feedbackTone = /^(정답|성공|경로 성공)/.test(visibleFeedback)
    ? 'is-success'
    : /^(오답|시간|20회|모양|물음표|정답은|모든|경로는|순서)/.test(visibleFeedback) ? 'is-error' : '';
  const liveDetail = visibleFeedback || statusMessage;
  const liveMessage = `${total}문제 중 ${current}번째${liveDetail ? `. ${liveDetail}` : ''}`;
  return (
    <div className={`game-workspace game-${gameId}`} data-mode={mode} role="region" aria-labelledby={`${gameId}-workspace-title`} tabIndex={-1}>
      <header className="workspace-head">
        <div><p>{game.no} · {game.skill} <span className="mode-chip">{mode === 'practice' ? '연습' : '실전형'}</span></p><h2 id={`${gameId}-workspace-title`}>{game.title}</h2></div>
        <div className="workspace-progress"><span>{current} / {total}</span><i role="progressbar" aria-label="문제 진행률" aria-valuemin={current === 0 ? 0 : 1} aria-valuemax={total} aria-valuenow={current} aria-valuetext={current === 0 ? `${total}문제 중 기억 구간` : `${total}문제 중 ${current}번째`}><b style={{ width: `${Math.round((current / total) * 100)}%` }} /></i></div>
        <button className="session-close" aria-label={`${mode === 'practice' ? '연습' : '실전형 연습'} 닫기`} onClick={onClose}>×</button>
      </header>
      <div className="workspace-body">{children}</div>
      <footer className="workspace-foot"><span>{mode === 'practice' ? helper : '피드백 없이 고정 설정으로 진행 중'}</span><b className={feedbackTone}>{visibleFeedback}</b><span className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</span></footer>
    </div>
  );
}

function ResultView({ result, mode, onClose, onRestart }: { result: SessionResult; mode: SessionMode; onClose: () => void; onRestart: () => void }) {
  const game = getGame(result.gameId);
  const trialCount = typeof result.detail?.trialCount === 'number' ? result.detail.trialCount : 0;
  const rotationDetail = result.gameId === 'rotation' ? [
    ['풀이 수', result.detail?.attemptCount ?? 0],
    ['조작 효율', result.detail?.clickEfficiency ?? '—'],
    ['평균 추가 단계', result.detail?.averageExtraClicks === '—' ? '—' : `${result.detail?.averageExtraClicks ?? 0}회`],
    ['알파벳 정확도', result.detail?.letterAccuracy ?? '—'],
    ['격자 정확도', result.detail?.tileAccuracy ?? '—'],
  ] : [];
  const nbackDetail = result.gameId === 'nback' ? [
    ['놓친 표적', result.detail?.misses ?? 0],
    ['최고 연속 정답', result.detail?.bestStreak ?? 0],
    ['2-back 정확도', result.detail?.n2Accuracy === '—' ? '—' : `${result.detail?.n2Accuracy ?? 0}%`],
    ['2·3-back 정확도', result.detail?.n23Accuracy === '—' ? '—' : `${result.detail?.n23Accuracy ?? 0}%`],
    ['2번째 전 정확도', result.detail?.secondAccuracy === '—' ? '—' : `${result.detail?.secondAccuracy ?? 0}%`],
    ['3번째 전 정확도', result.detail?.thirdAccuracy === '—' ? '—' : `${result.detail?.thirdAccuracy ?? 0}%`],
    ['둘 다 다름 정확도', result.detail?.neitherAccuracy === '—' ? '—' : `${result.detail?.neitherAccuracy ?? 0}%`],
  ] : [];
  return (
    <section className="stage-result" role="region" aria-labelledby="result-title" tabIndex={-1}>
      <span className="result-check" aria-hidden="true">✓</span><p>{mode === 'practice' ? '연습 모드' : '실전형 연습'} 완료 · {game.no}</p><h2 id="result-title">{game.title} 결과</h2>
      <div className="result-metrics">
        <article><span>정확도</span><b>{result.accuracy}%</b></article>
        <article><span>중앙 반응</span><b>{result.medianRt ? `${result.medianRt}ms` : '—'}</b></article>
        <article><span>일관성</span><b>{trialCount >= 2 ? `${result.stability}%` : '—'}</b></article>
        <article><span>오류</span><b>{result.errors}</b></article>
      </div>
      {rotationDetail.length > 0 && <aside className="rotation-result-detail" aria-label="도형 회전 상세 결과"><b>도형 회전 상세</b><dl>{rotationDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>조작 효율은 정답 문제의 최소 단계 수를 회전·반전·지움·초기화에 실제 사용한 조작 수로 나눈 연습 지표입니다.</p></aside>}
      {nbackDetail.length > 0 && <aside className="rotation-result-detail nback-result-detail" aria-label="도형 순서 상세 결과"><b>도형 순서 상세</b><dl>{nbackDetail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>정확도는 선택한 기억 간격과 응답 유형별 채점 문항을 기준으로 계산합니다.</p></aside>}
      {result.errors > 0 && <aside className="result-review"><b>오답 복습 포인트</b><p>{reviewAdvice[result.gameId]}</p></aside>}
      <div className="result-actions"><button onClick={onRestart}>{mode === 'practice' ? '다시 연습' : '실전형으로 다시 하기'}</button><button className="stage-start" onClick={onClose}>게임 목록 <span>→</span></button></div>
      <small>개인 연습 기록이며 실제 역량검사 점수나 채용 결과가 아닙니다.</small>
    </section>
  );
}

const rpsChoices = [
  { id: 'scissors', label: '가위', key: '←', image: '/assets/rps/scissors.svg' },
  { id: 'rock', label: '바위', key: '↓', image: '/assets/rps/rock.svg' },
  { id: 'paper', label: '보', key: '→', image: '/assets/rps/paper.svg' },
] as const;
function RpsGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => buildRpsTrials(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const schedule = useManagedTimeout();
  const item = trials[round];

  function choose(choice: RpsChoice | null) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setLocked(true);
    const ok = choice === item.answer;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    setFeedback(choice === null ? '시간 초과' : ok ? '정답' : '물음표 위치를 먼저 확인하세요.');
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('rps', nextCorrect, trials.length, nextRts, nextErrors));
      else { resolvedRef.current = false; setRound(round + 1); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, mode === 'practice' ? 1000 : 420);
  }

  useEffect(() => {
    resolvedRef.current = false;
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => choose(null), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Each new problem gets one fresh deadline; `choose` intentionally uses that round's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || shouldIgnoreGameShortcut(event)) return;
      if (['ArrowLeft','ArrowDown','ArrowRight'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft') choose('scissors');
      if (event.key === 'ArrowDown') choose('rock');
      if (event.key === 'ArrowRight') choose('paper');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = rpsChoices.find((choice) => choice.id === item.shown)!;
  return (
    <GameFrame gameId="rps" current={round + 1} total={trials.length} helper="← 가위 · ↓ 바위 · → 보" feedback={feedback} onClose={onClose}>
      <div className="round-label">{item.phase}</div>
      <DeadlineBar key={round} duration={config.paceMs} label="문제 제한시간" />
      <div className="rps-board">
        <article><span>나</span>{item.unknown === 'player' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
        <div><b>VS</b><span>내가 이기는 관계</span></div>
        <article><span>상대</span>{item.unknown === 'opponent' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
      </div>
      <div className="rps-actions">{rpsChoices.map((choice) => <button key={choice.id} disabled={locked} onClick={(event) => { if (event.detail > 1) return; choose(choice.id); }}><Image src={choice.image} alt="" width={42} height={42} /><span>{choice.key}</span><b>{choice.label}</b></button>)}</div>
    </GameFrame>
  );
}

type RotationAttempt = {
  kind: RotationPuzzle['kind'];
  correct: boolean;
  used: number;
  edits: number;
  optimal: number;
  extra: number;
  rt: number;
};
type RotationReview = RotationAttempt & { timedOut?: boolean; budgetExhausted?: boolean };
const ROTATION_PHASE_MS = 180_000;

function RotationShape({ puzzle, matrix, label }: { puzzle: RotationPuzzle; matrix: RotationMatrix; label: string }) {
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

function RotationGame({ onFinish, onClose, config, preferences }: GameProps & { config: PracticeConfig; preferences: RotationPreferences }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const [simulationPhase, setSimulationPhase] = useState<'letters' | 'tiles'>('letters');
  const contentMode = mode === 'simulation' ? simulationPhase : preferences.contentMode;
  const selectedLetters = mode === 'simulation' ? ROTATION_LETTERS : preferences.selectedLetters;
  const puzzleCount = mode === 'simulation' ? 120 : config.quantity;
  const puzzles = useMemo(() => buildRotationPuzzles(puzzleCount, seed + (simulationPhase === 'tiles' ? 73_001 : 0), contentMode, selectedLetters), [contentMode, puzzleCount, seed, selectedLetters, simulationPhase]);
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<RotationOpId[]>([]);
  const [clicks, setClicks] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [review, setReview] = useState<RotationReview | null>(null);
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const finishedRef = useRef(false);
  const attemptsRef = useRef<RotationAttempt[]>([]);
  const schedule = useManagedTimeout();
  const puzzle = puzzles[round % puzzles.length];
  const remaining = Math.max(0, 20 - clicks);
  const previewMatrix = mode === 'practice' && preferences.showPreview ? matrixForRotationSequence(sequence) : IDENTITY_MATRIX;

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
    onFinish(resultFor('rotation', correctAttempts.length, attempts.length, attempts.map((attempt) => attempt.rt), attempts.length - correctAttempts.length, {
      attemptCount: attempts.length,
      clickEfficiency: editTotal ? `${Math.round((optimalTotal / editTotal) * 100)}%` : '—',
      averageExtraClicks: correctAttempts.length ? averageExtra.toFixed(1) : '—',
      letterAccuracy: typeof typeAccuracy(letters) === 'number' ? `${typeAccuracy(letters)}%` : '—',
      tileAccuracy: typeof typeAccuracy(tiles) === 'number' ? `${typeAccuracy(tiles)}%` : '—',
    }));
  }

  function clearRoundState() {
    resolvedRef.current = false;
    setSequence([]);
    setClicks(0);
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

  function recordAttempt(ok: boolean, timedOut = false, usedOverride?: number, editsOverride?: number) {
    if (resolvedRef.current) return null;
    resolvedRef.current = true;
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    const used = usedOverride ?? sequence.length;
    const optimal = puzzle.optimal.length;
    const attempt: RotationAttempt = {
      kind: puzzle.kind,
      correct: ok,
      used,
      edits: editsOverride ?? clicks,
      optimal,
      extra: ok ? Math.max(0, used - optimal) : 0,
      rt: timedOut ? config.paceMs : Math.max(0, Math.round(performance.now() - started.current)),
    };
    attemptsRef.current.push(attempt);
    return attempt;
  }

  function resolveAnswer(ok: boolean, timedOut = false, options?: { used?: number; edits?: number; budgetExhausted?: boolean }) {
    const attempt = recordAttempt(ok, timedOut, options?.used, options?.edits);
    if (!attempt) return;
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
    if (ok && attempt.extra === 0) schedule(advanceRound, 1_300);
    else setReview({ ...attempt, timedOut, budgetExhausted: options?.budgetExhausted });
  }

  useEffect(() => {
    started.current = performance.now();
    if (mode !== 'practice') return;
    resolvedRef.current = false;
    timeoutRef.current = window.setTimeout(() => resolveAnswer(false, true), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // 문제별 제한시간은 라운드가 바뀔 때만 새로 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, mode, simulationPhase]);

  useEffect(() => {
    if (mode !== 'simulation') return;
    const phaseTimer = window.setTimeout(() => {
      if (simulationPhase === 'letters') {
        setSimulationPhase('tiles');
        setRound(0);
        clearRoundState();
      } else resultFromAttempts();
    }, ROTATION_PHASE_MS);
    return () => window.clearTimeout(phaseTimer);
    // 실전은 알파벳 3분 후 격자 도형 3분으로 한 번만 전환한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, simulationPhase]);

  function addOperation(id: RotationOpId) {
    if (locked || remaining <= 0 || sequence.length >= 8) return;
    setSequence((current) => [...current, id]);
    setClicks((value) => value + 1);
    const nextLength = sequence.length + 1;
    setAnnouncement(`${rotationOperation(id).label} 추가, ${nextLength}단계 입력, ${remaining - 1}회 남음${nextLength === 8 ? '. 입력 8칸이 모두 찼습니다. 한 단계를 지우거나 제출하세요.' : ''}`);
  }
  function undoOperation() {
    if (!sequence.length || locked || remaining <= 0) return;
    const nextSequence = sequence.slice(0, -1);
    const nextClicks = clicks + 1;
    setSequence(nextSequence);
    setClicks((value) => value + 1);
    setAnnouncement(`마지막 조작 삭제, ${nextSequence.length}단계 입력, ${remaining - 1}회 남음`);
    if (remaining === 1 && nextSequence.length === 0) resolveAnswer(false, false, { used: 0, edits: nextClicks, budgetExhausted: true });
  }
  function resetOperations() {
    if (!sequence.length || locked || remaining <= 0) return;
    const nextClicks = clicks + 1;
    setSequence([]);
    setClicks((value) => value + 1);
    setAnnouncement(`전체 입력 초기화, ${remaining - 1}회 남음`);
    if (remaining === 1) resolveAnswer(false, false, { used: 0, edits: nextClicks, budgetExhausted: true });
  }
  function submit() {
    if (!sequence.length || locked) return;
    resolveAnswer(rotationShapeMatches(puzzle, sequence));
  }

  const onRotationKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
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

  const currentPhase = simulationPhase === 'letters' ? '알파벳' : '격자 도형';
  const sequenceStatus = `${sequence.length}/8단계 · ${remaining}/20회 남음`;
  return (
    <GameFrame gameId="rotation" current={mode === 'simulation' ? (simulationPhase === 'letters' ? 1 : 2) : round + 1} total={mode === 'simulation' ? 2 : puzzles.length} helper="1·2 회전 · 3·4 반전 · Backspace 지움 · Delete 초기화 · Enter 제출" feedback={feedback} statusMessage={announcement} onClose={onClose}>
      {mode === 'simulation' ? <div className="rotation-phase-banner"><span>실전형 단계 {simulationPhase === 'letters' ? '1' : '2'} / 2</span><b>{currentPhase}</b><small>3분 동안 가능한 만큼 정확하게 해결하세요</small></div> : <div className="rotation-practice-banner"><b>{puzzle.kind === 'letter' ? '알파벳' : '격자 도형'}</b><span>{preferences.showPreview ? '미리보기 켜짐' : '미리보기 꺼짐'}</span></div>}
      <DeadlineBar key={mode === 'simulation' ? simulationPhase : round} duration={mode === 'simulation' ? ROTATION_PHASE_MS : config.paceMs} label={mode === 'simulation' ? `${currentPhase} 단계 남은 시간` : '문제 제한시간'} />
      <div className="rotation-comparison">
        <article className={preferences.showPreview && mode === 'practice' ? 'is-preview' : ''}><span>{preferences.showPreview && mode === 'practice' ? '현재 미리보기' : '시작'}</span><RotationShape puzzle={puzzle} matrix={previewMatrix} label={`${preferences.showPreview && mode === 'practice' ? '입력한 조작이 반영된 현재' : '시작'} ${puzzle.kind === 'letter' ? `알파벳 ${puzzle.letter}` : '4×4 격자 도형'}`} /></article>
        <b aria-hidden="true">→</b>
        <article><span>목표</span><RotationShape puzzle={puzzle} matrix={puzzle.target} label={`목표 ${puzzle.kind === 'letter' ? `알파벳 ${puzzle.letter}` : '4×4 격자 도형'}`} /></article>
      </div>
      <div className="rotation-controls">
        <div className="rotation-control-head"><div><b>변환 선택</b><small>최대 8단계 · 조작·지움·초기화 합계 20회</small></div><span className={remaining <= 5 ? 'is-low' : ''}>{sequenceStatus}</span></div>
        <div className="rotation-op-grid">{rotationOperations.map((operation) => <button type="button" key={operation.id} disabled={locked || remaining === 0 || sequence.length >= 8} onClick={() => addOperation(operation.id)} aria-label={`${operation.key}번 ${operation.label}`}><kbd>{operation.key}</kbd><b aria-hidden="true">{operation.short}</b><span>{operation.label}</span></button>)}</div>
        <div className="operation-sequence"><span>입력 순서</span><ol aria-label="입력한 변환 순서">{Array.from({ length: 8 }, (_, index) => <li className={sequence[index] ? 'filled' : ''} key={index}><span>{index + 1}</span><b>{sequence[index] ? rotationOperation(sequence[index]).short : ''}</b><small>{sequence[index] ? rotationOperation(sequence[index]).label.replace(' 45°', '') : '비어 있음'}</small></li>)}</ol></div>
        <div className="rotation-click-meter" role="progressbar" aria-label="남은 조작 기회" aria-valuemin={0} aria-valuemax={20} aria-valuenow={remaining} aria-valuetext={`20회 중 ${remaining}회 남음`}><i style={{ width: `${remaining * 5}%` }} /></div>
        <div className="rotation-submit-row"><span>남은 조작 <b>{remaining}</b><small>/ 20</small></span><button type="button" onClick={undoOperation} disabled={!sequence.length || locked || remaining <= 0}>하나 지움 <kbd>⌫</kbd></button><button type="button" onClick={resetOperations} disabled={!sequence.length || locked || remaining <= 0}>전체 초기화 <kbd>Del</kbd></button><button type="button" className="primary-submit" onClick={submit} disabled={!sequence.length || locked}>답안 제출 <kbd>Enter</kbd></button></div>
      </div>
      {review && (
        <section className={`rotation-review ${review.correct ? 'is-correct' : 'is-wrong'}`} aria-label="문제 풀이 결과">
          <header><div><span>{review.correct ? '정답' : review.timedOut ? '시간 초과' : review.budgetExhausted ? '조작 소진' : '오답'}</span><b>{review.correct ? `모양 일치 · 최소보다 +${review.extra}회` : '목표 모양과 불일치'}</b></div><dl><div><dt>최소</dt><dd>{review.optimal}회</dd></div><div><dt>최종 단계</dt><dd>{review.used}회</dd></div><div><dt>편집 조작</dt><dd>{review.edits}회</dd></div></dl></header>
          <div className="rotation-answer-compare"><div><span>내 입력</span><b>{rotationSequenceText(sequence)}</b></div><div><span>최소 조작 예시</span><b>{rotationSequenceText(puzzle.optimal)}</b></div></div>
          <button type="button" className="primary-submit" onClick={advanceRound}>{round >= puzzles.length - 1 ? '결과 보기' : '다음 문제'} <span>→</span></button>
        </section>
      )}
    </GameFrame>
  );
}

const personNames = ['영희','철수','미미'];
const foodIcons: Record<string, string> = { 우동:'🍜', 탕수육:'🍛', 초밥:'🍣', 장어:'🍱', 돈가스:'🍛', 만두:'🥟', 회:'🐟' };

function PersonMemory({ trial, person }: { trial: AppointmentTrial; person: number }) {
  const values = trial.people[person];
  if (trial.kind === 'location') return <div className="location-memory" role="img" aria-label={`선호 장소 ${values.join(', ')}`}>{Array.from({ length: 16 }, (_, index) => { const id = `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`; return <i aria-hidden="true" className={values.includes(id) ? 'selected' : ''} key={id}>{id}</i>; })}</div>;
  if (trial.kind === 'food') return <div className="food-memory">{values.map((value) => <span key={value}><i>{foodIcons[value]}</i><b>{value}</b></span>)}</div>;
  if (trial.kind === 'bus') return <div className="bus-memory">{values.map((value) => <span key={value}><i>🚌</i><b>{value}</b></span>)}</div>;
  return <div className="day-memory">{values.map((value) => <b key={value}>{value}</b>)}</div>;
}

function AppointmentGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => buildAppointmentTrials(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [person, setPerson] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const answerTimeoutRef = useRef<number | null>(null);
  const answerResolvedRef = useRef(false);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const answerLimit = Math.max(5000, config.paceMs * 2);
  useEffect(() => { started.current = performance.now(); }, []);

  function nextPerson() {
    if (person < 2) setPerson(person + 1);
    else { answerResolvedRef.current = false; setAnswering(true); started.current = performance.now(); }
  }
  useEffect(() => {
    if (answering || locked) return;
    const timer = window.setTimeout(nextPerson, config.paceMs);
    return () => window.clearTimeout(timer);
    // Person cards advance after the configured presentation time, or earlier by button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, person, answering, locked]);
  useEffect(() => {
    if (!answering || locked || mode !== 'simulation') return;
    answerResolvedRef.current = false;
    answerTimeoutRef.current = window.setTimeout(() => choose(null), answerLimit);
    return () => {
      if (answerTimeoutRef.current !== null) { window.clearTimeout(answerTimeoutRef.current); answerTimeoutRef.current = null; }
    };
    // The public tutorial does not publish an exact response deadline, so simulation uses the visible preset-derived limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answering, round, locked, mode, answerLimit]);
  function choose(value: string | null) {
    if (!answering || locked || answerResolvedRef.current) return;
    answerResolvedRef.current = true;
    if (answerTimeoutRef.current !== null) { window.clearTimeout(answerTimeoutRef.current); answerTimeoutRef.current = null; }
    setLocked(true);
    const ok = value === trial.answer;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setFeedback(value === null ? '시간 초과' : ok ? '정답' : `정답은 ${trial.answer}`);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('appointment', nextCorrect, trials.length, nextRts, nextErrors));
      else { answerResolvedRef.current = false; setRound(round + 1); setPerson(0); setAnswering(false); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, mode === 'practice' ? 1000 : 650);
  }

  return (
    <GameFrame gameId="appointment" current={round + 1} total={trials.length} helper={trial.kind === 'bus' ? '버스는 본 번호를 누적해 NOT을 찾습니다.' : '두 사람부터 교집합만 남겨 셋째와 비교합니다.'} feedback={feedback} onClose={onClose}>
      {!answering ? <div className="appointment-stimulus"><DeadlineBar key={`${round}-${person}`} duration={config.paceMs} label={`${personNames[person]} 정보 제시시간`} /><span>{personNames[person]} · {trial.kind === 'bus' ? '탑승 버스' : '선호 정보'}</span><h3>{trial.title}</h3><PersonMemory trial={trial} person={person} />{mode === 'practice' ? <button className="single-action" onClick={nextPerson}>{person < 2 ? '다음 사람' : '질문 보기'} <i>→</i></button> : <p className="auto-next">정보 제시시간이 끝나면 자동으로 다음 화면으로 이동합니다.</p>}</div> : <div className="appointment-question">{mode === 'simulation' && <DeadlineBar key={`${round}-answer`} duration={answerLimit} label="응답 제한시간" />}<span>{trial.kind === 'bus' ? 'NOT' : 'AND'}</span><h3>{trial.title}</h3><div>{trial.choices.map((value) => <button disabled={locked} onClick={() => choose(value)} key={value}>{trial.kind === 'food' && <i>{foodIcons[value]}</i>}<b>{value}</b></button>)}</div></div>}
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
  const [seed] = useState(newSessionSeed);
  const puzzles = useMemo(() => buildPathPuzzles(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [fences, setFences] = useState<Record<string, Fence>>({});
  const [clicks, setClicks] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const hadErrorRef = useRef(false);
  const interactionClicksRef = useRef(0);
  const scoreRef = useRef({ correct: 0, errors: 0, rts: [] as number[], attemptErrors: 0, clicks: 0 });
  const schedule = useManagedTimeout();
  const puzzle = puzzles[round];

  function advanceRound(success: boolean, message: string) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setLocked(true); setFeedback(message);
    const firstTrySuccess = success && !hadErrorRef.current;
    scoreRef.current = {
      ...scoreRef.current,
      correct: scoreRef.current.correct + (firstTrySuccess ? 1 : 0),
      errors: scoreRef.current.errors + (firstTrySuccess ? 0 : 1),
      rts: [...scoreRef.current.rts, Math.round(performance.now() - started.current)],
      clicks: interactionClicksRef.current,
    };
    schedule(() => {
      if (round === puzzles.length - 1) {
        const score = scoreRef.current;
        onFinish(resultFor('path', score.correct, puzzles.length, score.rts, score.errors, { clicks: score.clicks, attemptErrors: score.attemptErrors }));
      } else { resolvedRef.current = false; hadErrorRef.current = false; setRound((value) => value + 1); setFences({}); setClicks(0); setFeedback(''); setLocked(false); }
    }, mode === 'practice' ? 1000 : 550);
  }

  useEffect(() => {
    resolvedRef.current = false;
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => advanceRound(false, '시간 초과 · 다음 문제로 이동합니다.'), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Each path puzzle gets one deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function cycleCell(row: number, col: number) {
    if (clicks >= 18 || locked) return;
    const key = `${row}-${col}`;
    setFences((current) => {
      const next = { ...current };
      if (!next[key]) next[key] = 'slash'; else if (next[key] === 'slash') next[key] = 'backslash'; else delete next[key];
      return next;
    });
    const nextClicks = clicks + 1;
    setClicks(nextClicks);
    if (nextClicks === 18 && mode === 'practice') setFeedback('이번 시도의 조작 18회를 모두 사용했습니다. 경로를 확인하거나 전체 초기화로 다시 시도하세요.');
    interactionClicksRef.current += 1;
  }
  function submit() {
    if (locked) return;
    const count = Object.keys(fences).length;
    const routesOk = puzzle.vehicles.every((vehicle) => {
      const exit = simulatePath(vehicle.start, fences);
      return exit?.side === vehicle.goal.side && exit.index === vehicle.goal.index;
    });
    if (!routesOk) {
      if (mode === 'simulation') { advanceRound(false, ''); return; }
      hadErrorRef.current = true;
      scoreRef.current.attemptErrors += 1;
      setFeedback('모든 교통수단의 도착 위치를 다시 확인하세요.'); return;
    }
    const maximumScore = count === puzzle.target;
    advanceRound(maximumScore, maximumScore ? '경로 성공 · 정답 울타리 수 일치' : `경로는 성공했지만 최대 득점 조건은 울타리 ${puzzle.target}개입니다.`);
  }

  return (
    <GameFrame gameId="path" current={round + 1} total={puzzles.length} helper="칸을 누르면 빈칸 → / → \\ → 빈칸 순으로 바뀝니다." feedback={feedback} onClose={onClose}>
      <DeadlineBar key={round} duration={config.paceMs} label="문제 제한시간" />
      <div className="path-toolbar"><span>이번 시도 남은 조작 <b>{18 - clicks}</b></span><span>정답 울타리 수 <b>{puzzle.target}</b></span><button disabled={locked} onClick={() => { setFences({}); if (mode === 'practice') setClicks(0); setFeedback(mode === 'simulation' ? '배치를 초기화했습니다. 실전형에서는 남은 조작 수가 복구되지 않습니다.' : ''); }}>전체 초기화</button></div>
      <p className="sr-only">{puzzle.vehicles.map(pathVehicleSummary).join('. ')}</p>
      <div className="path-shell">
        <div className="edge-row top">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="top" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="edge-column left">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="left" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="path-grid">{Array.from({ length: 25 }, (_, index) => { const row = Math.floor(index / 5); const col = index % 5; const fence = fences[`${row}-${col}`]; return <button aria-label={`${row + 1}행 ${col + 1}열 ${fence ?? '빈칸'}`} disabled={locked || clicks >= 18} onClick={() => cycleCell(row, col)} key={index}><i className={fence ?? ''} /></button>; })}</div>
        <div className="edge-column right">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="right" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="edge-row bottom">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="bottom" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
      </div>
      <button className="path-submit primary-submit" disabled={locked} onClick={submit}>경로 확인</button>
    </GameFrame>
  );
}

const ingredients = [
  { id: 'leaf', name: '잎', icon: '🌿' },
  { id: 'mushroom', name: '버섯', icon: '🍄' },
  { id: 'berry', name: '열매', icon: '🫐' },
  { id: 'nut', name: '씨앗', icon: '🌰' },
] as const;
const recipeCombos = [
  [0],[1],[2],[3],
  [0,1],[0,2],[0,3],[1,2],[1,3],[2,3],
  [0,1,2],[0,1,3],[0,2,3],[1,2,3],
];
const recipeProbabilities = [.78,.31,.69,.42,.74,.36,.63,.28,.71,.44,.66,.34,.76,.39];
function makePotionTrials(quantity: number, seed: number) {
  const trials: Array<{ combo: number[]; recipe: number; outcome: 'blue' | 'red' }> = [];
  for (let block = 0; trials.length < quantity; block += 1) {
    const recipes = seededShuffle(Array.from({ length: 14 }, (_, index) => index), seed + block);
    for (const recipe of recipes) {
      const roll = ((Math.imul(seed + trials.length * 97 + 17, 1103515245) >>> 0) % 10000) / 10000;
      trials.push({ combo: recipeCombos[recipe], recipe, outcome: roll < recipeProbabilities[recipe] ? 'blue' : 'red' });
      if (trials.length === quantity) break;
    }
  }
  return trials;
}

function PotionGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => makePotionTrials(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [history, setHistory] = useState<Record<string, { red: number; blue: number }>>({});
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const key = trial.combo.join('-');
  const observed = history[key] ?? { red: 0, blue: 0 };
  useEffect(() => {
    resolvedRef.current = false;
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => choose(null), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Every prediction has one deadline and still reveals the stochastic outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function choose(prediction: 'red' | 'blue' | null) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setLocked(true);
    const ok = prediction === trial.outcome;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    const nextObserved = { ...observed, [trial.outcome]: observed[trial.outcome] + 1 };
    const nextHistory = { ...history, [key]: nextObserved };
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setHistory(nextHistory);
    setFeedback(`${prediction === null ? '시간 초과 · ' : ''}실제 결과: ${trial.outcome === 'blue' ? '파란 약' : '빨간 약'}`);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('potion', nextCorrect, trials.length, nextRts, nextErrors, { recipes: Object.keys(nextHistory).length }));
      else { resolvedRef.current = false; setRound(round + 1); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, mode === 'practice' ? 1000 : 600);
  }

  return (
    <GameFrame gameId="potion" current={round + 1} total={trials.length} helper="1장 4개 · 2장 6개 · 3장 4개를 서로 다른 14개 레시피로 기억합니다." feedback={feedback} showFeedbackInSimulation onClose={onClose}>
      <div className="potion-layout">
        <DeadlineBar key={round} duration={config.paceMs} label="응답 제한시간" />
        <div className="ingredient-cards">{trial.combo.map((index) => <article key={index}><i>{ingredients[index].icon}</i><b>{ingredients[index].name}</b><span>{String.fromCharCode(65 + index)}</span></article>)}</div>
        <div className="potion-observation"><span>이 조합의 이전 실제 결과</span><div><b className="blue">파랑 {observed.blue}</b><b className="red">빨강 {observed.red}</b></div></div>
        <h3>어떤 색의 약이 나올 가능성이 높을까요?</h3>
        <div className="potion-actions"><button className="blue" disabled={locked} onClick={() => choose('blue')}><i>●</i><b>파란 약</b></button><button className="red" disabled={locked} onClick={() => choose('red')}><i>●</i><b>빨간 약</b></button></div>
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

function nbackDecisionLabel(decision: NBackDecision | null) {
  if (decision === 'second') return '2번째 전';
  if (decision === 'third') return '3번째 전';
  return '둘 다 다름';
}

function NBackGame({ onFinish, onClose, glyphMnemonics, config, preferences }: GameProps & { glyphMnemonics: string[]; config: PracticeConfig; preferences: NBackPreferences }) {
  const { mode, showGlyphNames } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const [groups] = useState(() => selectNBackRoundGroups(seed, mode === 'simulation' ? null : preferences.group, mode === 'simulation'));
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
  const [selected, setSelected] = useState<NBackDecision | null>(null);
  const [feedback, setFeedback] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const answerRef = useRef<NBackDecision | null>(null);
  const responseRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);
  const earlyAdvanceRef = useRef<number | null>(null);
  const scoreRef = useRef<NBackScoreState>(newNBackScore());
  const trial = trials[index];
  const completedScored = trials.slice(0, index).filter((item) => !item.warmup).length;
  const scoredProgress = trials.slice(0, index + 1).filter((item) => !item.warmup).length;

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => setCountdown((value) => value === 1 ? null : (value ?? 1) - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const scoreTrial = useCallback((currentTrial: NBackTrial) => {
    const score = scoreNBackResponse(currentTrial, answerRef.current, responseRef.current);
    if (!score.scored || currentTrial.answer === null) return scoreRef.current;
    const previous = scoreRef.current;
    const nextStreak = score.correct ? previous.streak + 1 : 0;
    const task = previous.tasks[currentTrial.task];
    const decision = previous.decisions[currentTrial.answer];
    const missedTarget = score.outcome === 'miss' || (score.outcome === 'omission' && currentTrial.answer !== 'neither');
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
    return next;
  }, []);

  const finishCurrentTrial = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
    if (earlyAdvanceRef.current !== null) window.clearTimeout(earlyAdvanceRef.current);
    deadlineRef.current = null;
    earlyAdvanceRef.current = null;
    const score = scoreTrial(trial);
    if (index === trials.length - 1) {
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
      }));
      return;
    }
    answerRef.current = null;
    responseRef.current = null;
    setSelected(null);
    setFeedback('');
    if (trials[index + 1]?.round !== trial.round) setCountdown(3);
    setIndex((value) => value + 1);
  }, [groups, index, onFinish, scoreTrial, scoredTotal, trial, trials]);

  useEffect(() => {
    if (countdown !== null) return;
    resolvedRef.current = false;
    answerRef.current = null;
    responseRef.current = null;
    started.current = performance.now();
    deadlineRef.current = window.setTimeout(() => finishCurrentTrial(), paceMs);
    const focusFrame = window.requestAnimationFrame(() => stageRef.current?.closest<HTMLElement>('.game-workspace')?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
      if (earlyAdvanceRef.current !== null) window.clearTimeout(earlyAdvanceRef.current);
    };
  }, [countdown, finishCurrentTrial, index, paceMs]);

  function choose(answer: NBackDecision) {
    if (countdown !== null || trial.warmup || resolvedRef.current || answerRef.current !== null) return;
    answerRef.current = answer;
    responseRef.current = Math.max(0, Math.round(performance.now() - started.current));
    setSelected(answer);
    const score = scoreNBackResponse(trial, answer, responseRef.current);
    if (mode === 'practice') setFeedback(score.correct ? '정답 · 응답 저장됨' : `오답 · 정답은 ${nbackDecisionLabel(trial.answer)}입니다.`);
    if (progression === 'fast' && score.correct) {
      if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
      earlyAdvanceRef.current = window.setTimeout(() => finishCurrentTrial(), 300);
    }
  }

  const onNBackKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target?.closest('.game-workspace.game-nback') || target.closest('input, textarea, select, a, [contenteditable="true"]')) return;
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
  const helper = trial.task === 'n2' ? '← 2번째 전과 같음 · Space 다름' : '← 2번째 전 · → 3번째 전 · Space 둘 다 다름';
  const statusMessage = countdown !== null ? `${countdown}초 뒤 시작합니다.` : trial.warmup ? '입력 없이 도형을 기억하세요.' : selected ? '응답 저장됨' : '지금 도형을 분류하세요.';
  const answerClass = (decision: NBackDecision) => {
    const classes = selected === decision ? ['selected'] : [];
    if (mode === 'practice' && selected !== null) {
      if (trial.answer === decision) classes.push('correct');
      else if (selected === decision) classes.push('wrong');
    }
    return classes.join(' ');
  };

  return (
    <GameFrame gameId="nback" current={countdown !== null ? completedScored : scoredProgress} total={scoredTotal} helper={helper} feedback={feedback} statusMessage={statusMessage} onClose={onClose}>
      <div className="nback-stage" ref={stageRef}>
        {countdown !== null ? (
          <div className="nback-countdown" role="timer" aria-live="assertive" aria-label={`${countdown}초 뒤 도형 순서 게임 시작`}><span>ROUND {trial.round} · {taskLabel}</span><b>{countdown}</b><small>{helper}</small></div>
        ) : (
          <>
            <div className="nback-status"><span>ROUND {trial.round} · 묶음 {trial.group + 1} · {taskLabel}{trial.warmup ? ' · 기억 구간' : ''}</span>{mode === 'practice' && <button type="button" onClick={() => setShowName((value) => !value)}>이름표 {showName ? '숨기기' : '보기'}</button>}</div>
            <DeadlineBar key={`deadline-${trial.id}`} duration={paceMs} label="도형 제시시간" className="nback-time" />
            <div className="nback-stimulus" key={`stimulus-${trial.id}`}><CognitiveGlyph variant={trial.variant} size={240} color="#237b76" label={glyphShapeNames[trial.variant]} /></div>
            {mode === 'practice' && showName && <p className="nback-name"><span>{glyphShapeNames[trial.variant]}</span><b>암기명 {glyphMnemonics[trial.variant]}</b></p>}
            {trial.warmup ? <p className="auto-next nback-warmup">입력 없이 기억하세요. {taskLabel === '2-back' ? '2개' : '3개'}를 채운 뒤 응답이 시작됩니다.</p> : <div className={`nback-actions ${trial.task === 'n23' ? 'three-options' : 'two-options'}`}><button type="button" aria-pressed={selected === 'second'} className={answerClass('second')} disabled={selected !== null} onClick={() => choose('second')}><b>2번째 전</b><span>←</span></button>{trial.task === 'n23' && <button type="button" aria-pressed={selected === 'third'} className={answerClass('third')} disabled={selected !== null} onClick={() => choose('third')}><b>3번째 전</b><span>→</span></button>}<button type="button" aria-pressed={selected === 'neither'} className={answerClass('neither')} disabled={selected !== null} onClick={() => choose('neither')}><b>둘 다 다름</b><span>Space</span></button></div>}
          </>
        )}
      </div>
    </GameFrame>
  );
}

type NumberRound = { mode: 'flash' | 'rules'; board: number[]; targets?: number[]; skip: number | null; double: number[] };
function numberExpected(round: NumberRound) { return round.mode === 'flash' ? round.targets! : Array.from({ length: 9 }, (_, index) => index + 1).flatMap((value) => value === round.skip ? [] : round.double.includes(value) ? [value,value] : [value]); }

function makeNumberRounds(quantity: number, seed: number) {
  const flashCount = Math.max(1, Math.floor(quantity / 2));
  return Array.from({ length: quantity }, (_, index): NumberRound => {
    if (index < flashCount) return { mode: 'flash', board: [1,2,3,4,5,6,7,8,9], targets: seededShuffle([1,2,3,4,5,6,7,8,9], seed + index), skip: null, double: [] };
    const board = seededShuffle([1,2,3,4,5,6,7,8,9], seed + index * 3);
    const exceptions = seededShuffle([1,2,3,4,5,6,7,8,9], seed + index * 11);
    return { mode: 'rules', board, skip: exceptions[0], double: exceptions.slice(1,3) };
  });
}

function NumberGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const rounds = useMemo(() => makeNumberRounds(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [passed, setPassed] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const schedule = useManagedTimeout();
  const roundConfig = rounds[round];
  const expected = numberExpected(roundConfig);

  function finishRound(success: boolean, message: string) {
    if (locked || resolvedRef.current) return;
    resolvedRef.current = true;
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setLocked(true);
    const nextPassed = passed + (success ? 1 : 0);
    const nextErrors = errors + (success ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setPassed(nextPassed); setErrors(nextErrors); setRts(nextRts); setFeedback(message);
    schedule(() => {
      if (round === rounds.length - 1) onFinish(resultFor('number', nextPassed, rounds.length, nextRts, nextErrors));
      else { resolvedRef.current = false; setRound((value) => value + 1); setCursor(0); setFeedback(''); setLocked(false); }
    }, mode === 'practice' ? 1000 : 420);
  }

  useEffect(() => {
    resolvedRef.current = false;
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => finishRound(false, '시간 초과 · 다음 문제로 이동합니다.'), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // A round has one deadline; a wrong prefix ends it immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function choose(value: number) {
    if (locked) return;
    if (value !== expected[cursor]) { finishRound(false, '순서 오류 · 이 문제는 여기서 종료됩니다.'); return; }
    const next = cursor + 1;
    if (next === expected.length) finishRound(true, '정답');
    else setCursor(next);
  }

  return (
    <GameFrame gameId="number" current={round + 1} total={rounds.length} helper={roundConfig.mode === 'flash' ? 'ROUND 1 · 정렬된 판에서 강조된 숫자만 빠르게 누릅니다.' : `ROUND 2 · 건너뛰기 ${roundConfig.skip} · 두 번 누르기 ${roundConfig.double.join('·')}`} feedback={feedback} onClose={onClose}>
      <div className="number-layout">
        <DeadlineBar key={round} duration={config.paceMs} label="라운드 제한시간" />
        <div className="number-rule">{roundConfig.mode === 'flash' ? <span className="basic">강조된 숫자를 누르세요</span> : <><span>건너뛰기 <b>{roundConfig.skip}</b></span><span>두 번 누르기 <b>{roundConfig.double.join(' · ')}</b></span></>}</div>
        {roundConfig.mode === 'flash' && <p className="sr-only" aria-live="polite" aria-atomic="true">현재 목표 숫자 {expected[cursor]}</p>}
        <div className="number-board-pro">{roundConfig.board.map((value) => { const currentTarget = roundConfig.mode === 'flash' && value === expected[cursor]; return <button className={currentTarget ? 'target' : ''} aria-current={currentTarget ? 'step' : undefined} aria-label={currentTarget ? `${value}, 현재 목표` : String(value)} disabled={locked} key={value} onClick={() => choose(value)}>{value}</button>; })}</div>
      </div>
    </GameFrame>
  );
}

const wordPairs = [['집중','속도'],['신뢰','근거'],['검색','생성'],['판단','기억']];
const COUNT_BLANK_MS = 350;
function CountCloud({ word, count, offset }: { word: string; count: number; offset: number }) {
  return <div className="word-cloud">{Array.from({ length: count }, (_, index) => <span key={index} style={{ left: `${6 + ((index * 37 + offset * 11) % 82)}%`, top: `${7 + ((index * 29 + offset * 17) % 82)}%`, fontSize: `${11 + ((index * 7 + offset) % 5) * 3}px`, fontWeight: 500 + ((index + offset) % 3) * 150 }}>{word}</span>)}</div>;
}

function CountGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const specs = useMemo(() => buildCountTrials(config.quantity, seed), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'blank' | 'show' | 'answer'>('blank');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const answerTimeoutRef = useRef<number | null>(null);
  const answerResolvedRef = useRef(false);
  const schedule = useManagedTimeout();
  const spec = specs[round]; const pair = seededShuffle(wordPairs, seed + round)[0];
  const answerLimit = Math.max(2500, config.paceMs * 3);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setPhase('show'), COUNT_BLANK_MS);
    const answerTimer = window.setTimeout(() => { answerResolvedRef.current = false; setPhase('answer'); started.current = performance.now(); }, COUNT_BLANK_MS + config.paceMs);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(answerTimer); };
  }, [round, config.paceMs]);

  useEffect(() => {
    if (phase !== 'answer' || locked || mode !== 'simulation') return;
    answerResolvedRef.current = false;
    answerTimeoutRef.current = window.setTimeout(() => choose(null), answerLimit);
    return () => {
      if (answerTimeoutRef.current !== null) { window.clearTimeout(answerTimeoutRef.current); answerTimeoutRef.current = null; }
    };
    // Simulation must always terminate; this visible limit is derived from the public-flow practice preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, locked, mode, answerLimit]);

  function choose(side: 'left' | 'right' | null) {
    if (locked || phase !== 'answer' || answerResolvedRef.current) return;
    answerResolvedRef.current = true;
    if (answerTimeoutRef.current !== null) { window.clearTimeout(answerTimeoutRef.current); answerTimeoutRef.current = null; }
    setLocked(true);
    const target = spec.left > spec.right ? 'left' : 'right';
    const ok = side === target;
    const nextCorrect = correct + (ok ? 1 : 0); const nextErrors = errors + (ok ? 0 : 1); const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    schedule(() => { if (round === specs.length - 1) onFinish(resultFor('count', nextCorrect, specs.length, nextRts, nextErrors)); else { answerResolvedRef.current = false; setPhase('blank'); setLocked(false); setRound(round + 1); } }, 150);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.repeat || shouldIgnoreGameShortcut(event)) return; if (['ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault(); if (event.key === 'ArrowLeft') choose('left'); if (event.key === 'ArrowRight') choose('right'); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const phaseMessage = phase === 'blank' ? '시선을 가운데에 둡니다.' : phase === 'show' ? `${formatPace(config.paceMs)} 동안 양쪽의 개수만 비교합니다.` : '단어가 사라졌습니다. 더 많았던 쪽을 선택하세요.';
  return <GameFrame gameId="count" current={round + 1} total={specs.length} helper={phaseMessage} statusMessage={phaseMessage} onClose={onClose}>
    {phase === 'blank' ? <div className="count-fixation" aria-label="다음 문제 준비">＋</div> : <div className={`count-wrap phase-${phase}`}>{(phase === 'show' || (phase === 'answer' && mode === 'simulation')) && <DeadlineBar key={`${round}-${phase}`} duration={phase === 'show' ? config.paceMs : answerLimit} label={phase === 'show' ? '단어 제시시간' : '응답 제한시간'} />}<div className="count-board"><button disabled={phase !== 'answer' || locked} aria-label="왼쪽 선택" onClick={() => choose('left')}>{phase === 'show' ? <CountCloud word={pair[0]} count={spec.left} offset={round} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '← 왼쪽' : ' '}</span></button><i /><button disabled={phase !== 'answer' || locked} aria-label="오른쪽 선택" onClick={() => choose('right')}>{phase === 'show' ? <CountCloud word={pair[1]} count={spec.right} offset={round + 3} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '오른쪽 →' : ' '}</span></button></div></div>}
  </GameFrame>;
}

const MOUSE_BLANK_MS = 450;
const MOUSE_CATS_MS = 1200;
const MOUSE_HIGHLIGHT_MS = 850;

function MouseGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => buildMouseTrials(config.quantity, seed), [config.quantity, seed]);
  const decisionMs = Math.max(4000, config.paceMs * 4);
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<'memory' | 'blank' | 'cats' | 'highlight' | 'red' | 'blue'>('memory');
  const [decisionStep, setDecisionStep] = useState<'caught' | 'confidence'>('caught');
  const [pendingCaught, setPendingCaught] = useState<boolean | null>(null);
  const [redAnswer, setRedAnswer] = useState<boolean | null>(null);
  const [redConfidence, setRedConfidence] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [confidenceTotal, setConfidenceTotal] = useState(0);
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const redRt = useRef(0);
  const decisionResolvedRef = useRef(false);
  const decisionTimeoutRef = useRef<number | null>(null);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const catCells = [trial.red, trial.blue, ...trial.cats];

  useEffect(() => {
    const blankTimer = window.setTimeout(() => setStage('blank'), config.paceMs);
    const catsTimer = window.setTimeout(() => setStage('cats'), config.paceMs + MOUSE_BLANK_MS);
    const highlightTimer = window.setTimeout(() => setStage('highlight'), config.paceMs + MOUSE_BLANK_MS + MOUSE_CATS_MS);
    const decisionTimer = window.setTimeout(() => { setStage('red'); started.current = performance.now(); }, config.paceMs + MOUSE_BLANK_MS + MOUSE_CATS_MS + MOUSE_HIGHLIGHT_MS);
    return () => { window.clearTimeout(blankTimer); window.clearTimeout(catsTimer); window.clearTimeout(highlightTimer); window.clearTimeout(decisionTimer); };
  }, [round, config.paceMs]);

  function finishDecision(caught: boolean | null, confidence: number) {
    if (locked || decisionResolvedRef.current || (stage !== 'red' && stage !== 'blue')) return;
    decisionResolvedRef.current = true;
    if (decisionTimeoutRef.current !== null) { window.clearTimeout(decisionTimeoutRef.current); decisionTimeoutRef.current = null; }
    if (stage === 'red') {
      setLocked(true);
      setRedAnswer(caught); setRedConfidence(confidence); redRt.current = Math.round(performance.now() - started.current);
      schedule(() => {
        decisionResolvedRef.current = false;
        setPendingCaught(null); setDecisionStep('caught'); setStage('blue'); setLocked(false); started.current = performance.now();
      }, 180);
      return;
    }
    if (stage !== 'blue') return;
    setLocked(true);
    const redCorrect = redAnswer !== null && redAnswer === trial.redCaught; const blueCorrect = caught !== null && caught === trial.blueCaught;
    const points = (redCorrect ? 1 : 0) + (blueCorrect ? 1 : 0);
    const nextCorrect = correct + points; const nextErrors = errors + (2 - points); const nextRts = [...rts, redRt.current || decisionMs, Math.round(performance.now() - started.current)]; const nextConfidence = confidenceTotal + redConfidence + confidence;
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setConfidenceTotal(nextConfidence);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('mouse', nextCorrect, trials.length * 2, nextRts, nextErrors, { averageConfidence: (nextConfidence / (trials.length * 2)).toFixed(1) }));
      else { setStage('memory'); setDecisionStep('caught'); setPendingCaught(null); setRedAnswer(null); setRedConfidence(0); setLocked(false); redRt.current = 0; setRound((value) => value + 1); }
    }, 180);
  }

  function chooseCaught(caught: boolean) {
    if (locked || decisionResolvedRef.current || decisionStep !== 'caught' || (stage !== 'red' && stage !== 'blue')) return;
    if (decisionTimeoutRef.current !== null) { window.clearTimeout(decisionTimeoutRef.current); decisionTimeoutRef.current = null; }
    setPendingCaught(caught);
    setDecisionStep('confidence');
  }

  useEffect(() => {
    if (stage !== 'red' && stage !== 'blue') return;
    decisionResolvedRef.current = false;
    decisionTimeoutRef.current = window.setTimeout(() => {
      decisionTimeoutRef.current = null;
      finishDecision(decisionStep === 'confidence' ? pendingCaught : null, 0);
    }, decisionMs);
    return () => {
      if (decisionTimeoutRef.current !== null) { window.clearTimeout(decisionTimeoutRef.current); decisionTimeoutRef.current = null; }
    };
    // 판단과 확신 단계마다 별도 제한시간을 부여한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, decisionStep, pendingCaught]);

  const confidenceButtons = [{ value: 1, label: '불확실' }, { value: 2, label: '조금 확실' }, { value: 3, label: '확실' }, { value: 4, label: '매우 확실' }];

  const stageMessage = stage === 'memory' ? '생쥐 위치를 기억하세요.' : stage === 'blank' ? '빈 격자에서도 위치를 유지하세요.' : stage === 'cats' ? '고양이 위치를 확인하세요.' : stage === 'highlight' ? '빨강과 파랑 고양이 위치를 대조하세요.' : decisionStep === 'caught' ? `${stage === 'red' ? '빨간' : '파란'} 고양이가 생쥐를 잡았는지 판단하세요.` : '방금 판단에 대한 확신 정도를 선택하세요.';

  return (
    <GameFrame gameId="mouse" current={round + 1} total={trials.length} helper="생쥐 → 빈 격자 → 일반 고양이 → 색 표식 → 빨강·파랑 판단" statusMessage={stageMessage} onClose={onClose}>
      {stage === 'memory' || stage === 'blank' || stage === 'cats' || stage === 'highlight' ? <div className="mouse-layout">
        <div className="mouse-board-pro" role="grid" aria-label={stage === 'memory' ? '생쥐 위치 기억 격자' : stage === 'blank' ? '빈 기억 격자' : '고양이 위치 확인 격자'} aria-rowcount={6} aria-colcount={6}>{Array.from({ length: 36 }, (_, cell) => {
          const mouse = stage === 'memory' && trial.mice.includes(cell);
          const cat = (stage === 'cats' || stage === 'highlight') && catCells.includes(cell);
          const red = stage === 'highlight' && cell === trial.red;
          const blue = stage === 'highlight' && cell === trial.blue;
          const contents = mouse ? '생쥐' : red ? '빨간 고양이' : blue ? '파란 고양이' : cat ? '고양이' : '빈칸';
          return <div role="gridcell" aria-rowindex={Math.floor(cell / 6) + 1} aria-colindex={(cell % 6) + 1} aria-label={`${Math.floor(cell / 6) + 1}행 ${(cell % 6) + 1}열 ${contents}`} className={`${mouse ? 'mouse' : ''} ${red ? 'red' : ''} ${blue ? 'blue' : ''} ${cat && !red && !blue ? 'cat' : ''}`} key={cell}>{mouse ? '🐭' : cat ? '🐈' : ''}</div>;
        })}</div>
        <div className="mouse-actions"><span>{stage === 'memory' ? '위치 기억' : stage === 'blank' ? '기억 유지' : stage === 'cats' ? '고양이 확인' : '색 표식 확인'}</span><h3>{stage === 'memory' ? '생쥐가 있던 칸을 기억하세요.' : stage === 'blank' ? '빈 격자에서도 위치를 유지하세요.' : stage === 'cats' ? '같은 수의 고양이 위치를 확인하세요.' : '빨강·파랑 고양이 위치를 대조하세요.'}</h3><p className="auto-next">잠시 후 자동으로 다음 단계로 이동합니다.</p></div>
      </div> : <div className={`cat-decision ${stage}`}>
        <DeadlineBar key={`${round}-${stage}-${decisionStep}`} duration={decisionMs} label={`${stage === 'red' ? '빨간' : '파란'} 고양이 ${decisionStep === 'caught' ? '판단' : '확신'} 제한시간`} className="decision-time" />
        <div className="target-cat"><span>{stage === 'red' ? '빨간 고양이' : '파란 고양이'}</span><i>🐈</i><h3>{decisionStep === 'caught' ? '생쥐를 잡았나요?' : '방금 판단이 얼마나 확실한가요?'}</h3></div>
        {decisionStep === 'caught' ? <div className="binary-actions mouse-binary-actions" role="group" aria-label={`${stage === 'red' ? '빨간' : '파란'} 고양이 포획 여부`}><button className="missed" disabled={locked} onClick={() => chooseCaught(false)}>놓쳤다</button><button className="caught" disabled={locked} onClick={() => chooseCaught(true)}>잡았다</button></div> : <div className="confidence-scale" role="group" aria-label="판단 확신 정도">{confidenceButtons.map((button) => <button disabled={locked} onClick={() => finishDecision(pendingCaught, button.value)} key={button.value}><b>{button.value}</b><span>{button.label}</span></button>)}</div>}
      </div>}
    </GameFrame>
  );
}
