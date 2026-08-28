'use client';

import { useEffect, useState } from 'react';
import { GameStage } from './components/game-stage';
import { GameThumbnail } from './components/game-thumbnail';
import { games, type GameId, type SessionResult } from './lib/game-data';

const STORAGE_KEY = 'nineflow-practice-results-v2';
const gameIds = new Set(games.map((game) => game.id));

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

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);

  useEffect(() => {
    try {
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResults(sanitized);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      }
    } catch { /* 저장 데이터가 깨졌다면 빈 기록으로 계속 진행한다. */ }
  }, []);

  function saveResult(result: SessionResult) {
    const next = [result, ...results].slice(0, 100);
    setResults(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* 비공개 모드에서도 게임 완료는 유지한다. */ }
  }

  const recentResults = results.slice(0, 8);
  const averageAccuracy = recentResults.length ? Math.round(recentResults.reduce((sum, result) => sum + result.accuracy, 0) / recentResults.length) : 0;
  const averageRt = recentResults.length ? Math.round(recentResults.reduce((sum, result) => sum + result.medianRt, 0) / recentResults.length) : 0;

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NINEFLOW LAB 홈">
          <span className="brand-glyph">N</span>
          <span>NINEFLOW <em>LAB</em></span>
        </a>
        <div className="header-status" aria-label="연습 기록">
          <span>완료 기록</span><b>{results.length}</b>
        </div>
      </header>

      <section className="practice-head" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">JOBDA 공개 게임 구조 기준</p>
          <h1 id="page-title">전략게임 9종 연습실</h1>
          <p>게임을 고른 뒤 연습 모드 또는 실전 모드로 진행할 수 있습니다.</p>
        </div>
        <aside>
          <b>연습용 시뮬레이터</b>
          <span>공식 채점·문항·화면을 복제하거나 합격 가능성을 예측하지 않습니다.</span>
        </aside>
      </section>

      <section className="game-section" id="games" aria-labelledby="games-title">
        <div className="section-heading">
          <div>
            <span>9 GAMES</span>
            <h2 id="games-title">게임과 모드를 선택하세요</h2>
          </div>
          <p>공개 튜토리얼에서 확인되는 자극 종류와 조작 흐름을 반영했습니다.</p>
        </div>

        <div className="game-grid">
          {games.map((game) => {
            const last = results.find((result) => result.gameId === game.id);
            return (
              <article className={`game-card tone-${game.tone}`} key={game.id}>
                <button className="game-card-button" onClick={() => setActiveGame(game.id)} aria-label={`${game.title} 모드 선택`}>
                  <div className="card-top">
                    <span>{game.no}</span>
                    <span>{game.skill}</span>
                  </div>
                  <GameThumbnail gameId={game.id} />
                  <div className="card-copy">
                    <h3>{game.title}</h3>
                    <p>{game.rounds}</p>
                  </div>
                  <div className="card-action">
                    <span>{last ? `최근 정확도 ${last.accuracy}%` : '아직 기록 없음'}</span>
                    <b>모드 선택 <i>→</i></b>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="records-section" aria-labelledby="records-title">
        <div className="records-heading"><div><span>LOCAL RECORDS</span><h2 id="records-title">내 연습 기록</h2></div><p>회원가입 없이 이 브라우저에만 저장됩니다.</p></div>
        {recentResults.length ? <>
          <div className="record-summary"><article><span>최근 연습</span><b>{recentResults.length}회</b></article><article><span>평균 정확도</span><b>{averageAccuracy}%</b></article><article><span>평균 중앙 반응</span><b>{averageRt ? `${averageRt}ms` : '—'}</b></article></div>
          <div className="record-list">{recentResults.map((result) => { const game = games.find((item) => item.id === result.gameId)!; const mode = result.detail?.sessionMode; return <article key={result.id}><div><span>{game.no}</span><b>{game.title}</b><small>{formatCompletedAt(result.completedAt)}{typeof mode === 'string' ? ` · ${mode}` : ''}</small></div><dl><div><dt>정확도</dt><dd>{result.accuracy}%</dd></div><div><dt>중앙 반응</dt><dd>{result.medianRt ? `${result.medianRt}ms` : '—'}</dd></div><div><dt>오류</dt><dd>{result.errors}</dd></div></dl></article>; })}</div>
        </> : <div className="records-empty"><b>아직 완료한 연습이 없습니다.</b><span>게임 하나를 끝내면 정확도·반응시간·오류가 여기에 쌓입니다.</span></div>}
      </section>

      <footer>
        <div><b>NINEFLOW LAB</b><span>독립형 전략게임 연습 도구</span></div>
        <div className="footer-links">
          <a href="https://www.jobda.im/acc/tutorial" target="_blank" rel="noreferrer">JOBDA 공식 튜토리얼 ↗</a>
          <a href="https://github.com/twitter/twemoji" target="_blank" rel="noreferrer">손동작 이미지: Twemoji · CC BY 4.0</a>
        </div>
      </footer>

      {activeGame && (
        <GameStage gameId={activeGame} onClose={() => setActiveGame(null)} onSave={saveResult} />
      )}
    </main>
  );
}
