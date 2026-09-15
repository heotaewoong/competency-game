import type { RotationOpId, RotationPuzzleKind } from './rotation-game';

export type RotationGuideTip = {
  id: string;
  title: string;
  badge: string;
  criterion: string;
  mistake: string;
  steps: string;
  example: string;
};

export type RotationGuideExample = {
  id: string;
  title: string;
  caption: string;
  kind: RotationPuzzleKind;
  letter?: string;
  pattern?: number[];
  sequence: RotationOpId[];
};

export const rotationGuideExamples: RotationGuideExample[] = [
  {
    id: 'letter-turn-135',
    title: '알파벳 · 135° 회전',
    caption: 'R의 다리가 이동한 45° 눈금 세 칸을 같은 방향으로 추적',
    kind: 'letter',
    letter: 'R',
    sequence: ['right', 'right', 'right'],
  },
  {
    id: 'letter-diagonal',
    title: '알파벳 · 대각선 반전',
    caption: 'P라는 글자 이름이 아니라 줄기와 둥근 부분의 상대 위치로 판별',
    kind: 'letter',
    letter: 'P',
    sequence: ['left', 'left', 'flip-x'],
  },
  {
    id: 'tile-oblique',
    title: '격자 · 기울어진 반전',
    caption: '외딴 칸을 45° 옮긴 뒤 묶음의 거울상 여부를 확인',
    kind: 'tiles',
    pattern: [0,1,0,0, 1,1,0,1, 0,1,0,0, 1,0,1,1],
    sequence: ['right', 'flip-y'],
  },
  {
    id: 'tile-diagonal',
    title: '격자 · 대각선 반전',
    caption: '테두리 각도, 외딴 칸, 붙은 묶음 방향의 순서로 세 번 검산',
    kind: 'tiles',
    pattern: [1,0,1,0, 0,1,0,1, 1,1,0,1, 0,1,1,0],
    sequence: ['left', 'left', 'flip-y'],
  },
];

export const rotationGuideTips: RotationGuideTip[] = [
  {
    id: 'catalog',
    title: '전체 유형',
    badge: '8훈련군·15상태',
    criterion: '회전 7상태와 반전 8상태 중 목표 관계를 먼저 분류합니다.',
    mistake: 'P형·b형처럼 글자 외관을 서로 다른 수학적 변환으로 세는 것.',
    steps: '회전인지 거울상인지 → 각도 → 축 또는 조작 순서 → 최소 공식 적용.',
    example: '대각선 반전은 외관 예시가 달라도 고유 변환은 ↗축·↘축 2개',
  },
  {
    id: 'letters',
    title: '알파벳',
    badge: '꼬리·다리 2점',
    criterion: 'Q의 꼬리, R의 다리처럼 비대칭 특징 하나를 기준점으로 잡고 다른 획 하나를 보조점으로 둡니다.',
    mistake: '기울어진 글자를 읽으려 하며 매 단계 전체 모양을 다시 판단하는 것.',
    steps: '기준점의 목표 위치 → 45° 눈금 수 → 보조점의 거울상 여부 확인.',
    example: '색 점이 실제로 보일 때만 점을 추적하고, 없으면 획 두 곳을 스스로 지정',
  },
  {
    id: 'tiles',
    title: '격자 도형',
    badge: '외딴 칸+묶음',
    criterion: '가장자리 외딴 채움 칸 하나와 붙어 있는 2~3칸 묶음을 함께 추적합니다.',
    mistake: '채워진 칸 수만 같으면 같은 패턴이라고 판단하는 것.',
    steps: '프레임의 정사각형·마름모 방향 → 외딴 칸 → 묶음의 진행 방향.',
    example: '전체 격자를 외우지 말고 서로 다른 특징 두 곳만 추적',
  },
  {
    id: 'turn-only',
    title: '회전 7상태',
    badge: '45° 눈금',
    criterion: '중심과 일직선이 아닌 특징점 두 개의 시계·반시계 순서가 그대로면 회전만으로 맞출 수 있습니다.',
    mistake: '45°·90°·135°를 혼동하거나 180°를 네 번 회전해 낭비하는 것.',
    steps: '눈금 수 1·2·3·4 확인 → 짧은 방향 → 같은 방향 세 번은 135°로 묶기 → 180°만 LR+UD로 압축.',
    example: 'L135 = L45×3 / R135 = R45×3 / 180° = LR→UD',
  },
  {
    id: 'mirror-axis',
    title: '축 반전 2상태',
    badge: 'LR·UD',
    criterion: '기울기는 같은데 좌우 순서만 바뀌면 LR, 위아래 순서만 바뀌면 UD입니다.',
    mistake: '↔·↕를 도형이 이동할 방향으로 해석하는 것.',
    steps: '유지되는 좌표 확인 → 바뀐 좌표 확인 → 해당 축 반전 한 번.',
    example: 'LR은 좌우만, UD는 상하만 교환',
  },
  {
    id: 'oblique',
    title: '기울어진 반전 4상태',
    badge: '45°+반전',
    criterion: '목표가 45° 기울어져 있으면서 기준점 둘의 순서가 거울상일 때입니다.',
    mistake: '누락된 이 네 상태를 모두 대각선 반전으로 부르는 것.',
    steps: 'L45 또는 R45 → 남은 차이가 좌우인지 상하인지 → LR 또는 UD.',
    example: 'L45→LR · L45→UD · R45→LR · R45→UD · 실제 반전축은 화면 기준 22.5° 간격의 네 축',
  },
  {
    id: 'diagonal',
    title: '대각선 반전 2상태',
    badge: '샌드위치',
    criterion: '수학 좌표(위쪽이 +y)에서 y=x인 ↗축 또는 y=-x인 ↘축을 접는 선으로 삼은 거울상인지 봅니다.',
    mistake: 'P형·b형 등 시작 글자에 따라 네 개의 별도 수학적 변환이라고 중복해서 외우는 것.',
    steps: '먼저 L45로 축을 세운 뒤, y=x는 LR·y=-x는 UD를 누르고 R45로 되돌립니다.',
    example: 'y=x(↗): L45→LR→R45 / y=-x(↘): L45→UD→R45',
  },
  {
    id: 'order-minimum',
    title: '순서·최소화',
    badge: '3클릭 이내',
    criterion: '모든 비항등 목표 상태는 최소 1~3클릭 공식 중 하나로 표현됩니다.',
    mistake: '회전→반전과 반전→회전의 순서를 바꿔도 같다고 생각하는 것.',
    steps: '15상태 공식 대입 → 취소쌍 삭제 → 입력 순서대로 한 번 검산.',
    example: 'L45→R45 · LR→LR · UD→UD = 항등이므로 삭제',
  },
  {
    id: 'timed',
    title: '시간 압박',
    badge: '입력 전 결정',
    criterion: '첫 버튼 전에 기준점·회전량·거울상 여부가 정해졌는지 확인합니다.',
    mistake: '버튼을 눌러가며 탐색해 지움·초기화로 조작 예산을 쓰는 것.',
    steps: '유형 선택 연습 → 과정 예측 → 미리보기 끄기 → 제한시간 단축.',
    example: '정확도 90% 이상인 유형부터 속도를 올리고 취약 유형은 따로 반복',
  },
];
