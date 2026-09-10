'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameId } from '../lib/game-data';
import {
  evaluateRuleCheck,
  hasCompletedRuleCheck,
  ruleChecksByGame,
  upsertRuleCheckCompletion,
} from '../lib/game-onboarding';

const RULE_CHECK_STORAGE_KEY = 'nineflow-rule-check-v1';

function initialCompletion(gameId: GameId) {
  if (typeof window === 'undefined') return false;
  try { return hasCompletedRuleCheck(window.localStorage.getItem(RULE_CHECK_STORAGE_KEY), gameId); }
  catch { return false; }
}

export function RuleCheck({ gameId, onCompletionChange }: { gameId: GameId; onCompletionChange?: (completed: boolean) => void }) {
  const items = ruleChecksByGame[gameId];
  const [completed, setCompleted] = useState(() => initialCompletion(gameId));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() => items.map(() => null));
  const promptRef = useRef<HTMLLegendElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const current = items[questionIndex];
  const selected = answers[questionIndex];
  const correct = selected !== null && evaluateRuleCheck(current, selected);
  const correctCount = answers.filter((answer, index) => answer !== null && evaluateRuleCheck(items[index], answer)).length;

  useEffect(() => { onCompletionChange?.(completed); }, [completed, onCompletionChange]);

  function choose(choiceIndex: number) {
    if (selected !== null) return;
    setAnswers((previous) => previous.map((answer, index) => index === questionIndex ? choiceIndex : answer));
  }

  function finish() {
    const completedAt = new Date().toISOString();
    try {
      const raw = window.localStorage.getItem(RULE_CHECK_STORAGE_KEY);
      window.localStorage.setItem(RULE_CHECK_STORAGE_KEY, upsertRuleCheckCompletion(raw, gameId, completedAt));
    } catch { /* 저장이 막혀도 현재 설정 화면에서는 완료 상태를 유지한다. */ }
    setCompleted(true);
    window.requestAnimationFrame(() => restartRef.current?.focus());
  }

  function restart() {
    setCompleted(false);
    setQuestionIndex(0);
    setAnswers(items.map(() => null));
    window.requestAnimationFrame(() => promptRef.current?.focus());
  }

  function showNextQuestion() {
    setQuestionIndex((index) => index + 1);
    window.requestAnimationFrame(() => promptRef.current?.focus());
  }

  if (completed) {
    return (
      <section className="rule-check rule-check-complete" aria-label="무점수 규칙 확인 완료">
        <div aria-hidden="true">✓</div>
        <span><b>무점수 규칙 확인 완료</b><small>이 브라우저에서 공개 목표와 핵심 조작을 확인했습니다.</small></span>
        <button ref={restartRef} type="button" onClick={restart}>다시 확인</button>
      </section>
    );
  }

  return (
    <section className="rule-check" aria-labelledby={`${gameId}-rule-check-title`}>
      <header>
        <span><b id={`${gameId}-rule-check-title`}>시작 전 무점수 예제</b><small>독립 제작한 규칙 이해 문항이며 결과 기록에 반영되지 않습니다.</small></span>
        <em>{questionIndex + 1} / {items.length}</em>
      </header>
      <div className="rule-check-progress" aria-hidden="true"><i style={{ width: `${((questionIndex + (selected === null ? 0 : 1)) / items.length) * 100}%` }} /></div>
      <fieldset>
        <legend ref={promptRef} tabIndex={-1}>{current.prompt}</legend>
        <div>{current.choices.map((choice, choiceIndex) => {
          const isSelected = selected === choiceIndex;
          const isAnswer = selected !== null && current.correctIndex === choiceIndex;
          const tone = isAnswer ? 'is-answer' : isSelected ? 'is-wrong' : '';
          return <button type="button" key={choice} className={tone} disabled={selected !== null} aria-pressed={isSelected} onClick={() => choose(choiceIndex)}><span>{choiceIndex + 1}</span>{choice}</button>;
        })}</div>
      </fieldset>
      {selected !== null && (
        <div className={`rule-check-feedback ${correct ? 'is-correct' : 'is-error'}`} role="status" aria-live="polite">
          <span aria-hidden="true">{correct ? '✓' : '!'}</span>
          <div><b>{correct ? '핵심을 정확히 이해했습니다.' : `정답은 ${current.correctIndex + 1}번입니다.`}</b><p>{current.explanation}</p></div>
          {questionIndex < items.length - 1
            ? <button type="button" onClick={showNextQuestion}>다음 예제 <span aria-hidden="true">→</span></button>
            : correctCount === items.length
              ? <button type="button" onClick={finish}>확인 완료 · {correctCount}/{items.length}</button>
              : <button type="button" onClick={restart}>해설 확인 후 다시 풀기 · {correctCount}/{items.length}</button>}
        </div>
      )}
    </section>
  );
}
