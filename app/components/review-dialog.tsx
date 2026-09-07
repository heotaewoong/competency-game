'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { games, getGame, type GameId, type SessionResult } from '../lib/game-data';
import { lockDocumentScroll } from '../lib/scroll-lock';
import { CatMarker, MouseMarker, type CatTone } from './mouse-visuals';
import { CognitiveGlyph, glyphShapeNames } from './cognitive-glyph';
import {
  aggregateReviewErrors,
  getReviewAggregationContext,
  getReviewErrorMeta,
  hasReviewData,
  replayRotationEvents,
  rotationActionLabel,
  sanitizeReviewPayload,
  type GenericReviewAttempt,
  type RotationReviewAttempt,
} from '../lib/review-data';
import { matrixForRotationSequence, rotationCssMatrix, rotationOperation, rotationTransformDefinition, rotationTransformGroup, type RotationTransformId } from '../lib/rotation-game';
import { formatResultScore, resultScoreLabel } from '../lib/result-display';

type ReviewDialogProps = {
  results: SessionResult[];
  onClose: () => void;
  onPracticeGame?: (gameId: GameId) => void;
  initialSessionId?: string;
  initialErrorCode?: string;
  nested?: boolean;
};

function centerItemInScroller(
  scroller: HTMLElement | null,
  item: HTMLElement | null,
  behavior: ScrollBehavior = 'auto',
) {
  if (!scroller || !item) return;
  const scrollerRect = scroller.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  scroller.scrollTo({
    left: Math.max(0, scroller.scrollLeft + itemRect.left - scrollerRect.left - (scroller.clientWidth - itemRect.width) / 2),
    top: Math.max(0, scroller.scrollTop + itemRect.top - scrollerRect.top - (scroller.clientHeight - itemRect.height) / 2),
    behavior,
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function sequenceText(sequence: RotationReviewAttempt['submitted']) {
  return sequence.length ? sequence.map((operation) => rotationOperation(operation).short).join('  ') : '입력 없음';
}

function RotationReviewShape({ attempt, sequence, label }: { attempt: RotationReviewAttempt; sequence: RotationReviewAttempt['submitted']; label: string }) {
  const matrix = matrixForRotationSequence(sequence);
  return (
    <div className="review-rotation-shape-wrap" role="img" aria-label={label}>
      <div className={`review-rotation-shape ${attempt.puzzle.kind}`} style={{ transform: rotationCssMatrix(matrix) }} aria-hidden="true">
        {attempt.puzzle.kind === 'letter'
          ? <b>{attempt.puzzle.letter}</b>
          : <div className="review-rotation-grid">{attempt.puzzle.pattern?.map((cell, index) => <i className={cell ? 'filled' : ''} key={index} />)}</div>}
      </div>
    </div>
  );
}

function RotationAttemptPanel({ attempt }: { attempt: RotationReviewAttempt }) {
  const [eventIndex, setEventIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLOListElement>(null);
  const eventSequences = useMemo(() => replayRotationEvents(attempt.events), [attempt.events]);
  const currentEvent = attempt.events[Math.min(eventIndex, Math.max(0, attempt.events.length - 1))];
  const currentSequence = eventSequences[Math.min(eventIndex, Math.max(0, eventSequences.length - 1))] ?? [];
  const firstInefficient = attempt.firstInefficientEvent;
  const transform = attempt.puzzle.transformId ? rotationTransformDefinition(attempt.puzzle.transformId) : null;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = (matches: boolean) => {
      setReducedMotion(matches);
      if (matches) setPlaying(false);
    };
    const update = (event: MediaQueryListEvent) => applyPreference(event.matches);
    const frame = window.requestAnimationFrame(() => applyPreference(query.matches));
    query.addEventListener('change', update);
    return () => {
      window.cancelAnimationFrame(frame);
      query.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!playing || eventIndex >= attempt.events.length - 1) return;
    const timer = window.setTimeout(() => setEventIndex((value) => {
      const next = value + 1;
      if (next >= attempt.events.length - 1) setPlaying(false);
      return next;
    }), 700);
    return () => window.clearTimeout(timer);
  }, [eventIndex, playing, attempt.events.length]);

  useEffect(() => {
    const track = trackRef.current;
    const currentCard = track?.querySelector<HTMLElement>(`[data-review-event-index="${eventIndex}"]`) ?? null;
    centerItemInScroller(track, currentCard, playing && !reducedMotion ? 'smooth' : 'auto');
  }, [eventIndex, playing, reducedMotion]);

  if (!currentEvent) return <p className="review-empty-copy">이전 버전에서 저장된 기록이라 클릭별 재생 데이터가 없습니다.</p>;

  function move(next: number) {
    setPlaying(false);
    setEventIndex(Math.max(0, Math.min(next, attempt.events.length - 1)));
  }

  return (
    <section className="rotation-session-review" aria-label="도형 회전 클릭별 복습">
      {transform && <header className="review-rotation-transform"><span>세부 변환</span><b>{transform.label}</b><small>{transform.formula}</small></header>}
      <div className="review-rotation-stage">
        <article>
          <span>이 입력 뒤 모양</span>
          <RotationReviewShape attempt={attempt} sequence={currentSequence} label={`${currentEvent.index}번째 입력 뒤 내 도형`} />
          <b>{sequenceText(currentSequence)}</b>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>목표 모양</span>
          <div className="review-rotation-shape-wrap" role="img" aria-label="목표 도형">
            <div className={`review-rotation-shape ${attempt.puzzle.kind}`} style={{ transform: rotationCssMatrix(attempt.puzzle.target) }} aria-hidden="true">
              {attempt.puzzle.kind === 'letter'
                ? <b>{attempt.puzzle.letter}</b>
                : <div className="review-rotation-grid">{attempt.puzzle.pattern?.map((cell, index) => <i className={cell ? 'filled' : ''} key={index} />)}</div>}
            </div>
          </div>
          <b>목표 고정</b>
        </article>
      </div>

      <div className={`review-event-status ${currentEvent.inefficient ? 'is-inefficient' : ''}`} aria-live={playing ? 'off' : 'polite'}>
        <span>{currentEvent.index} / {attempt.events.length - 1}</span>
        <div><b>{rotationActionLabel(currentEvent.action)}</b><p>{currentEvent.inefficient ? '이 입력부터 사용한 조작과 남은 최소 조작의 합이 처음 최소값보다 커졌습니다.' : '이 상태는 아직 최소 경로 비용 안에 있습니다.'}</p></div>
        <dl><div><dt>사용 조작</dt><dd>{currentEvent.chargedClicks}</dd></div><div><dt>남은 최소</dt><dd>{currentEvent.remainingOptimal}</dd></div><div><dt>경과</dt><dd>{(currentEvent.elapsedMs / 1000).toFixed(1)}초</dd></div></dl>
      </div>

      <div className="review-replay-controls" role="group" aria-label="클릭 기록 재생">
        <button type="button" onClick={() => { if (eventIndex > 0) move(0); }} aria-disabled={eventIndex === 0}>처음</button>
        <button type="button" onClick={() => { if (eventIndex > 0) move(eventIndex - 1); }} aria-disabled={eventIndex === 0}>이전</button>
        <button type="button" className="is-play" aria-pressed={playing} title={reducedMotion ? '기기의 동작 줄이기 설정에 따라 자동 재생을 끕니다.' : undefined} onClick={() => { if (eventIndex >= attempt.events.length - 1) setEventIndex(0); setPlaying((value) => !value); }} disabled={attempt.events.length < 2 || reducedMotion}>{reducedMotion ? '재생 꺼짐' : playing ? '일시정지' : '자동 재생'}</button>
        <button type="button" onClick={() => { if (eventIndex < attempt.events.length - 1) move(eventIndex + 1); }} aria-disabled={eventIndex >= attempt.events.length - 1}>다음</button>
        <button type="button" onClick={() => { if (eventIndex < attempt.events.length - 1) move(attempt.events.length - 1); }} aria-disabled={eventIndex >= attempt.events.length - 1}>끝</button>
      </div>

      <ol ref={trackRef} className="review-event-track" aria-label="입력별 도형 변화">
        {attempt.events.map((event, index) => (
          <li key={`${attempt.id}-${event.index}`}>
            <button type="button" data-review-event-index={index} className={`${index === eventIndex ? 'is-current' : ''} ${event.inefficient ? 'is-inefficient' : ''}`} aria-current={index === eventIndex ? 'step' : undefined} onClick={() => move(index)}>
              <span>{event.index === 0 ? '시작' : `${event.index}번째`}</span>
              <RotationReviewShape attempt={attempt} sequence={eventSequences[index] ?? []} label={`${event.index}번째 입력 뒤 모양`} />
              <b>{rotationActionLabel(event.action)}</b>
              {event.index === firstInefficient && <small>첫 비효율</small>}
            </button>
          </li>
        ))}
      </ol>

      <div className="review-rotation-answer">
        <div><span>내 최종 입력</span><b>{sequenceText(attempt.submitted)}</b></div>
        <div><span>최소 조작 한 예시</span><b>{sequenceText(attempt.puzzle.optimal)}</b></div>
        <div><span>최종 상태에서 최소 보정 예시</span><b>{sequenceText(attempt.correction)}</b></div>
      </div>
      <p className="review-method-note">최소 풀이와 글자별로 비교하지 않습니다. 같은 정답을 만드는 다른 수열도 인정하고, 각 상태에서 목표까지 남은 최소 조작으로 비효율 여부를 계산합니다.</p>
    </section>
  );
}

function fenceMap(value: unknown) {
  const map = new Map<string, '/' | '\\'>();
  if (!Array.isArray(value)) return map;
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const match = item.match(/^(\d-[0-4])\s+([/\\])$/);
    if (match) map.set(match[1], match[2] as '/' | '\\');
  });
  return map;
}

function PathAttemptBoards({ attempt }: { attempt: GenericReviewAttempt }) {
  const mine = fenceMap(attempt.facts?.내배치);
  const answer = fenceMap(attempt.facts?.정답배치예시);
  if (!mine.size && !answer.size) return null;
  const board = (values: Map<string, '/' | '\\'>, label: string) => <article><span>{label}</span><div className="review-path-board" role="img" aria-label={`${label}: ${values.size}개 울타리`}>{Array.from({ length: 25 }, (_, index) => { const key = `${Math.floor(index / 5)}-${index % 5}`; const fence = values.get(key); return <i className={fence === '/' ? 'slash' : fence === '\\' ? 'backslash' : ''} key={key} />; })}</div><b>{values.size}개 배치</b></article>;
  return <section className="review-special-boards" aria-label="길 만들기 배치 비교">{board(mine, '내 마지막 배치')}{board(answer, '정답 배치 예시')}</section>;
}

function MouseAttemptBoard({ attempt }: { attempt: GenericReviewAttempt }) {
  const target = typeof attempt.facts?.고양이칸 === 'number' ? attempt.facts.고양이칸 : -1;
  const mice = Array.isArray(attempt.facts?.생쥐위치) ? attempt.facts.생쥐위치.filter((cell): cell is number => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < 36) : [];
  if (target < 0 || target >= 36) return null;
  const storedColor = attempt.facts?.고양이색;
  const color: Exclude<CatTone, 'neutral'> = storedColor === 'red' || storedColor === 'blue' ? storedColor : attempt.title.includes('빨간') ? 'red' : 'blue';
  const caught = mice.includes(target);
  const coordinate = (cell: number) => `${Math.floor(cell / 6) + 1}행 ${(cell % 6) + 1}열`;
  const boardLabel = `6×6 위치 복원. 생쥐 위치: ${mice.map(coordinate).join(', ')}. ${color === 'red' ? '빨간' : '파란'} 고양이 위치: ${coordinate(target)}`;
  return <section className="review-mouse-board-wrap" aria-label="고양이 술래잡기 위치 복원"><div className="review-mouse-board" role="img" aria-label={boardLabel}>{Array.from({ length: 36 }, (_, cell) => { const mouse = mice.includes(cell); const cat = cell === target; return <i aria-hidden="true" className={`${mouse ? 'has-mouse' : ''} ${cat ? `is-target ${color}` : ''}`} key={cell}>{mouse ? <MouseMarker size="review" /> : null}{cat ? <CatMarker tone={color} size="review" /> : null}</i>; })}</div><div><span>저장된 위치 복원</span><b>{caught ? '고양이 칸에 생쥐가 있었습니다.' : '고양이 칸에는 생쥐가 없었습니다.'}</b><p>생쥐 캐릭터는 기억 위치, 색 카드의 고양이는 이번 판단 대상입니다.</p></div></section>;
}

function NBackAttemptBoard({ attempt }: { attempt: GenericReviewAttempt }) {
  const task = attempt.facts?.비교유형 === 'n23' ? 'n23' : 'n2';
  const length = task === 'n23' ? 4 : 3;
  const variants = Array.isArray(attempt.facts?.최근도형ID)
    ? attempt.facts.최근도형ID.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < glyphShapeNames.length).slice(-length)
    : [];
  if (!variants.length) return null;
  const storedNames = Array.isArray(attempt.facts?.최근도형명)
    ? attempt.facts.최근도형명.filter((value): value is string => typeof value === 'string').slice(-length)
    : [];
  const labels = (task === 'n23' ? ['N-3', 'N-2', 'N-1', 'N'] : ['N-2', 'N-1', 'N']).slice(-variants.length);
  const targets = new Set(task === 'n23' ? ['N-3', 'N-2'] : ['N-2']);

  return (
    <section className="review-nback-board" aria-label={`${task === 'n23' ? '2·3-back' : '2-back'} 도형 순서 복원`}>
      <header><span>기억 순서 복원</span><b>{task === 'n23' ? '현재 N을 N-2·N-3과 비교' : '현재 N을 N-2와 비교'}</b></header>
      <ol className={task === 'n23' ? 'is-n23' : ''}>
        {variants.map((variant, index) => {
          const label = labels[index];
          const current = label === 'N';
          const target = targets.has(label);
          const name = storedNames[index] || glyphShapeNames[variant];
          return <li className={`${target ? 'is-target' : ''} ${current ? 'is-current' : ''}`.trim()} key={`${label}-${index}`}><small>{label}</small><CognitiveGlyph variant={variant} size={58} color={target || current ? '#237b76' : '#9fb5b3'} label={`${label} ${name}`} /><b>{name}</b><span>{current ? '현재' : target ? '비교 위치' : '유지 위치'}</span></li>;
        })}
      </ol>
    </section>
  );
}

function GenericAttemptPanel({ attempt, gameId }: { attempt: GenericReviewAttempt; gameId: GameId }) {
  const visibleFacts = attempt.facts ? Object.entries(attempt.facts).filter(([label]) => !['최근도형ID', '최근도형명', '비교유형'].includes(label)) : [];
  return (
    <section className="generic-attempt-review" aria-label="문항 복습 상세">
      <header><span>{attempt.title}</span><h4>{attempt.prompt}</h4><p>{attempt.explanation}</p></header>
      {gameId === 'path' && <PathAttemptBoards attempt={attempt} />}
      {gameId === 'mouse' && <MouseAttemptBoard attempt={attempt} />}
      {gameId === 'nback' && <NBackAttemptBoard attempt={attempt} />}
      <div className="review-answer-compare"><article><span>내 응답</span><b>{attempt.selected}</b></article><article><span>기대 응답·판정 기준</span><b>{attempt.expected}</b></article></div>
      {attempt.errorCodes.length > 0 && <div className="review-error-tips">{attempt.errorCodes.map((code) => { const meta = getReviewErrorMeta(gameId, code); return <article key={code}><span>복습 포인트</span><b>{meta.label}</b><p>{meta.tip}</p></article>; })}</div>}
      {visibleFacts.length > 0 && <dl className="review-facts">{visibleFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? '예' : '아니오' : String(value)}</dd></div>)}</dl>}
    </section>
  );
}

export function ReviewDialog({ results, onClose, onPracticeGame, initialSessionId, initialErrorCode, nested = false }: ReviewDialogProps) {
  const sessions = useMemo(() => results.flatMap((result) => {
    const review = sanitizeReviewPayload(result.review);
    return review?.gameId === result.gameId && hasReviewData(review) ? [{ ...result, review }] : [];
  }), [results]);
  const initialSession = sessions.find((session) => session.id === initialSessionId) ?? sessions[0];
  const initialAttempt = initialErrorCode ? initialSession?.review.attempts.find((attempt) => attempt.errorCodes.includes(initialErrorCode)) : undefined;
  const [selectedGameId, setSelectedGameId] = useState<GameId>(initialSession?.gameId ?? 'rotation');
  const [selectedSessionId, setSelectedSessionId] = useState(initialSession?.id ?? '');
  const [selectedAttemptId, setSelectedAttemptId] = useState(initialAttempt?.id ?? '');
  const [errorsOnly, setErrorsOnly] = useState(() => (initialSession?.review.summary.reviewPointCount ?? 0) > 0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const gameTabsRef = useRef<HTMLElement>(null);
  const attemptListRef = useRef<HTMLElement>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const sessionsByGame = useMemo(() => sessions.filter((session) => session.gameId === selectedGameId), [selectedGameId, sessions]);
  const selectedSession = sessionsByGame.find((session) => session.id === selectedSessionId) ?? sessionsByGame[0];
  const selectedContext = selectedSession ? getReviewAggregationContext(selectedSession) : null;
  const selectedContextSessions = useMemo(() => selectedContext
    ? sessionsByGame.filter((session) => getReviewAggregationContext(session).key === selectedContext.key)
    : [], [selectedContext, sessionsByGame]);
  const selectedReviewSummary = selectedSession?.review?.summary;
  const visibleAttempts = useMemo(() => {
    const attempts = selectedSession?.review?.attempts ?? [];
    return errorsOnly ? attempts.filter((attempt) => attempt.status !== 'correct' || attempt.errorCodes.length > 0) : attempts;
  }, [errorsOnly, selectedSession]);
  const selectedAttempt = visibleAttempts.find((attempt) => attempt.id === selectedAttemptId) ?? visibleAttempts[0];
  const selectedSummaries = useMemo(() => aggregateReviewErrors(sessions, selectedGameId, selectedContext?.key), [selectedContext?.key, selectedGameId, sessions]);
  const allSummaries = useMemo(() => aggregateReviewErrors(sessions), [sessions]);
  const rotationTransformSummaries = useMemo(() => {
    if (selectedGameId !== 'rotation') return [];
    const stats = new Map<RotationTransformId, { attempts: number; completed: number }>();
    selectedContextSessions.forEach((session) => session.review.attempts.forEach((attempt) => {
      if (attempt.kind !== 'rotation' || !attempt.puzzle.transformId) return;
      // 실전형 구간이 바뀌며 열린 채로 끝난 문항은 제출 시도가 아니므로 유형 통계에서 제외한다.
      if (attempt.phaseEnded) return;
      const current = stats.get(attempt.puzzle.transformId) ?? { attempts: 0, completed: 0 };
      current.attempts += 1;
      if (attempt.status !== 'error') current.completed += 1;
      stats.set(attempt.puzzle.transformId, current);
    }));
    return [...stats.entries()].map(([transformId, stat]) => {
      const definition = rotationTransformDefinition(transformId);
      return {
        transformId,
        label: definition.label,
        group: rotationTransformGroup(definition.groupId).label,
        attempts: stat.attempts,
        completion: Math.round((stat.completed / stat.attempts) * 100),
      };
    }).sort((left, right) => left.completion - right.completion || right.attempts - left.attempts).slice(0, 5);
  }, [selectedContextSessions, selectedGameId]);
  const selectedGame = getGame(selectedGameId);

  useEffect(() => {
    const tabs = gameTabsRef.current;
    const current = tabs?.querySelector<HTMLElement>(`[data-review-game-id="${selectedGameId}"]`) ?? null;
    centerItemInScroller(tabs, current);
  }, [selectedGameId]);

  useEffect(() => {
    if (!selectedAttempt?.id) return;
    const attempts = attemptListRef.current;
    const current = attempts?.querySelector<HTMLElement>(`[data-review-attempt-id="${selectedAttempt.id}"]`) ?? null;
    centerItemInScroller(attempts, current);
  }, [selectedAttempt?.id]);

  function selectError(summary: { gameId: GameId; errorCode: string; contextKey: string; representativeSessionId: string }) {
    const gameSessions = sessions.filter((session) => session.gameId === summary.gameId && getReviewAggregationContext(session).key === summary.contextKey);
    const session = gameSessions.find((item) => item.id === summary.representativeSessionId)
      ?? gameSessions.find((item) => (item.review.summary.errorCounts[summary.errorCode] ?? 0) > 0)
      ?? gameSessions[0];
    const attempt = session?.review.attempts.find((item) => item.errorCodes.includes(summary.errorCode));
    setSelectedGameId(summary.gameId);
    setSelectedSessionId(session?.id ?? '');
    setSelectedAttemptId(attempt?.id ?? '');
    setErrorsOnly(true);
  }

  function navigateAttempt(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleAttempts.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + visibleAttempts.length) % visibleAttempts.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % visibleAttempts.length;
    else return;
    event.preventDefault();
    const next = visibleAttempts[nextIndex];
    if (!next) return;
    setSelectedAttemptId(next.id);
    window.requestAnimationFrame(() => attemptListRef.current?.querySelector<HTMLElement>(`[data-review-attempt-id="${next.id}"]`)?.focus());
  }

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = lockDocumentScroll();
    const container = backdropRef.current?.parentElement;
    // 중첩 복습창은 GameStage가 stage-content를 직접 inert 처리한다.
    // 여기서 이미 inert인 형제를 다시 스냅샷하면 닫힌 뒤 true로 되돌려
    // 결과 화면이 영구 비활성화될 수 있으므로, 최상위 복습창에서만 형제를 관리한다.
    const siblings = !nested && container ? Array.from(container.children).filter((element) => element !== backdropRef.current) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter((item) => item.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0]; const last = focusables.at(-1)!;
      const active = document.activeElement;
      const activeIsTabStop = focusables.includes(active as HTMLElement);
      if (event.shiftKey && (active === first || !activeIsTabStop)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !activeIsTabStop)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKey, true);
      releaseScrollLock();
      siblingState.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden); });
      previousFocus?.focus();
    };
  }, [nested]);

  if (!sessions.length) {
    return (
      <div ref={backdropRef} className="review-backdrop" role="presentation">
        <section ref={dialogRef} className="review-dialog is-empty" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
          <header className="review-dialog-header"><div><span>REVIEW CENTER</span><h2 id="review-dialog-title">복습 센터</h2></div><button ref={closeRef} type="button" aria-label="복습 센터 닫기" onClick={onClose}>×</button></header>
          <div className="review-no-data">
            <b>아직 문항별 복습 기록이 없습니다.</b>
            <p>게임을 한 번 마치면 선택·정답·오류 유형과 도형 회전 클릭 기록이 여기에 저장됩니다.</p>
            <ol aria-label="복습 기록이 만들어지는 순서"><li><span>1</span>연습 시작</li><li><span>2</span>결과 확인</li><li><span>3</span>문항 복습</li></ol>
            <div>{onPracticeGame && <button type="button" className="review-practice-button" onClick={() => onPracticeGame('rps')}>추천 게임 연습하기 <span aria-hidden="true">→</span></button>}<a href="#games" onClick={onClose}>게임 직접 고르기</a></div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div ref={backdropRef} className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
        <header className="review-dialog-header">
          <div><span>REVIEW CENTER</span><h2 id="review-dialog-title">내 실수 복습</h2><p>점수보다 반복되는 행동을 찾고, 저장된 문제와 입력 과정을 다시 확인합니다.</p></div>
          <button ref={closeRef} type="button" aria-label="복습 센터 닫기" onClick={onClose}>×</button>
        </header>

        <section className="review-overview" aria-labelledby="review-overview-title">
          <div><span>MOST REPEATED</span><h3 id="review-overview-title">자주 나온 복습 포인트</h3><p>{sessions.length < 5 ? `현재 ${sessions.length}개 세션 · 게임별 가장 최근 비교 문맥만 보며, 아직 약점으로 단정하지 않습니다.` : '게임별 가장 최근의 동일 조건 안에서 반복 세션 수와 오류율을 비교합니다.'}</p></div>
          <div>{allSummaries.slice(0, 3).map((summary, index) => <button type="button" key={`${summary.gameId}-${summary.contextKey}-${summary.errorCode}`} onClick={() => selectError(summary)}><span>{index + 1}</span><div><small>{getGame(summary.gameId).title} · {summary.contextLabel} · {summary.count}/{summary.attemptedCount}회</small><b>{summary.label}</b></div><em>{summary.rate}%</em></button>)}</div>
        </section>

        <div className="review-dialog-layout">
          <nav ref={gameTabsRef} className="review-game-tabs" aria-label="복습할 게임">
            {games.map((game) => {
              const gameSessions = sessions.filter((session) => session.gameId === game.id);
              const count = gameSessions.reduce((sum, session) => sum + (session.review?.summary.reviewPointCount ?? 0), 0);
              return <button type="button" key={game.id} data-review-game-id={game.id} disabled={!gameSessions.length} aria-current={selectedGameId === game.id ? 'page' : undefined} onClick={() => { const nextSession = gameSessions[0]; setSelectedGameId(game.id); setSelectedSessionId(nextSession?.id ?? ''); setSelectedAttemptId(''); setErrorsOnly((nextSession?.review.summary.reviewPointCount ?? 0) > 0); }}><span>{game.no}</span><b>{game.shortTitle}</b><small>{gameSessions.length ? `${count}개 점검` : '기록 없음'}</small></button>;
            })}
          </nav>

          <div className="review-workspace">
            <header className={`review-game-head tone-${selectedGame.tone}`}>
              <div><span>{selectedGame.no} · {selectedGame.skill}</span><h3>{selectedGame.title}</h3><p>{selectedSummaries[0] ? `${selectedSummaries[0].contextLabel} 기준 · ${selectedSummaries[0].label} ${selectedSummaries[0].count}회` : `${selectedContext?.label ?? '선택 세션'} 기준 · 반복 오류가 아직 없습니다.`}</p></div>
              <div><label>세션·비교 기준<select value={selectedSession?.id ?? ''} onChange={(event) => { const nextSession = sessionsByGame.find((session) => session.id === event.target.value); setSelectedSessionId(event.target.value); setSelectedAttemptId(''); setErrorsOnly((nextSession?.review.summary.reviewPointCount ?? 0) > 0); }}>{sessionsByGame.map((session) => <option key={session.id} value={session.id}>{formatDate(session.completedAt)} · {resultScoreLabel(session)} {formatResultScore(session)} · {getReviewAggregationContext(session).label}</option>)}</select></label><button type="button" aria-pressed={errorsOnly} onClick={() => { setErrorsOnly((value) => !value); setSelectedAttemptId(''); }}>{errorsOnly ? '오류·점검만' : '전체 시도'}</button>{onPracticeGame && <button type="button" className="review-compact-practice-button" aria-label={`${selectedGame.title} 다시 연습`} onClick={() => onPracticeGame(selectedGameId)}>연습</button>}</div>
            </header>

            {(selectedSummaries.length > 0 || (selectedGameId === 'rotation' && rotationTransformSummaries.length > 0)) && <div className="review-analysis-strips">
              {selectedSummaries.length > 0 && <section className="review-summary-list" aria-label={`${selectedGame.title} 오류 통계`}>
                {selectedSummaries.map((summary) => <button type="button" key={`${summary.contextKey}-${summary.errorCode}`} onClick={() => selectError(summary)}><span><b>{summary.label}</b><em>{summary.count}/{summary.attemptedCount}회 · {summary.rate}% · {summary.sessionCount}개 세션</em></span><p>{summary.tip}</p></button>)}
              </section>}
              {selectedGameId === 'rotation' && rotationTransformSummaries.length > 0 && <details className="review-rotation-type-summary">
                <summary><span><b>세부 변환별 취약 순서</b><small>저장된 시도 중 완성률이 낮은 순 · 최대 5개</small></span><i aria-hidden="true" /></summary>
                <div>{rotationTransformSummaries.map((summary) => <article key={summary.transformId}><span>{summary.group}</span><b>{summary.label}</b><dl><div><dt>완성률</dt><dd>{summary.completion}%</dd></div><div><dt>표본</dt><dd>{summary.attempts}문제</dd></div></dl></article>)}</div>
              </details>}
            </div>}

            <div className="review-attempt-layout">
              <aside ref={attemptListRef} className="review-attempt-list" role="listbox" aria-label="저장된 시도 목록">
                {visibleAttempts.length ? visibleAttempts.map((attempt, index) => <button type="button" role="option" aria-selected={attempt.id === selectedAttempt?.id} tabIndex={attempt.id === selectedAttempt?.id ? 0 : -1} data-review-attempt-id={attempt.id} key={attempt.id} className={attempt.id === selectedAttempt?.id ? 'is-current' : ''} onKeyDown={(event) => navigateAttempt(event, index)} onClick={() => setSelectedAttemptId(attempt.id)}><span>{attempt.index + 1}</span><div><b>{attempt.title}</b><small>{attempt.kind === 'rotation' && attempt.phaseEnded ? '구간 종료 · 미제출' : attempt.status === 'correct' ? '정확' : attempt.status === 'neutral' ? '판단 점검' : attempt.errorCodes.length ? getReviewErrorMeta(selectedGameId, attempt.errorCodes[0]).label : '오류'}</small></div>{attempt.rtMs !== undefined && <em>{(attempt.rtMs / 1000).toFixed(1)}초</em>}</button>) : <div className="review-list-empty"><b>{selectedReviewSummary?.attemptedCount && !selectedSession?.review?.attempts.length ? '오래된 세션의 통계만 보관되어 있습니다.' : '이 필터에 해당하는 시도가 없습니다.'}</b>{selectedSession?.review?.attempts.length ? <button type="button" onClick={() => setErrorsOnly(false)}>전체 시도 보기</button> : <span>점수와 오류 횟수는 유지되지만 클릭별 화면은 저장 용량을 위해 정리되었습니다.</span>}</div>}
              </aside>

              <div className="review-attempt-detail" role="region" aria-label="선택한 시도 상세. 방향키나 Page Up, Page Down으로 내용을 스크롤할 수 있습니다." tabIndex={0}>
                <p className="sr-only" aria-live="polite">{selectedAttempt ? `${selectedAttempt.index + 1}번 시도 상세를 표시합니다.` : '표시할 시도가 없습니다.'}</p>
                {selectedAttempt?.kind === 'rotation' ? <RotationAttemptPanel key={`${selectedSession?.id ?? 'session'}-${selectedAttempt.id}`} attempt={selectedAttempt} /> : selectedAttempt ? <GenericAttemptPanel attempt={selectedAttempt} gameId={selectedGameId} /> : <p className="review-empty-copy">왼쪽에서 복습할 시도를 선택하세요.</p>}
              </div>
            </div>
          </div>
        </div>

        <footer className="review-dialog-footer"><span>기록은 이 브라우저에만 저장되며 화면 녹화나 마우스 좌표는 수집하지 않습니다.</span><div><button type="button" onClick={onClose}>닫기</button>{onPracticeGame && <button type="button" className="review-practice-button" onClick={() => onPracticeGame(selectedGameId)}>이 게임 다시 연습 <span>→</span></button>}</div></footer>
      </section>
    </div>
  );
}
