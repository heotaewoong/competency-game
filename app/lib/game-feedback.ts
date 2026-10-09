export type GameFeedbackSignal = { tone: 'success' | 'error' | 'neutral'; label: string };

// 해설에 포함된 '정답'과 실제 정답을 구분하고, 확률적 결과는 중립으로 둔다.
export function gameFeedbackSignal(feedback: string): GameFeedbackSignal | null {
  if (!feedback) return null;
  if (/^시간/.test(feedback)) return { tone: 'error', label: '시간 초과' };
  if (/^20회/.test(feedback)) return { tone: 'error', label: '조작 소진' };
  if (/^경로/.test(feedback) && /감점|초과|미달|^경로는/.test(feedback)) return { tone: 'error', label: '조건 불일치' };
  if (/^(정답은|오답|모양|물음표|모든|순서)/.test(feedback)) return { tone: 'error', label: '오답' };
  if (/^(정답|성공|경로 성공)(?:$|\s|·)/.test(feedback)) return { tone: 'success', label: '정답' };
  return { tone: 'neutral', label: '결과 확인' };
}

// JOBDA 공식 시간이 아니라 이 앱에서 결과를 알아볼 수 있게 하는 훈련값.
export const RPS_FEEDBACK_HOLD_MS = 1000;
