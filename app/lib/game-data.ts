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
};

export const games: GameMeta[] = [
  { id:'rotation', no:'01', title:'도형 회전하기', shortTitle:'회전', skill:'공간능력', time:'알파벳 3분 · 격자 3분', mark:'↻', tone:'violet', rule:'시작 모양을 목표 모양으로 만드는 45° 회전·반전 순서를 입력합니다.', input:'1–4 · 지움 · 초기화 · 제출', focus:'모양 일치·최소 조작', rounds:'알파벳·격자 도형', difficulty:'중' },
  { id:'rps', no:'02', title:'가위바위보', shortTitle:'가위바위보', skill:'인지능력', time:'가이드 약 3분', mark:'✊', tone:'blue', rule:'물음표 위치에 따라 내가 이기는 관계를 완성합니다.', input:'← · ↓ · →', focus:'관점 전환', rounds:'내 관점·상대 관점·혼합', difficulty:'하' },
  { id:'appointment', no:'03', title:'약속 정하기', shortTitle:'약속', skill:'작업기억', time:'가이드 약 4분', mark:'▦', tone:'mint', rule:'세 사람의 공통 선호 또는 아무도 이용하지 않은 번호를 찾습니다.', input:'보기 선택', focus:'AND·NOT 전환', rounds:'요일·장소·메뉴·버스', difficulty:'상' },
  { id:'path', no:'04', title:'길 만들기', shortTitle:'길', skill:'계획능력', time:'가이드 약 3분', mark:'╱', tone:'orange', rule:'정답 울타리 수에 맞춰 교통수단을 손님에게 보냅니다.', input:'울타리 회전 · 제출', focus:'선 계획 후 실행', rounds:'5×5 경로', difficulty:'상' },
  { id:'potion', no:'05', title:'마법약 만들기', shortTitle:'마법약', skill:'학습능력', time:'가이드 약 6분', mark:'⚗', tone:'pink', rule:'14개 재료 조합별 실제 결과를 누적해 색을 예측합니다.', input:'빨강 · 파랑', focus:'확률 피드백', rounds:'1장·2장·3장 조합', difficulty:'중' },
  { id:'nback', no:'06', title:'도형 순서 기억하기', shortTitle:'도형 순서', skill:'작업기억', time:'실전형 약 3분', mark:'◇', tone:'cyan', rule:'현재 도형을 두 번째 또는 세 번째 전 도형과 비교합니다.', input:'← · → · Space', focus:'N-back 갱신', rounds:'2-back·2·3-back', difficulty:'상' },
  { id:'number', no:'07', title:'숫자 누르기', shortTitle:'숫자', skill:'인지제어', time:'가이드 약 3분', mark:'9', tone:'lime', rule:'1부터 9까지 누르되 라운드별 예외 규칙을 적용합니다.', input:'숫자 버튼', focus:'예외 억제', rounds:'기본·건너뛰기·두 번', difficulty:'하' },
  { id:'count', no:'08', title:'개수 비교하기', shortTitle:'개수', skill:'주의집중', time:'가이드 약 3분', mark:'≋', tone:'amber', rule:'단어의 뜻과 크기를 무시하고 더 많은 쪽을 고릅니다.', input:'← · →', focus:'방해자극 억제', rounds:'좌우 비교', difficulty:'하' },
  { id:'mouse', no:'09', title:'고양이 술래잡기', shortTitle:'고양이', skill:'공간기억', time:'가이드 약 4분', mark:'⌗', tone:'red', rule:'6×6 지도에서 생쥐 위치를 기억하고 두 고양이의 포획 여부를 판단합니다.', input:'있음 · 없음 · 확신도', focus:'기억·확신 분리', rounds:'기억·빨강·파랑·확신', difficulty:'중' },
];

export const getGame = (id: GameId) => games.find((game) => game.id === id) ?? games[0];
