import type { GameId } from './game-data';

export const FEEDBACK_ISSUES_URL = 'https://github.com/heotaewoong/competency-game/issues';
export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 1000;
export const FEEDBACK_ISSUE_URL_MAX_LENGTH = 6500;

export type FeedbackCategory = 'bug' | 'rule' | 'difficulty' | 'feature' | 'other';

export const feedbackCategories: ReadonlyArray<{ id: FeedbackCategory; label: string }> = [
  { id: 'bug', label: '오류 제보' },
  { id: 'rule', label: '게임 규칙' },
  { id: 'difficulty', label: '난이도 의견' },
  { id: 'feature', label: '기능 개선' },
  { id: 'other', label: '기타 의견' },
];

type FeedbackIssueInput = {
  category: FeedbackCategory;
  gameId: GameId | 'site';
  message: string;
  rating?: number;
  mode?: string;
  includeEnvironment?: boolean;
  viewport?: { width: number; height: number };
  pageUrl?: string;
};

function categoryLabel(category: FeedbackCategory) {
  return feedbackCategories.find((item) => item.id === category)?.label ?? '기타 의견';
}

function gameLabel(gameId: GameId | 'site') {
  const labels: Record<GameId, string> = {
    rps: '가위바위보',
    rotation: '도형 회전하기',
    appointment: '약속 정하기',
    path: '길 만들기',
    potion: '마법약 만들기',
    nback: '도형 순서 기억하기',
    number: '숫자 누르기',
    count: '개수 비교하기',
    mouse: '고양이 술래잡기',
  };
  return gameId === 'site' ? '사이트 전체' : labels[gameId];
}

function feedbackIssueTitle(input: Pick<FeedbackIssueInput, 'category' | 'gameId'>) {
  return `[${categoryLabel(input.category)}] ${gameLabel(input.gameId)}`;
}

export function buildFeedbackIssueText(input: FeedbackIssueInput) {
  const message = input.message.trim().slice(0, FEEDBACK_MESSAGE_MAX);
  const lines = [
    '## 의견',
    '',
    message,
    '',
    '## 관련 항목',
    '',
    `- 유형: ${categoryLabel(input.category)}`,
    `- 게임: ${gameLabel(input.gameId)}`,
  ];
  if (input.rating && input.rating >= 1 && input.rating <= 5) lines.push(`- 사용 만족도: ${input.rating} / 5`);
  if (input.mode) lines.push(`- 진행 모드: ${input.mode}`);
  if (input.includeEnvironment) {
    lines.push('', '## 비식별 환경 정보', '');
    if (input.viewport) lines.push(`- 화면 크기: ${input.viewport.width} × ${input.viewport.height}`);
    if (input.pageUrl) lines.push(`- 페이지: ${input.pageUrl}`);
  }
  lines.push('', '> 이 의견은 NINEFLOW LAB의 공개 피드백 창구를 통해 작성되었습니다.');
  return lines.join('\n');
}

export function buildFeedbackIssueUrl(input: FeedbackIssueInput) {
  const base = `${FEEDBACK_ISSUES_URL}/new`;
  const params = new URLSearchParams({
    title: feedbackIssueTitle(input),
    body: buildFeedbackIssueText(input),
  });
  return `${base}?${params.toString()}`;
}

export function feedbackIssueUrlIsSafe(input: FeedbackIssueInput) {
  return buildFeedbackIssueUrl(input).length <= FEEDBACK_ISSUE_URL_MAX_LENGTH;
}

export function buildFeedbackIssuePasteUrl(input: Pick<FeedbackIssueInput, 'category' | 'gameId'>) {
  const params = new URLSearchParams({ title: feedbackIssueTitle(input) });
  return `${FEEDBACK_ISSUES_URL}/new?${params.toString()}`;
}
