import type { GameId } from './game-data';

export const RULE_CHECK_VERSION = 'rule-check-v1-2026-09' as const;

export type RuleCheckItem = {
  id: string;
  prompt: string;
  choices: readonly [string, string, string];
  correctIndex: 0 | 1 | 2;
  explanation: string;
};

/**
 * 공개된 과제 목표를 사용자가 이해했는지 확인하는 독립 연습 문항이다.
 * 공식 검사 문항·화면·채점 자료를 재현하지 않는다.
 */
export const ruleChecksByGame: Record<GameId, readonly [RuleCheckItem, RuleCheckItem]> = {
  rps: [
    {
      id: 'rps-perspective',
      prompt: '상대의 패가 보이고 내 패가 물음표입니다. 이 연습에서 먼저 확인할 것은 무엇인가요?',
      choices: ['화면에 보이는 패만 그대로 누른다', '누구의 패를 완성해야 하는지 확인한다', '가장 최근에 나온 패를 반복한다'],
      correctIndex: 1,
      explanation: '물음표가 내 패인지 상대 패인지 먼저 확인한 뒤, 안내된 관점에서 이기는 관계를 완성합니다.',
    },
    {
      id: 'rps-relation',
      prompt: '관점이 바뀌는 문제에서 실수를 줄이는 가장 안전한 순서는 무엇인가요?',
      choices: ['관점 확인 → 관계 판단 → 입력', '입력 → 관점 확인 → 수정', '속도만 높여 반복 입력'],
      correctIndex: 0,
      explanation: '관점과 물음표 위치를 먼저 고정하고 승패 관계를 판단한 뒤 한 번만 입력합니다.',
    },
  ],
  rotation: [
    {
      id: 'rotation-order',
      prompt: '회전과 반전을 함께 쓰는 문제에서 가장 중요한 것은 무엇인가요?',
      choices: ['버튼 색상', '조작을 누른 순서', '항상 회전을 두 번 누르는 것'],
      correctIndex: 1,
      explanation: '회전과 반전은 누른 순서에 따라 결과가 달라질 수 있으므로 조작 순서를 보존해야 합니다.',
    },
    {
      id: 'rotation-anchor',
      prompt: '목표 모양과 비교할 때 먼저 잡으면 좋은 기준은 무엇인가요?',
      choices: ['비대칭 특징의 위치와 방향', '배경색의 밝기', '문제 번호의 홀짝'],
      correctIndex: 0,
      explanation: '튀어나온 부분처럼 비대칭인 기준점을 잡으면 회전과 거울상을 구분하기 쉽습니다.',
    },
  ],
  appointment: [
    {
      id: 'appointment-common',
      prompt: '요일·장소·메뉴 라운드의 기본 판단은 무엇인가요?',
      choices: ['세 사람 모두에게 나온 항목', '한 사람에게만 나온 항목', '가장 먼저 나온 항목'],
      correctIndex: 0,
      explanation: '앞 라운드들은 세 사람의 선택에 공통으로 포함된 항목을 찾는 교집합 문제입니다.',
    },
    {
      id: 'appointment-bus',
      prompt: '미탑승 버스 라운드에서는 어떤 번호를 고르나요?',
      choices: ['세 사람이 모두 이용한 번호', '누구도 이용하지 않은 번호', '가장 큰 번호'],
      correctIndex: 1,
      explanation: '마지막 라운드는 앞 라운드와 반대로, 세 사람의 이용 목록 어디에도 없는 번호를 찾습니다.',
    },
  ],
  path: [
    {
      id: 'path-goal',
      prompt: '길 만들기에서 우선 충족해야 하는 조건은 무엇인가요?',
      choices: ['모든 차량이 지정된 손님에게 도착', '울타리를 화면 가득 설치', '가장 긴 경로 만들기'],
      correctIndex: 0,
      explanation: '먼저 모든 차량이 각자의 손님에게 도착해야 하며, 그다음 목표 울타리 수를 확인합니다.',
    },
    {
      id: 'path-efficiency',
      prompt: '경로가 모두 연결됐지만 목표보다 울타리를 많이 썼다면 어떻게 보나요?',
      choices: ['완전히 같은 기록이다', '경로 성공과 효율 조건을 나눠 본다', '차량 수만 세면 된다'],
      correctIndex: 1,
      explanation: '이 앱은 공개된 경로 성공 조건과 목표 울타리 수 조건을 분리해 복습합니다.',
    },
  ],
  potion: [
    {
      id: 'potion-combination',
      prompt: '마법약 결과를 학습할 때 무엇을 하나의 단위로 보나요?',
      choices: ['재료 하나의 색만', '제시된 재료 조합 전체', '버튼을 누른 속도만'],
      correctIndex: 1,
      explanation: '개별 재료 하나가 아니라 함께 제시된 조합 전체와 누적 결과를 연결해 학습합니다.',
    },
    {
      id: 'potion-probability',
      prompt: '누적 관찰상 파랑이 더 많았지만 이번 결과가 빨강이면 반드시 판단 오류인가요?',
      choices: ['항상 오류다', '확률적 결과라 반드시 오류는 아니다', '다음부터 무조건 빨강을 고른다'],
      correctIndex: 1,
      explanation: '결과는 확률적일 수 있습니다. 실제 색 적중과 누적 근거에 맞춘 판단을 따로 확인합니다.',
    },
  ],
  nback: [
    {
      id: 'nback-lag',
      prompt: '2-back 문제에서 현재 도형은 무엇과 비교하나요?',
      choices: ['바로 직전 도형', '두 번째 전 도형', '세 번째 뒤 도형'],
      correctIndex: 1,
      explanation: '2-back은 현재 도형을 두 번째 전에 나온 도형과 비교합니다.',
    },
    {
      id: 'nback-neither',
      prompt: '2·3-back에서 현재 도형이 두 번째 전, 세 번째 전과 모두 다르면 어떻게 하나요?',
      choices: ['두 번째 전을 선택', '세 번째 전을 선택', '둘 다 아님을 선택'],
      correctIndex: 2,
      explanation: '두 비교 대상과 모두 다르면 둘 다 아님 응답을 선택합니다.',
    },
  ],
  number: [
    {
      id: 'number-sequence',
      prompt: '규칙 라운드에서 가장 먼저 해야 할 일은 무엇인가요?',
      choices: ['1부터 순서를 세우고 예외를 적용', '가장 큰 숫자부터 누르기', '점등된 버튼만 계속 누르기'],
      correctIndex: 0,
      explanation: '기본 숫자 순서를 유지하면서 건너뛰기·두 번 누르기 같은 예외를 해당 숫자에 적용합니다.',
    },
    {
      id: 'number-layout',
      prompt: '숫자판 배열이 바뀌었을 때 안전한 전략은 무엇인가요?',
      choices: ['이전 위치를 그대로 누른다', '현재 숫자의 위치를 다시 확인한다', '아무 버튼이나 빠르게 누른다'],
      correctIndex: 1,
      explanation: '위치가 아니라 숫자 순서가 기준이므로 매 화면에서 현재 배열을 다시 확인합니다.',
    },
  ],
  count: [
    {
      id: 'count-target',
      prompt: '개수 비교에서 선택 기준은 무엇인가요?',
      choices: ['글자가 더 큰 쪽', '의미가 더 긍정적인 쪽', '실제 단어 수가 더 많은 쪽'],
      correctIndex: 2,
      explanation: '단어의 뜻과 크기는 방해 자극이며 실제로 보인 단어 개수만 비교합니다.',
    },
    {
      id: 'count-memory',
      prompt: '단어가 사라진 뒤 가장 도움이 되는 기억 방식은 무엇인가요?',
      choices: ['좌우 개수 차이를 짧게 유지', '단어 뜻을 문장으로 해석', '글자색 이름을 외우기'],
      correctIndex: 0,
      explanation: '제시 동안 좌우 개수 또는 어느 쪽이 더 많았는지를 짧게 부호화해 유지합니다.',
    },
  ],
  mouse: [
    {
      id: 'mouse-order',
      prompt: '고양이 판단 전에 가장 먼저 기억해야 하는 것은 무엇인가요?',
      choices: ['생쥐가 있던 위치', '격자 테두리 색', '라운드 번호'],
      correctIndex: 0,
      explanation: '생쥐 위치를 먼저 기억한 뒤 고양이 위치와 비교해 찾음·놓침을 판단합니다.',
    },
    {
      id: 'mouse-confidence',
      prompt: '확신도 응답은 어떻게 사용하는 것이 좋나요?',
      choices: ['항상 최고 확신을 고른다', '판단의 실제 확신 정도를 따로 표시한다', '정답 점수와 같은 뜻으로 본다'],
      correctIndex: 1,
      explanation: '확신도는 정확도와 별개인 자기 판단 기록입니다. 높은 확신 자체가 정답 점수는 아닙니다.',
    },
  ],
};

export function evaluateRuleCheck(item: RuleCheckItem, selectedIndex: number) {
  return selectedIndex === item.correctIndex;
}

type StoredRuleCheckCompletion = Record<string, { version?: unknown; completedAt?: unknown }>;

export function hasCompletedRuleCheck(raw: string | null, gameId: GameId) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as StoredRuleCheckCompletion;
    const item = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed[gameId] : null;
    return item?.version === RULE_CHECK_VERSION
      && typeof item.completedAt === 'string'
      && Number.isFinite(Date.parse(item.completedAt));
  } catch {
    return false;
  }
}

export function upsertRuleCheckCompletion(raw: string | null, gameId: GameId, completedAt: string) {
  let parsed: StoredRuleCheckCompletion = {};
  try {
    const candidate = raw ? JSON.parse(raw) as unknown : {};
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) parsed = candidate as StoredRuleCheckCompletion;
  } catch { /* 손상된 진행값은 현재 완료 기록부터 안전하게 다시 만든다. */ }
  return JSON.stringify({
    ...parsed,
    [gameId]: { version: RULE_CHECK_VERSION, completedAt },
  });
}
