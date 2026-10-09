import test from 'node:test';
import assert from 'node:assert/strict';
import { gameFeedbackSignal, RPS_FEEDBACK_HOLD_MS } from './game-feedback.ts';

test('오답의 정답 해설은 정답 표시로 분류하지 않는다', () => {
  assert.deepEqual(gameFeedbackSignal('정답은 수요일'), { tone: 'error', label: '오답' });
});

test('경로가 도착해도 울타리 감점·미달은 성공 표시로 분류하지 않는다', () => {
  for (const text of ['경로 성공 · 울타리 초과로 감점', '경로 성공 · 목표 울타리 수 미달', '경로는 맞지만 울타리를 다시 확인하세요.']) {
    assert.deepEqual(gameFeedbackSignal(text), { tone: 'error', label: '조건 불일치' });
  }
});

test('정답과 일반 오답은 색 이외의 이름표도 제공한다', () => {
  for (const text of ['정답', '정답 · 응답 저장됨', '성공', '경로 성공 · 정답 울타리 수 일치']) {
    assert.deepEqual(gameFeedbackSignal(text), { tone: 'success', label: '정답' });
  }
  for (const text of ['오답 · 다른 도형입니다.', '물음표 위치를 먼저 확인하세요.', '모양이 다릅니다.', '순서 오류', '모든 교통수단의 도착 위치를 확인하세요.']) {
    assert.deepEqual(gameFeedbackSignal(text), { tone: 'error', label: '오답' });
  }
});

test('시간 초과와 조작 소진은 각각 원인을 표시한다', () => {
  assert.deepEqual(gameFeedbackSignal('시간 초과'), { tone: 'error', label: '시간 초과' });
  assert.deepEqual(gameFeedbackSignal('시간이 끝났습니다.'), { tone: 'error', label: '시간 초과' });
  assert.deepEqual(gameFeedbackSignal('20회 조작을 모두 사용해 빈 답안이 되었습니다.'), { tone: 'error', label: '조작 소진' });
});

test('확률적인 물약 결과와 초기화 안내를 정오로 단정하지 않는다', () => {
  for (const text of ['예측 성공 · 실제 제조색은 파랑입니다.', '예측 실패 · 실제 제조색은 빨강입니다.', '배치를 초기화했습니다.']) {
    assert.deepEqual(gameFeedbackSignal(text), { tone: 'neutral', label: '결과 확인' });
  }
  assert.equal(gameFeedbackSignal(''), null);
});

test('가위바위보 결과 표시는 다음 입력 전에 1초 유지한다', () => {
  assert.equal(RPS_FEEDBACK_HOLD_MS, 1000);
});
