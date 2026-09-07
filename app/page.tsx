'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { GameThumbnail } from './components/game-thumbnail';
import { games, type GameId, type SessionResult } from './lib/game-data';

function StageLoading() {
  return <div className="stage-backdrop"><div className="stage-loading" role="status" aria-live="polite"><i aria-hidden="true" /><b>게임을 준비하고 있습니다.</b></div></div>;
}

const GameStage = dynamic(() => import('./components/game-stage').then((module) => module.GameStage), {
  ssr: false,
  loading: StageLoading,
});

const STORAGE_KEY = 'nineflow-practice-results-v2';
const ORDER_STORAGE_KEY = 'nineflow-game-order-v2';
const DIFFICULTY_SOURCE_URL = 'https://recruit.jobda.im/hubfs/TREND%20REPORT_HR%20%EA%B3%A0%EB%AF%BC%EC%9E%88%EC%8A%B5%EB%8B%88%EB%8B%A4_2%ED%8E%B8.pdf';
const DIFFICULTY_REVIEW_URLS = [
  { label: '상세 후기 1', href: 'https://thswldud.tistory.com/19' },
  { label: '상세 후기 2', href: 'https://ystory.tistory.com/entry/%EC%8B%A0%EC%97%AD%EA%B2%80AI%EC%97%AD%EB%9F%89%EA%B2%80%EC%82%AC-%ED%9B%84%EA%B8%B0-%EB%B0%8F-%EB%85%B8%ED%95%98%EC%9A%B0TIP' },
  { label: '다회 응시 후기', href: 'https://ityunseo.tistory.com/77' },
] as const;
const gameIds = new Set(games.map((game) => game.id));
type GameOrder = 'published' | 'perceived';
type ResultMode = 'practice' | 'simulation' | 'unknown';
const perceivedDifficultyOrder: GameId[] = ['nback', 'potion', 'mouse', 'appointment', 'path', 'rotation', 'count', 'rps', 'number'];
const perceivedDifficultyRank = new Map(perceivedDifficultyOrder.map((gameId, index) => [gameId, index + 1]));
const resultModeLabels: Record<ResultMode, string> = {
  practice: '연습 모드',
  simulation: '실전형 연습',
  unknown: '모드 미상',
};

function isSessionResult(value: unknown): value is SessionResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SessionResult>;
  const numericValues = [item.accuracy, item.medianRt, item.stability, item.errors];
  return typeof item.id === 'string' && typeof item.gameId === 'string' && gameIds.has(item.gameId as GameId)
    && typeof item.completedAt === 'string' && Number.isFinite(Date.parse(item.completedAt))
    && numericValues.every((number) => typeof number === 'number' && Number.isFinite(number));
}

function formatCompletedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(timestamp));
}

function getResultMode(result: SessionResult): ResultMode {
  const value = result.detail?.sessionMode;
  if (typeof value !== 'string') return 'unknown';
  if (value.includes('실전') || value === 'simulation') return 'simulation';
  if (value.includes('연습') || value === 'practice') return 'practice';
  return 'unknown';
}

function summarizeSessions(sessions: SessionResult[]) {
  const latest = sessions[0];
  const mode = latest ? getResultMode(latest) : null;
  const comparableSessions = mode ? sessions.filter((result) => getResultMode(result) === mode) : [];
  return {
    latest,
    mode,
    comparableSessions,
    best: comparableSessions.length ? Math.max(...comparableSessions.map((result) => result.accuracy)) : 0,
  };
}

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [gameOrder, setGameOrder] = useState<GameOrder>('perceived');

  useEffect(() => {
    let restoredOrder: GameOrder | null = null;
    let restoredResults: SessionResult[] | null = null;
    try {
      const savedOrder = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (savedOrder === 'published' || savedOrder === 'perceived') {
        restoredOrder = savedOrder;
      }
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isSessionResult);
        const seenIds = new Set<string>();
        const sanitized = valid.filter((result) => {
          if (seenIds.has(result.id)) return false;
          seenIds.add(result.id);
          return true;
        }).map((result) => ({
          ...result,
          accuracy: Math.min(100, Math.max(0, Math.round(result.accuracy))),
          stability: Math.min(100, Math.max(0, Math.round(result.stability))),
          medianRt: Math.max(0, Math.round(result.medianRt)),
          errors: Math.max(0, Math.round(result.errors)),
        })).slice(0, 100);
        // localStorage는 외부 저장소이므로 최초 1회 동기화한다.
        restoredResults = sanitized;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      }
    } catch { /* 저장 데이터가 깨졌다면 빈 기록으로 계속 진행한다. */ }
    const restoreFrame = window.requestAnimationFrame(() => {
      if (restoredOrder) setGameOrder(restoredOrder);
      if (restoredResults) setResults(restoredResults);
    });
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  function saveResult(result: SessionResult) {
    const next = [result, ...results].slice(0, 100);
    setResults(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* 비공개 모드에서도 게임 완료는 유지한다. */ }
  }

  const closeActiveGame = useCallback(() => setActiveGame(null), []);

  const recentResults = results.slice(0, 8);
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
  const featuredGame = lastResult
    ? games.find((game) => game.id === lastResult.gameId) ?? games[1]
    : games.find((game) => game.id === 'rps') ?? games[0];
  const featuredComparableResults = lastResult && lastResultMode
    ? results.filter((result) => result.gameId === featuredGame.id && getResultMode(result) === lastResultMode)
    : [];
  const orderedGames = gameOrder === 'perceived'
    ? [...games].sort((a, b) => (perceivedDifficultyRank.get(a.id) ?? 99) - (perceivedDifficultyRank.get(b.id) ?? 99))
    : games;

  function changeGameOrder(next: GameOrder) {
    setGameOrder(next);
    try { window.localStorage.setItem(ORDER_STORAGE_KEY, next); } catch { /* 저장을 쓸 수 없어도 정렬은 유지한다. */ }
  }

  return (
    <main className="site-shell" id="top">
      <a className="skip-link" href="#games">게임 목록으로 건너뛰기</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NINEFLOW LAB 홈">
          <span className="brand-glyph">N</span>
          <span>NINEFLOW <em>LAB</em></span>
        </a>
        <nav aria-label="주요 메뉴"><a href="#games">게임</a><a href="#records">내 기록</a></nav>
        <a className="header-status" href="#records" aria-label={`완료한 연습 ${results.length}회, 기록으로 이동`}>
          <span>완료</span><b>{results.length}</b>
        </a>
      </header>

      <section className="practice-head" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">AI 역량검사 전략게임 트레이너</p>
          <h1 id="page-title">연습할 게임을 고르고,<br />바로 시작하세요.</h1>
          <p>처음에는 설명과 피드백을 보며 익히고, 준비되면 실전형 연습으로 같은 흐름을 점검할 수 있습니다.</p>
          <div className="hero-actions">
            <button type="button" className="hero-primary" onClick={() => setActiveGame(featuredGame.id)}>
              <span>{lastResult ? '최근 게임 이어서' : '첫 연습 추천'}</span>
              <b>{featuredGame.title}</b><i aria-hidden="true">→</i>
            </button>
            <a href="#games">전체 9개 게임 보기</a>
          </div>
          <details className="simulator-note">
            <summary>이 연습 도구의 범위</summary>
            <p>공개된 게임 구조와 조작 흐름을 바탕으로 만든 독립형 시뮬레이터입니다. 공식 문항·화면·채점을 복제하거나 합격 가능성을 예측하지 않습니다.</p>
          </details>
        </div>
        <aside className={`continue-card tone-${featuredGame.tone}`} aria-label={lastResult ? '최근 게임 요약' : '첫 연습 추천'}>
          <div className="continue-head"><span>{lastResult ? 'CONTINUE' : 'START HERE'}</span><em>{featuredGame.no}</em></div>
          <div className="continue-body">
            <div className="continue-visual"><GameThumbnail gameId={featuredGame.id} /></div>
            <div>
              <small>{featuredGame.skill} · 난이도 {featuredGame.difficulty}{lastResult ? ` · ${lastResultModeLabel}` : ''}</small>
              <h2>{featuredGame.title}</h2>
              <p>{featuredGame.rule}</p>
            </div>
          </div>
          {lastResult ? (
            <dl className="continue-stats"><div><dt>최근 정확도</dt><dd>{lastResult.accuracy}%</dd></div><div><dt>최근 오류</dt><dd>{lastResult.errors}</dd></div><div><dt>동일 모드 횟수</dt><dd>{featuredComparableResults.length}회</dd></div></dl>
          ) : (
            <div className="continue-tip"><b>처음이라면</b><span>규칙이 단순한 가위바위보로 연습 모드와 실전형 연습의 차이부터 익혀보세요.</span></div>
          )}
        </aside>
      </section>

      <section className="game-section" id="games" aria-labelledby="games-title">
        <div className="section-heading">
          <div>
            <span>GAME LIBRARY</span>
            <h2 id="games-title">연습 게임</h2>
          </div>
          <p>카드를 누르면 규칙을 확인하고 연습 모드 또는 실전형 연습을 선택할 수 있습니다.</p>
        </div>

        <div className="game-order-toolbar">
          <span>정렬</span>
          <div className="game-order-actions" role="group" aria-label="게임 표시 순서">
            <button type="button" aria-pressed={gameOrder === 'perceived'} onClick={() => changeGameOrder('perceived')}>체감 어려운 순</button>
            <button type="button" aria-pressed={gameOrder === 'published'} onClick={() => changeGameOrder('published')}>게임 번호순</button>
          </div>
          <details className="difficulty-source"><summary>난이도 기준</summary><div className="difficulty-source-panel"><b>공식 등급과 체감 순위를 분리했습니다.</b><p>카드의 상·중·하는 JOBDA 공개 자료 기준입니다. 공식 1~9위는 없으며, 체감 순서는 여러 공개 후기에 반복된 경향을 합친 연습 우선순위라 개인차가 있습니다.</p><div><a href={DIFFICULTY_SOURCE_URL} target="_blank" rel="noreferrer">공식 등급 ↗</a>{DIFFICULTY_REVIEW_URLS.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div></div></details>
          <p className="sr-only" aria-live="polite">{gameOrder === 'perceived' ? '수험자 체감 난이도가 높은 순으로 배열했습니다.' : '게임 번호순으로 배열했습니다.'}</p>
        </div>

        <div className="game-grid">
          {orderedGames.map((game) => {
            const sessions = results.filter((result) => result.gameId === game.id);
            const { latest: last, mode, comparableSessions, best } = summarizeSessions(sessions);
            const modeLabel = mode ? resultModeLabels[mode] : '';
            const summaryId = `${game.id}-summary`;
            return (
              <article className={`game-card tone-${game.tone}`} key={game.id}>
                <div className="game-card-content">
                  <div className="card-top">
                    <span>GAME {game.no}</span>
                    <div className="card-badges"><span className="perceived-rank">체감 {perceivedDifficultyRank.get(game.id)}위</span><em className={`difficulty-badge difficulty-${game.difficulty === '상' ? 'high' : game.difficulty === '중' ? 'mid' : 'low'}`}>공식 {game.difficulty}</em></div>
                  </div>
                  <GameThumbnail gameId={game.id} />
                  <div className="card-copy">
                    <span>{game.skill}</span>
                    <h3>{game.title}</h3>
                    <p id={summaryId}>{game.rule}</p>
                  </div>
                  <dl className="card-record" aria-label={last ? `${modeLabel} 안에서 비교한 이 게임의 기록` : '이 게임의 기록 없음'}>
                    <div><dt>{last ? `${modeLabel} 최근` : '최근'}</dt><dd>{last ? `${last.accuracy}%` : '—'}</dd></div>
                    <div><dt>{last ? `${modeLabel} 최고` : '최고'}</dt><dd>{last ? `${best}%` : '—'}</dd></div>
                    <div><dt>{last ? '동일 모드 횟수' : '횟수'}</dt><dd>{comparableSessions.length}회</dd></div>
                  </dl>
                  <div className="card-action">
                    <span>{game.time}</span>
                    <b>설정 후 시작 <i aria-hidden="true">→</i></b>
                  </div>
                </div>
                <button className="game-card-hitarea" type="button" onClick={() => setActiveGame(game.id)} aria-label={`${game.title}, 난이도 ${game.difficulty}, 설정 열기`} aria-describedby={summaryId}><span className="sr-only">{game.title} 설정 열기</span></button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="records-section" id="records" aria-labelledby="records-title">
        <div className="records-heading"><div><span>MY PROGRESS</span><h2 id="records-title">내 연습 기록</h2></div><p>게임별 최근 모드 안에서만 최근·최고를 비교하며, 분량·속도가 다르면 참고용입니다.</p></div>
        {recentResults.length ? <>
          <div className="record-summary"><article><span>전체 연습</span><b>{results.length}회</b></article><article><span>연습한 게임</span><b>{practicedGames.length}<small>/ 9종</small></b></article><article><span>{lastResultModeLabel} 마지막 정확도</span><b>{lastResult.accuracy}%</b></article></div>
          <div className="game-record-grid" aria-label="게임별 기록">
            {practicedGames.map(({ game, latest, mode, comparableSessions, best }) => <article key={game.id} className={`tone-${game.tone}`}>
              <div><span>{game.no}</span><div><small>{game.skill}</small><b>{game.title}</b></div></div>
              <dl aria-label={`${resultModeLabels[mode ?? 'unknown']} 안에서 비교한 기록`}><div><dt>{resultModeLabels[mode ?? 'unknown']} 최근</dt><dd>{latest.accuracy}%</dd></div><div><dt>{resultModeLabels[mode ?? 'unknown']} 최고</dt><dd>{best}%</dd></div><div><dt>동일 모드 횟수</dt><dd>{comparableSessions.length}회</dd></div></dl>
              <button type="button" onClick={() => setActiveGame(game.id)} aria-label={`${game.title} 다시 연습`}>다시 연습 <span aria-hidden="true">→</span></button>
            </article>)}
          </div>
          <details className="history-panel">
            <summary>최근 세션 상세 보기 <span>{recentResults.length}개</span></summary>
            <div className="record-list">{recentResults.map((result) => { const game = games.find((item) => item.id === result.gameId)!; const modeLabel = resultModeLabels[getResultMode(result)]; return <article key={result.id}><div><span>{game.no}</span><b>{game.title}</b><small>{formatCompletedAt(result.completedAt)} · {modeLabel}</small></div><dl><div><dt>정확도</dt><dd>{result.accuracy}%</dd></div><div><dt>중앙 반응</dt><dd>{result.medianRt ? `${result.medianRt}ms` : '—'}</dd></div><div><dt>오류</dt><dd>{result.errors}</dd></div></dl></article>; })}</div>
          </details>
        </> : <div className="records-empty"><b>아직 완료한 연습이 없습니다.</b><span>게임 하나를 끝내면 그 게임의 최근·최고 점수와 시도 횟수가 여기에 쌓입니다.</span><button type="button" onClick={() => setActiveGame(featuredGame.id)}>첫 연습 시작</button></div>}
      </section>

      <footer>
        <div><b>NINEFLOW LAB</b><span>빠르게 시작하고, 게임별로 성장하는 전략게임 연습 도구</span></div>
        <div className="footer-links">
          <a href="https://www.jobda.im/acc/tutorial" target="_blank" rel="noreferrer">JOBDA 공식 튜토리얼 ↗</a>
          <a href="https://github.com/twitter/twemoji" target="_blank" rel="noreferrer">손동작 이미지: Twemoji · CC BY 4.0</a>
        </div>
      </footer>

      {activeGame && (
        <GameStage gameId={activeGame} onClose={closeActiveGame} onSave={saveResult} />
      )}
    </main>
  );
}
