# NINEFLOW LAB

9가지 AI 역량검사 전략게임을 연습하고, 완료 후 문항별 실수와 조작 과정을 복습하는 독립형 웹 앱입니다.

## 코드와 배포

- Git 브랜치: `main`
- Git 원격 저장소: <https://github.com/heotaewoong/competency-game>
- 기존 Vercel 배포 주소: <https://competency-game-three.vercel.app>
- 현재 배포 원본 태그: `vercel-dpl-G8qamXDwTKYnSDVrgq9pCjigG6vU`

> `.env.local`, `.vercel`, `node_modules`, 빌드·테스트 결과물은 저장소에 포함하지 않습니다. 위 태그는 Vercel 배포 `dpl_G8qamXDwTKYnSDVrgq9pCjigG6vU`에서 복구한 원본 코드 체크포인트입니다. `main`에는 그 뒤 검증한 테스트·복습·반응형 개선이 추가되어 있으며, Vercel 프로젝트는 GitHub와 자동 연동되어 있지 않으므로 별도 배포 전까지 운영 사이트는 바뀌지 않습니다.

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

게임 결과와 사용자 설정은 외부 서버가 아니라 사용 중인 브라우저의 `localStorage`에 저장됩니다.
