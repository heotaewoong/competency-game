import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackIssuePasteUrl, buildFeedbackIssueText, buildFeedbackIssueUrl, feedbackIssueUrlIsSafe, FEEDBACK_ISSUE_URL_MAX_LENGTH, FEEDBACK_MESSAGE_MAX } from './feedback.ts';

test('공개 이슈 URL에 유형·게임·의견을 안전하게 인코딩한다', () => {
  const url = new URL(buildFeedbackIssueUrl({ category: 'rule', gameId: 'nback', message: '묶음 선택 규칙을 다시 확인해 주세요.' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/heotaewoong/competency-game/issues/new');
  assert.equal(url.searchParams.get('title'), '[게임 규칙] 도형 순서 기억하기');
  assert.match(url.searchParams.get('body') ?? '', /묶음 선택 규칙/);
});

test('만족도와 환경정보는 선택했을 때만 포함한다', () => {
  const privateText = buildFeedbackIssueText({ category: 'bug', gameId: 'site', message: '모바일에서 버튼이 잘립니다.', includeEnvironment: false, viewport: { width: 390, height: 844 }, pageUrl: 'https://example.com/' });
  assert.doesNotMatch(privateText, /390 × 844|example\.com/);
  const sharedText = buildFeedbackIssueText({ category: 'bug', gameId: 'site', message: '모바일에서 버튼이 잘립니다.', rating: 4, includeEnvironment: true, viewport: { width: 390, height: 844 }, pageUrl: 'https://example.com/' });
  assert.match(sharedText, /사용 만족도: 4 \/ 5/);
  assert.match(sharedText, /390 × 844/);
  assert.match(sharedText, /https:\/\/example\.com\//);
});

test('의견은 최대 글자 수까지만 공개 본문에 포함한다', () => {
  const text = buildFeedbackIssueText({ category: 'other', gameId: 'site', message: '가'.repeat(FEEDBACK_MESSAGE_MAX + 20) });
  assert.equal((text.match(/가/g) ?? []).length, FEEDBACK_MESSAGE_MAX);
});

test('긴 한글 의견은 URL 한도를 넘기기 전에 복사·붙여넣기 경로로 전환한다', () => {
  const input = { category: 'bug' as const, gameId: 'site' as const, message: '가'.repeat(FEEDBACK_MESSAGE_MAX), includeEnvironment: true, viewport: { width: 390, height: 844 }, pageUrl: 'https://example.com/path' };
  const directUrl = buildFeedbackIssueUrl(input);
  assert.ok(directUrl.length > FEEDBACK_ISSUE_URL_MAX_LENGTH);
  assert.equal(feedbackIssueUrlIsSafe(input), false);
  const pasteUrl = new URL(buildFeedbackIssuePasteUrl(input));
  assert.equal(pasteUrl.searchParams.has('body'), false);
  assert.equal(pasteUrl.searchParams.get('title'), '[오류 제보] 사이트 전체');
  assert.equal(feedbackIssueUrlIsSafe({ ...input, message: '모바일에서 결과 버튼이 화면 밖으로 나갑니다.' }), true);
});
