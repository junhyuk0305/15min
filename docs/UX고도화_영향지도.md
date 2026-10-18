# 영향 지도 (2026-10-19, 읽기 전용 조사)

근거 표기: [코드]=저장소 확인, [pkg]=node_modules 확인, [문서]=공식 문서 확인, [미검증]=확인 못 함.

---

# A. 한국 시간 고정 (Asia/Seoul)

## A-0. 결론

- 핵심 사실: 서버의 모든 판정은 `profiles.timezone` 값을 읽는다. 이 값이 늘 `Asia/Seoul`이고 `pending_*`이 늘 null이면 SQL 함수와 Edge Function은 **본문을 고치지 않아도** 한국 시간으로 돈다. [코드]
- 그래서 서버는 "값을 고정하고, 값을 바꾸는 입구를 막는다"만 하면 된다. day_key, local_at, settle_goal 같은 함수 본문은 그대로 둔다.
- 앱은 `deviceTz`와 `profile.timezone`을 읽는 곳을 상수 하나로 바꾼다.
- rules.ts의 `timeZone` 인자는 남긴다. 순수 함수라 LA 서머타임 테스트가 그대로 유효하고, Deno 사본(sync:rules)도 상수 한 줄만 늘어난다.

## A-1. 권장 설계

1. `src/lib/rules.ts` 정책 숫자 구역에 `export const APP_TIME_ZONE = 'Asia/Seoul';` 추가. → `npm run sync:rules`로 `supabase/functions/_shared/rules.ts` 재생성. (rules-sync.test.ts가 일치를 검사)
2. 앱은 기기 시간대를 읽지도 보내지도 않는다. `deviceTz`, `tzOf`, `timeZoneOf`, `api.setTimezone`, 가입 메타의 `timezone`을 지운다.
3. selectors는 시간대 인자를 받지 않고 안에서 `APP_TIME_ZONE`을 쓴다. `PlanInput.timeZone`(plan.ts:50)은 남기고 planInputOf가 상수를 넣는다. 테스트 수정이 가장 적다.
4. 새 마이그레이션 1개 (`supabase/migrations/20261019000100_fixed_kst.sql`). 기존 파일은 손대지 않는다.
   - `update public.profiles set timezone='Asia/Seoul', pending_timezone=null, pending_timezone_from=null;`
   - `alter table public.profiles add constraint profiles_timezone_kst check (timezone = 'Asia/Seoul' and pending_timezone is null and pending_timezone_from is null);`
   - `create or replace function app_private.handle_new_user()`: 000600 본문(85~133행)을 복사하고 `v_tz` 선언(93), `valid_tz` 분기(105~107)를 지운 뒤 insert 값에 `'Asia/Seoul'`. **이걸 빼고 제약만 넣으면 옛 클라이언트가 다른 시간대를 메타로 보낼 때 가입이 제약 위반으로 실패한다.**
   - `drop function public.set_timezone(text); drop function app_private.set_timezone(uuid, text, timestamptz);` 출시 전이라 옛 빌드 호환은 필요 없다고 가정한다. `[가정]` 옛 개발 빌드가 부르면 PGRST202가 나고 store.boot가 error만 세팅하고 진행한다(store.ts:213-216).
   - `apply_timezone`(800:258), `settle_all`의 pending 갱신(800:282-288)은 **남긴다**. 제약 때문에 늘 0행이라 해가 없다. 지우면 settle_all 전체를 다시 써야 한다. 죽은 코드로 남는다는 점만 결정로그에 적는다.
   - 컬럼은 **지우지 않는다**. `pending_*`를 drop하면 apply_timezone이 $$ 문자열 본문이라 의존성 추적이 안 되고, 실행할 때 깨진다(settle_user, own_goal 진입마다 호출: core.sql:297, rpc.sql:53).
   - `valid_tz`(core.sql:81-88)는 handle_new_user 교체 뒤 쓰는 곳이 없다. 남겨 둔다(죽은 코드라고 말만 함).
5. Edge Function은 바꾸지 않아도 동작한다(값이 고정됨). 읽는 사람이 헷갈리지 않게 3곳만 상수로 바꾸는 것을 권장한다. `context.ts:60,70`, `reflection/handler.ts:66` → `APP_TIME_ZONE`. `usage.ts:12 learningDay(now, timeZone)`은 인자를 빼도 되고 그대로 둬도 된다.

### 대안 (권장 안 함)
- profiles에 BEFORE INSERT/UPDATE 트리거를 달아 timezone을 강제: 12줄로 끝나지만 handle_new_user가 여전히 메타를 읽는 것처럼 보여 읽는 사람을 속인다.
- rules.ts를 고정 오프셋(+9h, 1988년 이후 한국 서머타임 없음)으로 바꿔 Intl을 없애기: Hermes `formatToParts` 기기 위험(HANDOFF.md:51)이 사라진다. 대신 rules.ts 시그니처, LA 테스트, Deno 사본이 크게 바뀐다. 기기 스모크 테스트에서 Intl이 틀릴 때만 꺼낸다.

## A-2. 해외 사용자 UX 결과 (제품 결정 필요)

- 하루 경계: 한국 04:00. 뉴욕(EDT)에서는 오후 3시에 하루가 바뀐다.
- 화면 시각: `fmtClock(startMinutes)`는 분 숫자라 "22:00"은 한국 22:00이다. 기기 시각과 다르다.
- 알림: `notify.ts:100`이 절대 시각(`new Date(p.at)`)으로 로컬 알람을 건다. 한국 22:00 = 뉴욕 09:00(EDT)에 울린다. 알림 본문에는 시각 숫자가 없어 문구는 안 깨진다. [코드 plan.ts]
- 권장: 기기 오프셋이 +9가 아닐 때만(`new Date().getTimezoneOffset() !== -540`) 시각 옆에 "한국 시간" 한 줄을 보인다. 이 값은 기기 안에서만 쓰고 보내지 않으므로 수집이 아니다. 자리는 두 곳으로 줄인다.
  - `src/app/goal/new.tsx:360` 시작 시각 행
  - `src/app/settings/goal.tsx:112-118` 시각 스테퍼 근처
  - 항상 표시하는 안, 아무것도 안 하고 약관에만 적는 안도 있다. 제품 담당이 고른다.
- DevTools(`src/components/DevTools.tsx:16-17`)는 기기 로컬 `getHours()`로 찍는다. 고정 후에는 `localParts(ms, APP_TIME_ZONE)`로 바꿔야 화면 판정과 맞는다.

## A-3. 고칠 곳 (file:line)

### 앱
| 파일 | 줄 | 변경 |
|---|---|---|
| src/lib/rules.ts | 정책 숫자 구역(~10행), 머리 주석 3 | `APP_TIME_ZONE` 추가 → sync:rules |
| supabase/functions/_shared/rules.ts | 전체 | sync:rules 재생성(손으로 고치지 않음) |
| src/lib/store.ts | 49-50 | `deviceTz` 삭제 |
| | 142 | `todayKeyOf(get(), now())` |
| | 160, 166 | 주석에서 "시간대" 삭제, allSettled에서 setTimezone 제거(profile은 167 refresh가 읽음) |
| | 212-216 | setTimezone 블록 삭제 |
| | 291 | 메타에서 `timezone` 삭제 |
| | 515-517 | deviceTz 인자 제거, `tzOf` 삭제 |
| src/lib/selectors.ts | 43, 45-46, 53-54, 62-68, 83-84, 100, 209-215 | `timeZoneOf` 삭제, 시간대 인자 제거, 안에서 APP_TIME_ZONE |
| src/lib/selectors.ts | 108-119 reflectionWindow | 인자 유지(순수), 호출부가 상수 전달 |
| src/lib/api.ts | 189 | `SignupMeta`에서 timezone 삭제 |
| | 337-339 | `setTimezone` 삭제 |
| src/lib/model.ts | 7-9, 105-107 | timezone, pendingTimezone, pendingTimezoneFrom 삭제 |
| src/app/_layout.tsx | 18, 76, 145, 158 | deviceTz 인자 제거 |
| src/app/(tabs)/index.tsx | 32, 105-108, 138, 155 | tzOf/deviceTz → APP_TIME_ZONE |
| src/app/(tabs)/archive.tsx | 11, 81 | deviceTz 제거 |
| src/app/goal/new.tsx | 29, 313, 318 | tzOf → APP_TIME_ZONE |
| src/app/suspended.tsx | 12, 18-20, 65, 79, 169, 174, 185 | tz → APP_TIME_ZONE |
| src/app/session/learn.tsx | 18, 32 | deviceTz 제거 |
| src/app/session/retro.tsx | 16, 32 | deviceTz 제거 |
| src/components/DevTools.tsx | 8, 14, 16-17 | deviceTz 제거, getHours → localParts(KST) |
| src/components/goal/logic.ts | 121-126 | 그대로(인자 유지). 호출부 new.tsx가 상수 전달 |
| src/lib/plan.ts | 50 | 그대로(planInputOf가 상수 넣음) |

### Edge Functions
| 파일 | 줄 | 변경 |
|---|---|---|
| supabase/functions/_shared/context.ts | 60, 70 | `profile.timezone` → APP_TIME_ZONE (선택이지만 권장) |
| supabase/functions/reflection/handler.ts | 3(주석), 66 | 같음 |
| supabase/functions/_shared/usage.ts | 2(주석 "프로필 시간대"), 12 | 주석 수정. 인자는 선택 |
| supabase/functions/_shared/types.ts | 5 | 위 3곳을 바꾸면 `timezone` 필드 삭제 가능 |

### DB
- 새 마이그레이션 1개(A-1 4번). 기존 마이그레이션 수정 없음.
- `supabase/seed.sql:25`, `supabase/scripts/create-review-account.sql:40`: 메타의 timezone은 무시되므로 그대로 둬도 된다. 정리하려면 키만 뺀다.

### 스크립트
| 파일 | 줄 | 변경 |
|---|---|---|
| scripts/smoke-auth.ts | 3, 40-41, 54, 79, 85 | set_timezone 단계 삭제, `dayKeyOf(server, APP_TIME_ZONE)`, 메타 timezone 삭제 |
| scripts/e2e/scenarios.py | 122-125 | DB timezone 확인은 계속 통과. 남기거나 삭제 |
| scripts/e2e/lib.py:70, ui-lib.py:46 | 메타 timezone | 무시됨. 선택 정리 |
| scripts/e2e/lib.py:161, ui-lib.py:140 | `timezone_id='Asia/Seoul'` | 유지. **추가 권장:** `timezone_id='America/New_York'` 컨텍스트로 홈 시각과 하루 키가 KST인지 보는 시나리오 1개 |
| evals/run.ts:296, supabase/functions/tests/helpers.ts:27 | profile fixture timezone | types.ts에서 필드를 지우면 같이 삭제 |

## A-4. 테스트

### 삭제
- `supabase/tests/04_account.test.sql:125-134` 시간대 예약 블록, 단언 5개 → `plan(33)`을 `plan(28)`로.
- `supabase/tests/09_security.test.sql:146-160` L1 서쪽 시간대 블록, 단언 4개 → `plan(68)`을 `plan(64)`로. 1행 머리 주석의 "서쪽 시간대 변경" 삭제.

### 수정
- `04_account.test.sql:31-33`: 메타 `America/New_York` 가입 → 기대값을 `'Asia/Seoul'`로, 설명 "메타데이터 시간대는 무시". 41-42(잘못된 시간대 → Seoul)는 그대로 통과.
- `05_goal.test.sql:75`: 목록에서 `'set_timezone'` 삭제(함수가 없어도 count 0이라 통과는 하지만 이름이 남는다).
- `src/lib/__tests__/api.test.ts:186, 190, 199, 212`: 메타에서 timezone 삭제.
- `src/lib/__tests__/home.test.ts:218-220`: Profile 필드 삭제. 229, 231, 232: planInputOf 셋째 인자 삭제.
- `src/lib/__tests__/cache.test.ts:73-77, 82, 85, 89, 92`: routeInputOf/todayRowOf/planInputOf의 TZ 인자 삭제. 39, 53의 profileFromRow 입력 `timezone`은 남아도 무해.

### 유지 (인자를 남기므로 그대로 유효)
- `rules.test.ts` LA 서머타임(38-106), `plan.test.ts`, `goalSetup.test.ts`, `cache.test.ts:104-109 reflectionWindow`, `06_settle.test.sql:78-88` day_key/local_at LA.
- 나머지 SQL 테스트의 메타 `"timezone": "Asia/Seoul"`(02, 03, 05, 06, 07, 08)은 무시될 뿐 통과.

### 추가
- SQL: `profiles` timezone을 다른 값으로 update하면 check 위반(23514). `hasnt_function('public','set_timezone',...)`. 메타 `America/New_York` 가입 → Asia/Seoul(위 수정과 같은 단언).
- 앱: selectors가 시간대를 받지 않으므로 별도 단위 테스트 불필요. 대신 e2e에서 뉴욕 브라우저 컨텍스트 1개.

## A-5. 법무, 스토어 문서

| 파일 | 줄 | 변경 |
|---|---|---|
| docs/legal/개인정보처리방침.md | 46 | "기기 설정 / 기기의 시간대" 행 삭제 |
| docs/legal/이용약관.md | 57 | "이용자 기기 시간대의 오전 4시" → "한국 시간 오전 4시". 해외에서는 알림이 한국 시각에 맞춰 울린다는 문장 추가 검토 |
| store/privacy-labels.md | 45 | iOS "기기 시간대" 행 삭제 |
| | 85 | Google "기기 시간대" 행 삭제 |
| | 97 | 기기 시간대 설명 각주 삭제 |
| | 108 | 처리방침 대조표에서 "시간대" 삭제 |
| src/lib/copy.ts | legal 블록(548~) | 손대지 않고 `npm run sync:legal`로 재생성 |
| docs/결정로그.md | 20, 212 | 새 행으로 대체 기록("한국 시간 고정, 기기 시간대 수집 안 함") |
| docs/HANDOFF.md | 51 | Hermes Intl 확인은 계속 필요(기기가 KST가 아니어도 Asia/Seoul 포맷터가 맞아야 함) |

- [미검증] Sentry 네이티브 SDK가 기기 컨텍스트에 시간대를 넣는지 확인 못 했다. 넣는다면 Sentry를 켠 빌드의 "기타 진단 데이터"(privacy-labels.md:47)에 시간대가 들어가거나 beforeSend로 지워야 한다.

---

# B. 애니메이션 기반

## B-1. 설치와 설정

| 항목 | 상태 |
|---|---|
| react-native-reanimated | 4.5.1, peer `react-native 0.83-0.86`, `react-native-worklets 0.10.x` [pkg] |
| react-native-worklets | 0.10.1 [pkg] |
| Babel 플러그인 | babel.config.js 없음. **필요 없음.** babel-preset-expo 57.0.16이 `react-native-worklets/plugin`을 찾으면 자동으로 넣는다(build/configs/expo.js:96-102) [pkg]. v57 문서: "No additional configuration is required." [문서] |
| react-native-gesture-handler | ~2.32.0 설치. src에서 쓰는 곳 0. GestureHandlerRootView 없음 [코드] |
| expo-haptics | ~57.0.3. 웹은 Vibration API로 지원 [문서]. 지금은 useLearnClock.ts:57-58 한 곳, 웹 제외 |
| react-native-keyboard-controller | 1.21.9. `_layout.tsx:210` KeyboardProvider, `LearnShell.tsx:4,52`. 웹은 `bindings.js` 빈 구현으로 아무것도 안 함 [pkg] |
| 플랫폼 | reanimated v57 문서 frontmatter: android, ios, tvos, web, expo-go [문서]. gesture-handler: Android, iOS, Web [문서] |

## B-2. 지금 움직이는 것

- `src/app/(tabs)/index.tsx:82-93, 331` 독촉 진입 붉은 깜빡임. RN `Animated` 사용. **동작 줄이기 설정을 무시한다.**
- Modal `animationType="fade"`: `AccountLinks.tsx:39`, `goal/ReportSheet.tsx:44`, `learn/parts.tsx:41, 81, 153`.
- `src/app/coupon.tsx:87` `presentation: 'transparentModal', animation: 'fade'`.
- `LearnShell.tsx:47` `scrollToEnd({ animated: true })`.
- 루트 Stack(`_layout.tsx:286`)은 `headerShown:false`만. 화면 전환은 플랫폼 기본.
- reanimated import는 0곳. 레이아웃 애니메이션, LayoutAnimation 없음.

## B-3. 웹(Playwright) 호환

- reanimated 웹은 "purely in JavaScript"로 돈다. 느릴 수 있지만 동작한다 [문서].
- entering/exiting 레이아웃 애니메이션: Android, iOS, Web 모두 지원 표기 [문서]. 단 **`springify()`는 웹 미지원** [문서]. 프리셋은 시간 기반(`duration`)만 쓴다.
- 동작 줄이기: 기본값이 `ReduceMotion.System`. 켜져 있으면 withTiming은 즉시 끝값, entering은 끝으로 점프, exiting은 생략 [문서]. 웹은 `matchMedia('(prefers-reduced-motion: reduce)')`를 읽는다(lib/module/ReducedMotion.js:8) [pkg].
  - 그래서 Playwright `new_context(reduced_motion='reduce')`로 스크린샷과 텍스트 단언을 애니메이션 없이 고정할 수 있다. 현재 lib.py:161, ui-lib.py:140에 추가하면 된다.
- `useReducedMotion()`은 "앱 시작 때" 값이고 바뀌어도 리렌더하지 않는다 [문서]. 실시간이 필요하면 RN `AccessibilityInfo.addEventListener('reduceMotionChanged')`.
- `ReducedMotionConfig` 컴포넌트는 패키지에 있다(lib/module/component/ReducedMotionConfig.js) [pkg]. 문서 페이지에서는 확인 못 했다.
- keyboard-controller 웹: 빈 구현이라 깨지지 않지만 키보드 회피도 없다. 지금 구조 그대로.
- Stack `animation`, `presentation` 옵션: 타입 주석에 "Only supported on iOS and Android" [pkg expo-router/build/react-navigation/native-stack/types.d.ts:593, 625]. 웹에서 모달은 별도 라우트이고 닫기 버튼을 직접 둬야 한다 [문서 router/advanced/modals].

## B-4. 화면 전환과 시트 (v57)

- `animation`: default, fade, fade_from_bottom, flip, none, simple_push, slide_from_bottom, slide_from_right, slide_from_left, ios_from_right, ios_from_left [pkg react-native-screens types.d.ts:14].
- `animationDuration`: iOS만, 기본 500. modal/formSheet/pageSheet와 default/flip에는 안 먹는다 [pkg].
- `presentation`: card, modal, transparentModal, containedModal, containedTransparentModal, fullScreenModal, formSheet, pageSheet [pkg].
- `formSheet`: `sheetAllowedDetents`(Android 최대 3개, 'fitToContents' 가능), `sheetCornerRadius`, `sheetGrabberVisible`(iOS), `sheetInitialDetentIndex` [pkg]. 시트 안에서는 헤더와 중첩 스택이 안 그려진다 [문서]. 타입 주석에는 "Android는 modal로 대체"라는 문장도 있어 문서와 어긋난다 [미검증, 기기 확인 필요].
- 권장: 화면 전환은 기본값 유지. 손댄다면 학습 진입(`session/*`)만 `animation: 'fade'`. 새 의존성(@gorhom/bottom-sheet 등)은 넣지 않는다.
- 하단 시트(신고, 확인 창)는 지금처럼 컴포넌트 안 상태로 연다. RN `Modal transparent` + 내용에 reanimated `SlideInDown` + 배경 `FadeIn`. 웹에서도 같은 코드가 돈다.
  - 주의: `visible=false`가 되면 Modal이 바로 내려가므로 내용의 exiting은 보이지 않는다(코드 구조상 추론) [미검증]. 닫힘은 Modal `animationType="fade"`에 맡긴다.
  - 쓸어내려 닫기는 넣지 않는다. 넣으면 gesture-handler와 Modal 안 GestureHandlerRootView가 필요하다 [미검증].

## B-5. 타이핑식 공개와 학습 시계

- 시계 게이트: `clockRunning = appActive && focused && !waiting && !offline && !failed && !overlay && !blocked` (src/lib/learn.ts:38-40).
- `waiting`: learn.tsx:90 `waiting > 0`(요청 카운터, 96행 request가 올림), retro.tsx:87 `waiting`.
- 딴짓 판정(quietMs)은 시계가 돌 때만 쌓인다(learn.ts:51-56). 그래서 공개 중 시계를 멈추면 딴짓 팝업도 안 뜬다.
- 서버는 `active_seconds`를 시작 뒤 경과 시간으로 자른다(rpc.sql:353-355 `least(target*60, v_elapsed, ...)`). 시계를 더 오래 멈춰도 서버 규칙은 깨지지 않는다.
- **결정 제안: 공개 중은 "응답 중"으로 본다.** 시계를 멈춘다. 이유: 기획(메가프롬프트 320행)이 "AI 응답 중 타이머 멈춤"이고, 사용자 눈에는 공개가 끝나야 응답이 끝난다.
- 조건 3개로 남용을 막는다.
  1. 공개 총 시간 상한 900ms. 글 길이에 비례하되 넘지 않는다(예: 단어당 30ms, 최대 900ms).
  2. 탭하면 즉시 전부 보인다.
  3. 동작 줄이기면 공개 없이 즉시 보인다.
- 구현 자리: Transcript가 마지막 AI 줄 공개 끝을 `onRevealEnd`로 알린다. learn.tsx:90은 `waiting: waiting > 0 || revealing`, retro.tsx:87은 `waiting || revealing`. ClockGates 타입은 그대로.
- 스크롤: LearnShell.tsx:47의 scrollToEnd는 공개 시작 때 한 번, 끝날 때 한 번.
- 웹 e2e: reduced_motion='reduce' 컨텍스트면 공개가 즉시라 기존 텍스트 단언이 그대로 통과한다.

## B-6. 공용 모션 모듈 제안 (`src/lib/motion.ts`, 40줄 안팎)

```ts
import { Easing, FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
export const DUR = { fast: 150, base: 220, slow: 320 } as const;
export const EASE = Easing.out(Easing.cubic);
export const enter = {
  line: FadeInDown.duration(DUR.base).easing(EASE),   // 새 대화 줄
  fade: FadeIn.duration(DUR.fast),                    // 배너, 오류 줄
  sheet: SlideInDown.duration(DUR.slow).easing(EASE), // 하단 시트 내용
};
export const REVEAL = { msPerWord: 30, maxMs: 900 };
```
- springify 금지(웹 미지원). 모두 기본 `ReduceMotion.System`을 따른다.
- `.easing()`은 4.5.1 ComplexAnimationBuilder 타입에 있다(ComplexAnimationBuilder.d.ts:33) [pkg].

## B-7. 손댈 컴포넌트

| 파일 | 할 일 |
|---|---|
| src/lib/motion.ts (새 파일) | 위 상수와 프리셋 |
| src/components/learn/Transcript.tsx | 새 줄 `entering={enter.line}`, 마지막 AI 줄 공개와 `onRevealEnd` |
| src/components/ChatLine.tsx | 공개용 부분 글자 표시 prop(또는 Transcript에서 잘라 넘김) |
| src/components/learn/LearnShell.tsx:47 | 공개 시작과 끝에 scrollToEnd |
| src/app/session/learn.tsx:90, retro.tsx:87 | `revealing`을 waiting 게이트에 더함 |
| src/components/learn/parts.tsx:41, 81, 153 | 단계 안내, 모달, 신고 시트 내용에 enter.fade / enter.sheet |
| src/components/goal/ReportSheet.tsx:44 | 내용에 enter.sheet |
| src/components/AccountLinks.tsx:39 | 내용에 enter.fade |
| src/app/(tabs)/index.tsx:82-93 | useFlash를 reanimated `withSequence(withTiming…)`로 옮겨 동작 줄이기를 따르게 함 |
| src/components/StatusBanner.tsx, Banner.tsx, ErrorLine.tsx | 나타날 때 enter.fade |
| src/components/Segmented.tsx, Checkbox.tsx, goal/Chip.tsx | 선택 피드백. 움직임 대신 `Haptics.selectionAsync()`만 검토 |
| src/components/learn/LessonPanel.tsx, QuizPanel.tsx | 정답/오답 피드백 자리(내용 미확인, 필요 시) |
| src/app/_layout.tsx:286 | 기본 유지. 선택: session 화면 `animation: 'fade'` |
| src/app/coupon.tsx:87 | 그대로 |
| scripts/e2e/lib.py:161, ui-lib.py:140 | `reduced_motion='reduce'` 추가 |

- 추가 설치 없음. GestureHandlerRootView도 지금은 넣지 않는다.
