'use client';

import { CognitiveGlyph, glyphShapeNames } from './cognitive-glyph';
import type { NBackTask } from '../lib/nback-game';

export function NBackThumbnailVisual() {
  return (
    <div className="nback-thumb-visual" aria-hidden="true">
      <div className="nback-thumb-track">
        <span className="nback-thumb-slot is-target"><small>N-2</small><CognitiveGlyph variant={3} size={58} color="#2a9fb8" /></span>
        <i className="nback-thumb-gap"><b /><b /><b /></i>
        <span className="nback-thumb-slot is-current"><small>NOW</small><CognitiveGlyph variant={3} size={58} color="#2a9fb8" /></span>
      </div>
      <div className="nback-thumb-tags"><span>N-BACK</span><b>2-BACK</b></div>
    </div>
  );
}

export function NBackIntroDiagram({ task }: { task: NBackTask }) {
  const isN23 = task === 'n23';
  const slots = isN23
    ? [
        { label: 'N-3', variant: 3, target: true, current: false },
        { label: 'N-2', variant: 4, target: true, current: false },
        { label: 'N-1', variant: 5, target: false, current: false },
        { label: 'NOW', variant: 3, target: false, current: true },
      ]
    : [
        { label: 'N-2', variant: 3, target: true, current: false },
        { label: 'N-1', variant: 4, target: false, current: false },
        { label: 'NOW', variant: 3, target: false, current: true },
      ];
  const answer = isN23 ? '예시 정답 · 3번째 전' : '예시 정답 · 2번째 전';
  const description = isN23 ? '현재 도형을 N-2와 N-3에 각각 비교합니다.' : '현재 도형을 N-2 하나와 비교합니다.';

  return (
    <section className="nback-intro-diagram" aria-label={`${isN23 ? '2·3-back' : '2-back'} 예시. ${description} ${answer}`}>
      <header><span>N-BACK 한눈에 보기</span><b>{description}</b></header>
      <ol className={isN23 ? 'is-n23' : ''}>
        {slots.map((slot) => (
          <li className={`${slot.target ? 'is-target' : ''} ${slot.current ? 'is-current' : ''}`.trim()} key={slot.label}>
            <small>{slot.label}</small>
            <CognitiveGlyph variant={slot.variant} size={54} color={slot.target || slot.current ? '#237b76' : '#9fb5b3'} label={`${slot.label} ${glyphShapeNames[slot.variant]}`} />
            <span>{slot.current ? '현재' : slot.target ? '비교' : '유지'}</span>
          </li>
        ))}
      </ol>
      <footer><span>{isN23 ? 'N-3과 현재 N이 같음' : 'N-2와 현재 N이 같음'}</span><b>{answer}</b></footer>
    </section>
  );
}

function NBackRoundLane({ task }: { task: NBackTask }) {
  const isN23 = task === 'n23';
  const slots = isN23
    ? [
        { label: 'N-3', variant: 3, target: true },
        { label: 'N-2', variant: 4, target: true },
        { label: 'N-1', variant: 5, target: false },
        { label: 'N', variant: 3, target: false },
      ]
    : [
        { label: 'N-2', variant: 3, target: true },
        { label: 'N-1', variant: 4, target: false },
        { label: 'N', variant: 3, target: false },
      ];

  return (
    <ol className={isN23 ? 'is-n23' : ''}>
      {slots.map((slot) => (
        <li className={`${slot.target ? 'is-target' : ''} ${slot.label === 'N' ? 'is-current' : ''}`.trim()} key={slot.label}>
          <small>{slot.label}</small>
          <CognitiveGlyph variant={slot.variant} size={42} color={slot.target || slot.label === 'N' ? '#237b76' : '#9fb5b3'} label={`${slot.label} ${glyphShapeNames[slot.variant]}`} />
        </li>
      ))}
    </ol>
  );
}

export function NBackSimulationDiagram() {
  return (
    <section className="nback-simulation-diagram" aria-label="실전형 연습은 1라운드 2-back 다음 2라운드 2·3-back 순서로 진행됩니다. 라운드가 바뀌면 기억 칸을 새로 채웁니다.">
      <header><span>실전형 진행 지도</span><b>2-back을 마치면 기억 칸을 초기화하고 2·3-back으로 전환합니다.</b></header>
      <div>
        <article><header><span>ROUND 1</span><b>2-BACK</b></header><NBackRoundLane task="n2" /><p>N-2와 현재 N을 비교</p></article>
        <i aria-hidden="true">→</i>
        <article><header><span>ROUND 2</span><b>2·3-BACK</b></header><NBackRoundLane task="n23" /><p>N-2·N-3과 현재 N을 각각 비교</p></article>
      </div>
      <footer><b>라운드 전환</b><span>앞 라운드 도형은 이어서 기억하지 않습니다.</span></footer>
    </section>
  );
}

export function NBackLagRail({ task, warmup, position }: { task: NBackTask; warmup: boolean; position: number }) {
  const isN23 = task === 'n23';
  const labels = isN23 ? ['N-3', 'N-2', 'N-1', 'N'] : ['N-2', 'N-1', 'N'];
  const targets = new Set(isN23 ? ['N-3', 'N-2'] : ['N-2']);
  const warmupGoal = isN23 ? 3 : 2;
  const warmupFilled = Math.min(position + 1, warmupGoal);
  const visibleFilled = warmup ? warmupFilled : labels.length;
  const instruction = warmup
    ? `기억 채우기 ${warmupFilled}/${warmupGoal}`
    : isN23
      ? '현재 N을 N-2·N-3과 비교'
      : '현재 N을 N-2와 비교';

  return (
    <section className={`nback-lag-map ${warmup ? 'is-warmup' : 'is-ready'}`} aria-label={instruction}>
      <header><span><i>N</i> BACK MAP</span><b>{instruction}</b></header>
      <ol className={isN23 ? 'is-n23' : ''}>
        {labels.map((label, index) => {
          const filled = index >= labels.length - visibleFilled;
          const current = label === 'N';
          const target = targets.has(label);
          return (
            <li className={`${filled ? 'is-filled' : ''} ${current ? 'is-current' : ''} ${target ? 'is-target' : ''}`.trim()} key={label}>
              <span>{label}</span><i>{current ? '현재' : target ? '비교' : '유지'}</i>
            </li>
          );
        })}
      </ol>
      <p>{warmup ? '도형 값을 순서대로 넣는 중입니다.' : '칸은 위치만 안내하며 이전 도형은 보여주지 않습니다.'}</p>
    </section>
  );
}
