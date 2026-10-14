import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionResult } from './game-data.ts';
import { createPracticeSummaryCsv } from './practice-summary-csv.ts';

function result(overrides: Partial<SessionResult> = {}): SessionResult {
  return { id: 'summary-rps', gameId: 'rps', completedAt: '2026-10-14T01:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2, ...overrides };
}

function rows(csv: string) {
  assert.equal(csv[0], '\ufeff');
  assert.ok(csv.endsWith('\r\n'));
  return csv.slice(1, -2).split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replaceAll('""', '"')));
}

test('세션 요약은 한국어 열과 UTC 시각·숫자 단위를 보존하고 원본은 바꾸지 않는다', () => {
  const original = Object.freeze(result({ detail: Object.freeze({ sessionMode: '연습 모드', quantity: 9, paceMs: 4500 }) }));
  const before = JSON.stringify(original);
  const output = rows(createPracticeSummaryCsv(Object.freeze([original])));
  assert.equal(output[0].length, 10);
  assert.deepEqual(output[1].slice(0, 9), ['2026-10-14T01:00:00.000Z', '가위바위보', '연습 모드', '정확도', '80', '중앙 반응', '720', '오류', '2']);
  assert.deepEqual(JSON.parse(output[1][9]), original.detail);
  assert.equal(JSON.stringify(original), before);
  assert.ok(!createPracticeSummaryCsv([original]).includes(original.id));
});

test('새 마법약의 근거 판정 보류는 0점과 구분하고 측정 없는 시간은 비운다', () => {
  const output = rows(createPracticeSummaryCsv([result({ gameId: 'potion', accuracy: 0, medianRt: 0, errors: 0, detail: { scoringVersion: 'potion-evidence-v1', evidenceTrials: 0, sessionMode: 'simulation' } })]));
  assert.deepEqual(output[1].slice(2, 9), ['실전형 연습', '근거 정렬률', '', '중앙 반응', '', '근거 반대·무응답', '0']);
});

test('이전 마법약·길 만들기 점수와 오류 의미 및 이전 기록의 모드를 구분한다', () => {
  for (const [gameId, score, error, time] of [
    ['potion', '결과 적중률', '결과 미적중', '중앙 반응'],
    ['path', '첫 제출 최대득점률', '첫 제출 최대득점 미달', '경로 연결 중앙시간'],
  ] as const) {
    const output = rows(createPracticeSummaryCsv([result({ gameId })]));
    assert.equal(output[1][2], '설정 정보 없음');
    assert.equal(output[1][3], score);
    assert.equal(output[1][5], time);
    assert.equal(output[1][7], error);
  }
});

test('설정의 쉼표·따옴표·줄바꿈·수식 문자열은 하나의 JSON 셀 안에서 보존한다', () => {
  const detail = { note: '=1+2,";\r\n@SUM(1,2)', sessionMode: '=HYPERLINK("x")', quantity: 9 };
  const output = rows(createPracticeSummaryCsv([result({ detail })]));
  assert.equal(output.length, 2);
  assert.equal(output[1].length, 10);
  assert.equal(output[1][2], '설정 정보 없음');
  assert.deepEqual(JSON.parse(output[1][9]), detail);
  assert.ok(!output[1].some(cell => /^[=+\-@＝＋－＠]/u.test(cell)));
});

test('확장 연도 시각의 수식 시작 기호는 리터럴로 처리한다', () => {
  for (const completedAt of ['-000001-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z']) {
    assert.equal(rows(createPracticeSummaryCsv([result({ completedAt })]))[1][0], `\t${completedAt}`);
  }
});

test('빈 기록은 헤더만 출력하고 손상 기록·초과 기록은 기존 백업 경계에서 거절한다', () => {
  assert.equal(rows(createPracticeSummaryCsv([])).length, 1);
  assert.throws(() => createPracticeSummaryCsv([result({ completedAt: 'not-a-date' })]), TypeError);
  assert.throws(() => createPracticeSummaryCsv([result({ accuracy: Number.NaN })]), TypeError);
  assert.throws(() => createPracticeSummaryCsv(Array.from({ length: 101 }, (_, index) => result({ id: `too-many-${index}` }))), TypeError);
});
