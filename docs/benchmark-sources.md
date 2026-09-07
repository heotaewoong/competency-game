# AI 역량검사 게임 벤치마크·근거 인벤토리

> 검증일: 2026-09-08 (Asia/Seoul)
> 목적: 공개적으로 확인 가능한 JOBDA 게임 mechanics와 인지과제·채용평가·접근성 근거를 분리해, 연습용 사이트 구현에 사용할 수 있는 기준을 남긴다.  
> 주의: 이 문서는 **연습 서비스 설계용 근거 목록**이다. JOBDA의 비공개 문항, 채점식, 난수 생성, 평가모형을 복제하거나 추정하는 사양서가 아니다.

## 0. 근거 등급

| 등급 | 의미 | 사용 원칙 |
|---|---|---|
| A1 | JOBDA/MIDAS 공식, 정부·표준기관·공공기관의 1차 자료 | 공개된 사실로 기술할 수 있다. 단, 버전·기업 설정 차이는 따로 표시한다. |
| A2 | 동료심사 논문·학술 리뷰·고전 원전 | 인지과제와 측정 설계의 근거로 쓴다. JOBDA의 실제 채점식 근거로 오인하지 않는다. |
| B | 개인 후기·커뮤니티·비공식 연습 도구 | 화면 이해와 사용성 가설에만 쓴다. 시간·문항 수·점수 규칙을 확정하지 않는다. |

## 1. 가장 중요한 버전 경고

- 2023 JOBDA 공개 레거시 튜토리얼 번들은 게임 코드 `RPS, MRT, PM, RMT, PCT2, OTN, FNB, HAS, WNC` **9개**를 노출한다.
- 구 역량검사 연습 랜딩의 문구에는 “총 8개 게임”이 남아 있다.
- 따라서 구현은 9개 모듈을 지원하되, 실제 기업 응시는 배정 버전·검사 코드에 따라 일부 모듈이 빠질 수 있다는 안내를 보여줘야 한다.
- 공식 공개 페이지는 “구 역량검사 연습”으로 표시되므로, 픽셀 단위 복제품이나 현재 실전과 동일하다는 표현은 피한다.
- [2024 JAINWON 공개 기업자료](https://recruit.jobda.im/hubfs/TREND%20REPORT_HR%20%EA%B3%A0%EB%AF%BC%EC%9E%88%EC%8A%B5%EB%8B%88%EB%8B%A4_2%ED%8E%B8.pdf)는 9개 게임을 모두 4분으로 제시한다. 2023 레거시 시간과 충돌하므로 실제 응시에서는 기업 초대 안내를 우선한다.
- [현행 응시 안내](https://www.jobda.im/acca/test)는 전체 검사 약 80분과 큰 검사 범주만 공개한다. 게임별 현재 문항 수·시간·점수식은 공개값으로 단정하지 않는다.
- [2026 JOBDA Upgrade Report v8.4.0](https://contents.h.place/hubfs/Readme%20%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C%20%ED%8C%8C%EC%9D%BC/%EC%97%85%EB%8D%B0%EC%9D%B4%ED%8A%B8%20%EB%A6%AC%ED%8F%AC%ED%8A%B8/%5B%EC%97%AD%EA%B2%80%5D%20Upgrade%20Report_v8.4.0%201.pdf)는 과제 설명·연습과 실전 응시를 분리한 흐름을 보여준다. 구현은 이 정보 구조만 참고하고 화면·브랜드·자산은 독립적으로 설계한다.

## 2. 공개 mechanics: 9개 게임

| 코드 | 게임 | 2023 공개 레거시 내용 | 2023 시간/입력 | 구현 가능한 핵심 상태 |
|---|---|---|---|---|
| RPS | 가위바위보 | 총 3라운드. 1R 나의 관점, 2R 상대 관점, 3R 두 관점이 무작위로 제시된다. 목표 관점에 따라 이기기/지기를 판단하고 가위·바위·보를 방향키 ←·↓·→로 입력한다. | 약 3분 / 키보드 | `RULE_CUE → HAND_STIMULUS → KEY_RESPONSE → NEXT` |
| MRT | 도형 회전하기 | 글자 또는 도형의 전·후 모양을 보고 좌45°, 우45°, 좌우반전, 상하반전을 조합한다. 회전 1회는 45°이며 최대 클릭 횟수가 있다. | 약 6분 / 마우스 | `PUZZLE_READY → COMPOSE_TRANSFORMS → SUBMIT → EVALUATE` |
| PM | 약속 정하기 | 세 친구의 요일·장소·메뉴·버스 정보를 순차 기억한다. 1–3R은 모두가 고른 항목, 4R은 누구도 타지 않은 버스를 고른다. | 약 4분 / 마우스 | `SHOW_1 → SHOW_2 → SHOW_3 → QUERY → CHOOSE` |
| RMT | 길 만들기 | 모든 교통수단이 지정 손님에게 가도록 진행 방향을 90° 바꾸는 울타리를 최소 개수로 설치한다. 경로는 겹쳐도 되고 난이도와 차량 수가 증가한다. | 레거시 카드 약 3분·공식 영상 5분 / 마우스 | `BOARD_READY → EDIT_FENCES → SUBMIT → SIMULATE` |
| PCT2 | 마법약 만들기 | 네 재료 조합을 보고 빨간/파란 약 중 더 가능성 높은 결과를 학습한다. 결과는 100% 결정적이지 않고 개별 카드가 아니라 전체 조합이 결과를 좌우한다. | 약 6분 / 마우스 | `SHOW_COMBO → PREDICT → STOCHASTIC_FEEDBACK → UPDATE` |
| OTN | 숫자 누르기 | 총 2라운드. 1R은 제시 숫자, 2R은 1–9 숫자를 규칙에 따라 누른다. 숫자판 배열이 바뀌며 건너뛰기·두 번 누르기 규칙이 있다. | 약 3분 / 마우스 | `SHOW_RULE → SHOW_SIGNAL → CLICK_SEQUENCE → NEXT` |
| FNB | 도형 순서 기억하기 | 총 2라운드. 1R은 현재 도형을 두 번째 전과, 2R은 두 번째/세 번째 전 조건에 맞춰 비교한다. | 약 3분 / 키보드 | `STREAM_STIMULUS → N_BACK_DECISION → UPDATE_BUFFER` |
| HAS | 고양이 술래잡기 | 생쥐 위치를 기억해 고양이가 생쥐를 찾았는지 판단하고, 그 판단에 대한 확신도도 응답한다. 진행할수록 쥐와 고양이 수가 늘어난다. | 약 4분 / 마우스 | `ENCODE_MICE → SHOW_CATS → HIT_DECISION → CONFIDENCE` |
| WNC | 개수 비교하기 | 좌우에 나타난 두 단어군 중 **개수가 더 많았던 단어**를 선택한다. 글자 크기·의미가 아니라 개수가 기준이며 수가 많고 비슷해진다. 공식 영상은 단어 1초 제시·생각 3초를 안내한다. | 약 3분 / 마우스 | `BRIEF_DISPLAY → MASK/QUERY → LEFT_OR_RIGHT → NEXT` |

### 2.1 게임별 공개 mechanics 근거 매핑

각 행의 시간·조작·팁은 [2023 공개 레거시 튜토리얼 번들](https://jobda.acca.ai/static/chunk/js/tutorial.a83495cf0f099a48faad.js)에서 확인했고, 아래 2023 개발사 공개 글·영상으로 실제 화면과 라운드 설명을 교차 확인했다.

| 게임 | JOBDA 공식 글 | 잡다 공식 영상 |
|---|---|---|
| 가위바위보 | <https://www.jobda.im/info/335> | <https://www.youtube.com/watch?v=AcS2bKk-ZZg> |
| 도형 회전하기 | <https://www.jobda.im/info/336> | <https://www.youtube.com/watch?v=yu5-fuA2jC0> |
| 약속 정하기 | <https://www.jobda.im/info/337> | <https://www.youtube.com/watch?v=FTo_F_Yz4g4> |
| 길 만들기 | <https://www.jobda.im/info/338> | <https://www.youtube.com/watch?v=GpNCcqaxrL4> |
| 마법약 만들기 | <https://www.jobda.im/info/339> | <https://www.youtube.com/watch?v=qTKFQYPUg2Y> |
| 숫자 누르기 | <https://www.jobda.im/info/340> | <https://www.youtube.com/watch?v=lb34gWLkExw> |
| 도형 순서 기억하기 | <https://www.jobda.im/info/341> | <https://www.youtube.com/watch?v=SrZq-Qv-5dU> |
| 고양이 술래잡기 | <https://www.jobda.im/info/342> | <https://www.youtube.com/watch?v=kwptjPJRXRQ> |
| 개수 비교하기 | <https://www.jobda.im/info/343> | <https://www.youtube.com/watch?v=GpFOO5wc2d0> |

게임별 표의 기본 총시간은 2023 공개 레거시 카드의 “약” 표기다. 다만 길 만들기는 같은 시기 공식 영상에서 5분으로 안내해 카드의 약 3분과 상충한다. 2024 공개 기업자료도 9개 모두 4분으로 달라 현행 설정으로 단정할 수 없다. 문항 수, 오답 피드백, 점수식과 대부분의 세부 자극 노출시간은 공개되지 않았다. 개수 비교하기는 2023 공식 영상에서 단어 1초 제시·생각 3초를 별도로 공개한다.

## 3. 구현 사양: 도형 회전하기

### 3.1 공식/공식 영상에서 확인된 입력과 화면

- 자극: 글자·기호 실루엣 또는 두 색 패턴의 “전”과 “후”.
- 변환 버튼: `왼쪽 45° 회전`, `오른쪽 45° 회전`, `좌우반전`, `상하반전`.
- 공식 영상 화면에는 순서가 있는 답안 슬롯 1–8, `하나 지움`, `전체 초기화`, `답안 제출`, 남은 클릭 횟수가 보인다.
- 변환은 클릭 순서대로 합성해야 한다. 반전과 회전은 교환법칙이 성립하지 않으므로 큐의 순서를 보존한다.
- 정답 조건은 `apply(before, transformQueue) == after`.

### 3.2 상태 머신

| 현재 상태 | 이벤트 | 가드 | 효과 | 다음 상태 |
|---|---|---|---|---|
| `ROUND_INTRO` | 시작 | — | 타이머·문항 초기화 | `PUZZLE_READY` |
| `PUZZLE_READY` | 변환 버튼 | 예산 > 0, 슬롯 여유 | 변환 큐 끝에 연산 추가 | `COMPOSING` |
| `COMPOSING` | 변환 버튼 | 예산 > 0, 슬롯 여유 | 연산 추가, 클릭 예산 갱신 | `COMPOSING` |
| `COMPOSING` | 하나 지움 | 큐 비어 있지 않음 | 마지막 연산 제거 | `COMPOSING` |
| `COMPOSING` | 전체 초기화 | — | 큐 비움 | `PUZZLE_READY` |
| `PUZZLE_READY/COMPOSING` | 답안 제출 | 큐 검증 가능 | 순차 변환 결과를 목표와 비교 | `FEEDBACK_OR_ADVANCE` |
| `FEEDBACK_OR_ADVANCE` | 다음 | 남은 문항 있음 | 새 자극·큐 초기화 | `PUZZLE_READY` |
| 아무 상태 | 시간 종료 | — | 입력 잠금·세션 기록 | `END` |

권장 데이터 모델:

```text
transform ∈ {ROTATE_LEFT_45, ROTATE_RIGHT_45, FLIP_HORIZONTAL, FLIP_VERTICAL}
queue: ordered transform[]
maxSlots: configurable (공식 2023 영상은 8칸)
clickBudget: configurable
```

### 3.3 공개되지 않아 설정값으로 둘 항목

- 실제 최신 실전의 문항 수, 글자/패턴 라운드 순서, 라운드별 시간.
- `하나 지움`·`전체 초기화`가 클릭 예산을 차감하는지, 예산이 문항/라운드/전체 중 어느 범위에서 초기화되는지.
- 최소 연산 보너스, 오답 감점, 부분점수 식.
- 공식 영상의 8개 슬롯과 4×4 격자 도형 디자인은 2023 공개 영상 관찰값이며 현재 기업 배정 버전의 보장은 아니다.

### 3.4 로컬 노트의 관련 이미지(저장소 미포함)

다음 파일은 원 작성 노트의 외부 첨부 폴더에 있으며 이 저장소에는 포함하지 않는다.

- 공식 영상 캡처로 노트에 배치된 파일: `Pasted image 20260827220411.png`, `Pasted image 20260827220439.png`, `Pasted image 20260827220451.png`, `Pasted image 20260827220535.png`, `Pasted image 20260828110148.png`, `Pasted image 20260828110103.png`, `Pasted image 20260828110354.png`, `Pasted image 20260828110838.png`.
- 후기 도식(비공식): `JOBDA-kimmalcha-rotation-anchor.png`, `JOBDA-kimmalcha-rotation-pattern-1.png`, `JOBDA-kimmalcha-rotation-pattern-2.png`.
- “기준점 이름 붙이기”는 기억 보조 전략으로는 쓸 수 있지만 JOBDA 공식 채점 원리나 보장된 공략법으로 표시하면 안 된다.

## 4. 구현 사양: 약속 정하기

### 4.1 라운드별 자극과 정답 함수

| 라운드 | 사람별 자극 | 질문/버튼 | 정답 조건 |
|---|---|---|---|
| 1 요일 | 친구 3명의 선호 요일. 공식 영상은 전반 3개, 후반 4개 예시를 보인다. | 월–일 7개 버튼 | `intersection(S1,S2,S3)`의 공통 요일 |
| 2 장소 | 4×4=16칸 장소판에서 각 친구의 선호 칸 3개, 후반 4개 예시. | 16칸 장소 선택 | `intersection(S1,S2,S3)`의 공통 칸 |
| 3 메뉴 | 각 친구의 메뉴 이미지 3개, 후반 4개 예시. | 메뉴 이미지 버튼 | `intersection(S1,S2,S3)`의 공통 메뉴 |
| 4 버스 | 각 친구가 타고 온 버스 번호 묶음. | 후보 번호 버튼 | `choices \ union(S1,S2,S3)`의 누구도 타지 않은 번호 |

### 4.2 상태 머신

| 현재 상태 | 이벤트 | 효과 | 다음 상태 |
|---|---|---|---|
| `ROUND_INTRO` | 시작 | 라운드 유형·시도 초기화 | `SHOW_PERSON_1` |
| `SHOW_PERSON_1` | 노출시간 종료 | 첫 정보 숨김 | `SHOW_PERSON_2` |
| `SHOW_PERSON_2` | 노출시간 종료 | 둘째 정보 숨김 | `SHOW_PERSON_3` |
| `SHOW_PERSON_3` | 노출시간 종료 | 셋째 정보 숨김, 질의 생성 | `QUERY` |
| `QUERY` | 선택 버튼 클릭 | 선택 즉시 기록·집합식으로 판정 | `FEEDBACK_OR_NEXT` |
| `FEEDBACK_OR_NEXT` | 다음 | 다음 시도 또는 다음 라운드 | `SHOW_PERSON_1/ROUND_INTRO` |
| 아무 상태 | 시간 종료 | 입력 잠금·세션 기록 | `END` |

공식 영상 화면에서는 별도 제출 버튼보다 선택 버튼이 답안 입력 역할을 한다. 정확한 노출시간, 시도 수, 오답 피드백 시간, 사람별 버스 수는 공개되지 않았으므로 설정값으로 둔다.

### 4.3 로컬 노트의 관련 이미지

- 공식 영상 캡처로 노트에 배치된 파일: `Pasted image 20260827221613.png`, `Pasted image 20260827221231.png`, `Pasted image 20260828174506.png`, `Pasted image 20260827221355.png`, `Pasted image 20260827221410.png`, `Pasted image 20260827221632.png`.
- 후기 도식(비공식): `JOBDA-kimmalcha-appointment-day-location.png`, `JOBDA-kimmalcha-appointment-food-bus.png`.
- “1–3R 소거, 4R 누적”은 2023 공개 레거시 튜토리얼 번들에도 적힌 개발사 공개 팁이다. 다만 후기에서 제안하는 암기 약어는 개인 전략이다.

## 5. 구현 사양: 길 만들기

### 5.1 공식/공식 영상에서 확인된 규칙

- 보드: 공식 2023 영상 예시는 5×5 격자이고, 차량과 대응 손님이 네 변 바깥에 배치된다.
- 셀 입력: 대각 울타리 `/` 또는 `\`를 설치하고 다시 클릭해 제거한다. 안전한 모델은 셀당 `NONE | SLASH | BACKSLASH` 하나다.
- 이동: 차량은 직진하고 울타리를 만나면 90° 반사된다.
- 경로 길이와 경로 중첩은 정답에 영향을 주지 않는다. 같은 울타리를 여러 차량이 공유할 수 있다.
- 기능 성공: 모든 차량이 자기 손님에게 도착해야 한다. 하나라도 실패하면 공식 영상 표현상 오류 처리된다.
- 최대 득점: 설치 울타리 수가 화면의 `정답의 울타리 수`와 같아야 한다. 공식 영상은 초과 시도/초과 울타리로 획득 점수가 감소한다고 설명한다.
- 화면에는 `클릭 가능 횟수`, `정답의 울타리 수`, `제출` 버튼이 보인다.

### 5.2 반사 함수

```text
SLASH "/":     UP→RIGHT, RIGHT→UP, DOWN→LEFT, LEFT→DOWN
BACKSLASH "\": UP→LEFT, LEFT→UP, DOWN→RIGHT, RIGHT→DOWN
```

### 5.3 상태 머신

| 현재 상태 | 이벤트 | 가드 | 효과 | 다음 상태 |
|---|---|---|---|---|
| `PUZZLE_READY` | 셀/대각 클릭 | 클릭 예산 > 0 | 울타리 설치·교체·제거, 예산 갱신 | `EDIT_BOARD` |
| `EDIT_BOARD` | 셀/대각 클릭 | 클릭 예산 > 0 | 보드 갱신 | `EDIT_BOARD` |
| `PUZZLE_READY/EDIT_BOARD` | 제출 | — | 각 차량을 독립 시뮬레이션 | `SIMULATE` |
| `SIMULATE` | 종료 | 모든 차량 도착 여부 계산 | 기능 정답과 최대득점 조건을 따로 기록 | `FEEDBACK_OR_NEXT` |
| `FEEDBACK_OR_NEXT` | 다음 | 남은 문제 있음 | 보드·예산·목표 수 초기화 | `PUZZLE_READY` |
| 아무 상태 | 시간 종료 | — | 입력 잠금·세션 기록 | `END` |

시뮬레이터는 `(vehicleId, row, col, direction)` 방문 상태를 저장해 루프를 탐지해야 한다. 보드 이탈, 잘못된 손님 도착, 루프는 해당 차량 실패다.

```text
functionalCorrect = every(vehicle reaches assignedCustomer)
maxScoreCondition = functionalCorrect && placedFenceCount == targetFenceCount
```

초과 울타리 제출이 “오답”인지 “정답이지만 감점”인지는 공개 영상 설명만으로 완전히 확정되지 않는다. 따라서 연습 모드에서는 두 조건을 분리해 보여주는 것이 정직하다.

### 5.4 로컬 노트의 관련 이미지

- 공식 영상 캡처로 노트에 배치된 파일: `Pasted image 20260827222341.png`, `Pasted image 20260827222502.png`, `Pasted image 20260827222641.png`, `Pasted image 20260827222904.png`, `Pasted image 20260828104829.png`, `Pasted image 20260828104930.png`, `Pasted image 20260828105142.png`.
- 후기 도식(비공식): `JOBDA-kimmalcha-path.png`.
- 셀 하나에 두 대각 울타리를 동시에 둘 수 있는지, 교체 클릭의 정확한 히트영역, 클릭 예산의 차감/복원 규칙은 공개 자료로 확정되지 않았다.

## 6. 검증된 과학과 추정 팁의 경계

| 항목 | 검증 상태 | 제품에 쓰는 방식 |
|---|---|---|
| 게임 이름·대략 시간·입력 도구·개발사 공개 팁 | 2023 공개 레거시 번들에서 확인 | 사실로 표시하되 “2023 레거시”, “약”을 붙이고 현행 초대 안내를 우선한다. |
| 2023 공식 영상의 구체적 UI | 잡다 공식 채널 영상에서 확인 | 레거시 참고로 사용하고 최신 실전 동일성을 주장하지 않는다. |
| 길 만들기 5×5 보드, 도형 회전 4×4 격자·8개 변환 슬롯, 전/후반 자극 증가 | 공식 영상 화면 관찰 | 레거시 공개 화면값으로 표시하고 최신 실전 동일성을 주장하지 않는다. |
| 문항 수·대부분의 노출 밀리초·난수 분포·정확한 점수식 | 공개 확인 불가 | 개수 비교 1초 제시·3초 생각처럼 명시된 예외 외에는 하드코딩하지 않고 임의 연습 난이도라고 표시한다. |
| 도형 이름 붙이기, 손가락 암기, 특정 패턴 공식 | 후기·개인 전략 | “연습 팁”으로만 제공하고 합격 보장 표현을 금지한다. |
| N-back·정신회전·계획·확률학습·메타인지의 측정 근거 | 동료심사 문헌 존재 | 연습 로그와 피드백 설계에 사용하되 JOBDA 채점식으로 오인하지 않는다. |
| 연습 점수 상승 = 실제 직무역량 상승 | 근거 불충분 | 숙련/재검사 효과와 일반화 한계를 함께 고지한다. |

## 7. 중복 제거 URL 인벤토리

- 아래 표는 정확한 URL 기준으로 중복 제거했다.
- A2 논문은 JOBDA mechanics의 직접 증거가 아니라, 과제 설계·신뢰도·공정성 검토 근거다.
- B 자료는 공식 자료와 충돌하면 사용하지 않는다.

**고유 URL 수: 129개**

| # | 범주 | 등급 | 정확한 URL | 한 줄 설계 시사점 |
|---:|---|:---:|---|---|
| 1 | JOBDA 공식 | A1 | <https://www.jobda.im/acc/tutorial> | 공개 튜토리얼의 과제 구성·연습 진입점과 구 버전 표기를 확인한다. |
| 2 | JOBDA 공식 | A1 | <https://jobda.acca.ai/tutorial> | 2023 공개 레거시 튜토리얼의 카드·과제 흐름을 참고하되 현행 실전과 동일하다고 보지 않는다. |
| 3 | JOBDA 공식 | A1 | <https://jobda.acca.ai/static/chunk/js/tutorial.a83495cf0f099a48faad.js> | 2023 공개 레거시의 9개 게임 코드, 당시 소요시간, 조작 도구, 설명과 팁을 대조한다. |
| 4 | JOBDA 공식 | A1 | <https://www.youtube.com/playlist?list=PLRvhT8gNnOeoZNbmGq7GjImm7CC7e7-XU> | 잡다 공식 게임 해설 영상 묶음의 출처와 순서를 확인한다. |
| 5 | JOBDA 공식 | A1 | <https://www.jobda.im/info/335> | 가위바위보의 공식 해설·영상 연결을 기준으로 규칙 표현을 제한한다. |
| 6 | JOBDA 공식 | A1 | <https://www.jobda.im/info/336> | 도형 회전하기의 공식 해설·영상 연결을 기준으로 회전/반전 UI를 검증한다. |
| 7 | JOBDA 공식 | A1 | <https://www.jobda.im/info/337> | 약속 정하기의 공식 해설·영상 연결을 기준으로 네 라운드 규칙을 검증한다. |
| 8 | JOBDA 공식 | A1 | <https://www.jobda.im/info/338> | 길 만들기의 공식 해설·영상 연결을 기준으로 울타리·경로 규칙을 검증한다. |
| 9 | JOBDA 공식 | A1 | <https://www.jobda.im/info/339> | 마법약 만들기의 확률학습 규칙과 공식 설명을 확인한다. |
| 10 | JOBDA 공식 | A1 | <https://www.jobda.im/info/340> | 숫자 누르기의 라운드·건너뛰기·두 번 누르기 규칙을 확인한다. |
| 11 | JOBDA 공식 | A1 | <https://www.jobda.im/info/341> | 도형 순서 기억하기의 2-back/2·3-back 비교 규칙을 확인한다. |
| 12 | JOBDA 공식 | A1 | <https://www.jobda.im/info/342> | 고양이 술래잡기의 위치기억과 확신도 응답 구조를 확인한다. |
| 13 | JOBDA 공식 | A1 | <https://www.jobda.im/info/343> | 개수 비교하기가 글자 크기·뜻이 아닌 개수를 묻는 과제임을 확인한다. |
| 14 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=AcS2bKk-ZZg> | 가위바위보의 실제 자극·방향키 매핑·라운드 시각 흐름을 참고한다. |
| 15 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=yu5-fuA2jC0> | 도형 회전하기의 4개 변환 버튼, 답안 슬롯, 초기화·제출 UI를 참고한다. |
| 16 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=FTo_F_Yz4g4> | 약속 정하기의 요일·16칸 장소·메뉴·버스 자극과 선택 화면을 참고한다. |
| 17 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=GpNCcqaxrL4> | 길 만들기의 5×5 보드, 울타리 방향, 클릭/정답 울타리 수 UI를 참고한다. |
| 18 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=qTKFQYPUg2Y> | 마법약 만들기의 네 재료 조합과 확률적 피드백 화면을 참고한다. |
| 19 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=lb34gWLkExw> | 숫자 누르기의 숫자판 재배치와 억제 규칙 화면을 참고한다. |
| 20 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=SrZq-Qv-5dU> | 도형 순서 기억하기의 연속 자극과 키보드 판단 흐름을 참고한다. |
| 21 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=kwptjPJRXRQ> | 고양이 술래잡기의 위치 판단 뒤 확신도 응답 흐름을 참고한다. |
| 22 | JOBDA 공식 영상 | A1 | <https://www.youtube.com/watch?v=GpFOO5wc2d0> | 개수 비교하기의 좌우 단어군, 1초 제시·3초 생각, 선택 흐름을 참고한다. |
| 23 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/335> | 가위바위보 공식 글 제목과 영상 ID의 정본 메타데이터를 확인한다. |
| 24 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/336> | 도형 회전하기 공식 글 제목과 영상 ID를 확인한다. |
| 25 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/337> | 약속 정하기 공식 글 제목과 영상 ID를 확인한다. |
| 26 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/338> | 길 만들기 공식 글 제목과 영상 ID를 확인한다. |
| 27 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/339> | 마법약 만들기 공식 글 제목과 영상 ID를 확인한다. |
| 28 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/340> | 숫자 누르기 공식 글 제목과 영상 ID를 확인한다. |
| 29 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/341> | 도형 순서 기억하기 공식 글 제목과 영상 ID를 확인한다. |
| 30 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/342> | 고양이 술래잡기 공식 글 제목과 영상 ID를 확인한다. |
| 31 | JOBDA 공식 API | A1 | <https://api.jobda.im/post/343> | 개수 비교하기 공식 글 제목과 영상 ID를 확인한다. |
| 32 | JOBDA 공식 | A1 | <https://www.jobda.im/acca/test> | 응시 상품·검사 진입의 현재 공개 안내를 확인한다. |
| 33 | JOBDA 공식 | A1 | <https://www.jobda.im/acca/introduce> | 역량검사의 공식 소개와 해석 범위를 확인한다. |
| 34 | JOBDA 공식 | A1 | <https://www.jobda.im/acca/results> | 결과표가 공개하는 지표 범위를 확인해 연습 점수의 과잉 해석을 막는다. |
| 35 | JOBDA 공식 | A1 | <https://www.jobda.im/acca/test/list> | 공개 연습/응시 과제 목록이 바뀌는지 릴리스 전 확인한다. |
| 36 | JOBDA 공식 | A1 | <https://www.jobda.im/acca/sampleResult> | 샘플 결과표의 용어와 시각 표현을 참고하되 채점 로직은 추정하지 않는다. |
| 37 | JOBDA 공식 | A1 | <https://www.jobda.im/jobdafaq> | 지원 환경·응시 FAQ를 운영 안내와 오류 메시지 설계에 반영한다. |
| 38 | JOBDA Recruit 공식 | A1 | <https://recruit.jobda.im/features/optimize/acca> | 기업용 역량검사의 공식 목적과 운영 맥락을 확인한다. |
| 39 | JOBDA Recruit 공식 | A1 | <https://recruit.jobda.im/features/optimize/fullreport> | 기업용 상세 리포트가 다루는 영역과 사용자 관점을 참고한다. |
| 40 | MIDAS 공식 연구 | A1 | <https://contents.h.place/acca/labnote/37/ai-competency-0> | 역량검사 개발 철학과 과제 해석의 공식 설명을 확인한다. |
| 41 | MIDAS 공식 연구 | A1 | <https://contents.h.place/acca/labnote/31/gamification> | 게임화가 측정과 응시 경험에 미치는 공식 설명을 설계 근거로 사용한다. |
| 42 | MIDAS 공식 연구 | A1 | <https://contents.h.place/acca/labnote/6/lie-detection> | 반응 패턴과 솔직성 설명을 참고하되 비공개 탐지 규칙은 구현하지 않는다. |
| 43 | MIDAS 공식 PDF | A1 | <https://contents.h.place/hubfs/Readme%20%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C%20%ED%8C%8C%EC%9D%BC/%EC%97%85%EB%8D%B0%EC%9D%B4%ED%8A%B8%20%EB%A6%AC%ED%8F%AC%ED%8A%B8/%5B%EC%97%AD%EA%B2%80%5D%20Upgrade%20Report_v8.4.0%201.pdf> | 2026 과제 설명·연습과 실전 응시가 분리된 정보 구조를 참고하되 시각 자산은 독립 설계한다. |
| 44 | JOBDA Recruit 공식 PDF | A1 | <https://recruit.jobda.im/hubfs/TREND%20REPORT_HR%20%EA%B3%A0%EB%AF%BC%EC%9E%88%EC%8A%B5%EB%8B%88%EB%8B%A4_2%ED%8E%B8.pdf> | 채용 담당자 관점의 활용 맥락을 확인해 연습 서비스의 설명 문구를 조정한다. |
| 45 | MIDAS 공식 API 문서 | A1 | <https://midasinhelp.readme.io/reference/%EC%97%AD%EA%B2%80%EC%84%BC%ED%84%B0-%EF%B8%8F-jobda-%EA%B2%B0%EA%B3%BC-%EB%B6%88%EB%9F%AC%EC%98%A4%EA%B8%B0-%EA%B4%80%EB%A6%AC%EC%9E%90%EC%9A%A9> | 공식 결과 연동 API의 존재만 확인하고 비공개 평가값을 모사하지 않는다. |
| 46 | JOBDA Recruit 공식 PDF | A1 | <https://recruit.jobda.im/hubfs/Readme%20%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C%20%ED%8C%8C%EC%9D%BC/%EC%9E%90%EB%A3%8C%EC%8B%A4/%EC%97%AD%EA%B2%80%EC%84%BC%ED%84%B0%20%EC%9D%91%EC%8B%9C%EC%9E%90%20%EA%B0%80%EC%9D%B4%EB%93%9C.pdf> | 응시 전 환경 점검과 진행 안내를 온보딩 체크리스트에 반영한다. |
| 47 | 공개 후기 | B | <https://blog.naver.com/kcl8523/223247427854> | 실제 응시자가 체감한 시간·난이도·전략을 가설로 수집하되 공식 규칙과 분리한다. |
| 48 | 공개 후기 | B | <https://blog.naver.com/tmddk6477/223452725727> | 게임별 화면 예시와 설명 순서를 참고하되 자극·점수 규칙은 그대로 복제하지 않는다. |
| 49 | 공개 후기 | B | <https://blog.naver.com/pieyomi/223414785929> | 응시 과정에서 자주 헷갈리는 지점을 튜토리얼 문구 후보로 수집한다. |
| 50 | 공개 후기 | B | <https://blog.naver.com/choco_o1/223692824090> | 최근 응시 경험의 게임 구성 차이를 확인해 버전 고정 문구를 피한다. |
| 51 | 공개 후기 | B | <https://journeyman.tistory.com/entry/%ED%95%9C%EC%96%91%EB%8C%80%ED%95%99%EA%B5%90-%EC%A7%81%EC%9B%90-%EC%B1%84%EC%9A%A9-7%ED%8E%B8-AI-%EC%97%AD%EB%9F%89%EA%B2%80%EC%82%AC-%EB%B0%8F-1%EC%B0%A8-%EB%A9%B4%EC%A0%91-%ED%9B%84%EA%B8%B0-20250610ver-%EC%A0%84%EB%AC%B8-%E5%82%B3%E5%95%8F> | 검사 전후 흐름과 응시자 부담을 사용자 여정 가설로 참고한다. |
| 52 | 공개 커뮤니티 | B | <https://community.linkareer.com/written_test/2447031> | 다양한 후기 간 불일치를 찾아 기업별 과제 구성이 달라질 수 있음을 안내한다. |
| 53 | 공개 후기 | B | <https://jobhuntinginseoul.tistory.com/44> | 실전에서의 집중력·시간 압박 경험을 연습 난이도 조절 가설로 참고한다. |
| 54 | 공개 연습 | B | <https://nbackgame.kr/shape> | 도형 N-back의 반복 연습 UX를 비교하되 JOBDA 공식과 동일하다고 표기하지 않는다. |
| 55 | 공개 연습 | B | <https://www.ai-interview-games.com/> | 여러 인지 게임을 한 화면에서 연습하는 정보 구조를 벤치마킹한다. |
| 56 | 공공 취업지원 | A1 | <https://www.jobaba.net/interview/mainList.do> | 공공기관이 제공하는 면접·역량검사 연습 접근성을 온보딩 참고자료로 사용한다. |
| 57 | 공개 개발기 | B | <https://velog.io/@fakedev/AI-%EC%97%AD%EB%9F%89%EA%B2%80%EC%82%AC%EA%B0%80-%EC%8B%AB%EC%96%B4%EC%84%9C-%EC%A7%81%EC%A0%91-%EC%97%B0%EC%8A%B5-%EA%B2%8C%EC%9E%84%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4-%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C> | 개인 연습 게임의 구현 선택과 한계를 비교해 재현성·저작권 위험을 점검한다. |
| 58 | 채용측정 표준 | A1 | <https://www.apa.org/science/programs/testing/standards> | 점수 해석 전에 타당도·신뢰도·공정성 근거를 문서화한다. |
| 59 | 채용측정 표준 | A2 | <https://doi.org/10.1017/iop.2018.195> | 직무 관련성, 타당화 표본, 점수 사용 목적을 먼저 정의한다. |
| 60 | AI 채용 가이드 | A1 | <https://www.siop.org/wp-content/uploads/legacy/SIOP%20Considerations%20and%20Recommendations%20for%20the%20Validation%20and%20Use%20of%20AI-Based%20Assessments%20for%20Employee%20Selection%20010323.pdf> | AI 기반 선발 도구에 설명 가능성·감사·지속 검증 절차를 둔다. |
| 61 | 측정 품질 표준 | A1 | <https://www.ets.org/pdfs/about/standards-quality-fairness.pdf> | 과제 개발부터 배포·채점·접근성까지 품질 게이트를 둔다. |
| 62 | 채용 규제 | A1 | <https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XIV/part-1607> | 선발률과 불리한 영향 점검을 버전별로 기록한다. |
| 63 | 게임 기반 평가 | A2 | <https://doi.org/10.3389/fpsyg.2022.942662> | 재미뿐 아니라 인지능력 타당도·공정성·응시 경험을 함께 평가한다. |
| 64 | 게임 기반 평가 | A2 | <https://doi.org/10.1016/j.chb.2021.106701> | 게임 행동지표를 전통 지능 측정과 교차 타당화한다. |
| 65 | 게임 기반 평가 | A2 | <https://doi.org/10.1111/cogs.13308> | 대규모 환경에서도 측정 불변성과 외적 타당도를 재확인한다. |
| 66 | 게임 기반 평가 | A2 | <https://doi.org/10.1111/ijsa.12425> | 언어·국가 집단 간 적용 전 측정동일성과 성과 차이를 검사한다. |
| 67 | 응시자 반응 | A2 | <https://doi.org/10.1111/ijsa.12329> | 왜 게임을 쓰는지 설명하고 무엇을 측정하는지 사전 고지한다. |
| 68 | 응시자 반응 | A2 | <https://doi.org/10.1016/j.chb.2020.106356> | 전통 검사 대비 게임화에 대한 선호·공정성 인식을 함께 측정한다. |
| 69 | 체계적 문헌고찰 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC9554090/> | 게임형 선발평가의 근거 수준과 미검증 주장을 분리한다. |
| 70 | 메타분석 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC11676581/> | 게임 지표가 전통 인지검사와 보이는 관계를 근거로 구성타당도를 점검한다. |
| 71 | 웹 반응시간 | A2 | <https://doi.org/10.3758/s13428-015-0567-2> | 브라우저 반응시간 오차를 실험실 도구와 비교하고 보정 가능한 범위를 명시한다. |
| 72 | 웹 반응시간 | A2 | <https://doi.org/10.3758/s13428-020-01501-5> | 브라우저·OS·장치별 타이밍 정밀도 차이를 QA 매트릭스에 넣는다. |
| 73 | 장치 효과 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC8568735/> | 휴대폰·태블릿·PC 선택이 점수에 미치는 영향을 분석하고 권장 장치를 안내한다. |
| 74 | 웹 실험 타당성 | A2 | <https://doi.org/10.3758/s13423-012-0296-9> | 웹과 실험실 성능의 비교 근거를 바탕으로 온라인 품질 통제를 설계한다. |
| 75 | 재검사 효과 | A2 | <https://doi.org/10.3390/jintelligence6010006> | 연습으로 반응시간이 줄 수 있음을 결과 해석과 연습 모드에 표시한다. |
| 76 | 재검사 신뢰도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC6431228/> | 개인차 지표는 반복 측정 신뢰도가 낮을 수 있어 단일 시행 과잉 해석을 피한다. |
| 77 | 반응시간 신뢰도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC10354485/> | 연속반응 과제는 정확도뿐 아니라 RT 지표의 재검사 신뢰도를 별도 검증한다. |
| 78 | 속도-정확도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC4706043/> | 속도와 능력을 한 점수로 섞기 전에 정확도·RT·누락을 분리 저장한다. |
| 79 | 지속 작업 | A2 | <https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.00823/full> | 주의 과제의 방법과 신뢰도 보고 방식을 참고해 지표별 품질을 공개한다. |
| 80 | 인지 피로 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC2916666/> | 장시간 자기속도 과제에서 피로가 성과에 미치는 영향을 세션 순서에 반영한다. |
| 81 | 인지 피로 | A2 | <https://doi.org/10.1037/a0015719> | 검사 길이 증가가 성과와 응시자 반응에 미치는 영향을 제한시간 설계에 반영한다. |
| 82 | N-back 타당도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC2770861/> | N-back을 작업기억 전체의 완전한 대리변수로 과장하지 않는다. |
| 83 | N-back 기전 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC7781187/> | 정확도와 뇌·행동 관계가 과제 조건에 따라 달라짐을 해석에 반영한다. |
| 84 | N-back 보고 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC5339218/> | hit, false alarm, 누락, d-prime 등 성과 지표를 명확히 정의한다. |
| 85 | N-back 신뢰도 | A2 | <https://doi.org/10.1007/s12144-025-07318-9> | 연령·자극 유형·대체형식에 따른 신뢰도 차이를 버전 검증에 반영한다. |
| 86 | 훈련 전이 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC9747798/> | 연습 점수 향상을 일반 인지능력 향상으로 곧바로 해석하지 않는다. |
| 87 | 정신회전 고전 | A2 | <https://doi.org/10.1126/science.171.3972.701> | 각도 차이와 반응시간의 관계를 난이도 조절 변수로 사용한다. |
| 88 | 정신회전 검사 | A2 | <https://doi.org/10.2466/pms.1978.47.2.599> | 문항 형식과 오답 유인의 균형을 공간과제 제작 검토에 사용한다. |
| 89 | 정신회전 신뢰도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC3806254/> | 문항 수와 자극 차이가 개인차 신뢰도에 미치는 영향을 검증한다. |
| 90 | 정신회전 난이도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC11765874/> | 각도 외에도 대칭성·복잡도·자극 특징을 난이도 매개변수로 분리한다. |
| 91 | 계획 과제 | A2 | <https://doi.org/10.1080/713755977> | 계획시간, 이동 수, 규칙 위반을 분리해 경로 과제 지표를 설계한다. |
| 92 | 계획 과제 | A2 | <https://doi.org/10.1016/j.cogbrainres.2004.04.002> | 문제 구조가 계획 전략을 바꾸므로 난이도를 단순 길이로만 조절하지 않는다. |
| 93 | 계획 신뢰도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC6669988/> | 계획 과제의 신뢰도·규준 한계를 고려해 반복 가능한 보조 지표로 사용한다. |
| 94 | 사전계획 지표 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC13353248/> | 첫 행동 전 숙고시간과 전체 성과를 분리 기록해 사전계획을 추정한다. |
| 95 | 확률 범주학습 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC1409838/> | 정답률만 보지 말고 참가자가 쓰는 전략 전환을 함께 분석한다. |
| 96 | 확률학습 피드백 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC4285817/> | 교정 피드백 유무가 학습 과정을 바꾸므로 피드백 정책을 고정한다. |
| 97 | 확률반전 신뢰도 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC9729159/> | 행동·계산모형 지표의 재검사 신뢰도를 따로 확인한다. |
| 98 | 범주학습 전략 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC4540635/> | 단순 정답률 뒤의 규칙기반·유사성 전략 차이를 로그 설계에 반영한다. |
| 99 | 메타인지 측정 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC4097944/> | 확신도와 정답률을 분리하고 type-2 지표로 메타인지 민감도를 산출한다. |
| 100 | 메타인지 효율 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC5858026/> | 문항 수가 적을 때 계층 베이지안 meta-d′ 추정을 고려한다. |
| 101 | 메타인지 훈련 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC6390881/> | 확신도 피드백이 행동을 바꿀 수 있으므로 연습·평가 모드를 분리한다. |
| 102 | 확신도 판단 | A2 | <https://doi.org/10.1198/016214506000001437> | 확률 예측에는 Brier/log score 같은 proper scoring rule을 사용한다. |
| 103 | 전향·회고 판단 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC6192381/> | 응답 전후 확신도를 구분해 수집하고 같은 지표로 합치지 않는다. |
| 104 | 접근성 표준 | A1 | <https://www.w3.org/TR/WCAG22/> | 키보드, 색상, 타이밍, 포커스 요구를 최소 품질 기준으로 적용한다. |
| 105 | 인지 접근성 | A1 | <https://www.w3.org/WAI/WCAG2/supplemental/objectives/o5-user-focus/> | 주의 분산을 줄이고 현재 목표·진행 상태를 명확히 보여준다. |
| 106 | 인지·학습 접근성 | A1 | <https://www.w3.org/WAI/cognitive/> | 복잡한 지시를 단계화하고 기억 부담을 과제 의도 이상으로 늘리지 않는다. |
| 107 | 장애·AI 채용 | A1 | <https://www.ada.gov/resources/ai-guidance/> | 장애 지원 요청과 합리적 조정 경로를 평가 전 제공한다. |
| 108 | 시각장애·채용 | A1 | <https://www.eeoc.gov/laws/guidance/visual-disabilities-workplace-and-americans-disabilities-act> | 시각 중심 과제에서 대체 절차와 차별 위험을 사전에 검토한다. |
| 109 | AI 위험관리 | A1 | <https://airc.nist.gov/airmf-resources/airmf/> | 측정·관리·거버넌스·문서화를 전 생애주기 체크리스트로 운영한다. |
| 110 | EU AI 규정 | A1 | <https://eur-lex.europa.eu/eli/reg/2024/1689/oj> | 고용 선발 AI의 고위험 의무를 고려해 로그·감독·품질관리를 설계한다. |
| 111 | OECD AI 원칙 | A1 | <https://oecd.ai/en/dashboards/ai-principles/P6> | 공정성·투명성·책임성 원칙을 제품 의사결정 기록에 연결한다. |
| 112 | UNESCO AI 윤리 | A1 | <https://www.unesco.org/en/articles/recommendation-ethics-artificial-intelligence?hub=66973> | 인권·비차별·인간 감독 원칙을 평가 운영 정책에 반영한다. |
| 113 | DIF 공정성 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC5459266/> | 집단 간 문항기능차이를 정기적으로 분석해 편향 문항을 제거한다. |
| 114 | 적응검사 노출 | A2 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC7174806/> | 적응형 난이도에서는 문항 노출 통제와 추정 정밀도를 함께 최적화한다. |
| 115 | 웹 접근성 구현 | A1 | <https://www.w3.org/TR/wai-aria-1.2/> | 커스텀 게임 컨트롤에 정확한 역할·상태·이름을 제공한다. |
| 116 | 웹 접근성 구현 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> | 포인터 목표 크기와 간격을 확보해 오클릭을 줄인다. |
| 117 | 웹 접근성 구현 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html> | 키보드 포커스를 항상 시각적으로 확인할 수 있게 한다. |
| 118 | 웹 접근성 구현 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html> | 측정 목적과 충돌하지 않는 범위에서 시간 연장·조정 정책을 제공한다. |
| 119 | 웹 접근성 구현 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html> | 자동 진행·움직임에는 정지/일시정지 가능성을 검토한다. |
| 120 | 웹 접근성 구현 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html> | 색만으로 정답·경로·상태를 구분하지 않고 모양·텍스트를 병행한다. |
| 121 | 반응형 설계 | A1 | <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design> | 고정 게임 캔버스와 주변 UI가 작은 화면에서 깨지지 않도록 재배치한다. |
| 122 | 반응형 설계 | A1 | <https://web.dev/articles/responsive-web-design-basics> | viewport·유동 레이아웃·미디어쿼리를 성능 저하 없이 적용한다. |
| 123 | 타이밍 구현 | A1 | <https://developer.mozilla.org/en-US/docs/Web/API/Performance/now> | 반응시간에는 단조 증가 고해상도 시계를 쓰고 Date.now를 피한다. |
| 124 | 포인터 구현 | A1 | <https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events> | 마우스·터치·펜 입력을 통합하고 pointer capture를 적절히 사용한다. |
| 125 | 세션 무결성 | A1 | <https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API> | 탭 비활성화를 감지해 타이머 왜곡과 무효 세션을 명시적으로 처리한다. |
| 126 | 키보드 접근성 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html> | 모든 핵심 기능을 포인터 없이도 수행할 수 있게 한다. |
| 127 | 동작 접근성 | A1 | <https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html> | 기기 흔들기·기울이기 입력이 있다면 버튼 대안을 제공한다. |
| 128 | 색상 시스템 | A1 | <https://design-system.service.gov.uk/styles/colour/> | 의미 색상에 충분한 대비와 비색상 보조 신호를 둔다. |
| 129 | 버튼 시스템 | A1 | <https://design-system.service.gov.uk/components/button/> | 주요 행동·보조 행동·위험 행동의 위계를 일관된 버튼으로 표현한다. |

## 8. 파일·검증 메모

- 원본 개인 노트는 이 조사에서 수정하지 않았으며 이 저장소에 포함하지 않았다.
- 로컬 이미지 파일 존재 여부와 노트의 임베드 참조를 대조했다.
- JOBDA 공개 API `/post/335`–`/post/343`에서 공식 제목과 YouTube ID를 대조했다.
- 공개 페이지/연습/디자인 URL은 2026-08-28에 응답 여부를 확인했고, DOI·PMC·표준·규정 URL은 영구 식별자 또는 공식 원문 주소를 사용했다.
- 자동 확인에서는 129개 중 118개가 2xx로 응답했다. 출판사 봇 차단이 걸린 DOI 10개는 Crossref에서 DOI·논문 제목을 재검증했고, SIOP 공식 PDF 1개는 공식 도메인의 실재 주소지만 자동 요청에는 403을 반환했다.
- 공식 영상의 시각 자산을 그대로 복제하지 말고, mechanics만 재구성한 독자적 그래픽·아이콘을 사용한다.
