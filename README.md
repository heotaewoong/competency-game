# NINEFLOW LAB

9가지 AI 역량검사 전략게임을 연습하고, 시작 전 환경 점검부터 무점수 규칙 예제, 완료 후 문항별 복습과 기록 백업까지 이어지는 독립형 웹 앱입니다.

## 사용자 기능

- 9가지 공개 구조 기반 게임과 맞춤 연습·독립 실전형 프리셋
- 게임별 무점수 규칙 확인 2문항과 반복 가능한 전략 가이드
- 화면·브라우저 온라인 신호(서비스 도달성 보장 아님)·저장·입력·리소스를 확인하는 응시 준비센터
- 고대비·큰 글자·움직임 줄이기, 시간 제한 없는 접근성 연습
- 정확도·반응시간·일관성·오류 유형과 문항별 조작 복습
- 서버 전송 없는 버전 JSON 기록 내보내기·검증·병합 복원·확인 후 삭제

공식 문항·화면·채점식을 복제하지 않으며 실제 점수, 합격 가능성, 성격을 예측하지 않습니다. 공개 버전끼리 규칙이 충돌하거나 현행 세부가 비공개인 경우 기업 초대 화면을 우선합니다.

## 코드와 배포

- Git 브랜치: `main`
- Git 원격 저장소: <https://github.com/heotaewoong/competency-game>
- Vercel 운영 주소: <https://heobrain-competency-game.vercel.app>
- 배포 소스 복구 기준 태그: `vercel-dpl-G8qamXDwTKYnSDVrgq9pCjigG6vU`

> `.env.local`, `.vercel`, `node_modules`, 빌드·테스트 결과물은 저장소에 포함하지 않습니다. 위 태그는 Vercel 배포 `dpl_G8qamXDwTKYnSDVrgq9pCjigG6vU`에서 소스를 복구한 시점의 코드 체크포인트이며, 현재 운영 배포의 소스라고 단정하지 않습니다. `main`과 운영 사이트의 일치 여부는 Vercel 배포 메타데이터의 배포 ID와 소스 SHA로 별도 확인해야 합니다. Vercel 프로젝트는 GitHub와 자동 연동되어 있지 않으므로 별도 배포 전까지 `main` 변경은 운영 사이트에 반영되지 않습니다.

## 주요 코드

- `app/page.tsx`: 홈, 게임 목록, 기록·복습 진입 화면
- `app/components/game-stage.tsx`: 9개 게임의 설정·실행·결과 흐름
- `app/lib/`: 게임별 문항 생성, 채점, 저장, 복습 데이터 로직
- `app/globals.css`: 전체 반응형 UI와 게임별 스타일
- `e2e/`: Playwright 실제 브라우저 회귀 테스트
- `tsconfig.quality.json`: Vinext·Next.js 생성 타입과 분리된 소스 품질 검사 설정
- `public/`: 게임 이미지와 사이트 공유 이미지

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

Google Drive가 마운트된 G: 경로에서는 Node.js 의존성 설치와 빌드가 느리거나 불안정할 수 있습니다. 코드는 G: 저장소에서 관리하고, 실행·검증할 때는 저장소를 `C:\TEMP`의 별도 검증 폴더로 복사해 사용하는 것을 권장합니다. 비밀정보가 담긴 `.env.local`은 저장소에 넣지 말고 검증 폴더에서만 별도로 설정합니다.

```powershell
cd C:\TEMP\competency-game-verify
npm install
npm run dev
```

기본 개발 주소는 터미널에 표시됩니다. 일반적으로 <http://localhost:3000>입니다.

## 검증

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

전체 검증은 다음 명령으로 실행합니다.

```powershell
npm run quality
```

게임 결과와 사용자 설정은 외부 서버가 아니라 사용 중인 브라우저의 `localStorage`에 저장됩니다. `내 기록 → 백업·복원`에서 버전이 있는 JSON 파일로 내보내고, 검증 후 기존 기록과 병합해 복원할 수 있습니다.
