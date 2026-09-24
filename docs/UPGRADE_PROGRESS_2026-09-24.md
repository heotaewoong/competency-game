# 2026-09-24 역량게임 개선 기록

## 작업 범위

- 사용자 요청: 오늘 22:00 KST까지 실제 게임 흐름, 속도, 오류를 우선 개선한다.
- 원본: `G:\내 드라이브\0.project_money\competency-game`
- 검증: `C:\TEMP\competency-game-fix-20260915`
- 공개 주소: https://heobrain-competency-game.vercel.app/
- 승인 범위: 이 프로젝트 수정, GitHub main push, 기존 Vercel 프로젝트 프로덕션 배포 및 라이브 검증.
- 시간 예약: 이 작업의 heartbeat `22`, 매 정시, 2026-09-24 22:00 KST까지. 마지막 실행은 결과 정리 후 자동화를 중지한다.
- 현행 공식 비공개 문항 수·시간·채점값을 추측하지 않는다. 공개 규칙과 독립 훈련값의 구분을 유지한다.

## 확인한 기준선

- 시작 HEAD `88071513d1e8609eb07a5260c9d0aa1e4b4d0970`, 작업 트리 clean.
- 기존 로컬 QA: 단위 203/203, 브라우저 92/92. 이번 작업 시작 때 원본 추적 파일 109개와 검증본 해시 일치.
- `8807151` GitHub main push 완료. Quality Gate 35947905507 성공 확인.
- 배포 전 공개 alias는 `dpl_2Lowgiw6uzrEWDnkqwKBftMbyggB` (2026-09-13)로 최신 코드가 아님.
- Vercel CLI OAuth의 비ASCII hostname 헤더 오류는 프로세스 한정 ASCII 변환으로 해결. 시스템 호스트명/CLI 설치 파일은 수정하지 않았다.

## 1차 수정 및 검증 진행

| 문제 | 기존 버전 재현 | 수정 | 통합 검증 |
|---|---|---|---|
| 마감 후 콜백 처리 전 일시정지하면 문항이 멈춤 | 문제/피드백 전환 두 경로에서 `1 / 9` 정지 | 남은 0ms 재예약 + 실행 완료 상태로 중복 방지 | 2/2 통과 |
| Ctrl/Alt/Meta/Shift/한글 조합키가 답안으로 처리됨 | 가위바위보·회전 모두 기본 동작 취소 발생 | 공용 입력 가드 및 회전·위치 격자에 재사용 | 2/2 통과 |
| 준비센터 resize마다 동기 저장소 점검 | 열린 준비센터 자체의 40 resize → 40 probe | 기존 150ms debounce 재사용 | 준비센터 자체 40 → 1, 성능 3/3 통과 |
| 약속 메뉴 이미지 실패 시 빈 자극으로 시작 | 이미지 요청 실패 후 복구 안내 없음 | 시작 전 로드 확인, 10초 만료·재시도·취소, 숨긴 탭은 복귀 확인 | 5/5 통과, 320×568 안내 화면 직접 확인 |
| 마법약 결과 공개와 공통 모드 문구 불일치 | 공식 규칙/코드 대조 | 학습에 필요한 제조 결과 표시 문구 명시 | 타입·lint·빌드 통과 |

RED 증거: `C:\TEMP\cg-timer-boundary-red-20260924`, `C:\TEMP\cg-keyboard-red-20260924`, `C:\TEMP\cg-readiness-resize-red-20260924`, `C:\TEMP\cg-appointment-asset-red-20260924`.

검증 결과:

- 단위 테스트 203/203, 타입 검사, lint, Next production build 통과.
- 새 회귀·성능 검사 12/12 통과: `C:\TEMP\cg-new-regressions-green-20260924`.
- 기존 전체 검사 첫 실행은 9개 통과 뒤 약속 타이머 검사에서 중단. Trace상 응답 즉시 타이머 정지는 통과했으나, 마지막 확인이 클릭 후 1,626ms에 실행되어 정상 결과 전환(900ms)을 넘겼다. 제품 문제가 아닌 실시간 검사 경쟁으로 판정했다.
- 해당 검사만 기존 Playwright 가상 시계 방식으로 보완: 답 후 400ms 동안 표시값 유지, 950ms 뒤 정상 결과 전환 확인. 단독 1/1 통과: `C:\TEMP\cg-appointment-deadline-deterministic-20260924`. 앱의 피드백 시간은 변경하지 않았다.
- 기존 90개 재실행은 15개 통과 뒤 탭 이탈 검사에서 제어 지연으로 중단. 실패 시점 trace에는 이미 `.rps-board`, `2 / 9` 및 시간초과 피드백이 있어 타이머 영구정지가 아님을 확인했다. 컨텍스트 종료도 90초 제한을 넘겼다. 증거: `C:\TEMP\cg-existing-regressions-final-20260924`.
- 탭 이탈 검사도 가상 시계 방식으로 보완한 뒤 단독 1/1 통과(12.1초). 준비 정지·명시 재개·다른 대화상자 중 이탈·이탈 횟수·문제 정지·재개 후 입력을 검증했다. 증거: `C:\TEMP\cg-visibility-pause-deterministic-20260924`.
- 로컬 부하와 독립된 GitHub Quality Gate에서 전체를 재검증한다. 로컬 전체 통과로 보고하지 않는다. 테스트 보완 후 타입 검사는 재통과했고, 중복 lint 재실행은 환경 부하 때문에 중지했다. 최초 lint는 통과했으며 CI에서 다시 확인한다.

변경 파일(위 원본 폴더 기준):

- 수정: `app/components/game-stage.tsx`, `app/components/readiness-center.tsx`, `e2e/accessibility-regressions.spec.ts`, `e2e/runtime-performance-regressions.spec.ts`.
- 생성: `e2e/timer-boundary-regressions.spec.ts`, `e2e/keyboard-shortcut-regressions.spec.ts`, `e2e/appointment-asset-recovery.spec.ts`, 이 진행 기록.
- 검증용 별도 생성: `C:\TEMP\competency-release-cli.cjs`, `C:\TEMP\competency-game-release-20260924`와 위 회귀 증거 폴더. CLI 링크가 만든 릴리스 폴더의 임시 `.env.local`은 업로드 전 제거했으며 소스에 포함하지 않는다.

## 다음 작업

1. 변경 파일은 원본과 검증본에 동기화 완료. 새 외부 의존성은 추가하지 않았다.
2. 탭 이탈 회귀 검사를 보완하고 후보 변경을 선택 커밋·push하여 GitHub Quality Gate 전체 결과를 확인한다.
3. 전체 검증이 통과한 동일 커밋을 깨끗한 릴리스 폴더에서 배포한다. 공용 타이머 수정 때문에 9종 흐름을 모두 검증한다.
4. 지정 공개 alias에 실제 새 배포가 연결됐는지 확인하고 9종 시작, 주요 라운드, 타이머, 모바일/가로 화면, 오류 로그를 검증한다.
5. 이 문서에 실제 커밋·배포·검증 결과를 갱신한다. 진행 중인 빌드/배포/동일 파일 수정을 중복 시작하지 않는다.

## 규칙 재확인

2026-09-24 공식 페이지 1회 대조 결과, 현행 JOBDA 게임별 비공개 규칙을 새로 확정할 근거는 없었다. `PUBLIC_RULE_EVIDENCE.md`의 공개/독립값 경계를 유지한다. 길 만들기 클릭 예산 정책, 현행 가위바위보 4번째 라운드 세부는 미확정이므로 추정 구현하지 않는다.
