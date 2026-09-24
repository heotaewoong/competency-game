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

## 1차 검증·배포 절차

1. 변경 파일은 원본과 검증본에 동기화 완료. 새 외부 의존성은 추가하지 않았다.
2. 탭 이탈 회귀 검사를 보완하고 후보 변경을 선택 커밋·push하여 GitHub Quality Gate 전체 통과를 확인했다.
3. 검증한 동일 커밋을 깨끗한 릴리스 폴더에서 배포했다. 공용 타이머 수정에 대해 9종 흐름을 모두 원격 검증했다.
4. 지정 공개 alias가 실제 새 배포에 연결됨을 확인했다. 아래 별도 공개 E2E 결과와 오류 로그를 기록한다.
5. 이 문서에 실제 커밋·배포·검증 결과를 보존한다. 진행 중인 빌드/배포/동일 파일 수정을 중복 시작하지 않는다.

## 1차 릴리스

- 제품 커밋: `8f54697e6a59bd0ce558c68773380981bb33f381`, GitHub main push 및 깨끗한 릴리스 폴더 HEAD 일치.
- 원격 전체 검증: [Quality Gate 35951147383](https://github.com/heotaewoong/competency-game/actions/runs/35951147383) 성공(11분 29초). 단위 203/203, Chromium·Mobile Safari 브라우저 102/102(10분), 타입·lint·Next production build 통과. 최종 출력에 실패/불안정 재시도 항목 없음.
- Vercel 후보: `dpl_4X7zHcKM2B6NwgPdQxjrLg2xhkvq`, `competency-game-ebzswmvbb-heotaewoongs-projects.vercel.app`, READY. Node 22.x, Next 16.3.3, 원격 빌드 29초.
- 후보는 공개 사용자 alias를 바꾸지 않는 방식으로 먼저 빌드했다. 원격 전체 검증 성공 후 기존 프로젝트에 promote 완료.
- `heobrain-competency-game.vercel.app` alias의 실제 deployment ID가 위 새 배포와 일치한다. 리다이렉트 없이 공개 URL HTTP 200 확인.
- 인앱 브라우저에서 공개 사이트 새로고침 → 약속 정하기 설정 열기 → 수정된 모드 문구·요일/위치/메뉴/버스 선택 UI → 닫기 확인. 작은 세로 화면 직접 확인, 브라우저 error 로그 없음. 기존 사용자 기록 5회 유지, 기록/환경설정을 초기화하지 않았다.
- 새 배포를 지정한 최근 30분 Vercel error 조회는 `No logs found` 반환. 이것은 관찰 구간의 오류 로그가 없다는 뜻이며, 전체 사용자 무오류 보장이나 장기 모니터링 구축을 뜻하지 않는다. 별도 로그 드레인 구성 여부는 확인하지 못했다.
- 공개 URL 대상 별도 브라우저 검증 **32/32 통과(5분)**: `C:\TEMP\cg-production-release-20260924`. 9종 모바일 시작·종료, 새 오류 회귀, 약속 4라운드 40문항·N-back 47문항·숫자 1/2라운드 완료·채점, 탭 이탈, 렌더링/resize, 보안 헤더/이미지 캐시, Mobile Safari 터치·기록 이전까지 포함한다.
- 1차 릴리스 검증 완료 시각: 2026-09-24 12:44 KST 전후. 구현 커밋 `8f54697`을 배포했고, 이후 이 문서만 갱신하는 기록 커밋은 제품 코드나 배포 산출물을 바꾸지 않는다.

## 이어갈 작업

- 시간 제한: 오늘 22:00 KST 이후에는 새 개발/배포를 시작하지 않는다. 자동화 `22`는 마지막 보고 후 중지한다.
- 1차 제품 변경과 전체 CI를 반복 구현하지 않는다. 위 공개 검증 결과와 현재 Git·배포 상태를 먼저 확인한다. 로컬 검증 서버와 테스트 실행은 종료했다.
- 공개 설정 설명의 한국어 어절 중간 줄바꿈은 아래 후속 점검에서 재현·수정·배포했다. 같은 문제를 다시 구현하지 않는다.
- 공식 규칙은 아래 공개 근거의 경계를 유지한다. 확인되지 않은 공식 문항이나 분량을 새로운 기능으로 지어내지 않는다.

## 규칙 재확인

2026-09-24 공식 페이지 1회 대조 결과, 현행 JOBDA 게임별 비공개 규칙을 새로 확정할 근거는 없었다. `PUBLIC_RULE_EVIDENCE.md`의 공개/독립값 경계를 유지한다. 길 만들기 클릭 예산 정책, 현행 가위바위보 4번째 라운드 세부는 미확정이므로 추정 구현하지 않는다.

## 12:46 후속 점검 — 설정 설명의 한국어 줄바꿈

- 시작 HEAD `4797b29`, 작업 트리 clean, remote main 일치. 공개 alias는 1차 배포 `dpl_4X7zHcKM2B6NwgPdQxjrLg2xhkvq` 유지. 직전 제품 CI는 성공했으며 문서 전용 후속 CI만 진행 중이었다. 중복 제품 배포/테스트는 없었다.
- 공개 385×778 화면에서 도형 회전 과제 설명의 `순서를`가 중간에서 나뉘는 것을 DOM Range의 실제 줄 영역으로 재현했다. 이전 약속 설명 화면 관찰과 같은 원인이다. RED: `C:\TEMP\cg-korean-wrap-red-20260924`(첫 실패 후 중단).
- `app/globals.css`의 `.stage-intro :where(p, dd)`에 `word-break: keep-all; overflow-wrap: anywhere`만 추가. 설정 문단·설정값에 한정하며 게임 자극·입력·타이머·채점·별도 시작 버튼 스타일은 변경하지 않는다. 긴 토큰은 화면 밖으로 넘치지 않도록 예외 줄바꿈을 허용한다.
- 기존 `e2e/ux-performance.spec.ts`에 기본/큰 글자 각 1개 검사를 추가. 9종 설정에서 320×568, 385×778, 844×360의 실제 어절 분리·수평 넘침·시작 버튼 위치와 클릭 가능성을 검사한다.
- 수정 파일: `app/globals.css`, `e2e/ux-performance.spec.ts`, 이 문서. 새 제품 파일/의존성 없음.
- 정적 확인: 타입 검사, 변경한 E2E 파일 ESLint, Next production build 통과. 원본과 검증본의 CSS/E2E SHA256 일치. 로컬 전체 lint는 환경 지연으로 중지했으며 기존 설정의 원격 전체 CI에서 다시 확인한다.
- 로컬 브라우저 **23/23 통과(3.6분)**: UX 10개·9종 모바일 시작/종료·Mobile Safari 4개. 신규 2개는 총 54개 게임/화면/글자 크기 조합에서 실제 한국어 어절·가로 넘침·시작 버튼을 확인했다. 기본/큰 글자 약속 설정 화면 두 장을 직접 검수했다. GREEN: `C:\TEMP\cg-korean-wrap-green-20260924`.
- 제품 커밋 `131f064f3c0311c749aade5979d0a42aac7e6682` main push 완료. 깨끗한 릴리스 폴더의 동일 HEAD에서 후보 배포 `dpl_3GhrH3wnhBYd7MS2i9BFtw4NkTP5` 생성: `competency-game-gpkfp6wjk-heotaewoongs-projects.vercel.app`, READY, Next 16.3.3 / Node 22, 원격 빌드 32초. 배포 보호를 유지한 인증 CLI 조회에서 후보 HTTP 200 및 CSP 등 기존 보안 헤더 확인.
- [Quality Gate 35954057258](https://github.com/heotaewoong/competency-game/actions/runs/35954057258) 성공(11분 46초): 단위 203/203, Chromium·Mobile Safari 브라우저 104/104(10.3분), 타입·전체 lint·production build 통과. 실패/불안정 재시도 항목 없음. GitHub Actions Node 20 action 런타임 및 향후 Ubuntu runner 전환 안내는 제품 런타임 오류가 아닌 CI 유지보수 경고다.
- 독립 읽기 전용 코드 리뷰에서 P1/P2 발견 없음. 신규 어절 검사는 과제목표 문단을 직접 측정하며, 모든 `dd`나 펼친 상세 설명의 개별 어절까지 검사했다고 주장하지 않는다.
- 전체 CI 성공 후 기존 READY 후보를 promote 완료. 공개 alias의 실제 deployment ID `dpl_3GhrH3wnhBYd7MS2i9BFtw4NkTP5` 일치, 지정 공개 주소의 리다이렉트 없는 HTTP 200 확인. 중복 배포 없음.
- 인앱 공개 브라우저 새로고침 → 도형 회전 설정 열기 → 작은 세로 화면의 설명·시작 버튼 직접 확인 → 홈 복귀. 한글 어절 줄바꿈 개선 확인, 브라우저 error 로그 없음, 기존 사용자 기록 5회 유지. 사용자 기록이나 환경설정은 초기화하지 않았다.
- 공개 URL 대상 UX·Mobile Safari 별도 검사 **14/14 통과(3.8분)**. 9종 설정의 3개 화면 크기 × 2개 글자 크기 조합, 자산 지연 로딩, 메뉴 미선택 시 불필요한 이미지 다운로드 방지, 설정 바로가기, Safari 터치·기록 이전을 확인했다. 기본/큰 글자 약속 설정의 공개 스크린샷 2장을 직접 검수했다. 결과와 스크린샷: `C:\TEMP\cg-korean-wrap-production-20260924`.
- 새 배포 대상 최근 30분 Vercel error 조회 결과 `No logs found`. 이 관찰 구간과 실행한 검증 범위에 한정하며 모든 사용자·기기에서 무오류라고 보장하지 않는다.
- 2차 릴리스 검증 완료: 2026-09-24 13:21 KST 전후. 제품 커밋은 `131f064`; 이후 이 문서만 커밋하는 작업은 제품 산출물을 변경하지 않으므로 중복 배포하지 않는다. 진행 중인 로컬 서버·테스트·배포 없음. 다음 자동 점검은 Git·공개 alias를 확인한 뒤 새로 재현된 문제만 좁게 수정한다. 오늘 22:00 KST 종료 조건과 공식 비공개 규칙의 미확정 상태는 유지한다.
