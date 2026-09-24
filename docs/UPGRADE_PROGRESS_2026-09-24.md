# 2026-09-24 역량게임 개선 기록

## 작업 범위

- 사용자 최신 요청(17:53 KST): 오늘 밤 자정, **2026-09-25 00:00 KST까지** 실제 게임 흐름·오류·속도·기능·사용자 친화적 디자인 개선을 이어간다. 이전 22:00 종료 조건을 대체한다.
- 원본: `G:\내 드라이브\0.project_money\competency-game`
- 검증: `C:\TEMP\competency-game-fix-20260915`
- 공개 주소: https://heobrain-competency-game.vercel.app/
- 승인 범위: 이 프로젝트 수정, GitHub main push, 기존 Vercel 프로젝트 프로덕션 배포 및 라이브 검증.
- 시간 예약: 이 작업의 heartbeat `22`, 매 정시, **2026-09-25 00:00 KST까지**. 자정 이후 새 변경·배포를 시작하지 않고 결과 정리 후 자동화를 PAUSED로 바꾼다.
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

## 13:24 후속 점검 — 상태 전환과 저장 복원

- 시작 HEAD `ab42bf7`, 원본 clean 및 GitHub main 일치. 공개 alias는 검증된 2차 배포 `dpl_3GhrH3wnhBYd7MS2i9BFtw4NkTP5` 유지. 문서 전용 CI `35955360264`만 진행 중이며 중복 배포 없음.
- 검사 이야기: 게임 완료 → v4 기록 저장 → 새로고침 → 해당 게임 문항 복습 복원. 기존 9종 완료 검사의 공통 저장 확인 뒤 새로고침·복습 열기를 추가했다. 제품 저장 로직 변경이 아닌 회귀 검증 보강이며 아래 로컬·공개 검사에서 통과했다.
- 읽기 전용 병렬 감사에서 길 만들기의 900px 경계 전환 시 키보드 포커스 복구 누락과 회전 과정 재생의 수동 정지 시 남은 단계 시간 미보존을 발견했다. 아래 공개 RED로 실제 오류를 확정한 뒤 수정했다.
- 파일 소유를 분리했다: 루트 `e2e/completion-flows.spec.ts`, UX 감사 `e2e/path-responsive-focus.spec.ts` 신규, 타이머 감사 `e2e/timer-boundary-regressions.spec.ts`. 검사 작성 후 루트에 인계했으며 앱 수정·커밋·배포는 루트에서만 진행했다.
- 공개 RED 확인: 회전 재생은 500ms 진행→수동 정지 5초→재개 후 200ms에서 `0 / 3`에 머물러 실패(`C:\TEMP\cg-rotation-replay-red-20260924`). 길 만들기는 1024→844 및 역방향 모두 BODY로 포커스가 이탈해 방향키·Enter가 무반응, 2/2 실패(`C:\TEMP\cg-path-focus-red-20260924`). 기존 사용자 브라우저가 아닌 독립 테스트 컨텍스트에서 재현했다.
- `app/components/game-stage.tsx` 수정: 공용 timeout의 비활성 상태도 기존 pause 분기로 처리해 잔여시간을 보존한다. 27개 호출부의 resetKey 계약 대조 결과 새 문항의 전체 시간 초기화와 충돌하지 않는다. 길 만들기는 CSS와 동일한 media 경계에서 숨겨진 기존 격자 버튼만 같은 칸의 보이는 버튼으로 복구한다. 제출 버튼/모달에 포커스가 있거나 게임이 일시정지·잠금이면 개입하지 않는다. 새 의존성·규칙·문항·채점 변경 없음.
- React/Ponytail 읽기 전용 재검토에서 P1/P2 또는 불필요한 추상화 없음. 기존 ref와 포커스 함수를 재사용하고 media change 리스너를 정리한다. 수정한 앱/검사 4개 파일의 원본·검증본 SHA256 일치.
- 단위 203/203, 타입 및 Next production build 통과. 변경 대상 로컬 ESLint는 장시간 정체로 중지했으므로 lint 통과로 주장하지 않으며 원격 전체 CI에서 확인한다. 문서 전용 직전 CI `35955360264` 성공.
- 검증본의 포트 4173은 다른 프로세스가 사용 중이므로 건드리지 않았다. 이 작업 전용 production server는 `127.0.0.1:4187`에서 별도로 실행하고 검증 후 종료했다.
- 로컬 추가 검증 **22/22 통과(5.6분)**: 두 방향 길 만들기 반응형 포커스와 제출/모달 비탈취, 회전 풀이 수동 정지→잔여200ms 재개→모달 정지/재개, 기존 마감 경계 2개, 9종 연습 완주→새로고침→문항 복습, 숫자 실전형 라운드 전환, 렌더링/resize 3개, Mobile Safari 4개. 증거: `C:\TEMP\cg-state-transitions-green-20260924`. 길 만들기 수정 후 포커스 표시 화면 직접 검수.
- 변경한 E2E 3개 파일 ESLint 별도 통과. 로컬 앱 ESLint 중단 사실은 유지하며 원격 전체 검사로 확정한다. 전용4187 서버와 검사는 종료했다. 원본 변경5개 파일만 선택 커밋해 원격 전체 검증 후 동일 산출물을 배포한다.
- 제품 커밋 `4698fe155b32002fe931d3d569b3c03ed8975816` GitHub main push 완료. [Quality Gate 35957230514](https://github.com/heotaewoong/competency-game/actions/runs/35957230514) 성공(12분23초): 단위203/203, Chromium·Mobile Safari 브라우저107/107(10.8분), 타입·전체 lint·production build 통과. 실패/불안정 재시도 항목 없음.
- 동일 제품 커밋의 Vercel 후보 `dpl_9gGbXoTQjA24FrGZNjvfTBsdfXPZ`, `competency-game-2wsoxj374-heotaewoongs-projects.vercel.app` READY. Node22/Next16.3.3, 원격 빌드34초. `--skip-domain`으로 한 번 생성한 기존 후보를 전체 CI 성공 후 promote했다. 중복 배포 없음.
- 후보는 보호된 상태로 인증 CLI를 통해 HTTP 200, 기존 CSP/HSTS/프레임 차단/권한 제한 헤더를 확인했다. 배포 보호를 끄거나 별도 자격증명을 생성하지 않았다. 공개 alias의 실제 deployment ID가 위 배포와 일치하고 지정 공개 URL은 리다이렉트 없이 HTTP 200이다.
- 공개 별도 검사 첫 실행은 **16통과·1실패·5미실행**(5.1분). 실패는 피드백 경계 검사에서 `2 / 9` 대신 `4 / 9 → 5 / 9` 관찰이다. Trace에서 경계 주입 **이전** 답 클릭 시 이미2/9, disabled 확인 시3/9, 주입 직전4/9임을 확인했다. 클릭3.07초·disabled 확인4.60초 지연으로 2.5초 제한을 넘긴 검사 경쟁이며 제품 중복 진행의 증거는 없다. 실패 증거를 보존했다: `C:\TEMP\cg-state-transitions-production-20260924`.
- 경계 검사 2개만 기존 Playwright 가상 시계로 결정적으로 보완했다. 세션 시작 전 시간 정지 → 준비3/2/1 → 반드시1/9 확인 → `performance.now +10,000ms`로 콜백 전 만료 조건 주입 → 모달 재개 → 필요한 가상 시간만 진행. 정답 기대값을 완화하거나 앱 타이머/규칙을 변경하지 않았다.
- 공개 후속 검사 **7/7 통과(49.9초)**: 문제/피드백 만료 경계, 회전 재생 정지·재개, Mobile Safari 4개 전부. 결과 `C:\TEMP\cg-state-transitions-production-deterministic-20260924`. 앞선 통과 항목과 합쳐 대상22개 고유 항목 모두 최종 확인했으나 단일 실행22/22 성공으로 표현하지 않는다. 중간 보충 실행4/4도 통과(`C:\TEMP\cg-state-transitions-production-remaining-20260924`).
- 공개 길 만들기 두 방향 resize 후 방향키·Enter 포커스 화면을 캡처하고 직접 검수했다. 인앱 공개 브라우저에서도 새로고침 → 길 만들기 시작 → 방향키로1행2열 이동 → Enter 울타리 배치 → 중단 확인 → 홈 복귀를 실제 조작했다. 브라우저 error 로그 없음, 기존 사용자 기록5회 유지, 사용자 환경설정/기록 초기화 없음.
- 새 배포의 최근30분 Vercel error 조회는 `No logs found`. 이 관찰 구간과 실행한 기기/시나리오에 한정하며 모든 사용자·환경의 무오류를 보장하지 않는다. 비공개 JOBDA 문항 수·시간·채점이나 현행 미공개 규칙을 새로 확정한 것은 아니다.
- 수정 파일: `app/components/game-stage.tsx`, `e2e/completion-flows.spec.ts`, `e2e/timer-boundary-regressions.spec.ts`, 이 문서. 생성 파일: `e2e/path-responsive-focus.spec.ts`. 외부 반영: GitHub main 및 기존 Vercel 프로젝트의 지정 공개 URL. Ponytail/React 검토에 따라 기존 시계·포커스 함수와 브라우저 media change만 재사용했으며 새 제품 의존성은 없다.
- 제품 배포 이후 변경은 경계 검사와 검증 기록뿐이다. 이 후속 커밋 때문에 제품을 다시 배포하지 않는다. 오늘22:00 KST 종료 조건과 공개 규칙 근거 경계를 유지하며, 다음 점검은 후속 CI·Git 상태·공개 alias를 확인하고 새로 재현한 문제만 좁게 수정한다.
- 후속 검사 보완의 ESLint·타입 검사 통과, 원본/검증본 SHA256 일치. 독립 읽기 전용 리뷰에서 1,400ms/400ms가 기존1,000ms 피드백·320ms 입력 안정화만 통과하고 다음 문항2,500ms 만료 전에 멈추며, 이전0ms 재예약 결함은 여전히 잡는 것을 확인했다. 3차 제품 공개 검증 완료 시각: 2026-09-24 14:16 KST 전후. 소유한 서버·테스트·배포 실행은 모두 종료했으며, 후속 검사/기록 커밋의 원격 CI는 다음 점검에서 별도로 확인한다.

## 14:17 후속 점검 — 백업 중복 보호와 3개 답안 가독성

- 시작 HEAD `04071074ff137f06c6c07180c011a73319ebabb8`, 원본 clean·origin 확인. 공개 alias는 3차 배포 `dpl_9gGbXoTQjA24FrGZNjvfTBsdfXPZ`이며 HTTP200 유지. 직전 후속 검사/기록 CI `35959134609`는 이후 성공 확인했다. 중복 배포/기존 파일 병렬 수정 없음.
- 검증 흐름: 백업 선택 → 파일 검증 → 기존 기록과 병합 → 새로고침 → 기존 점수/설정 보존, 그리고 2·3-back의 3개 답안 문구·단축키를 짧은 가로 화면에서 읽고 입력하기.
- 공개 RED: 동일ID의 백업이 로컬 정확도80/오류2/세부설정을 정확도0/오류9/설정없음으로 덮어썼다. UI의 중복 제외·비파괴 병합 안내와 충돌한다. `C:\TEMP\cg-backup-collision-red-20260924`.
- `app/page.tsx`의 해당 병합 호출 순서만 현재 메모리 → 저장된 로컬 → 백업으로 변경했다. 공통 merge의 첫 컬렉션 우선 규칙을 재사용하고, 새ID만 추가한다. 삭제 세대·손상/미래버전 보호·저장 실패 경로는 그대로 유지한다. 백업이 같은ID의 더 풍부한 내용을 가져도 자동 덮어쓰지는 않는 비파괴 정책이다.
- 공개 RED: 844×360의 N-back 3개 답안에서 첫 두 문구와 단축키가 약18.7×16px, 마지막 문구는 약5.7×16px 겹쳤다. 기본·큰 글자 모두실패, 캡처 직접 검수. `C:\TEMP\cg-nback-label-red-20260924`.
- `app/globals.css` 기존 짧은가로 media 영역에2줄만 추가해 3개답안 버튼 내부를 문구 위/단축키 아래로 배치한다. 버튼/영역 크기·2개답안·타이머·규칙·입력은 변경하지 않는다.
- 회귀검사 추가: `e2e/readiness-data.spec.ts` 백업충돌1개, `e2e/accessibility-regressions.spec.ts` 기본/큰글자2개. 신규파일·의존성 없음. 원본/검증본4개 수정파일 SHA256 일치. 단위전체·타입·변경대상 ESLint·Next production build 통과.
- 별도4187 production server에서 백업/저장세대/준비센터/모바일Safari/N-back **21/21 통과(2분)**. 기본·큰글자 수정 후 스크린샷 직접 검수, 기존80점/설정 보존 및 새 기록만 추가 후 새로고침 확인. `C:\TEMP\cg-backup-nback-green-20260924`. 서버는 검증 후 종료한다. 수정파일은 위4개와 이 문서이며 전체 원격CI 성공 전 공개 승격하지 않는다.
- 제품 커밋 `cff6aa6085c0294b70a287e45da518f302ff63e7` main push 완료. [Quality Gate 35960221708](https://github.com/heotaewoong/competency-game/actions/runs/35960221708) 성공(12분2초): 단위203/203, Chromium·Mobile Safari110/110(10.6분), 타입·전체lint·production build 통과. 실패/불안정 재시도 없음. 로컬4187 서버 종료했으며 루트만 배포를 진행했다.
- 깨끗한 기존 릴리스 폴더의 동일 커밋에서 Vercel 후보 `dpl_H6NPF5X26XmWJ8fwCjypsE8rLuqV`, `competency-game-nuynhzzxx-heotaewoongs-projects.vercel.app` READY. Node22/Next16.3.3, 빌드28초. `--prod --skip-domain` 후보1개만 생성하고 전체CI 성공 후 이 산출물을 promote했다. 새환경변수/자격증명/의존성/결제 설정 변경 없음.
- 후보 인증 조회 HTTP200·보안 헤더 유지, 공개 alias는 CI 대기 중 이전 검증본 유지 확인. 원본과 검증본의 실행코드/자산/검사/설정100개 파일 전부 SHA256 일치. CSS 독립 리뷰에서 P1/P2없음: 실제 media 범위는 높이600px이하 가로모드이며 최소너비 제한은 없다. 새 규칙은 그 안의3개답안 버튼에만 적용한다.
- 승격 후 `heobrain-competency-game.vercel.app` alias의 deployment ID가 `dpl_H6NPF5X26XmWJ8fwCjypsE8rLuqV`와 일치한다. 지정URL HTTP200, 리다이렉트0. 인앱 브라우저 새로고침 → 백업·복원 대화상자 열기/닫기 확인, 브라우저error로그 없음, 기존사용자기록5회와 환경설정 보존. 실제 백업충돌/복원 조작은 별도테스트컨텍스트에서 수행하며 사용자기록에 테스트파일을 가져오지 않았다.
- 새 배포 최근30분 Vercel error 조회는 `No logs found`. 관찰 구간에 한정하며 무오류 보장은 아니다. 공식 비공개 규칙을 추정하거나 새로운 게임 분량/채점으로 바꾸지 않았다.
- 공개URL 대상 별도검사 **21/21 통과(2.1분)**: `C:\TEMP\cg-backup-nback-production-20260924`. 기본/큰글자3개답안 캡처 직접검수, 백업충돌·복원·손상/세대보호·Safari터치/이전 확인. 4차 릴리스 검증완료: 2026-09-24 14:47 KST 전후. 제품커밋은 `cff6aa6`, 이후 문서전용 기록커밋은 재배포하지 않는다. 소유한서버·검사·배포 실행없음.
- 다음 점검: 문서전용 후속CI·Git·공개alias부터 확인한다. 백업대화상자를 닫은 직후 인앱 AX 초점이 페이지로 표시된 관찰은 지연/실제복구누락 여부를 추가재현할 후보이며 아직 확정오류로 판정하지 않았다. 기존사용자기록을 변경하지 않는 분리된 테스트에서 확인한다. 오늘22:00 이후 새개발/배포금지·자동화22종료 조건은 유지한다.

## 15:02 후속 점검 — 대화상자 종료 후 키보드 초점 복구

- 시작 시각 15:02 KST, 원본 `748aed4` clean 및 origin 주소 확인. 문서 후속 [CI 35961487519](https://github.com/heotaewoong/competency-game/actions/runs/35961487519) 성공, 공개 URL HTTP200 및 alias가 직전 `dpl_H6NPF5X26XmWJ8fwCjypsE8rLuqV`를 가리킴을 확인했다. 진행 중인 다른 변경·배포 없음.
- 인앱 공개 사이트에서 기록 백업·복원 버튼을 Enter로 열고 Esc로 닫자 DOM `activeElement`가 BODY로 이동했다. 사용자 기록 5개는 건드리지 않았다. 별도 Playwright 컨텍스트의 RED 2개에서 백업 두 진입점 × 닫기 3방식, 준비센터 홈/게임 내부 × 닫기 3방식 모두 원래 버튼 초점 복구에 실패했다. `C:\TEMP\cg-dialog-focus-red-20260924`.
- 같은 native dialog 수명주기를 사용하는 약속 게임 이미지 로딩/실패 취소도 기존 E2E에 초점 검사를 추가해 RED 2개 확인. `C:\TEMP\cg-asset-focus-red-20260924`.
- 원인: 조건부 렌더링으로 dialog가 제거된 뒤 passive effect에서 `close()`만 호출해 원래 초점 복구에 의존했다. [React effect 정리 시점](https://react.dev/reference/react/useEffect) 및 기존 Feedback/Review/Strategy dialog 구현을 대조했다. 세 기존 effect에 열기 직전 초점 저장과 연결된 요소에 대한 복구만 추가했다. `preventScroll`로 화면 이동을 피하고 `isConnected`로 성공적인 게임 시작 후 사라진 버튼을 건너뛴다. 새 훅·의존성·게임 규칙·타이머·채점 변경 없음(Ponytail lite).
- 수정: `app/components/data-management-dialog.tsx`, `app/components/readiness-center.tsx`, `app/components/game-stage.tsx`; 회귀 검사: `e2e/readiness-data.spec.ts`, `e2e/appointment-asset-recovery.spec.ts`, `e2e/mobile-webkit.spec.ts`; 기록: 이 문서. 신규 프로젝트 파일 없음. 원본/검증본 6개 코드·검사 파일 SHA256 일치, `git diff --check` 통과. 독립 읽기 검토에서 StrictMode·중첩 inert·성공 시 화면 전환의 P1/P2 문제 없음.
- C:\TEMP 전용 복사본에서 타입·전체 lint·Next production build·전체 단위검사 통과. 로컬4187 대상 Chromium/Mobile Safari **20/20 통과(3.9분)**: 키보드 초점, 기존 터치·백업/복원·중복 보호·손상 파일·저장 이전·이미지 재시도·취소·숨김 탭 복귀·짧은 가로 화면을 확인했다. `C:\TEMP\cg-dialog-focus-green-20260924`. 소유한4187 서버 종료, 전체 원격 CI 성공 전 공개 승격하지 않는다.
- 추가 입력 감사: CountGame/MouseGame의 입력·타이머·일시정지 흐름을 읽다가 CountGame의 네이티브 Enter 자동반복 차단 누락을 발견했다. 공개 사이트 별도 컨텍스트에서 실제 `keyboard.down('Enter')` 두 번(중간 keyup 없음)으로 재현했다. guided 제시에서 응답으로 넘어간 뒤 자동 초점된 왼쪽 답이 두 번째 반복 keydown만으로 채점됐다. 가상 시계를 고정해 시간초과와 분리했고, 답 버튼 focused/enabled 확인 다음 `toBeEnabled`가 disabled로 실패한 RED 증거: `C:\TEMP\cg-count-repeat-red-20260924`. 최초 검사 초안의 예약 초점 준비 실패는 렌더 확인 후 한 프레임 진행으로 보정했으며 최종 RED는 실제 채점 지점이다.
- Count의 왼쪽·오른쪽·직접 다음 버튼 3개에 기존 게임들의 `event.repeat` 기본동작 방지 패턴만 적용했다. 새 입력과 방향키 규칙은 유지한다. `e2e/accessibility-regressions.spec.ts`에 회귀 1개 추가(+50줄): 반복 Enter 채점 금지 → 키를 떼고 새 입력하면 정상 채점 → 누른 채 다음 문항으로 넘어가도 제시 단계를 건너뛰지 않음. 원본/검증본 SHA256 일치. MouseGame은 이번 읽기 범위에서 추가 확정 결함 없음. 추가 수정 후 재빌드·검사 중, 아직 공개 배포 전이다.
- Count 추가 후 타입·변경 대상 lint·production 재빌드 통과. 최초 로컬 검사는 기존2개 통과, 신규 검사의 앞부분(반복 차단/새 입력 허용)은 통과했으나 다음 문항의 새350ms blank 타이머를 가상 시계가 진행하지 않아 후반 검사1개 실패했다. 스냅샷에 `2/5 · 준비 · ＋`가 남았으며 게임 코드는 바꾸지 않고 해당 렌더 확인 후400ms를 진행하도록 검사만 보정(+1줄). 이후 Count **3/3 통과(22.2초)**, `C:\TEMP\cg-count-repeat-green-final-20260924`. 앞선 실패는 `C:\TEMP\cg-count-repeat-green-20260924`에 보존했다. 이번 로컬 검증은 대화상자20개와 Count3개의 별도 실행이며 단일23개 실행으로 표현하지 않는다.
- 제품 커밋 `1c4de5a89153d767b34483586c87683de59c5a8b` main push 완료. [Quality Gate 35965580413](https://github.com/heotaewoong/competency-game/actions/runs/35965580413) 실행 중: 원격 타입·전체 lint·단위 단계 성공, 전체 브라우저 단계 대기. 소유한 로컬4187 서버는 종료했고 별도 테스트·배포 작업을 중복 시작하지 않았다.
- 동일 커밋의 깨끗한 기존 릴리스 폴더에서 `--prod --skip-domain` 후보 1개 생성: `dpl_2jNtW9Lr4EsnwyvUH51RjFKJas5j`, `competency-game-euvtohwpm-heotaewoongs-projects.vercel.app`, READY. Node22/Next16.3.3, 빌드39초, npm audit 0 vulnerabilities. 후보 인증 HTTP200·보안 헤더 확인, 15:43 KST 지정 공개 alias는 이전 `dpl_H6NPF5X26XmWJ8fwCjypsE8rLuqV` 유지 확인. 전체 CI 통과 전 승격하지 않는다. 도구체인 ESLint9 지원 종료 경고는 별도 유지보수 검토 대상으로 남기며 이번 입력·접근성 수정에 의존성 업그레이드를 섞지 않았다.
- 전체 [CI 35965580413](https://github.com/heotaewoong/competency-game/actions/runs/35965580413) **성공(12분37초)**: 단위203/203, Chromium·Mobile Safari **114/114(11.1분)**, 타입·전체 lint·production build 통과. 실패/불안정 재시도 없음. GitHub action 런타임 Node20 지원 종료/Node24 강제 실행 및 ubuntu-latest의10월 전환 경고는 별도 도구체인 유지보수 항목이며 앱 Node22 빌드 실패가 아니다.
- CI 통과 후 동일 후보를 한 번 promote했다. 지정 `heobrain-competency-game.vercel.app` alias가 `dpl_2jNtW9Lr4EsnwyvUH51RjFKJas5j`와 일치, HTTP200·리다이렉트0. 재빌드/중복 배포 없음.
- 공개 인앱 브라우저에서 열린 게임이 없는지 먼저 확인한 뒤 새로고침 → 키보드로 백업 창 열기 → Esc 닫기 후 `activeElement=BUTTON`, `기록 백업·복원`으로 복구됨을 직접 확인했다. 기존 사용자 기록5개와 설정 보존, 파일 가져오기/삭제/새 게임 완료는 사용자 탭에서 하지 않았다. 브라우저 error로그 `[]`; 새 배포 최근30분 Vercel error 조회 `No logs found`. 관찰 범위에 한정하며 전체 무오류 보장은 아니다. Drains 설정은 이번에 조회/변경하지 않았다.
- 공개 URL 대상 최종 **23/23 통과(2.5분)**: `C:\TEMP\cg-dialog-count-production-20260924`. Count 반복 Enter·새 입력, 대화상자 초점, 약속 이미지 복구/대기 취소, 백업·복원·중복 보존, 준비센터·짧은 가로 화면, Mobile Safari 터치·키보드·기록 이전을 검증했다. 5차 제품 릴리스 `1c4de5a` 완료 시각은15:57 KST 전후이며 이후 문서전용 커밋은 재배포하지 않는다. 소유한 서버·테스트·배포 실행 없음.
- 다음 점검: Git/문서 후속 CI/공개 alias를 재확인한다. 새로고침 최초 AX에서 기록0회가 보였다가 클라이언트 복원 후5회로 바뀌는 표시를 관찰했다(실제 기록 손실 아님). 필요한 경우 초기 복원 중 상태 표시를 분리하는 UX 후보이며 이번에는 추가 구현하지 않았다. 비공개 공식 문항 수·시간·채점을 추측해 변경하지 않는 원칙과 오늘22:00 종료 조건은 그대로 유지한다.

## 16:01 후속 점검 — 첫 로딩의 기록 0회 오인 방지

- 16:01 KST 시작, 원본 `ec95c97` clean·origin 주소·공개 alias `dpl_2jNtW9Lr4EsnwyvUH51RjFKJas5j` 확인. 문서 후속 CI35967103749도 성공했으며 다른 변경/배포 작업은 없었다.
- 공개 사이트의 분리된 테스트 컨텍스트에서 JS 청크 전송을 보류했다. 저장소를 읽기도 전에 헤더가 `완료한 연습 0회`라고 안내하는 RED를 재현: `C:\TEMP\cg-home-loading-red-20260924`(첫 검사 실패 후 중단, 나머지2개 미실행). 데이터 손실이 아니라 초기 빈 배열을 실제 조회 결과처럼 표시한 문제다.
- `app/page.tsx`의 기존 복원 rAF에 완료 플래그 하나를 추가했다. 확인 전 헤더·9개 게임 카드 횟수는 `—`, 추천·기록 섹션은 확인 중 안내를 표시한다. 추천 시작/해당 공략/복습/백업은 복원 전 비활성화한다. 고정 게임 목록과 전체 가이드는 유지하며 저장소 읽기·쓰기·세대 충돌 보호·채점·게임 규칙은 바꾸지 않았다. 새 훅/의존성/스켈레톤 시스템 없이 기존 UI를 재사용했다(Ponytail lite).
- 완료 플래그는 저장소 접근 차단이나 다른 탭의 교체 때문에 기존 복원 경로가 조기 반환해도 종료된다. 독립 읽기 검토에서 기존 동기화/데이터 손실 위험과 충돌은 발견하지 못했다. 준비센터 상태 복원 전의 미점검 안내는 별도 UX 후보로 남겨 이번 기록 수정에 상태 시스템을 확장하지 않았다.
- 신규 검사 `e2e/home-loading.spec.ts`: 데스크톱/390px 모바일 느린 로딩 → 빈 저장소/기존1개 기록 복원 → 백업창 열기, 가로 넘침/콘솔 오류, 저장소 getter 차단 시 로딩 종료/게임 설정 진입. 생성되는 캡처는 임시 검증 폴더에만 보관한다. 원본/검증본 두 코드·검사 파일 SHA256 일치 및 diff check 통과. 전체 단위 검사 통과, 타입·전체 lint·production build 통과 후 최종 버튼 속성 포함 재빌드/브라우저 검증 중이다. 아직 공개 배포하지 않았다.
- 최종 UI 속성 포함 타입·대상 lint·재빌드 통과. 최초 로컬24개 검사는19개 통과 후 Mobile Safari 키보드 검사1개 실패,4개 미실행. trace의 입력 시점에 `records-data-button disabled`와 `aria-busy=true`가 남아 있어 실제 버튼이 준비되기 전 Enter를 보냈음을 확인했다. [Playwright 공식 actionability 표](https://playwright.dev/docs/actionability)에서 `press()`는 Enabled를 자동 대기하지 않으므로 기존 Chromium/Safari 백업 키보드 검사 두 곳에 `toBeEnabled()`를 추가했다. 제품 코드를 약화하거나 고정 sleep을 추가하지 않았다. 실패 증거는 `C:\TEMP\cg-home-loading-green-20260924`에 보존하고24개 전체를 다시 실행한다. 신규3개는 첫 실행부터 통과했으며 데스크톱·모바일 로딩 캡처에서 겹침/가로 넘침 없음을 직접 확인했다.
- 최종 로컬 재검사 **24/24 통과(3.4분)**: `C:\TEMP\cg-home-loading-green-final-20260924`. 느린 로딩/저장소 차단/기존·빈 기록, 백업·복원·동일ID 보존, 저장 세대 경쟁·손상 원본 보존, Mobile Safari 터치/키보드/이전 포맷 복원을 확인했다. 변경된 기존 파일은 `app/page.tsx`, `e2e/readiness-data.spec.ts`, `e2e/mobile-webkit.spec.ts`, 이 문서이며 신규 파일은 `e2e/home-loading.spec.ts`이다. 코드·검사4개 원본/검증본 SHA256 일치. 제품 커밋 후 전체 원격 CI를 통과하기 전 공개 승격하지 않는다.
- 제품 커밋 `3db2b988386c230682b44710b946d5be42dda1e6` main push 완료. [전체 CI35969489006](https://github.com/heotaewoong/competency-game/actions/runs/35969489006)의 타입·전체 lint·단위 성공, 브라우저 검사 실행 중. 소유한4187 서버 종료. 기존 깨끗한 릴리스 폴더에서 해당 커밋의 후보만1개 생성: `dpl_BWF3jHQNQRszxCKsApEAewQUShRo`, `https://competency-game-dvvrqxsd3-heotaewoongs-projects.vercel.app`, READY/Next16.3.3/Node22/빌드40초/npm audit0. `--prod --skip-domain` 및 인증 HTTP200·보안 헤더 확인. 16:27 KST 지정 공개 alias는 이전 `dpl_2jNtW9Lr4EsnwyvUH51RjFKJas5j` 유지. 전체 CI 전 공개 승격하지 않으며 문서만 먼저 추가 push해 진행 중 검사를 취소하지 않는다.
- CI 대기 중 NumberGame/NBackGame 읽기 전용 감사: 새 확정 오류 없음. 다음 heartbeat의 검사 공백 후보는 NBack fast300ms와 원래 deadline 동시 만료 후 pause/resume의 단일 채점·이동, Number 2라운드 전환3초 도중 탭 숨김/0ms 경계 재개의 잔여시간·단일 시작이다. 기존 resolvedRef/index resetKey 및 Number locked/phaseTransition 보호를 확인했으며 버그로 단정하거나 이번 릴리스 코드를 추가 수정하지 않았다.
- [CI35969489006](https://github.com/heotaewoong/competency-game/actions/runs/35969489006) **성공(13분6초)**: 단위203/203·브라우저117/117(11.1분)·타입·전체 lint·production build 통과, failed/flaky 요약 없음. 배포 메타의 githubCommitSha도 제품 `3db2b98`과 일치. 이전 공개 alias 유지 재확인 후 동일 후보만 한 번 promote하여 `heobrain-competency-game.vercel.app`가 `dpl_BWF3jHQNQRszxCKsApEAewQUShRo`를 가리킴을 확인했고 HTTP200/redirect0이다.
- 공개 인앱에서 게임이 열려 있지 않음을 확인하고 새로고침했다. 최초 AX는 `기록 확인 중` 및 disabled 백업으로 표시, 이후 기존5회와 백업창의 `현재 기록5개`를 확인했다. Enter 열기→Esc 닫기 후 원래 버튼 초점 복구, console error `[]`. 중간 CUA DOM 대기 명령은 CDP3초 timeout1회가 있었으나 바로 AX 재관찰에서5회 복원과 정상 UI를 확인한 뒤 실제 조작을 완료했다. 사용자 기록 변경/가져오기/삭제 없음. Vercel 새 배포 최근30분 error로그 없음, Drains 미조회.
- 공개24개 최초 실행은 **21통과/1실패/2미실행(2분)**로 보존: `C:\TEMP\cg-home-loading-production-20260924`. 실패는 기존 Mobile Safari 터치 게임 진입의 `rps stage visible`5초 제한이며, trace 마지막 스냅샷에는 해당 rps dialog가 생성되어 있다. 초기 DOM 복원 뒤 터치됐고 관련 JS 응답은200/24~40ms였다. 전송 실패나 기록 손실로 단정하지 않으며, 5초 UI 준비 지연의 원인은 아직 확정하지 않았다. 타임아웃을 늘리거나 앱을 변경하지 않고 Mobile Safari5개만 별도 재검사한다. 이번 공개 실행을24/24로 표현하지 않는다.
- Mobile Safari 별도 재검사는 첫 백업 버튼 enabled5초 대기에서 실패, 나머지4개 미실행: `C:\TEMP\cg-home-loading-production-mobile-recheck-20260924`. 따라서 일회성으로 넘기지 않고 C:\TEMP 전용 진단을3회 실행했다. Windows의 Mobile Safari 프로필(WebKit) 자동화 관측값은 navigation0.87~0.94초, 그 후 기록 준비2.62/5.71/6.08초, tap 후 게임 표시5.63/7.60/4.49초였다. JS 응답18~79ms, visibility=visible, pageerror 없음. 30초 진단 한도 안에3회 모두 최종 작동했지만 기존5초 회귀검사 통과로 간주하지 않는다. 이 수치는 프로토콜/폴링 시간을 포함하며 실제 iPhone이나 순수 렌더시간 측정은 아니다.
- 같은 시점 PC 여유 물리메모리612760KB/전체16119016KB, CPU34%였다. 저메모리 환경의 영향은 후보일 뿐 원인으로 확정하지 않았다. 사용자 프로그램 종료/설정 변경 없음. 진단 소스와 상세 관측값은 `C:\TEMP\cg-webkit-loading-diagnostic-20260924\mobile-webkit.spec.ts`, `MEASUREMENTS.md`에 보존하고 정상 e2e 탐색 경로에서 옮겼다. **다음 heartbeat 최우선은 공개 WebKit 초기 준비 지연을 여유 있는 검증 환경 및 런타임 프로파일로 분리하는 것**이다. 앱 초기 로딩 수정은 공개 확인됐으나 모바일 속도 전체 해결·공개24/24 성공을 주장하지 않는다.
- 최초 공개 실행에서 미실행됐던 Mobile Safari v2/v3 기록 이전2개는 별도 실행 **2/2 통과(12.5초)**: `C:\TEMP\cg-home-loading-production-migration-20260924`. 공개 검증 실패와 후속 진단을 모두 유지하며 성공한 단일24개 실행으로 합산하지 않는다. 이번 제품 릴리스는 `3db2b98`이고 이후 문서 후속 커밋은 재배포하지 않는다. 소유한 로컬 서버·검사·배포 프로세스는 모두 종료됐다. 다음 점검은 Git/문서 후속 CI/공개 alias 재확인 후 위 WebKit 지연 원인 분리부터 시작한다. 자동화22의 오늘22:00 종료 조건 유지.

## 17:01 후속 점검 — 브라우저 내부 초기 진입 계측 및 타이머 경계 검사

- 17:01 KST 시작. 원본 `d21c7ef` clean·origin 확인, 문서 후속 CI35971898434 성공. 지정 공개 alias는 제품 `3db2b98`/배포 `dpl_BWF3jHQNQRszxCKsApEAewQUShRo`와 일치, READY·HTTP200/redirect0·최근30분 Vercel error로그 없음. 이 실행에서 신규 배포는 시작하지 않았다.
- C:\TEMP 전용 진단에서 브라우저 내부 MutationObserver·click 이벤트·performance.now를 수집했다. 빈 저장소의 Chromium touch/WebKit touch 각1회, trace/video off와 기존 retain-on-failure on의 별도 두 실행. 페이지 내부 기록 준비는 Chromium402/455ms, WebKit965/682ms; click→RPS DOM 삽입은 Chromium311/312ms, WebKit324/320ms였다. 두 실행 각각2개가 최종 화면 표시/pageerror 없음으로 종료됐다. 실제 iPhone 및 실제 화면 페인트 측정은 아니며 30초 진단이 기존5초 제품 회귀검사 통과를 뜻하지 않는다.
- 이번에는 이전5초 초과 지연이 재현되지 않았고, 캡처 여부의 인과관계도 입증되지 않았다. 호스트 여유 메모리는 시작 약440MB에서 계측 후 약1.03GB로 변했다. 사용자 앱 종료/전역 설정 변경 없음. 독립 정적 감사에서도 빈 저장소에서5초를 설명할 확정 P1/P2 병목 없음. 많은 기록의 복원/재집계와 공통 게임 모듈 평가 비용은 미확정 측정 후보만 남긴다. 추측에 따른 앱 변경·timeout 완화·속도 해결 주장을 하지 않는다(Ponytail lite).
- 계측 결과 `C:\TEMP\cg-startup-inpage-20260924`, `C:\TEMP\cg-startup-inpage-captured-20260924`; 소스와 한계 기록 `C:\TEMP\cg-startup-inpage-sources-20260924\MEASUREMENTS.md`. 진단 소스는 검증 복사본의 정상 검사/빌드 경로 밖으로 옮겨 보존했다. 제품 앱 코드/의존성은 변경하지 않았다.
- 직전 감사에서 남긴 도형 기억하기 fast300ms+원래deadline의 중복 방지, 숫자 누르기 2라운드3초 전환의 일시정지/탭 숨김 경계에 대해 공개 DOM 기반 독립 E2E를 보강 중이다. 아직 검사 통과나 신규 오류 수정으로 보고하지 않는다.
- [숫자 누르기 공식 해설](https://www.jobda.im/info/340)과 [도형 순서 기억하기 공식 해설](https://www.jobda.im/info/341)은 브라우저에서 다시 열어 각각2023-03-27/2023-04-01 게시물과 공식 영상 연결을 확인했다. 이번에는 영상 전체를 새로 재검증하지 않았으며 기존 `PUBLIC_RULE_EVIDENCE.md`의 공개 규칙/독립 프리셋 경계를 유지한다. 현재 초대형 검사의 비공개 시간·채점·문항 수를 새로 확인한 것으로 표현하지 않는다.
- 신규 `e2e/nback-pause-boundary.spec.ts`: 응답 후100ms→일시정지5초→재개199ms 유지/+1ms 진행으로 fast300ms 잔여시간 확인. 별도 performance.now만+10초 주입으로 두 만료 콜백이 큐에서 지연된 조건을 만든 뒤 실제 닫기/계속 UI를 통과시켜 한 문항만 진행·최종3회 채점/정확도100%·오류0·복습3개 확인. 이는 경계 조건 주입 검사이지 실제10초 렉을 재현한 것은 아니다.
- 신규 `e2e/number-pause-boundary.spec.ts`: 실전형 앱 프리셋의1라운드6문항을 실제 입력해 완료→2라운드 전환 중 visibility 이벤트 hidden5초/visible후 미재개3초에는 정지→명시적 재개. 두 신규 검사 모두 별도 컨텍스트의 pageerror/console.error를 확인한다. 사용자 탭·기록을 변경하지 않는다.
- 첫 로컬 **5/5(23.2초)**, 공개 **5/5(26.8초)**: 신규2개와 기존 만료0ms/RPS 피드백/회전 재생 검사3개. 증거 `C:\TEMP\cg-pause-boundary-local-20260924`, `C:\TEMP\cg-pause-boundary-production-20260924`. 별도 독립 검토에서 숫자 검사의1,500~2,200ms 전환 범위가 너무 넓고 DOM개수만으로 내부 콜백 호출 횟수를 증명할 수 없음을 지적받았다. 제품 오류가 아니라 검사 한계다. 마지막1R피드백을 정확히360ms에서 멈추고 재개1,899ms/+1ms의 정확한 남은1,900ms 경계로 보강했으며, 이름/보고도 남은 시간 보존으로 한정했다. 이 최종 변경분은 재검증 중이다.
- C:\TEMP 검증본에서 전체 단위 **203/203**(합산 TAP tests/pass203·fail0, npm test exit0), 타입·전체 lint·production build 통과. 숫자 검사 최종 정밀화 후 타입·신규2개 대상 lint도 다시 통과했다. 앱 코드·규칙·저장 형식·의존성 변경은 없다. 새 검사2개 원본/검증본 SHA256 일치를 확인했다.
- 최종 로컬5개 실행은 **3통과/1실패/1미실행(40.8초)**: `C:\TEMP\cg-pause-boundary-local-final-20260924`. 신규2개(정확한1,900ms 포함)와 기존 첫 RPS 경계는 통과했고, 기존 RPS 피드백 검사가 타이머 시작 전 홈 카드 `click()`15초 초과로 실패했다. trace는 click호출20,021ms→실제 클릭 단계37,028ms→timeout37,030ms를 기록했고 실패 캡처에는 RPS 설정 화면이 열려 있다. 대기·조작 경로 지연의 원인은 미확정이며 신규 타이머 오류로 단정하지 않는다. 실패/미실행2개만 변경 없이 따로 실행해 **2/2(8.5초)** 통과: `C:\TEMP\cg-pause-boundary-local-followup-20260924`. 별도 실행들을 단일5/5로 합치지 않는다. 기존 검사 timeout이나 제품 코드를 완화하지 않았다.
- 최종 공개 URL 검사 **5/5(24.0초)** 통과: `C:\TEMP\cg-pause-boundary-production-final-20260924`. 신규 NBack 정확한200ms·중복 만료/채점, Number 정확한1,900ms·명시적 재개, 기존 RPS2개·회전 재생을 검증했다. 신규2개에서는 pageerror/console.error도0건이다. 앞선 WebKit5초 실패 및 이번 로컬 Chromium클릭 대기 실패의 원인이 해결됐다는 뜻은 아니다.
- 이번 선택 변경은 진행 문서 수정과 신규 E2E2개뿐이다. 검증된 파일만 main에 커밋·push하고 원격 전체 CI를 확인한다. 앱 번들이 같으므로 불필요한 Vercel 재배포는 하지 않으며 공개 제품은 `3db2b98`/`dpl_BWF3jHQNQRszxCKsApEAewQUShRo`를 유지한다. 소유한4187 서버와 모든 로컬 검사 실행은 종료했고 listener 없음 확인, 공식 자료용 임시 브라우저 탭도 닫았다.
- 다음 heartbeat: 최신 main 커밋의 Quality Gate 상태를 먼저 확인한다(신규2개 포함 예상119개 브라우저 검사; 성공 전119/119로 표현하지 않음). 원격 CI가 실패하면 해당 실패부터 조사한다. 간헐적 초기 UI/자동화 클릭 대기 지연은 열린 검증 항목으로 유지하되 같은 검사를 무작정 반복하거나 측정 없이 게임 구조를 바꾸지 않는다. 오늘22:00 종료/자동화22 PAUSED 조건 유지.

## 17:53 사용자 연장 — N-back 중복 만료의 실제 화면 중단 수정

- 사용자 최신 요청에 따라 종료를 2026-09-25 00:00 KST로 연장했다. 자동화22의 이름·prompt·종료 시각을 기존 대상/매 정시 일정과 함께 갱신하고 ACTIVE readback을 확인했다. 위 과거 기록의22:00 조건은 이 지시로 대체한다.
- 시작 원본 `18aef474700806fc209e4eb4515c434b240d4a20` clean, origin 유지. 공개 alias는 제품 `3db2b98`/배포 `dpl_BWF3jHQNQRszxCKsApEAewQUShRo` 유지, 최근30분 서버 error로그 없음. 서버 로그가 없다는 것은 클라이언트 오류가 없다는 증거가 아니다.
- [CI35976059869](https://github.com/heotaewoong/competency-game/actions/runs/35976059869) **실패**: 타입·전체 lint·단위203·build 성공, 브라우저118통과/1실패. 신규 NBack 경계 검사의 같은 위치에서 최초 실행과2회 재시도 모두 실패했다. 증거를 `C:\TEMP\cg-ci-35976059869`에 내려받아 캡처와 trace를 직접 확인했다. 단순5초 대기 실패가 아니라 route 오류 화면이며 `TypeError: Cannot read properties of undefined (reading 'task')`가 기록됐다. 이전 Windows 로컬/공개 통과만으로 오류 없음으로 결론 내리지 않는다.
- 원인: fast300ms와 원래deadline이 모두 만료된 뒤 pause/resume할 때, 첫 완료가 다음 문항을 렌더하고 layout effect가 boolean 완료 가드를 다시 열었다. passive timer 정리 전에 같은 문항의 이전 콜백이 도착하면 중복 채점/배열 범위 밖 이동이 가능했다. NBack 중앙 `finishCurrentTrial`만 완료 index를 기억하도록 바꾸고 이미 완료한 index 이하의 입력·완료를 차단했다. layout effect의 완료 가드 초기화는 제거하되 답안·반응시간 초기화는 유지했다.
- 공용 타이머·다른8개 게임·공개 규칙·제한시간·채점식·디자인·의존성·저장 형식은 변경하지 않았다. 기존 경계 검사를 제거하거나 timeout을 늘리지 않았다(Ponytail lite). 읽기 전용 독립 검토에서 guided 수동 이동, 실전2라운드, 세션 remount의 단조 index 조건과 원본/검증본 해시 일치를 확인했다.
- 수정 원본은 G:에 보존하고 C:\TEMP 전용 복사본에서 타입·lint·단위·build·NBack 기능 검사를 진행한다. 실제 실패했던 Linux 전체 CI가 성공하기 전에는 공개 승격하지 않는다. 아직 수정본 배포/통과를 주장하지 않는다.
- C:\TEMP 수정본 타입·전체 lint·단위 전체·production build 성공. NBack 관련 기존 브라우저 **10/10 통과(1.7분)**: `C:\TEMP\cg-nback-guard-local-20260924`. fast pause200ms/중복0ms 만료, guided 수동 완료·저장, 실전형 앱 프리셋47문항/2라운드, 모바일 진입·종료, 작은 가로 화면/큰 글자/터치 영역/내부 스크롤을 확인했다. 큰 글자3개 답안 캡처도 직접 확인했다. 추적 앱·검사·설정 파일의 원본/검증본 해시 일치.
- 나머지8개 게임 완료 진입점의 독립 읽기 전용 감사에서는 같은 종류의 확정 신규 문제가 없었다. 단일 완료 timer, 상호 배타적 단계, 기존 문항·사람별 전환 guard를 확인했으며 코드 일괄 변경을 하지 않았다. 이 정적 감사는 전체 실행 검사를 대신하지 않는다. 검증한 앱 파일과 이 문서만 커밋하여 전체 Linux CI를 시작한다.
- 제품 커밋 `ab3d3a70073ba3a4315514c050b362ca5267d107` main push 완료. [CI35979620655](https://github.com/heotaewoong/competency-game/actions/runs/35979620655)의 타입·전체 lint·단위 성공, 브라우저 진행 중. 소유한4187 서버 종료/listener 없음 확인. 깨끗한 기존 릴리스 복사본에서 해당 커밋의 후보만1개 생성: `dpl_6r4Unh3qKiF7Lnxqv1UtFrQhNVRP`, `https://competency-game-qh95p3g2j-heotaewoongs-projects.vercel.app`, READY/Next16.3.3/Node22/빌드29초/npm audit0. `--prod --skip-domain`, 인증 HTTP200·보안 헤더와 메타 githubCommitSha를 확인했다. 지정 공개 alias는 이전 `dpl_BWF3jHQNQRszxCKsApEAewQUShRo`를 유지한다. 전체 CI 전 공개 승격/추가 push 없음.
- CI 대기 중 공개 IAB383×778에서 별도 UX 점검. NBack의 시간 제한 없는 연습을 켜도 세부 설정의 고정 간격/0.3초 자동 전환 안내가 계속 활성 표시되는 불일치를 실제 AX로 확인했다. 설정은 원래 OFF로 복구했고 기존5기록 유지, 새 게임 완료/기록 수정/삭제 없음. 이 안내 문제 및 버튼 포커스에서 Space가 네이티브 버튼 선택이 되는 단축키 설명 범위는 후속 소규모 개선 후보로 남긴다.
- 같은 점검에서 숨겨진 checkbox를 AX로 직접 누르면 panel이 빈 흰 화면이 되는 현상을 발견했다. 도구 문제와 분리하기 위해 정상 설정 화면에서 일반 Tab만으로 체크박스에 진입했고 **실제 키보드 경로에서도 재현**했다. input은unchecked 유지, stage-panel.scrollTop906/scrollHeight1672, stage-intro.scrollTop938/scrollHeight1935, 콘솔 오류 없음. 흰 화면을 직접 캡처/확인한 뒤 Esc로 홈을 복구했다. label의y238~311과 투명input의y1538~1551이 서로 다른 위치인 readback도 확인했다. `.rotation-preview-setting input` absolute와 static label의 위치 기준이 원인 후보다. 이 별도 접근성 문제는 최소 CSS 수정과 실제 Tab 회귀 검사로 진행하며 NBack 타이머 릴리스와 결과를 구분한다.
- NBack [CI35979620655](https://github.com/heotaewoong/competency-game/actions/runs/35979620655) **성공(12분52초)**: 단위203/203, 브라우저119/119(11.4분), 타입·전체 lint·build 통과, failed/flaky 없음. 실제 Linux 실패했던 경계 검사도 첫 실행에서 통과했다. 기존 alias를 재확인한 뒤 같은 후보만1회 promote했고 지정 공개 URL→`dpl_6r4Unh3qKiF7Lnxqv1UtFrQhNVRP`·HTTP200/redirect0 확인.
- NBack 공개 배포 후 **14/14 통과(1.4분)**: 9개 게임 모바일 시작·종료, NBack/Number의 정확한 일시정지 경계, RPS 만료·피드백·회전 재생. `C:\TEMP\cg-nback-guard-production-20260924`에 보존. 공개 IAB 새로고침 뒤 기존5기록 복원을 확인했다. 새 배포 최근30분 Vercel error로그 없음, Drains 미조회. 이 릴리스는 별도로 발견한 체크박스 흰 화면 문제까지 해결한 것은 아니다.

## 18:29 후속 — 설정 체크박스 키보드 포커스의 흰 화면 방지

- 공통 `.rotation-preview-setting`은 9게임의 시간 제한 없는 연습과 Rotation의 단계별 과정 미리보기에서 재사용된다. 해당 label에 `position:relative`1줄을 추가해 절대 위치의 투명 input이 자기 label 안에서 배치되도록 했다. 스크롤 패널 구조/JS/저장 형식/게임 규칙은 변경하지 않았다.
- 신규 `e2e/checkbox-focus-scroll.spec.ts`4개: NBack383×778/844×360/1280×900 및 Rotation 미리보기383×778. 실제 Tab(세부 설정 Enter)으로 checkbox에 도달해 input·label·도구모음·시작 버튼 좌표, 바깥 panel.scrollTop0, Space토글·Esc닫기·원래 카드 초점 복귀와 콘솔을 검사한다. 직접 숨겨진 input클릭/강제 focus로 대체하지 않으며 좌표JSON·스크린샷을 남긴다. 원본/검증본 동일. 수정 전 공개 제품 `ab3d3a7`에서 RED검사를 시작하며 수정본 GREEN이나 배포로 아직 보고하지 않는다.
- 수정 전 공개 제품에서 신규4개 **모두 실패(예상 RED)**: `C:\TEMP\cg-checkbox-focus-production-red-20260924`와 하위 `report`에 증거 보존. NBack세로 panel.scrollTop906, Rotation2510 등 실제 화면 이탈을 잡았다. 수정본 최초 로컬은7통과/1실패(54.1초), `C:\TEMP\cg-checkbox-focus-local-green-20260924`에 그대로 보존했다. 유일한 실패는844×360의 label.bottom273.265625 대 intro.bottom272로1.265625px 테두리 걸침이다. 직접 캡처에서 문구·토글·헤더·시작2버튼 모두 표시되고 panel.scrollTop0/Space/Esc는 통과함을 확인했다.
- 독립 리뷰 후 label↔intro 경계2곳만 테두리·소수점 반올림을 고려해2px 허용으로 교정했다. **panel.scrollTop===0 및 toolbar/시작 버튼의 화면 내 조건은 그대로** 유지했다. 불필요한 input 전체면적 변경/스크롤 구조 변경은 하지 않았다(Ponytail lite). 최종 원본/검증본 SHA256 일치, 타입·전체 lint·단위203/203·production build 및 최종 검사 파일 lint 통과.
- 최종 로컬 **8/8 통과(47.5초)**: `C:\TEMP\cg-checkbox-focus-local-green-final-20260924` 및 하위report. 새4개, 기존 긴 설정/44px터치2개, NBack·Number pause경계2개 포함. 같은 최종 검사로 수정 전 공개 제품의 RED도 다시 확인한 뒤 선택 파일만 커밋한다. 아직 CSS 수정의 공개 배포는 하지 않았다.
- 동일 최종 검사로 수정 전 공개 제품의4개가 다시 **모두 RED**임을 확인했다: `C:\TEMP\cg-checkbox-focus-production-red-final-20260924` 및 하위report.2px 경계 허용으로 실제 수백px 스크롤 오류가 숨겨지지 않는다. 검증된 CSS1줄, 신규 회귀 검사, 진행 문서만 커밋·push한다. 소유한4187 서버 종료. 새 전체 Linux CI 예상123개가 성공하기 전에는 CSS 후보를 공개 승격하지 않는다.
- 제품 커밋 `502bf0db1a4c42a1dfcdebe3161daf574179567a` main push. [CI35982744150](https://github.com/heotaewoong/competency-game/actions/runs/35982744150)의 타입·lint·단위 성공, 브라우저 진행 중. 기존 릴리스 복사본 clean/정확한SHA에서 후보1개만 생성: `dpl_5CKL5UetkasSJndBxbDoTkh4vZiB`, `https://competency-game-47w3t9wa6-heotaewoongs-projects.vercel.app`, READY/Next16.3.3/Node22/빌드28초/npm audit0. 인증 HTTP200·보안 헤더·meta githubCommitSha 확인, 지정 공개 alias는 NBack 수정 배포 `dpl_6r4Unh3qKiF7Lnxqv1UtFrQhNVRP` 유지. 최종 로컬 세로 NBack/Rotation 및 가로 NBack 캡처를 직접 확인했고 초점 테두리·문구·헤더·시작 버튼이 정상 표시됐다. 공개 승격 전까지 문서만 추가 push하지 않는다.
- 추가 Windows Desktop WebKit 진단에서는 새4개가 모두 마지막 원래 카드 초점 복귀 검사에서 실패했다. 앞선 Tab/좌표/panel.scrollTop0/Space/모달 닫기는 통과했지만 마지막 콘솔 검사는 실패 뒤이므로 실행되지 않았다. `C:\TEMP\cg-checkbox-focus-webkit-local-20260924`에 report/trace/실패 캡처와 임시 설정을 보존했다. 임시 설정은 정상 검증 폴더 밖으로 옮겼고 소유한 서버는 종료했다. 이 결과를4개 통과나 초기 진입 timeout으로 표현하지 않는다.
- 원인 감사: GameStage는 mount 시 `document.activeElement`만 저장하며 홈 `openGame`은 실제 클릭 버튼을 지정하지 않는다. 포인터 클릭으로 버튼 초점을 이동하지 않는 WebKit에서는 원래 카드 복귀를 보장하지 못한다. 공통 openGame에 기존5개 직접 버튼의 currentTarget을 전달하는 최소 수정이 다음 우선 항목이다. 가이드/복습에서 게임으로 넘어오는 경로는 사라지는 내부 CTA를 저장하지 않도록 구분해야 한다. 이번 CSS 배포에 해당 JS 변경을 섞지 않았으며 실제 Safari/iPhone 전체 동작을 검증한 것은 아니다.
- [CI35982744150](https://github.com/heotaewoong/competency-game/actions/runs/35982744150) **성공(12분55초)**: 타입·전체 lint·단위203/203·production build·브라우저123/123(11.4분), 실패/불안정 재시도 없음. 지정 공개 alias가 이전 검증본임을 확인한 뒤 같은 후보 `dpl_5CKL5UetkasSJndBxbDoTkh4vZiB`만1회 promote했다. 공개 URL의 최종 조작 검증을 이어간다.
- 공개 alias→`dpl_5CKL5UetkasSJndBxbDoTkh4vZiB`, meta githubCommitSha→`502bf0d` 및 READY/production 확인. HTTP200·redirect0, 최근30분 Vercel error로그 없음(Drains 미조회). 공개 Chromium 최종 **8/8 통과(39.8초)**: `C:\TEMP\cg-checkbox-focus-production-green-20260924`에 report·좌표·캡처를 보존했다. 새 체크박스4개/긴 설정·터치 영역2개/NBack·Number 경계2개를 검사했다.
- 공개 IAB383×778에서도 새로고침→기존5기록 복원→NBack 설정→일반 Tab만으로 시간 제한 checkbox 진입→Esc를 직접 확인했다. checkbox=unchecked 유지, input에 초점, panel.scrollTop0, label.top346.4375/bottom419.21875, 헤더·설명·시작 버튼이 모두 보이는 캡처를 직접 검수했다. Esc 후 원래 NBack 카드 BUTTON 초점 복귀, error로그0. 사용자 설정·기록 변경/완료/삭제 없음. DOM 진단의 instanceof 구문1회가 CUA 읽기 전용 환경에서 실패해 tagName 기반 읽기로 교정했으며 제품 콘솔 오류로 집계하지 않는다.
- 별도 공개 Mobile Safari 기존5개 실행은 **4통과/1실패(49.4초)**: `C:\TEMP\cg-checkbox-focus-production-mobile-20260924`. 첫 백업 버튼의 enabled 대기5초에서 실패했고 해당 키보드 모달 검사는 진입하지 못했다. 준비센터 터치·접근성, RPS 터치 첫 문제, v2/v3 기록 이전4개는 통과했다. 실패 캡처/trace 보존, 대기 중 disabled와 실패 후 캡처의 준비 완료 상태를 구분한다. 이전부터 남은 WebKit 초기 복원 지연이 해결된 것은 아니며 재시도·timeout 확대 없이 다음 원인 분리 항목으로 유지한다. 전체 공개13/13 또는 Safari 무오류로 합산하지 않는다.
- 19:01 KST 전후 두 제품 수정(NBack 중복 만료, 체크박스 흰 화면)의 공개 반영과 검증 기록을 완료했다. 소유한4187 listener 및 실행 중 테스트/배포 없음. 문서만 후속 커밋·push하며 재배포하지 않는다. 다음 실행은 문서 후속 CI·Git·alias 확인 후 WebKit 포인터 게임 진입의 원래 버튼 초점 복귀 수정을 우선한다. 기존 `critical-flows.spec.ts` 회전 fixture를 활용하고 직접 진입5곳·키보드 가이드/복습 handoff2곳을 구분 검증한다. 현재 Playwright 기본 설정에서 해당 파일은 Chromium만 실행되므로 실제 WebKit 회귀 실행 범위도 명시해야 한다. NBack 시간 제한 없는 연습의 자동 전환 안내 불일치는 그다음 후보다. 사용자 연장 종료 조건은 **2026-09-25 00:00 KST**이며 자동화22 ACTIVE 유지.

## 19:03 후속 — Safari 포인터 진입 후 게임 종료 초점 복귀

- 시작 원본 `323fd04` clean·origin 유지, 공개 alias `dpl_5CKL5UetkasSJndBxbDoTkh4vZiB`·HTTP200/redirect0 확인. 문서 후속 CI35984878692 실행 중이며 앞선 서버/배포는 종료 상태다. 종료 시각은 사용자 연장대로 2026-09-25 00:00 KST다.
- 이전 WebKit4개 실패를 근거로 홈 `openGame` 호출7곳과 GameStage·가이드·복습의 focus/inert cleanup을 읽었다. [MDN의 button 클릭·초점 설명](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus)도 확인했다. Safari 포인터는 버튼을 자동 focus하지 않을 수 있으므로 공통 openGame에 실제 홈 버튼을 optional 인자로 받아 동기 `focus({preventScroll:true})`한 뒤 기존 화면 열기·닫기 복구를 재사용한다. 직접 버튼5곳만 currentTarget을 전달하고 가이드/복습 handoff2곳은 기존 cleanup 경로를 유지한다.
- 수정은 `app/page.tsx`8줄추가/6줄삭제이며 새 hook/상태/의존성/게임 규칙/타이머/채점/저장 변경 없음(Ponytail lite). 독립 읽기 리뷰에서 신규 P1/P2 위험 없음. Safari에서 가이드/복습 자체를 포인터로 여는 별도 진입은 이번 수정 대상이 아니므로 모든 팝업 초점 해결로 확대하지 않는다.
- 신규 `e2e/game-opener-focus.spec.ts`7개: 미리 focus하지 않은 홈 직접 클릭5곳, 키보드로 연 가이드/복습→게임 전환2곳, 종료 후 원래 버튼·홈 inert/aria-hidden·오류 로그 확인. `playwright.config.ts`의 새 `desktop-safari-focus`는 이7개와 기존 checkbox4개만 실행하며 Chromium 검사도 유지한다. 기존 CI는 WebKit이 설치되어 있어 추가 의존성 없이 해당 회귀를 자동 실행한다. G: 원본 보존/C:\TEMP 검증본 SHA256 일치; 타입·전체 lint·production build 통과, 전체 단위 및 수정 전 공개 RED/수정본 GREEN 검증 진행 중. 아직 신규 제품 커밋·배포 전이다.
- 수정 전 공개 Desktop WebKit 신규7개 실행은 **7실패**로 보존했다: `C:\TEMP\cg-game-opener-production-red-20260924`. 카드1개는 종료 후 opener inactive가 실제 RED이며 나머지6개는 기록 초기 복원 aria-busy=true의5초 제한에서 먼저 실패해 초점 경로는 미실행이다. 모두 같은 오류7개로 해석하지 않고 timeout을 바꾸지 않았다. 이 실행은 기존 초기 로딩 지연을 다시 관찰한 것이지 수정본의 실패가 아니다.
- 전체 단위 검사 exit0, 신규 검사/config 포함 추가 타입·대상 lint 통과. 앞선 문서 CI35984878692도 성공했다. 로컬 IAB 홈/이미지/게임 카드 정상 렌더 및 console error0, 고양이 카드 진입 직후 body.top=-2079px→Esc 뒤 scrollY2079·동일 카드 BUTTON 초점 복귀를 직접 확인했다. agent-browser CLI가 없어 새 설치 없이 기존 Playwright/CUA로 검증했다. 사용자 공개 탭/기록은 이 로컬 조작에서 변경하지 않았다.
- 로컬 Chromium/WebKit22개 최초 실행은 **20통과/2실패(2.3분)**: `C:\TEMP\cg-game-opener-local-green-20260924`. Chromium11개와 WebKit9개(기존 checkbox4·직접 진입3·handoff2)가 초점 복귀까지 통과했다. WebKit 카드1개는 초기 aria-busy5초, 기록 재연습1개는 클릭 뒤 game stage5초에서 실패해 초점 검사는 미실행이다. 실패2개만 코드/timeout 변경 없이 따로 실행하여 **2/2 통과(8.2초)**: `C:\TEMP\cg-game-opener-local-followup-20260924`. 최초 실행을22/22로 바꾸지 않는다.
- 원본/검증본 앱·새 검사·config3개 SHA256 일치 및 diff check 통과. 새 검사 포함 전체 원격 CI 예상141개를 확인하기 위해 선택4파일만 커밋한다. 소유한4187 서버·임시 로컬 탭 종료. 기존 공개 제품은 아직 `502bf0d`이며 원격 성공 전 새 공개 승격하지 않는다. 초기 WebKit 지연 원인에 대한 읽기 전용 trace 검토를 병행한다.
- 제품 `323aa1aa89e9daa41a044a6251650d1f06d8f854` main push 완료. [CI35988741192](https://github.com/heotaewoong/competency-game/actions/runs/35988741192) 타입·전체 lint·단위 성공, 브라우저 단계 진행 중. 기존 clean 릴리스 복사본을 정확한SHA로 fast-forward해 후보1개 생성: `dpl_AddTR8jgQUEQ37pV1aZjqY54TU8k`, `https://competency-game-7yyb8nu3h-heotaewoongs-projects.vercel.app`, READY/production/Next16.3.3/Node22/빌드39초/npm audit0. 후보 인증 HTTP200·meta githubCommitSha 확인. 지정 공개 alias는 이전 `dpl_5CKL5UetkasSJndBxbDoTkh4vZiB` 유지하며 CI 전 승격하지 않는다.
- 기존 trace 독립 정밀 검토: 공개 초기 준비 실패6개는 JS14개가 navigation후328~597ms에 모두200 수신됐지만6.24~7.05초의 실패 직후 snapshot도 aria-busy=true였다. 단순 네트워크 전송 지연이나 assertion 왕복 지연만으로 설명할 수 없다. 로컬 기록 재연습 실패는 click/로딩UI가 실제 실행됐고 청크2개200/8.3·13.8ms 수신 이후5초 stage 대기가 실패했으며, 실패209ms 뒤 snapshot에 rotation dialog가 있다. 따라서 클릭이 실행되지 않은 것으로 분류하지 않는다. 남은 구간은 JS평가/hydration→복원 effect/Storage 동기처리→rAF→React commit이다. 앱 병목과 호스트/WebKit 스케줄링 중 원인은 아직 확정하지 않았다.
- CI 대기 중 추가 페이지 내부 계측 각1회: Desktop Chromium 준비965.8ms, WebKit2008ms. Storage 단일호출 최대2ms/1ms, 복원 rAF 대기7.1ms/70ms, callback0.2ms/2ms였다. 마지막JS수신→첫Storage호출의 간격은 약686ms/1729ms로 관찰됐으나5초 초과는 재현되지 않았고 JS평가/hydration/effect scheduling 중 세부 원인은 못 나눴다. 공개제품/5초검사 변경 없이 별도30초 관찰2개가 완료된 것이며 기존 실패를 성공으로 대체하지 않는다. 저장값은 수집하지 않았다. 원시 출력 `C:\TEMP\cg-startup-marks-20260924-console.log`, 소스·한계·측정표 `C:\TEMP\cg-startup-marks-sources-20260924\MEASUREMENTS.md`. 임시 소스는 정상 검증 폴더 밖으로 옮겼고 새 서버/제품 배포를 만들지 않았다.
- [CI35988741192](https://github.com/heotaewoong/competency-game/actions/runs/35988741192) **성공(12분10초)**: 단위203/203, 브라우저141/141(10.8분), 타입·전체 lint·production build. 신규 Desktop WebKit11개를 포함해 실패/불안정 재시도 없음. 기존 alias를 확인한 뒤 동일 후보만1회 promote했다. 지정 공개 URL은 `dpl_AddTR8jgQUEQ37pV1aZjqY54TU8k`·HTTP200/redirect0으로 확인했다.
- 공개 IAB 새로고침 전 진행 게임/모달0개 확인, 새로고침 후 기존5기록 유지. NBack 기록의 `다시 연습` 클릭→게임 설정→Esc 후 동일 BUTTON 초점·scrollY5275 복귀, 홈 inert0, console error0. 실제 초점 테두리와 모바일 기록 화면 캡처를 검수했다. 사용자 설정/기록 작성·삭제 없음. 새 배포 최근30분 Vercel error로그 없음(Drains 미조회). 이는 관찰 구간의 결과이며 모든 기기 무오류 보장이 아니다. 공개27개 별도검사 진행 중이다.
- 공개 최종 **27/27 통과(2.7분)**: `C:\TEMP\cg-game-opener-production-20260924` 및 하위report. Chromium11·Desktop WebKit11·Mobile Safari5에서 직접 클릭5곳/키보드 가이드·복습 handoff/기존4개 Tab checkbox/모바일 터치·접근성·기록 이전을 검증했다. 실패했던 실제 초점 경로까지 통과했지만 초기 복원 속도를 바꾼 수정은 아니므로 간헐적5초 지연의 해결을 뜻하지 않는다. 실제 iPhone 기기 검증은 하지 않았다.
- 이번 제품 릴리스는 `323aa1a`/`dpl_AddTR8jgQUEQ37pV1aZjqY54TU8k`이다. 소유한 서버·테스트·배포 프로세스는 종료했고4187 listener 없음, 임시 로컬 브라우저 탭 정리 완료. 문서 후속 커밋만 push하고 재배포하지 않는다. 다음 heartbeat는 문서 CI·Git·공개 alias부터 재확인한다. 다음 확정 UX 개선 후보는 NBack 시간 제한 없는 연습에서 비활성인 자동 전환 설정의 안내 불일치다. 초기 WebKit 지연은 같은 실패 실행의 내부 계측이 없으면 원인을 단정하지 않고, 가이드/복습 자체의 포인터 진입 초점은 별도 미검증 범위로 남긴다. 종료는 사용자 요청대로2026-09-25 00:00 KST이며 자동화22 ACTIVE 유지.

## 20:00 후속 — 도형 기억 무제한 연습의 설정 안내 일치

- 시작 시각 20:00:51 KST, 원본 `34725e4` clean·origin/main 일치, 공개 alias는 이전 검증본 `dpl_AddTR8jgQUEQ37pV1aZjqY54TU8k` 유지. 앞선 실행 종료 및 4187 listener 없음 확인. 문서 후속 CI35990402148도 성공했다. 사용자 종료 시각 2026-09-25 00:00 KST 유지.
- 확인된 UX 문제: `guidedPacing`이면 NBack의 300ms 빠른 전환과 문제 간격 타이머가 이미 꺼지지만, 시작 전 자동 전환 선택지 2개는 활성 표시되고 자동 이동을 안내했다. `NBackPracticeOptions` 단일 호출자에 기존 guidedPacing을 전달하고 해당 fieldset만 native disabled로 표시한다. 직접 다음 도형으로 이동하며 무제한을 끄면 다시 적용된다는 안내를 연결했다. 기존 disabled/style을 재사용하고 hover만 비활성에서 제외한다(Ponytail lite). 새 상태·효과·의존성·타이머·규칙·채점·저장 스키마 변경 없음.
- 독립 코드 검토에서 신규 P1/P2 위험 없음. 난이도·도형 묶음 변경은 계속 가능하며 저장된 fast/fixed는 유지한다. 실전형 UI와 실제 Context=false/progression=fixed 경계는 그대로다. 일반 문제 간격 조절 UI 및 기존 결과의 저장된 선호값은 이번 범위에서 바꾸지 않았다.
- 신규 `e2e/nback-guided-settings.spec.ts` 검사 2개: ON 시 disabled/설명/Tab 건너뛰기, 난이도·묶음 사용, reload 이후 ON+fast 유지, Space로 OFF·Tab/방향키·다시 reload 복원; fast+무제한 조합에서 3초 이상 경과해도 warmup/선택 답이 자동 진행하지 않고 직접 완료·v4 결과/복습 각 1개 저장. 기존 Playwright Desktop WebKit focus 프로젝트에도 두 검사를 등록했다. 사용자 기록과 분리된 테스트 컨텍스트만 사용한다.
- 수정 전 공개 설정 검사 1개는 disabled 속성이 없어서 **예상 실패(RED)**: `C:\TEMP\cg-nback-guided-production-red-20260924`. HTML report 경로가 결과 폴더 안이라는 도구 경고가 있었으나 실제 검사·trace·실패 캡처가 남았고 다음 실행부터 report를 형제 경로로 분리했다. 도구 경고를 제품 오류로 세지 않는다.
- G: 제품 2파일·신규 검사와 C:\TEMP 검증본 SHA256 일치. 타입·전체 lint·전체 단위(exit0)·production build·신규 검사 추가 타입/lint 통과. 로컬 Chromium **7/7(54.3초)**: 새 2개+기존 Tab 체크박스 4개+NBack 일시정지/겹친 만료 경계 1개. `C:\TEMP\cg-nback-guided-local-20260924` 및 형제 `-report`에 보존. 이 시점은 새 제품 커밋/공개 배포 전이다.
- 로컬 IAB1265×712 홈 렌더·NBack 진입·무제한 ON·세부 설정에서 실제 disabled 표시/안내를 직접 캡처 확인했고 console error0. 토글 OFF로 원복 후 Esc·임시 탭 종료. 별도 기존 레이아웃 후보도 발견했다: 이 폭에서 NBack 도형 묶음 3열 카드의 문구가 한 글자씩 세로로 꺾인다. 원인 읽기 검토 후 다음 독립 수정으로 분리한다. 이전 간헐적 WebKit 초기 지연은 이번 수정으로 해결됐다고 주장하지 않는다.
- Desktop WebKit 최초 **1통과/1실패(2.1분)**: `C:\TEMP\cg-nback-guided-webkit-local-20260924` 및 형제 `-report`. 수동 진행/완료/저장 검사는 통과. 설정 검사는 ON·비활성·첫 reload·OFF·Tab/화살표까지 통과한 뒤 두 번째 reload 후 홈 카드 click15초 대기에서 실패했다. 같은 코드·timeout으로 실패 1개만 별도 재검사 **1/1(42.2초)**: `C:\TEMP\cg-nback-guided-webkit-followup-20260924` 및 형제 `-report`. 최초를 2/2로 바꾸지 않는다. 추가 config/test lint 통과·등록된 전체 브라우저 검사 145개 확인.
- 제품/검사/config 4개 원본↔검증본 SHA256 일치·diff check 통과. 선택 5파일만 커밋/push하여 전체 원격 CI145개를 검증한다. WebKit 재진입 실패 trace는 별도 읽기 검토하며 공개 승격 전에는 원격 성공이 필요하다.
- 제품 커밋 `9a63f443393bd38a5190978b36570b7db2df2630` main push 완료. [CI35992330793](https://github.com/heotaewoong/competency-game/actions/runs/35992330793) 진행 중. 정확한 SHA의 clean 릴리스 복사본에서 후보 배포를 한 번 생성했다: `dpl_GZhGYi5LAqq4aBrncKB6WF4mLFb5`, `https://competency-game-lmh80agcz-heotaewoongs-projects.vercel.app`. READY/production·commit metadata 일치·인증 HTTP200, Next16.3.3/Node22/빌드50초/npm audit0. 지정 공개 alias는 이전 검증본을 유지하며 CI 성공 전 승격하지 않는다.
- WebKit 실패 trace 독립 검토: 마지막 reload 후 click 안정성 검사에9.05초가 걸렸고, 스크롤 뒤 실제 클릭 전달을 뜻하는 `performing click action` 로그 없이15초 제한이 끝났다. trace의 input 메타데이터는 실제 action보다 먼저 생성되므로 클릭 성공 증거로 쓰지 않는다. 기록은 reload 직후 busy=true에서 실패 직후false가 됐지만 게임 로딩 UI·dialog·lazy chunk 요청은 없었다. 이번 실패는 클릭 전달 전 검사 지연으로 분류하며 설정 저장 오류나 클릭 후 로딩 오류로 단정하지 않는다. 원인은 아직 미확정이다.
- 다음 레이아웃 후보의 원인도 읽기 확인했다. intro 컨테이너980px 이상에서 두 단으로 배치되지만 왼쪽 묶음 카드는3열이며, 카드 안의 미리보기 최소92px·패딩·간격이 텍스트 폭을 잠식한다. 기존 모바일 세로 카드 규칙은 viewport620px 이하에서만 적용된다. 후속은 기존 묶음 grid 선택자에 카드 최소폭 기반 자동 열을 검토하고1265×712·컨테이너980px 전후·화면620/621px에서 검증한다. 아직 해당 CSS나 게임 규칙은 수정하지 않았다.
- 후보 대기 중 로컬 IAB 추가 시각 검수: 383×778 세로와 844×360 가로에서 비활성 선택지·새 안내·고정 시작 버튼·닫기 버튼을 직접 확인했다. 가로 화면 intro의 가로 넘침=false, panel.scrollTop=0, console error0. 무제한 OFF로 복원하고 viewport override reset·임시 탭 닫기·소유한 4187 서버 종료를 완료했다. 사용자 공개 탭의 설정/기록은 조작하지 않았다.
- [CI35992330793](https://github.com/heotaewoong/competency-game/actions/runs/35992330793) **성공(14분28초)**: 단위203/203·브라우저145/145(12.9분)·타입·전체 lint·production build, 실패/불안정 재시도 없음. 지정 alias가 이전 배포를 유지함을 확인한 뒤 동일 후보 `dpl_GZhGYi5LAqq4aBrncKB6WF4mLFb5`만 promote한다. GitHub runner의 Action Node20 강제Node24 및 추후 Ubuntu26 전환 안내는 CI 환경 경고이며 앱 Node22 실패가 아니다. 이번 범위에서 CI 환경 버전을 변경하지 않았다.
- 동일 후보를 한 번 promote 완료. 지정 공개 alias→`dpl_GZhGYi5LAqq4aBrncKB6WF4mLFb5`, HTTP200·redirect0 확인. 최근30분 Vercel error 로그 없음(Drains 미조회). 공개 사이트 별도 Chromium·Desktop WebKit·Mobile Safari 회귀18개는 진행 중이다.
- 공개 IAB에서도 진행 중 게임/모달이 없음을 확인한 뒤 새로고침했다. 기존 완료 기록5회 유지→NBack 진입→원래 무제한=false 확인→ON/세부 설정에서 disabled=true·새 안내·기존 고정 간격 선택 유지→OFF 후 disabled=false/안내 제거→Esc 뒤 원래 카드 초점·inert0·기록5회 유지까지 직접 확인했다. 새 안내가 보이는 383×778 공개 캡처를 검수했고 console error0. 게임 완료/기록 추가·삭제는 하지 않았으며 토글은 원래 값으로 복원했다.
- 공개 최초 결과는 **17통과/1실패(6.2분)**: `C:\TEMP\cg-nback-guided-production-20260924` 및 형제 `-report`. 새 설정/수동 완료 검사는 Chromium·Desktop WebKit 양쪽 모두 통과했고 Chromium7개와 Mobile Safari5개도 통과했다. 실패는 기존 Desktop WebKit1280×900 Tab 체크박스 검사의 전체90초 제한이다. 최초를18/18로 보고하지 않는다.
- 실패 trace 독립 검토: 게임 진입→Tab 초점·geometry·캡처→Space로ON·초점 유지→panelScrollTop 확인→Esc 종료(stage count0)까지 통과했다. 마지막 opener toBeFocused가 mismatch/결과 없이 전체 timeout으로 중단됐고 최종 console 배열 검사는 미실행이다. lazy chunk2개는 HTTP200·27.3/27.6ms였고 여러 query/Tab 명령의2~4.5초 지연이 누적됐다. Windows 여유 메모리986052KB/전체16119016KB도 관찰했으나 원인으로 단정하지 않는다. 같은 코드·timeout으로 실패1개만 별도 재검사한다.
- 공개 실패1개의 후속도 **0통과/1실패(16.3초)**: `C:\TEMP\cg-nback-guided-production-followup-20260924` 및 형제 `-report`. 이번에는 카드 클릭 뒤 NBack stage visible5초에서 실패해 Tab/체크박스 검사에 진입하지 못했다. 최초의90초 누적 지연과 다른 실패 경계로 구분하며 추가 반복이나 timeout 확대는 하지 않는다. 새 설정 검사와 직접 공개 조작은 정상이고 원격 CI145/145도 통과했으나, **공개 전체18/18 또는 WebKit 지연 해결로 보고하지 않는다.**
- 제품 릴리스는 `9a63f44`/`dpl_GZhGYi5LAqq4aBrncKB6WF4mLFb5`를 유지한다. 남은 우선 항목은 Windows WebKit의 실제 실패 실행에서 네트워크 완료→JS 평가/React commit/입력·검사 지연을 구분하는 내부 계측이다. 게임 규칙·타이머를 추측으로 바꾸거나 사용자 앱을 종료하지 않는다. 그다음은 확인된 NBack 묶음 카드의 좁은 텍스트 레이아웃이다. 문서 후속 커밋은 재배포하지 않으며 종료 시각2026-09-25 00:00 KST와 자동화22 ACTIVE를 유지한다.
- 후속 실패 trace 추가 분리: 실제 click action 실행/완료 후 `stage-loading`이 표시됐고 게임 청크2개는 HTTP200·47.1/59.6ms로 수신됐다. stage visible5초 실패 후 약211ms의 snapshot에는 NBack dialog가 존재하며 기록 복원도 이미 busy=false다. 새 옵션 조작 전의 지연이므로 원인이라고 단정하지 않는다. 다음 계측은 특히 동적 import 완료→GameStage mount/효과→DOM 표시 구간을 우선한다. 실패 증거와 이후 snapshot을 분리해 보존했고 새 검사 실행/배포 프로세스는 모두 종료됐다.
