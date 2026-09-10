import type { GameReviewPayload } from './review-data';

export type GameId =
  | 'rotation'
  | 'rps'
  | 'appointment'
  | 'path'
  | 'potion'
  | 'nback'
  | 'number'
  | 'count'
  | 'mouse';

export type PracticeMode = 'guide' | 'focus' | 'rehearsal';
export type GameDifficulty = '상' | '중' | '하';

export type GameMeta = {
  id: GameId;
  no: string;
  title: string;
  shortTitle: string;
  skill: string;
  time: string;
  mark: string;
  tone: string;
  rule: string;
  input: string;
  focus: string;
  rounds: string;
  difficulty: GameDifficulty;
};

export type SessionResult = {
  id: string;
  gameId: GameId;
  completedAt: string;
  accuracy: number;
  medianRt: number;
  stability: number;
  errors: number;
  detail?: Record<string, number | string>;
  review?: GameReviewPayload;
};

export const games: GameMeta[] = [
  { id:'rotation', no:'01', title:'도형 회전하기', shortTitle:'회전', skill:'공간능력', time:'2023 공개 약 6분 · 2024 자료 4분 · 초대 우선', mark:'↻', tone:'violet', rule:'시작 모양을 목표 모양으로 만드는 45° 회전·반전 순서를 입력합니다.', input:'마우스 버튼 · 1–4/지움/초기화/제출 키보드 보조', focus:'모양 일치·최소 조작', rounds:'알파벳 → 4×4 격자 도형', difficulty:'중' },
  { id:'rps', no:'02', title:'가위바위보', shortTitle:'가위바위보', skill:'인지능력', time:'2023 레거시 3R·약 3분 · 2026 공개화면 4R·4분 · 초대 우선', mark:'✊', tone:'blue', rule:'2023 공개 레거시 세 라운드에서 물음표 위치에 따라 내가 이기는 관계를 완성합니다.', input:'← · ↓ · →', focus:'관점 전환', rounds:'2023 레거시: 내 패 → 상대 패 → 혼합', difficulty:'하' },
  { id:'appointment', no:'03', title:'약속 정하기', shortTitle:'약속', skill:'작업기억', time:'2023 공개 약 4분 · 2024 자료 4분 · 초대 우선', mark:'▦', tone:'mint', rule:'세 사람의 공통 선호를 찾고, 마지막에는 아무도 이용하지 않은 버스를 고릅니다.', input:'보기 선택', focus:'AND·NOT 전환', rounds:'요일 → 4×4 위치 → 메뉴 → 미탑승 버스', difficulty:'상' },
  { id:'path', no:'04', title:'길 만들기', shortTitle:'길', skill:'계획능력', time:'2023 자료 상충: 카드 약 3분·공식 영상 5분 · 2024 자료 4분 · 초대 우선', mark:'╱', tone:'orange', rule:'모든 교통수단을 지정 손님에게 보내고, 목표보다 많은 울타리는 감점 조건으로 분리합니다.', input:'울타리 설치·제거 · 제출', focus:'경로 성공·울타리 효율 분리', rounds:'5×5 경로', difficulty:'상' },
  { id:'potion', no:'05', title:'마법약 만들기', shortTitle:'마법약', skill:'학습능력', time:'2023 공개 약 6분 · 2024 자료 4분 · 초대 우선', mark:'⚗', tone:'pink', rule:'4개 재료의 1·2·3개 조합 결과를 반복 학습해 더 가능성 높은 색을 예측합니다.', input:'빨강 · 파랑', focus:'확률 피드백', rounds:'1개·2개·3개 재료 조합', difficulty:'중' },
  { id:'nback', no:'06', title:'도형 순서 기억하기', shortTitle:'도형 순서', skill:'작업기억', time:'2023 공개 약 3분 · 2024 자료 4분 · 초대 우선', mark:'◇', tone:'cyan', rule:'현재 도형을 두 번째 또는 세 번째 전 도형과 비교합니다.', input:'← · → · Space', focus:'N-back 갱신', rounds:'2-back → 2·3-back', difficulty:'상' },
  { id:'number', no:'07', title:'숫자 누르기', shortTitle:'숫자', skill:'인지제어', time:'2023 공개 약 3분 · 2024 자료 4분 · 초대 우선', mark:'9', tone:'lime', rule:'점등 숫자를 누른 뒤, 1부터 9까지 예외 규칙을 적용해 순서대로 누릅니다.', input:'숫자 버튼', focus:'반응·예외 억제', rounds:'점등 숫자 → 건너뛰기·두 번', difficulty:'하' },
  { id:'count', no:'08', title:'개수 비교하기', shortTitle:'개수', skill:'인지능력', time:'2023 공개 약 3분 · 2024 자료 4분 · 초대 우선', mark:'≋', tone:'amber', rule:'긍정·부정 단어의 뜻과 크기를 무시하고 실제 단어 개수가 더 많은 쪽을 고릅니다.', input:'마우스 좌·우 선택 · ←/→ 키보드 보조', focus:'의미·크기 방해자극 억제', rounds:'1초 제시 · 3초 응답', difficulty:'하' },
  { id:'mouse', no:'09', title:'고양이 술래잡기', shortTitle:'고양이', skill:'작업기억', time:'2023 공개 약 4분 · 2024 자료 4분 · 초대 우선', mark:'⌗', tone:'red', rule:'6×6 격자의 생쥐 위치를 기억한 뒤 빨강·파랑 고양이가 찾았는지 확신도와 함께 판단합니다.', input:'놓쳤다 · 찾았다 · 확신도', focus:'위치기억 · 앱 보조 분석: 확신 판단', rounds:'생쥐 → 고양이 → 빨강 → 파랑', difficulty:'중' },
];

export const getGame = (id: GameId) => games.find((game) => game.id === id) ?? games[0];
