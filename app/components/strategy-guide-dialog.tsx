'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { games, getGame, type GameId } from '../lib/game-data';
import { lockDocumentScroll } from '../lib/scroll-lock';
import { getStrategyGuide } from '../lib/strategy-guide';
import { GameThumbnail } from './game-thumbnail';

type StrategyGuideDialogProps = {
  initialGameId?: GameId;
  onClose: () => void;
  onStartGame?: (gameId: GameId) => void;
  nested?: boolean;
};

const COMPACT_STRATEGY_TABS_QUERY = '(max-width: 760px), (max-width: 900px) and (max-height: 600px) and (orientation: landscape)';

function subscribeCompactStrategyTabs(onChange: () => void) {
  const media = window.matchMedia(COMPACT_STRATEGY_TABS_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function compactStrategyTabsSnapshot() {
  return window.matchMedia(COMPACT_STRATEGY_TABS_QUERY).matches;
}

export function StrategyGuideDialog({ initialGameId = 'rotation', onClose, onStartGame, nested = false }: StrategyGuideDialogProps) {
  const [selectedGameId, setSelectedGameId] = useState<GameId>(initialGameId);
  const compactTabs = useSyncExternalStore(subscribeCompactStrategyTabs, compactStrategyTabsSnapshot, () => false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const selectedTabRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const game = getGame(selectedGameId);
  const guide = getStrategyGuide(selectedGameId);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = lockDocumentScroll();
    const container = backdropRef.current?.parentElement;
    const siblings = !nested && container ? Array.from(container.children).filter((element) => element !== backdropRef.current) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusFrame = window.requestAnimationFrame(() => selectedTabRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      const active = document.activeElement;
      const activeIsTabStop = items.includes(active as HTMLElement);
      if (event.shiftKey && (active === first || !activeIsTabStop)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !activeIsTabStop)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKey, true);
      releaseScrollLock();
      siblingState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      previousFocus?.focus();
    };
  }, [nested]);

  useEffect(() => {
    const revealFrame = window.requestAnimationFrame(() => {
      const tabs = tabsRef.current;
      const tab = selectedTabRef.current;
      if (!tabs || !tab) return;
      const tabsRect = tabs.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      tabs.scrollTo({
        left: Math.max(0, tabs.scrollLeft + tabRect.left - tabsRect.left - (tabs.clientWidth - tabRect.width) / 2),
        top: Math.max(0, tabs.scrollTop + tabRect.top - tabsRect.top - (tabs.clientHeight - tabRect.height) / 2),
      });
    });
    return () => window.cancelAnimationFrame(revealFrame);
  }, [selectedGameId]);

  function selectGame(gameId: GameId) {
    setSelectedGameId(gameId);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('.strategy-guide-content')?.scrollTo({ top: 0 }));
  }

  function moveTab(offset: number) {
    const currentIndex = games.findIndex((item) => item.id === selectedGameId);
    const nextIndex = (currentIndex + offset + games.length) % games.length;
    selectGame(games[nextIndex].id);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`#strategy-tab-${games[nextIndex].id}`)?.focus());
  }

  return (
    <div ref={backdropRef} className="strategy-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="strategy-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="strategy-guide-title">
        <header className="strategy-guide-header">
          <div><span>9-GAME PLAYBOOK</span><h2 id="strategy-guide-title">전략게임 가이드</h2><p>규칙을 외우는 데서 끝내지 않고, 실제 판단 순서와 복습 방법까지 한곳에 모았습니다.</p></div>
          <button type="button" aria-label="전략게임 가이드 닫기" onClick={onClose}>×</button>
        </header>

        <div className="strategy-guide-layout">
          <nav ref={tabsRef} className="strategy-game-tabs" role="tablist" aria-label="가이드를 볼 게임" aria-orientation={compactTabs ? 'horizontal' : 'vertical'}>
            {games.map((item) => (
              <button
                id={`strategy-tab-${item.id}`}
                key={item.id}
                ref={item.id === selectedGameId ? selectedTabRef : undefined}
                type="button"
                role="tab"
                aria-selected={item.id === selectedGameId}
                aria-controls="strategy-guide-panel"
                tabIndex={item.id === selectedGameId ? 0 : -1}
                onClick={() => selectGame(item.id)}
                onKeyDown={(event) => {
                  if (event.key === (compactTabs ? 'ArrowRight' : 'ArrowDown')) { event.preventDefault(); moveTab(1); }
                  if (event.key === (compactTabs ? 'ArrowLeft' : 'ArrowUp')) { event.preventDefault(); moveTab(-1); }
                  if (event.key === 'Home') { event.preventDefault(); selectGame(games[0].id); window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`#strategy-tab-${games[0].id}`)?.focus()); }
                  if (event.key === 'End') { event.preventDefault(); const last = games.at(-1)!; selectGame(last.id); window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`#strategy-tab-${last.id}`)?.focus()); }
                }}
              >
                <span>{item.no}</span><b>{item.title}</b><small>{item.skill}</small>
              </button>
            ))}
          </nav>

          <div id="strategy-guide-panel" className="strategy-guide-content" role="tabpanel" aria-labelledby={`strategy-tab-${selectedGameId}`} tabIndex={0}>
            <section className={`strategy-guide-hero tone-${game.tone}`}>
              <div className="strategy-guide-thumb"><GameThumbnail gameId={selectedGameId} /></div>
              <div><span>{game.no} · {game.skill} · 2024 공개 기업자료 난이도 {game.difficulty}</span><h3>{game.title}</h3><p>{guide.oneLine}</p></div>
            </section>

            <section className="strategy-guide-formula" aria-labelledby="guide-order-title">
              <div><span>DECISION FLOW</span><h4 id="guide-order-title">판단 순서</h4></div>
              <ol>{guide.decisionOrder.map((step, index) => <li key={step}><span>{index + 1}</span><b>{step}</b></li>)}</ol>
            </section>

            <section className="strategy-guide-example" aria-labelledby="guide-example-title">
              <div className="strategy-block-title"><span>ORIGINAL EXAMPLE</span><h4 id="guide-example-title">자체 제작 대표 예시</h4></div>
              <article><span>상황</span><h5>{guide.example.title}</h5><p>{guide.example.situation}</p><div><b>{guide.example.answer}</b><small>{guide.example.reason}</small></div></article>
            </section>

            <div className="strategy-guide-columns">
              <section aria-labelledby="guide-tips-title">
                <div className="strategy-block-title"><span>KEY TIPS</span><h4 id="guide-tips-title">핵심 공략</h4></div>
                <ul>{guide.tips.map((item, index) => <li key={item.title}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.title}</b><p>{item.body}</p></div></li>)}</ul>
              </section>
              <section className="strategy-mistakes" aria-labelledby="guide-mistakes-title">
                <div className="strategy-block-title"><span>WATCH OUT</span><h4 id="guide-mistakes-title">흔한 실수</h4></div>
                <ul>{guide.mistakes.map((item) => <li key={item.title}><span aria-hidden="true">!</span><div><b>{item.title}</b><p>{item.body}</p></div></li>)}</ul>
              </section>
            </div>

            <section className="strategy-guide-drills" aria-labelledby="guide-drills-title">
              <div className="strategy-block-title"><span>TRAINING LADDER</span><h4 id="guide-drills-title">추천 훈련 순서</h4></div>
              <ol>{guide.drills.map((item) => <li key={item.title}><b>{item.title}</b><p>{item.body}</p></li>)}</ol>
            </section>

            <aside className="strategy-guide-scope" role="note"><b>가이드 범위</b><p>공개된 게임 구조를 바탕으로 만든 독립형 학습 자료입니다. 예시 문항·표현·훈련 순서는 이 앱이 자체 제작했으며 실제 비공개 문항이나 채점 기준을 복제하지 않습니다.</p></aside>
          </div>
        </div>

        <footer className="strategy-guide-footer">
          <span><b>{game.title}</b> 가이드를 보고 있습니다.</span>
          <div><a href={`https://www.jobda.im/info/${({ rps:'335', rotation:'336', appointment:'337', path:'338', potion:'339', number:'340', nback:'341', mouse:'342', count:'343' } as Record<GameId, string>)[selectedGameId]}`} target="_blank" rel="noreferrer">JOBDA 공개 레거시 해설 ↗</a>{onStartGame && <button type="button" onClick={() => onStartGame(selectedGameId)}>이 게임 연습하기 <span>→</span></button>}</div>
        </footer>
      </section>
    </div>
  );
}
