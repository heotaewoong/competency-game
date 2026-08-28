'use client';

/* eslint-disable react-hooks/purity -- 반응시간은 렌더 중이 아니라 사용자 입력 이벤트에서만 측정한다. */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import { CognitiveGlyph, glyphDefaultMnemonics, glyphShapeNames } from './cognitive-glyph';
import { GameThumbnail } from './game-thumbnail';
import { getGame, type GameId, type SessionResult } from '../lib/game-data';

type RawResult = Omit<SessionResult, 'id' | 'completedAt'>;
type GameProps = { onFinish: (result: RawResult) => void; onClose: () => void };

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

type PracticeConfig = { quantity: number; paceMs: number };
type SessionMode = 'practice' | 'simulation';
const SessionModeContext = createContext({ mode: 'practice' as SessionMode, showGlyphNames: true });
type PracticeSpec = {
  quantityLabel: string; quantityMin: number; quantityMax: number; quantityStep: number; quantityDefault: number;
  paceLabel: string; paceMin: number; paceMax: number; paceStep: number; paceDefault: number;
};

const practiceSpecs: Record<GameId, PracticeSpec> = {
  rps: { quantityLabel:'문제 수', quantityMin:9, quantityMax:30, quantityStep:3, quantityDefault:15, paceLabel:'문제 제한', paceMin:2500, paceMax:8000, paceStep:500, paceDefault:4500 },
  rotation: { quantityLabel:'문제 수', quantityMin:3, quantityMax:15, quantityStep:1, quantityDefault:5, paceLabel:'문제 제한', paceMin:15000, paceMax:60000, paceStep:5000, paceDefault:30000 },
  appointment: { quantityLabel:'세트 수', quantityMin:4, quantityMax:12, quantityStep:4, quantityDefault:4, paceLabel:'정보 제시', paceMin:1500, paceMax:6000, paceStep:500, paceDefault:3000 },
  path: { quantityLabel:'문제 수', quantityMin:3, quantityMax:12, quantityStep:1, quantityDefault:3, paceLabel:'문제 제한', paceMin:30000, paceMax:120000, paceStep:10000, paceDefault:60000 },
  potion: { quantityLabel:'시행 수', quantityMin:28, quantityMax:84, quantityStep:14, quantityDefault:42, paceLabel:'응답 제한', paceMin:3000, paceMax:12000, paceStep:1000, paceDefault:7000 },
  nback: { quantityLabel:'도형 세트', quantityMin:2, quantityMax:20, quantityStep:2, quantityDefault:10, paceLabel:'도형 제시', paceMin:800, paceMax:3000, paceStep:100, paceDefault:1600 },
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
  const stability = mean ? Math.max(0, Math.round(100 - Math.min(100, (Math.sqrt(variance) / mean) * 100))) : 0;
  return { gameId, accuracy: Math.round((correct / Math.max(total, 1)) * 100), medianRt: median(rts), stability, errors, detail };
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
  const panelRef = useRef<HTMLElement>(null);
  const finishedRun = useRef(false);
  const game = getGame(gameId);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = panelRef.current?.parentElement;
    const siblings = backdrop?.parentElement ? Array.from(backdrop.parentElement.children).filter((element) => element !== backdrop) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => element.offsetParent !== null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = items[0]; const last = items.at(-1)!;
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
  }, [onClose]);

  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [phase, run]);

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
    } catch { /* 잘못된 설정은 사용자 기본값으로 복구한다. */ }
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

  function finish(raw: RawResult) {
    if (finishedRun.current) return;
    finishedRun.current = true;
    const completed: SessionResult = { ...raw, detail: { ...raw.detail, sessionMode: sessionMode === 'practice' ? '연습 모드' : '실전 모드' }, id: `${gameId}-${Date.now()}`, completedAt: new Date().toISOString() };
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
      <section ref={panelRef} className="stage-panel" role="dialog" aria-modal="true" aria-label={`${game.title} 연습`} tabIndex={-1}>
        {phase === 'intro' && (
          <div className="stage-intro">
            <button className="stage-close" aria-label="연습 닫기" onClick={onClose}>×</button>
            <div className="intro-heading">
              <div className="intro-visual"><GameThumbnail gameId={gameId} /></div>
              <div><p>{game.no} · {game.skill}</p><h2>{game.title}</h2><span>{game.rounds}</span></div>
            </div>
            <div className="intro-rule"><b>연습 규칙</b><p>{game.rule}</p></div>
            <dl className="stage-meta">
              <div><dt>조작</dt><dd>{game.input}</dd></div>
              <div><dt>유형</dt><dd>{game.rounds}</dd></div>
              <div><dt>연습 포인트</dt><dd>{game.focus}</dd></div>
              <div><dt>공개 안내</dt><dd>{game.time}</dd></div>
            </dl>
            <ModeSelector mode={sessionMode} onChange={setSessionMode} />
            {sessionMode === 'practice' ? <SessionSettings gameId={gameId} value={practiceConfig} onChange={savePracticeConfig} /> : <SimulationPreset gameId={gameId} />}
            {gameId === 'nback' && sessionMode === 'practice' && <GlyphNameLegend names={glyphMnemonics} onChange={saveGlyphMnemonics} showDuringPlay={showGlyphNames} onShowDuringPlayChange={saveGlyphVisibility} />}
            <div className="intro-actions">
              <a href={`https://www.jobda.im/info/${officialInfo[gameId]}`} target="_blank" rel="noreferrer">공식 해설 확인 ↗</a>
              <button className="stage-start" onClick={() => setPhase('play')}>{sessionMode === 'practice' ? '연습 시작' : '실전 모드 시작'} <span>→</span></button>
            </div>
            <small>{sessionMode === 'practice' ? '속도·분량·이름표를 조절하며 익히는 모드입니다.' : '공개 튜토리얼의 조작 흐름을 고정 적용한 시뮬레이션입니다. 비공개 문항·타이밍·채점식과 동일함을 뜻하지 않습니다.'}</small>
          </div>
        )}
        {phase === 'play' && <SessionModeContext.Provider value={{ mode: sessionMode, showGlyphNames }}><GameRouter key={`${gameId}-${run}`} gameId={gameId} config={sessionMode === 'practice' ? practiceConfig : defaultPracticeConfig(gameId)} glyphMnemonics={glyphMnemonics} onFinish={finish} onClose={onClose} /></SessionModeContext.Provider>}
        {phase === 'result' && result && <ResultView result={result} mode={sessionMode} onClose={onClose} onRestart={restart} />}
      </section>
    </div>
  );
}

function ModeSelector({ mode, onChange }: { mode: SessionMode; onChange: (mode: SessionMode) => void }) {
  return (
    <section className="mode-selector" aria-label="진행 모드 선택">
      <div><b>진행 모드</b><small>목표에 맞게 한 번만 선택하세요</small></div>
      <div className="mode-options" role="radiogroup" aria-label="연습 또는 실전 모드">
        <button type="button" role="radio" aria-checked={mode === 'practice'} className={mode === 'practice' ? 'active' : ''} onClick={() => onChange('practice')}>
          <span>연습 모드</span><b>내 설정으로 반복</b><small>분량·속도 조절 · 이름표 · 즉시 피드백</small>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'simulation'} className={mode === 'simulation' ? 'active' : ''} onClick={() => onChange('simulation')}>
          <span>실전 모드</span><b>고정 조건으로 집중</b><small>설정 잠금 · 이름표/정오 피드백 비공개</small>
        </button>
      </div>
    </section>
  );
}

function SimulationPreset({ gameId }: { gameId: GameId }) {
  const spec = practiceSpecs[gameId];
  const config = defaultPracticeConfig(gameId);
  return (
    <section className="simulation-preset" aria-label="실전 모드 고정 설정">
      <div><span><b>실전 모드 고정 설정</b><small>세션 시작 후 변경할 수 없습니다</small></span><em>LOCKED</em></div>
      <dl>
        <div><dt>{spec.quantityLabel}</dt><dd>{config.quantity}</dd></div>
        <div><dt>{spec.paceLabel}</dt><dd>{formatPace(config.paceMs)}</dd></div>
        <div><dt>도움 표시</dt><dd>숨김</dd></div>
      </dl>
      <p>현재 공개된 JOBDA 튜토리얼은 정확한 최신 문항 수·자극 시간·채점식을 모두 공개하지 않습니다. 따라서 공개된 조작 순서를 유지한 권장 고정값으로 진행합니다.</p>
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
        <label><span>{spec.quantityLabel}</span><div><button type="button" aria-label={`${spec.quantityLabel} 줄이기`} onClick={() => change('quantity', -spec.quantityStep)}>−</button><output>{value.quantity}</output><button type="button" aria-label={`${spec.quantityLabel} 늘리기`} onClick={() => change('quantity', spec.quantityStep)}>＋</button></div></label>
        <label><span>{spec.paceLabel}</span><div><button type="button" aria-label={`${spec.paceLabel} 줄이기`} onClick={() => change('paceMs', -spec.paceStep)}>−</button><output>{formatPace(value.paceMs)}</output><button type="button" aria-label={`${spec.paceLabel} 늘리기`} onClick={() => change('paceMs', spec.paceStep)}>＋</button></div></label>
      </div>
      <p>정확한 최신 문항 수·노출시간은 공개되지 않아 조절값으로 제공합니다. 게임 구조와 조작은 JOBDA 공개 튜토리얼 기준입니다.</p>
    </section>
  );
}

function GlyphNameLegend({ names, onChange, showDuringPlay, onShowDuringPlayChange }: { names: string[]; onChange: (names: string[]) => void; showDuringPlay: boolean; onShowDuringPlayChange: (show: boolean) => void }) {
  function update(index: number, raw: string) {
    const value = Array.from(raw.trim()).at(-1) ?? '';
    if (!value) return;
    const next = [...names]; next[index] = value; onChange(next);
  }
  return (
    <section className="glyph-legend" aria-label="한 글자 도형 이름표">
      <div><span><b>내 한 글자 이름표</b><label className="glyph-visibility"><input type="checkbox" checked={showDuringPlay} onChange={(event) => onShowDuringPlayChange(event.target.checked)} /><i aria-hidden="true" /><small>연습 중 표시</small></label></span><button type="button" onClick={() => onChange([...glyphDefaultMnemonics])}>기본값 복원</button></div>
      <p>설명 이름은 모양 구분용입니다. 오른쪽 칸에 내가 외울 한 글자를 직접 입력하세요.</p>
      <div className="glyph-legend-grid">
        {names.map((name, index) => <label key={index}><CognitiveGlyph variant={index} size={42} color="#55c8c3" label={glyphShapeNames[index]} /><span><small>{glyphShapeNames[index]}</small><input aria-label={`${glyphShapeNames[index]} 암기명`} inputMode="text" maxLength={2} value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => update(index, event.target.value)} /></span></label>)}
      </div>
    </section>
  );
}

function GameRouter({ gameId, glyphMnemonics, config, ...props }: GameProps & { gameId: GameId; glyphMnemonics: string[]; config: PracticeConfig }) {
  if (gameId === 'rps') return <RpsGame {...props} config={config} />;
  if (gameId === 'rotation') return <RotationGame {...props} config={config} />;
  if (gameId === 'appointment') return <AppointmentGame {...props} config={config} />;
  if (gameId === 'path') return <PathGame {...props} config={config} />;
  if (gameId === 'potion') return <PotionGame {...props} config={config} />;
  if (gameId === 'nback') return <NBackGame {...props} config={config} glyphMnemonics={glyphMnemonics} />;
  if (gameId === 'number') return <NumberGame {...props} config={config} />;
  if (gameId === 'count') return <CountGame {...props} config={config} />;
  return <MouseGame {...props} config={config} />;
}

function GameFrame({ gameId, current, total, children, helper, feedback, showFeedbackInSimulation = false, onClose }: { gameId: GameId; current: number; total: number; children: ReactNode; helper: string; feedback?: string; showFeedbackInSimulation?: boolean; onClose: () => void }) {
  const game = getGame(gameId);
  const { mode } = useContext(SessionModeContext);
  return (
    <div className={`game-workspace game-${gameId}`} data-mode={mode}>
      <header className="workspace-head">
        <div><p>{game.no} · {game.skill} <span className="mode-chip">{mode === 'practice' ? '연습' : '실전'}</span></p><h2>{game.title}</h2></div>
        <div className="workspace-progress"><span>{current} / {total}</span><i><b style={{ width: `${Math.round((current / total) * 100)}%` }} /></i></div>
        <button aria-label="연습 닫기" onClick={onClose}>×</button>
      </header>
      <div className="workspace-body">{children}</div>
      <footer className="workspace-foot"><span>{mode === 'practice' ? helper : '공개 튜토리얼 흐름 기반 · 코칭 표시 없이 진행 중'}</span><b aria-live="polite">{mode === 'practice' || showFeedbackInSimulation ? feedback ?? '' : ''}</b></footer>
    </div>
  );
}

function ResultView({ result, mode, onClose, onRestart }: { result: SessionResult; mode: SessionMode; onClose: () => void; onRestart: () => void }) {
  const game = getGame(result.gameId);
  return (
    <div className="stage-result">
      <span className="result-check">✓</span><p>{mode === 'practice' ? '연습 모드' : '실전 모드'} 완료 · {game.no}</p><h2>{game.title}</h2>
      <div className="result-metrics">
        <article><span>정확도</span><b>{result.accuracy}%</b></article>
        <article><span>중앙 반응</span><b>{result.medianRt ? `${result.medianRt}ms` : '—'}</b></article>
        <article><span>일관성</span><b>{result.stability}%</b></article>
        <article><span>오류</span><b>{result.errors}</b></article>
      </div>
      {result.errors > 0 && <aside className="result-review"><b>오답 복습 포인트</b><p>{reviewAdvice[result.gameId]}</p></aside>}
      <div className="result-actions"><button onClick={onRestart}>{mode === 'practice' ? '다시 연습' : '실전 다시 하기'}</button><button className="stage-start" onClick={onClose}>게임 목록 <span>→</span></button></div>
      <small>개인 연습 기록이며 실제 역량검사 점수나 채용 결과가 아닙니다.</small>
    </div>
  );
}

const rpsChoices = [
  { id: 'scissors', label: '가위', key: '←', image: '/assets/rps/scissors.svg' },
  { id: 'rock', label: '바위', key: '↓', image: '/assets/rps/rock.svg' },
  { id: 'paper', label: '보', key: '→', image: '/assets/rps/paper.svg' },
] as const;
type Rps = typeof rpsChoices[number]['id'];
const losesTo: Record<Rps, Rps> = { scissors: 'rock', rock: 'paper', paper: 'scissors' };
const beats: Record<Rps, Rps> = { scissors: 'paper', rock: 'scissors', paper: 'rock' };
function RpsGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => {
    const perPhase = Math.max(1, Math.floor(config.quantity / 3));
    return Array.from({ length: config.quantity }, (_, index) => {
      const phaseIndex = Math.min(2, Math.floor(index / perPhase));
      const shown = rpsChoices[seededShuffle([0,1,2], seed + index)[0]].id;
      const unknown: 'player' | 'opponent' = phaseIndex === 0 ? 'player' : phaseIndex === 1 ? 'opponent' : seededShuffle(['player','opponent'] as const, seed + index * 7)[0];
      return { shown, unknown, answer: unknown === 'player' ? losesTo[shown] : beats[shown], phase: phaseIndex === 0 ? '내 패 찾기' : phaseIndex === 1 ? '상대 패 찾기' : '관점 혼합' };
    });
  }, [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const schedule = useManagedTimeout();
  const item = trials[round];

  function choose(choice: Rps | null) {
    if (locked) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setLocked(true);
    const ok = choice === item.answer;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    setFeedback(choice === null ? '시간 초과' : ok ? '정답' : '물음표 위치를 먼저 확인하세요.');
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('rps', nextCorrect, trials.length, nextRts, nextErrors));
      else { setRound(round + 1); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, 420);
  }

  useEffect(() => {
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => choose(null), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Each new problem gets one fresh deadline; `choose` intentionally uses that round's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
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
      <div className="time-strip" aria-label="문제 제한시간"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
      <div className="rps-board">
        <article><span>나</span>{item.unknown === 'player' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
        <div><b>VS</b><span>내가 이기는 관계</span></div>
        <article><span>상대</span>{item.unknown === 'opponent' ? <b className="rps-question">?</b> : <Image src={shown.image} alt={shown.label} width={126} height={126} />}</article>
      </div>
      <div className="rps-actions">{rpsChoices.map((choice) => <button key={choice.id} disabled={locked} onClick={(event) => { if (event.detail > 1) return; choose(choice.id); }}><Image src={choice.image} alt="" width={42} height={42} /><span>{choice.key}</span><b>{choice.label}</b></button>)}</div>
    </GameFrame>
  );
}

type Matrix = [number, number, number, number];
type RotationOpId = 'left' | 'right' | 'flip-x' | 'flip-y';
const identity: Matrix = [1, 0, 0, 1];
const rootHalf = Math.SQRT1_2;
const rotationOps: Array<{ id: RotationOpId; label: string; short: string; matrix: Matrix }> = [
  { id: 'left', label: '왼쪽 45° 회전', short: '↺ 45°', matrix: [rootHalf, -rootHalf, rootHalf, rootHalf] },
  { id: 'right', label: '오른쪽 45° 회전', short: '↻ 45°', matrix: [rootHalf, rootHalf, -rootHalf, rootHalf] },
  { id: 'flip-x', label: '좌우반전', short: '↔ 반전', matrix: [-1, 0, 0, 1] },
  { id: 'flip-y', label: '상하반전', short: '↕ 반전', matrix: [1, 0, 0, -1] },
];

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d] = left; const [e, f, g, h] = right;
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h].map((value) => Math.round(value * 10000) / 10000) as Matrix;
}
function matrixFor(sequence: RotationOpId[]) {
  return sequence.reduce((current, id) => multiply(rotationOps.find((operation) => operation.id === id)!.matrix, current), identity);
}
function sameMatrix(a: Matrix, b: Matrix) { return a.every((value, index) => Math.abs(value - b[index]) < 0.001); }
function matrixKey(matrix: Matrix) { return matrix.map((value) => Math.round(value * 1000) / 1000).join(','); }
function minimumOperationCount(target: Matrix) {
  const targetKey = matrixKey(target);
  const queue: Array<{ matrix: Matrix; depth: number }> = [{ matrix: identity, depth: 0 }];
  const seen = new Set([matrixKey(identity)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (matrixKey(current.matrix) === targetKey) return current.depth;
    for (const operation of rotationOps) {
      const next = multiply(operation.matrix, current.matrix);
      const key = matrixKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ matrix: next, depth: current.depth + 1 });
    }
  }
  return 8;
}
function cssMatrix(matrix: Matrix) { return `matrix(${matrix.join(',')},0,0)`; }

const rotationPuzzles: Array<{ kind: 'tiles' | 'letter'; pattern?: number[]; letter?: string; answer: RotationOpId[] }> = [
  { kind: 'letter', letter: 'R', answer: ['right','right','flip-x'] },
  { kind: 'letter', letter: 'F', answer: ['left','flip-y'] },
  { kind: 'tiles', pattern: [1,0,0,1,1,0,1,0,0,1,1,0,1,0,0,1], answer: ['right'] },
  { kind: 'tiles', pattern: [1,0,1,0,0,1,0,0,1,1,0,1,0,1,1,0], answer: ['flip-y','left'] },
  { kind: 'tiles', pattern: [0,1,0,1,1,1,0,0,0,1,0,0,1,0,1,1], answer: ['flip-x','right','right'] },
];

function RotationShape({ puzzle, matrix, label }: { puzzle: typeof rotationPuzzles[number]; matrix: Matrix; label: string }) {
  return <div className="rotation-shape-wrap" aria-label={label}><div className={`rotation-shape ${puzzle.kind}`} style={{ transform: cssMatrix(matrix) }}>{puzzle.kind === 'letter' ? <b>{puzzle.letter}</b> : <div className="rotation-tile-grid">{puzzle.pattern!.map((cell, index) => <i className={cell ? 'filled' : ''} key={index} />)}</div>}</div></div>;
}

function RotationGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const puzzles = useMemo(() => Array.from({ length: config.quantity }, (_, index) => seededShuffle(rotationPuzzles, seed + Math.floor(index / rotationPuzzles.length))[index % rotationPuzzles.length]), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<RotationOpId[]>([]);
  const [clicks, setClicks] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const schedule = useManagedTimeout();
  const puzzle = puzzles[round];
  const target = useMemo(() => matrixFor(puzzle.answer), [puzzle]);
  const minimumOperations = useMemo(() => minimumOperationCount(target), [target]);
  const remaining = 20 - clicks;

  useEffect(() => {
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => finishRound(false, '시간 초과 · 다음 문제로 이동합니다.'), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Each puzzle gets one deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function addOperation(id: RotationOpId) {
    if (locked || remaining <= 0 || sequence.length >= 8) return;
    setSequence((current) => [...current, id]); setClicks((value) => value + 1);
  }
  function undoOperation() {
    if (!sequence.length || locked || remaining <= 0) return;
    setSequence((current) => current.slice(0, -1)); setClicks((value) => value + 1);
  }
  function resetOperations() {
    if (!sequence.length || locked || remaining <= 0) return;
    setSequence([]); setClicks((value) => value + 1);
  }
  function finishRound(ok: boolean, message: string) {
    if (locked) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setLocked(true);
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    setFeedback(message);
    schedule(() => {
      if (round === puzzles.length - 1) onFinish(resultFor('rotation', nextCorrect, puzzles.length, nextRts, nextErrors));
      else { setRound(round + 1); setSequence([]); setClicks(0); setFeedback(''); setLocked(false); }
    }, 700);
  }
  function submit() {
    if (!sequence.length || locked) return;
    const ok = sequence.length === minimumOperations && sameMatrix(matrixFor(sequence), target);
    finishRound(ok, ok ? '정답' : '목표와 다릅니다. 기준점과 반전 방향을 확인하세요.');
  }

  return (
    <GameFrame gameId="rotation" current={round + 1} total={puzzles.length} helper="조작 순서를 모두 정한 뒤 제출하세요." feedback={feedback} onClose={onClose}>
      <div className="time-strip" aria-label="문제 제한시간"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
      <div className="rotation-comparison">
        <article><span>시작</span><RotationShape puzzle={puzzle} matrix={identity} label="시작 모양" /></article>
        <b>→</b>
        <article><span>목표</span><RotationShape puzzle={puzzle} matrix={target} label="목표 모양" /></article>
      </div>
      <div className="rotation-controls">
        <div className="rotation-op-grid">{rotationOps.map((operation) => <button key={operation.id} disabled={locked || remaining === 0} onClick={() => addOperation(operation.id)}><b>{operation.short}</b><span>{operation.label}</span></button>)}</div>
        <div className="operation-sequence"><span>입력 순서</span><div>{Array.from({ length: 8 }, (_, index) => <i className={sequence[index] ? 'filled' : ''} key={index}>{sequence[index] ? rotationOps.find((operation) => operation.id === sequence[index])!.short : index + 1}</i>)}</div></div>
        <div className="rotation-submit-row"><span>남은 클릭 <b>{remaining}</b></span><button onClick={undoOperation} disabled={!sequence.length || locked || remaining <= 0}>하나 지움</button><button onClick={resetOperations} disabled={!sequence.length || locked || remaining <= 0}>전체 초기화</button><button className="primary-submit" onClick={submit} disabled={!sequence.length || locked}>답안 제출</button></div>
      </div>
    </GameFrame>
  );
}

type AppointmentKind = 'day' | 'location' | 'food' | 'bus';
type AppointmentTrial = { kind: AppointmentKind; title: string; people: string[][]; choices: string[]; answer: string };
const appointmentTrials: AppointmentTrial[] = [
  { kind: 'day', title: '세 사람이 모두 가능한 요일', people: [['월','수','금'],['화','수','토'],['수','금','일']], choices: ['월','수','금','토','일'], answer: '수' },
  { kind: 'location', title: '세 사람이 모두 선호한 장소', people: [['A1','B2','D4'],['B2','C1','C4'],['A4','B2','D1']], choices: ['A1','B2','C4','D1'], answer: 'B2' },
  { kind: 'food', title: '세 사람이 모두 선호한 메뉴', people: [['우동','탕수육','초밥'],['장어','탕수육','돈가스'],['탕수육','만두','회']], choices: ['우동','탕수육','돈가스','만두','회'], answer: '탕수육' },
  { kind: 'bus', title: '아무도 탑승하지 않은 버스', people: [['81','549'],['25','73'],['9','48']], choices: ['81','324','73','9','48'], answer: '324' },
];
const personNames = ['영희','철수','미미'];
const foodIcons: Record<string, string> = { 우동:'🍜', 탕수육:'🍛', 초밥:'🍣', 장어:'🍱', 돈가스:'🍛', 만두:'🥟', 회:'🐟' };

function PersonMemory({ trial, person }: { trial: AppointmentTrial; person: number }) {
  const values = trial.people[person];
  if (trial.kind === 'location') return <div className="location-memory">{Array.from({ length: 16 }, (_, index) => { const id = `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`; return <i className={values.includes(id) ? 'selected' : ''} key={id}>{id}</i>; })}</div>;
  if (trial.kind === 'food') return <div className="food-memory">{values.map((value) => <span key={value}><i>{foodIcons[value]}</i><b>{value}</b></span>)}</div>;
  if (trial.kind === 'bus') return <div className="bus-memory">{values.map((value) => <span key={value}><i>🚌</i><b>{value}</b></span>)}</div>;
  return <div className="day-memory">{values.map((value) => <b key={value}>{value}</b>)}</div>;
}

function AppointmentGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => Array.from({ length: config.quantity }, (_, index) => seededShuffle(appointmentTrials, seed + Math.floor(index / appointmentTrials.length))[index % appointmentTrials.length]), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [person, setPerson] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const schedule = useManagedTimeout();
  const trial = trials[round];
  useEffect(() => { started.current = performance.now(); }, []);

  function nextPerson() {
    if (person < 2) setPerson(person + 1);
    else { setAnswering(true); started.current = performance.now(); }
  }
  useEffect(() => {
    if (answering || locked) return;
    const timer = window.setTimeout(nextPerson, config.paceMs);
    return () => window.clearTimeout(timer);
    // Person cards advance after the configured presentation time, or earlier by button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, person, answering, locked]);
  function choose(value: string) {
    if (locked) return;
    setLocked(true);
    const ok = value === trial.answer;
    const nextCorrect = correct + (ok ? 1 : 0);
    const nextErrors = errors + (ok ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setFeedback(ok ? '정답' : `정답은 ${trial.answer}`);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('appointment', nextCorrect, trials.length, nextRts, nextErrors));
      else { setRound(round + 1); setPerson(0); setAnswering(false); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, 650);
  }

  return (
    <GameFrame gameId="appointment" current={round + 1} total={trials.length} helper={trial.kind === 'bus' ? '버스는 본 번호를 누적해 NOT을 찾습니다.' : '두 사람부터 교집합만 남겨 셋째와 비교합니다.'} feedback={feedback} onClose={onClose}>
      {!answering ? <div className="appointment-stimulus"><div className="time-strip"><i key={`${round}-${person}`} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div><span>{personNames[person]} · {trial.kind === 'bus' ? '탑승 버스' : '선호 정보'}</span><h3>{trial.title}</h3><PersonMemory trial={trial} person={person} /><button className="single-action" onClick={nextPerson}>{person < 2 ? '다음 사람' : '질문 보기'} <i>→</i></button></div> : <div className="appointment-question"><span>{trial.kind === 'bus' ? 'NOT' : 'AND'}</span><h3>{trial.title}</h3><div>{trial.choices.map((value) => <button disabled={locked} onClick={() => choose(value)} key={value}>{trial.kind === 'food' && <i>{foodIcons[value]}</i>}<b>{value}</b></button>)}</div></div>}
    </GameFrame>
  );
}

type Side = 'top' | 'right' | 'bottom' | 'left';
type Direction = 'up' | 'right' | 'down' | 'left';
type Fence = 'slash' | 'backslash';
type Vehicle = { id: string; icon: string; color: string; start: { side: Side; index: number }; goal: { side: Side; index: number } };
type PathPuzzle = { target: number; correct: Record<string, Fence>; vehicles: Vehicle[] };
const pathPuzzles: PathPuzzle[] = [
  { target: 2, correct: { '3-2': 'slash', '1-1': 'slash' }, vehicles: [
    { id: 'A', icon: '🚗', color: '#f3a52b', start: { side: 'left', index: 3 }, goal: { side: 'top', index: 2 } },
    { id: 'B', icon: '🚌', color: '#3977e7', start: { side: 'bottom', index: 1 }, goal: { side: 'right', index: 1 } },
  ] },
  { target: 2, correct: { '3-1': 'slash', '2-3': 'slash' }, vehicles: [
    { id: 'A', icon: '🛵', color: '#e95f69', start: { side: 'top', index: 1 }, goal: { side: 'left', index: 3 } },
    { id: 'B', icon: '🚕', color: '#3bae79', start: { side: 'right', index: 2 }, goal: { side: 'bottom', index: 3 } },
  ] },
  { target: 3, correct: { '4-2': 'slash', '1-2': 'backslash', '2-4': 'backslash' }, vehicles: [
    { id: 'A', icon: '🚙', color: '#906ee8', start: { side: 'left', index: 4 }, goal: { side: 'left', index: 1 } },
    { id: 'B', icon: '🚐', color: '#19a6a6', start: { side: 'top', index: 4 }, goal: { side: 'right', index: 2 } },
  ] },
];

const directionDelta: Record<Direction, [number, number]> = { up: [-1,0], right: [0,1], down: [1,0], left: [0,-1] };
const slashTurn: Record<Direction, Direction> = { up: 'right', right: 'up', down: 'left', left: 'down' };
const backslashTurn: Record<Direction, Direction> = { up: 'left', left: 'up', down: 'right', right: 'down' };

function enterFrom(start: Vehicle['start']) {
  if (start.side === 'top') return { row: 0, col: start.index, direction: 'down' as Direction };
  if (start.side === 'bottom') return { row: 4, col: start.index, direction: 'up' as Direction };
  if (start.side === 'left') return { row: start.index, col: 0, direction: 'right' as Direction };
  return { row: start.index, col: 4, direction: 'left' as Direction };
}

function simulate(start: Vehicle['start'], fences: Record<string, Fence>): Vehicle['goal'] | null {
  let { row, col, direction } = enterFrom(start);
  for (let step = 0; step < 80; step += 1) {
    const fence = fences[`${row}-${col}`];
    if (fence === 'slash') direction = slashTurn[direction];
    if (fence === 'backslash') direction = backslashTurn[direction];
    const [dr, dc] = directionDelta[direction]; row += dr; col += dc;
    if (row < 0) return { side: 'top', index: col };
    if (row > 4) return { side: 'bottom', index: col };
    if (col < 0) return { side: 'left', index: row };
    if (col > 4) return { side: 'right', index: row };
  }
  return null;
}

function EdgeMarker({ side, index, vehicles }: { side: Side; index: number; vehicles: Vehicle[] }) {
  const start = vehicles.find((vehicle) => vehicle.start.side === side && vehicle.start.index === index);
  const goal = vehicles.find((vehicle) => vehicle.goal.side === side && vehicle.goal.index === index);
  return <div className="edge-marker">{start && <span className="vehicle" style={{ '--marker': start.color } as CSSProperties}>{start.icon}<b>{start.id}</b></span>}{goal && <span className="passenger" style={{ '--marker': goal.color } as CSSProperties}>●<b>{goal.id}</b></span>}</div>;
}

function PathGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const { mode } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const puzzles = useMemo(() => Array.from({ length: config.quantity }, (_, index) => seededShuffle(pathPuzzles, seed + Math.floor(index / pathPuzzles.length))[index % pathPuzzles.length]), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [fences, setFences] = useState<Record<string, Fence>>({});
  const [clicks, setClicks] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const scoreRef = useRef({ correct: 0, errors: 0, rts: [] as number[] });
  const schedule = useManagedTimeout();
  const puzzle = puzzles[round];

  function advanceRound(success: boolean, message: string) {
    if (locked) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setLocked(true); setFeedback(message);
    scoreRef.current = {
      correct: scoreRef.current.correct + (success ? 1 : 0),
      errors: scoreRef.current.errors + (success ? 0 : 1),
      rts: [...scoreRef.current.rts, Math.round(performance.now() - started.current)],
    };
    schedule(() => {
      if (round === puzzles.length - 1) {
        const score = scoreRef.current;
        onFinish(resultFor('path', score.correct, puzzles.length, score.rts, score.errors, { clicks }));
      } else { setRound((value) => value + 1); setFences({}); setClicks(0); setFeedback(''); setLocked(false); }
    }, 550);
  }

  useEffect(() => {
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
    setClicks((value) => value + 1);
  }
  function submit() {
    if (locked) return;
    const count = Object.keys(fences).length;
    const routesOk = puzzle.vehicles.every((vehicle) => {
      const exit = simulate(vehicle.start, fences);
      return exit?.side === vehicle.goal.side && exit.index === vehicle.goal.index;
    });
    if (!routesOk) {
      if (mode === 'simulation') { advanceRound(false, ''); return; }
      scoreRef.current.errors += 1; setFeedback('모든 교통수단의 도착 위치를 다시 확인하세요.'); return;
    }
    const maximumScore = count === puzzle.target;
    advanceRound(maximumScore, maximumScore ? '경로 성공 · 정답 울타리 수 일치' : `경로는 성공했지만 최대 득점 조건은 울타리 ${puzzle.target}개입니다.`);
  }

  return (
    <GameFrame gameId="path" current={round + 1} total={puzzles.length} helper="칸을 누르면 빈칸 → / → \\ → 빈칸 순으로 바뀝니다." feedback={feedback} onClose={onClose}>
      <div className="time-strip" aria-label="문제 제한시간"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
      <div className="path-toolbar"><span>클릭 가능 <b>{18 - clicks}</b></span><span>정답 울타리 수 <b>{puzzle.target}</b></span><button disabled={locked} onClick={() => { setFences({}); setClicks(0); setFeedback(''); }}>전체 초기화</button></div>
      <div className="path-shell">
        <div className="edge-row top">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="top" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="edge-column left">{Array.from({ length: 5 }, (_, index) => <EdgeMarker side="left" index={index} vehicles={puzzle.vehicles} key={index} />)}</div>
        <div className="path-grid">{Array.from({ length: 25 }, (_, index) => { const row = Math.floor(index / 5); const col = index % 5; const fence = fences[`${row}-${col}`]; return <button aria-label={`${row + 1}행 ${col + 1}열 ${fence ?? '빈칸'}`} disabled={locked} onClick={() => cycleCell(row, col)} key={index}><i className={fence ?? ''} /></button>; })}</div>
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
  const schedule = useManagedTimeout();
  const trial = trials[round];
  const key = trial.combo.join('-');
  const observed = history[key] ?? { red: 0, blue: 0 };
  useEffect(() => {
    started.current = performance.now();
    timeoutRef.current = window.setTimeout(() => choose(null), config.paceMs);
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current); };
    // Every prediction has one deadline and still reveals the stochastic outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function choose(prediction: 'red' | 'blue' | null) {
    if (locked) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
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
      else { setRound(round + 1); setFeedback(''); setLocked(false); started.current = performance.now(); }
    }, 600);
  }

  return (
    <GameFrame gameId="potion" current={round + 1} total={trials.length} helper="1장 4개 · 2장 6개 · 3장 4개를 서로 다른 14개 레시피로 기억합니다." feedback={feedback} showFeedbackInSimulation onClose={onClose}>
      <div className="potion-layout">
        <div className="time-strip"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
        <div className="ingredient-cards">{trial.combo.map((index) => <article key={index}><i>{ingredients[index].icon}</i><b>{ingredients[index].name}</b><span>{String.fromCharCode(65 + index)}</span></article>)}</div>
        <div className="potion-observation"><span>이 조합의 이전 실제 결과</span><div><b className="blue">파랑 {observed.blue}</b><b className="red">빨강 {observed.red}</b></div></div>
        <h3>어떤 색의 약이 나올 가능성이 높을까요?</h3>
        <div className="potion-actions"><button className="blue" disabled={locked} onClick={() => choose('blue')}><i>●</i><b>파란 약</b></button><button className="red" disabled={locked} onClick={() => choose('red')}><i>●</i><b>빨간 약</b></button></div>
      </div>
    </GameFrame>
  );
}

type NBackAnswer = 'left' | 'right' | 'space';
type NBackTrial = { variant: number; set: number; group: number; round: 1 | 2; mode: '2-back' | '2·3-back'; warmup: boolean; answer: NBackAnswer };
function makeNBackTrials(setCount: number, seed: number) {
  const trials: NBackTrial[] = [];
  const roundBoundary = Math.ceil(setCount / 2);
  for (let set = 0; set < setCount; set += 1) {
    const group = set % 5;
    const base = group * 3;
    const shapes = seededShuffle([base,base+1,base+2], seed + set);
    const mixed = set >= roundBoundary;
    const pattern = mixed ? [0,1,2,0,2,1,2,0,1] : [0,1,0,2,1,2,0,1,2];
    const sequence = pattern.map((index) => shapes[index]);
    sequence.forEach((variant, index) => {
      const is2 = index >= 2 && variant === sequence[index - 2];
      const is3 = index >= 3 && variant === sequence[index - 3];
      const answer: NBackAnswer = is2 ? 'left' : mixed && is3 ? 'right' : 'space';
      trials.push({ variant, set, group, round: mixed ? 2 : 1, mode: mixed ? '2·3-back' : '2-back', warmup: index < 2, answer });
    });
  }
  return trials;
}

function NBackGame({ onFinish, onClose, glyphMnemonics, config }: GameProps & { glyphMnemonics: string[]; config: PracticeConfig }) {
  const { mode, showGlyphNames } = useContext(SessionModeContext);
  const [seed] = useState(newSessionSeed);
  const nbackTrials = useMemo(() => makeNBackTrials(config.quantity, seed), [config.quantity, seed]);
  const scoredTotal = useMemo(() => nbackTrials.filter((item) => !item.warmup).length, [nbackTrials]);
  const [index, setIndex] = useState(0);
  const [showName, setShowName] = useState(mode === 'practice' && showGlyphNames);
  const [selected, setSelected] = useState<NBackAnswer | null>(null);
  const started = useRef(0);
  const answerRef = useRef<NBackAnswer | null>(null);
  const responseRef = useRef(0);
  const scoreRef = useRef({ correct: 0, errors: 0, rts: [] as number[] });
  const trial = nbackTrials[index];

  function choose(answer: NBackAnswer) {
    if (trial.warmup || answerRef.current !== null) return;
    answerRef.current = answer;
    responseRef.current = Math.round(performance.now() - started.current);
    setSelected(answer);
  }

  useEffect(() => {
    answerRef.current = null;
    responseRef.current = 0;
    started.current = performance.now();
    const timer = window.setTimeout(() => {
      if (!trial.warmup) {
        const ok = answerRef.current === trial.answer;
        scoreRef.current = {
          correct: scoreRef.current.correct + (ok ? 1 : 0),
          errors: scoreRef.current.errors + (ok ? 0 : 1),
          rts: [...scoreRef.current.rts, responseRef.current || config.paceMs],
        };
      }
      if (index === nbackTrials.length - 1) {
        const score = scoreRef.current;
        onFinish(resultFor('nback', score.correct, scoredTotal, score.rts, score.errors));
      } else { answerRef.current = null; responseRef.current = 0; setSelected(null); setIndex((value) => value + 1); }
    }, config.paceMs);
    return () => window.clearTimeout(timer);
    // Timing is intentionally fixed per stimulus; answers lock but never advance the card early.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || trial.warmup || answerRef.current !== null) return;
      if (['ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
      if (event.key === 'ArrowLeft') choose('left');
      if (event.key === 'ArrowRight' && trial.mode === '2·3-back') choose('right');
      if (event.code === 'Space') choose('space');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <GameFrame gameId="nback" current={index + 1} total={nbackTrials.length} helper={trial.mode === '2-back' ? '← 2번째 전과 같음 · Space 다름' : '← 2번째 전 · → 3번째 전 · Space 둘 다 다름'} onClose={onClose}>
      <div className="nback-stage">
        <div className="nback-status"><span>ROUND {trial.round} · SET {trial.group + 1} · {trial.mode}</span>{mode === 'practice' && <button onClick={() => setShowName((value) => !value)}>이름표 {showName ? '숨기기' : '보기'}</button>}</div>
        <div className="time-strip nback-time" aria-label="도형 제시시간"><i key={index} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
        <div className="nback-stimulus" key={`${trial.set}-${index}`}><CognitiveGlyph variant={trial.variant} size={240} color="#55c8c3" label={glyphShapeNames[trial.variant]} /></div>
        {mode === 'practice' && showName && <p className="nback-name">{glyphShapeNames[trial.variant]} · 내 이름 <b>{glyphMnemonics[trial.variant]}</b></p>}
        {trial.warmup ? <p className="auto-next nback-warmup">입력 없이 기억하세요. 같은 시간 뒤 자동으로 넘어갑니다.</p> : <div className="nback-actions"><button className={selected === 'left' ? 'selected' : ''} disabled={selected !== null} onClick={() => choose('left')}><span>←</span><b>2번째 전</b></button>{trial.mode === '2·3-back' && <button className={selected === 'right' ? 'selected' : ''} disabled={selected !== null} onClick={() => choose('right')}><span>→</span><b>3번째 전</b></button>}<button className={selected === 'space' ? 'selected' : ''} disabled={selected !== null} onClick={() => choose('space')}><span>Space</span><b>둘 다 다름</b></button></div>}
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
  const schedule = useManagedTimeout();
  const roundConfig = rounds[round];
  const expected = numberExpected(roundConfig);

  function finishRound(success: boolean, message: string) {
    if (locked) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setLocked(true);
    const nextPassed = passed + (success ? 1 : 0);
    const nextErrors = errors + (success ? 0 : 1);
    const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setPassed(nextPassed); setErrors(nextErrors); setRts(nextRts); setFeedback(message);
    schedule(() => {
      if (round === rounds.length - 1) onFinish(resultFor('number', nextPassed, rounds.length, nextRts, nextErrors));
      else { setRound((value) => value + 1); setCursor(0); setFeedback(''); setLocked(false); }
    }, 420);
  }

  useEffect(() => {
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
        <div className="time-strip" aria-label="라운드 제한시간"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>
        <div className="number-rule">{roundConfig.mode === 'flash' ? <span className="basic">강조된 숫자를 누르세요</span> : <><span>건너뛰기 <b>{roundConfig.skip}</b></span><span>두 번 누르기 <b>{roundConfig.double.join(' · ')}</b></span></>}</div>
        <div className="number-board-pro">{roundConfig.board.map((value) => <button className={roundConfig.mode === 'flash' && value === expected[cursor] ? 'target' : ''} disabled={locked} key={value} onClick={() => choose(value)}>{value}</button>)}</div>
      </div>
    </GameFrame>
  );
}

const countSpecs = [{left:18,right:14},{left:13,right:17},{left:21,right:18},{left:16,right:20},{left:24,right:19},{left:15,right:18},{left:22,right:25},{left:19,right:16},{left:17,right:23},{left:26,right:22}];
const wordPairs = [['집중','속도'],['신뢰','근거'],['검색','생성'],['판단','기억']];
const COUNT_BLANK_MS = 350;
function CountCloud({ word, count, offset }: { word: string; count: number; offset: number }) {
  return <div className="word-cloud">{Array.from({ length: count }, (_, index) => <span key={index} style={{ left: `${6 + ((index * 37 + offset * 11) % 82)}%`, top: `${7 + ((index * 29 + offset * 17) % 82)}%`, fontSize: `${11 + ((index * 7 + offset) % 5) * 3}px`, fontWeight: 500 + ((index + offset) % 3) * 150 }}>{word}</span>)}</div>;
}

function CountGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const specs = useMemo(() => Array.from({ length: config.quantity }, (_, index) => seededShuffle(countSpecs, seed + Math.floor(index / countSpecs.length))[index % countSpecs.length]), [config.quantity, seed]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'blank' | 'show' | 'answer'>('blank');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const schedule = useManagedTimeout();
  const spec = specs[round]; const pair = seededShuffle(wordPairs, seed + round)[0];

  useEffect(() => {
    const showTimer = window.setTimeout(() => setPhase('show'), COUNT_BLANK_MS);
    const answerTimer = window.setTimeout(() => { setPhase('answer'); started.current = performance.now(); }, COUNT_BLANK_MS + config.paceMs);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(answerTimer); };
  }, [round, config.paceMs]);

  function choose(side: 'left' | 'right') {
    if (locked || phase !== 'answer') return;
    setLocked(true);
    const target = spec.left > spec.right ? 'left' : 'right';
    const ok = side === target;
    const nextCorrect = correct + (ok ? 1 : 0); const nextErrors = errors + (ok ? 0 : 1); const nextRts = [...rts, Math.round(performance.now() - started.current)];
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts);
    schedule(() => { if (round === specs.length - 1) onFinish(resultFor('count', nextCorrect, specs.length, nextRts, nextErrors)); else { setPhase('blank'); setLocked(false); setRound(round + 1); } }, 150);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.repeat) return; if (event.key === 'ArrowLeft') choose('left'); if (event.key === 'ArrowRight') choose('right'); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  return <GameFrame gameId="count" current={round + 1} total={specs.length} helper={phase === 'blank' ? '시선을 가운데에 둡니다.' : phase === 'show' ? `${formatPace(config.paceMs)} 동안 양쪽의 개수만 비교합니다.` : '단어가 사라진 뒤 더 많았던 쪽을 선택합니다.'} onClose={onClose}>
    {phase === 'blank' ? <div className="count-fixation" aria-label="다음 문제 준비">＋</div> : <div className={`count-wrap phase-${phase}`}>{phase === 'show' && <div className="time-strip"><i key={round} style={{ '--duration': `${config.paceMs}ms` } as CSSProperties} /></div>}<div className="count-board"><button disabled={phase !== 'answer' || locked} aria-label="왼쪽 선택" onClick={() => choose('left')}>{phase === 'show' ? <CountCloud word={pair[0]} count={spec.left} offset={round} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '← 왼쪽' : ' '}</span></button><i /><button disabled={phase !== 'answer' || locked} aria-label="오른쪽 선택" onClick={() => choose('right')}>{phase === 'show' ? <CountCloud word={pair[1]} count={spec.right} offset={round + 3} /> : <div className="count-hidden">?</div>}<span>{phase === 'answer' ? '오른쪽 →' : ' '}</span></button></div></div>}
  </GameFrame>;
}

const mouseTrials = [
  { mice:[0,7,13,20,28,35,4,31], red:13, blue:11 },
  { mice:[2,8,15,21,27,33,5,30], red:19, blue:27 },
  { mice:[1,6,14,22,29,34,11,25], red:11, blue:18 },
  { mice:[3,9,16,23,26,32,12,35], red:16, blue:30 },
  { mice:[0,8,12,19,24,31,17,35], red:10, blue:31 },
];
const mouseCatPools = [
  [2,5,14,22,30,33], [0,6,12,24,32,35], [3,8,15,21,27,32], [1,7,14,22,27,35], [2,6,14,20,27,34],
];
const MOUSE_BLANK_MS = 450;
const MOUSE_CATS_MS = 1200;
const MOUSE_HIGHLIGHT_MS = 850;

function MouseGame({ onFinish, onClose, config }: GameProps & { config: PracticeConfig }) {
  const [seed] = useState(newSessionSeed);
  const trials = useMemo(() => Array.from({ length: config.quantity }, (_, index) => {
    const order = seededShuffle(Array.from({ length: mouseTrials.length }, (_, itemIndex) => itemIndex), seed + Math.floor(index / mouseTrials.length));
    const sourceIndex = order[index % mouseTrials.length];
    return { ...mouseTrials[sourceIndex], cats: mouseCatPools[sourceIndex] };
  }), [config.quantity, seed]);
  const decisionMs = Math.max(4000, config.paceMs * 4);
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<'memory' | 'blank' | 'cats' | 'highlight' | 'red' | 'blue'>('memory');
  const [redAnswer, setRedAnswer] = useState<boolean | null>(null);
  const [redConfidence, setRedConfidence] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [confidenceTotal, setConfidenceTotal] = useState(0);
  const [locked, setLocked] = useState(false);
  const started = useRef(0);
  const redRt = useRef(0);
  const transitionGuard = useRef(false);
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

  function decide(caught: boolean | null, confidence: number) {
    if (locked || transitionGuard.current) return;
    if (stage === 'red') {
      transitionGuard.current = true;
      setRedAnswer(caught); setRedConfidence(confidence); redRt.current = Math.round(performance.now() - started.current); setStage('blue'); started.current = performance.now();
      schedule(() => { transitionGuard.current = false; }, 180);
      return;
    }
    if (stage !== 'blue') return;
    setLocked(true);
    const redCorrect = redAnswer !== null && redAnswer === trial.mice.includes(trial.red); const blueCorrect = caught !== null && caught === trial.mice.includes(trial.blue);
    const points = (redCorrect ? 1 : 0) + (blueCorrect ? 1 : 0);
    const nextCorrect = correct + points; const nextErrors = errors + (2 - points); const nextRts = [...rts, redRt.current || decisionMs, Math.round(performance.now() - started.current)]; const nextConfidence = confidenceTotal + redConfidence + confidence;
    setCorrect(nextCorrect); setErrors(nextErrors); setRts(nextRts); setConfidenceTotal(nextConfidence);
    schedule(() => {
      if (round === trials.length - 1) onFinish(resultFor('mouse', nextCorrect, trials.length * 2, nextRts, nextErrors, { averageConfidence: (nextConfidence / (trials.length * 2)).toFixed(1) }));
      else { setStage('memory'); setRedAnswer(null); setRedConfidence(0); setLocked(false); transitionGuard.current = false; redRt.current = 0; setRound((value) => value + 1); }
    }, 180);
  }

  useEffect(() => {
    if (stage !== 'red' && stage !== 'blue') return;
    const timer = window.setTimeout(() => decide(null, 0), decisionMs);
    return () => window.clearTimeout(timer);
    // Every red/blue decision receives its own fixed deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const decisionButtons = [
    { caught: false, confidence: 4, label: '매우 확실' }, { caught: false, confidence: 3, label: '확실' }, { caught: false, confidence: 2, label: '조금 확실' }, { caught: false, confidence: 1, label: '불확실' },
    { caught: true, confidence: 1, label: '불확실' }, { caught: true, confidence: 2, label: '조금 확실' }, { caught: true, confidence: 3, label: '확실' }, { caught: true, confidence: 4, label: '매우 확실' },
  ];

  return (
    <GameFrame gameId="mouse" current={round + 1} total={trials.length} helper="생쥐 → 빈 격자 → 일반 고양이 → 색 표식 → 빨강·파랑 판단" onClose={onClose}>
      {stage === 'memory' || stage === 'blank' || stage === 'cats' || stage === 'highlight' ? <div className="mouse-layout">
        <div className="mouse-board-pro">{Array.from({ length: 36 }, (_, cell) => { const mouse = stage === 'memory' && trial.mice.includes(cell); const cat = (stage === 'cats' || stage === 'highlight') && catCells.includes(cell); const red = stage === 'highlight' && cell === trial.red; const blue = stage === 'highlight' && cell === trial.blue; return <div className={`${mouse ? 'mouse' : ''} ${red ? 'red' : ''} ${blue ? 'blue' : ''} ${cat && !red && !blue ? 'cat' : ''}`} key={cell}>{mouse ? '🐭' : cat ? '🐈' : ''}</div>; })}</div>
        <div className="mouse-actions"><span>{stage === 'memory' ? '위치 기억' : stage === 'blank' ? '기억 유지' : stage === 'cats' ? '고양이 확인' : '색 표식 확인'}</span><h3>{stage === 'memory' ? '생쥐가 있던 칸을 기억하세요.' : stage === 'blank' ? '빈 격자에서도 위치를 유지하세요.' : stage === 'cats' ? '같은 수의 고양이 위치를 확인하세요.' : '빨강·파랑 고양이 위치를 대조하세요.'}</h3><p className="auto-next">잠시 후 자동으로 다음 단계로 이동합니다.</p></div>
      </div> : <div className={`cat-decision ${stage}`}>
        <div className="time-strip decision-time"><i key={`${round}-${stage}`} style={{ '--duration': `${decisionMs}ms` } as CSSProperties} /></div>
        <div className="target-cat"><span>{stage === 'red' ? '빨간 고양이' : '파란 고양이'}</span><i>🐈</i><h3>생쥐를 잡았나요?</h3></div>
        <div className="decision-groups">
          <section><b>← 놓쳤다</b><div>{decisionButtons.slice(0,4).map((button, index) => <button className="missed" disabled={locked} onClick={() => decide(button.caught, button.confidence)} key={index}><b>{button.label}</b><span>확신 {button.confidence}</span></button>)}</div></section>
          <section><b>잡았다 →</b><div>{decisionButtons.slice(4).map((button, index) => <button className="caught" disabled={locked} onClick={() => decide(button.caught, button.confidence)} key={index}><b>{button.label}</b><span>확신 {button.confidence}</span></button>)}</div></section>
        </div>
      </div>}
    </GameFrame>
  );
}
