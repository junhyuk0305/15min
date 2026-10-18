# 그래고 출시 HANDOFF

사람이 해야 하는 일을 실행 순서대로 적는다. 항목마다 왜 필요한지, 어디서 하는지, 끝나면 넣을 값, 넣는 곳을 적는다.
작성 2026-10-18. 브랜치 `feat/mvp-launch`. 원격 저장소에 올리지 않았다.

- **지금 상태로 할 수 있는 것:** 로컬 Supabase(Docker)와 웹 빌드로 가입부터 3일 완료, 포기, 정지, 삭제까지 돌릴 수 있다. AI는 `AI_FAKE=1` 고정 응답이다. Android production 빌드(AAB)는 한 번 성공했다.
- **키를 넣어야 할 수 있는 것:** 실제 Gemini 수업과 AI 평가, 운영 Supabase 배포, 운영 값이 들어간 스토어 빌드, iOS 빌드, 스토어 제출, 실기기 알림 확인.

## 0. 결정 필요

| 항목 | 지금 상태 | 고를 것 |
|---|---|---|
| 첫날 당일 체험 학습 | 기획서 5.1대로 목표 설정 다음 날부터 시작 | 설정 당일 짧은 체험 학습을 둘지 |
| 가입 연령 | 만 18세 이상. MP 3절은 14세였다. Gemini API 추가 약관(2026-04-28)이 18세 미만이 접근할 가능성이 높은 앱에서 API 사용을 금지한다 | 18세 유지, 또는 14세로 내리고 AI 공급자를 바꿀지 |
| 삭제 계정 해시 보관 1년 | 1년 뒤 해시를 지우면 영구 정지된 이메일로 다시 가입할 수 있다 | 보관 기간 |
| 신고 보관 1년 `[가정]` | 계정과 분리된 날로부터 1년 뒤 매일 파기한다(마이그레이션 `20261018001000`). 처리방침 3절, 3.2, 9절에 적었다 | 1년 유지 또는 변경. 바꾸면 `purge_old_data`와 처리방침을 함께 고친다 |
| 반성문과 알림의 외모 언급 | 사용자가 쓴 이유에 외모가 있을 때만 언급한다(기획서 9.1) | App Store 1.1 위험을 감수할지, 1차에서 뺄지 |
| 포기 대기 중 탈퇴 | 탈퇴하면 그 포기를 확정으로 센다. 약관규제법상 불이익 조항일 수 있다 `[법무 확인]` | 유지할지 |
| 04:00을 넘는 일정 | 시작 시각 + 학습 분 + 회고 3분이 04:00을 넘으면 목표를 만들 수 없다 | 유지할지, 하루 경계를 사람마다 다르게 둘지 |

## 1. 실행 순서

| 순서 | 할 일 | 왜 | 어디서 | 끝나면 넣을 값과 넣는 곳 |
|---|---|---|---|---|
| 1 | 앱 이름 표기, slug, 번들 ID 확정 | 첫 스토어 업로드 뒤에는 번들 ID를 바꿀 수 없다. 지금 값은 slug `timebulldog`, ID `com.dochackchack.timebulldog`, EAS 프로젝트 `@chackchack/timebulldog` | `app.json` | 바꾸면 `app.json`의 `slug`, `ios.bundleIdentifier`, `android.package`를 고치고 `npx eas-cli@latest init`을 다시 한다 |
| 2 | Supabase 프로젝트 생성 | 서버(DB, 인증, AI 함수)가 여기 있다 | supabase.com 대시보드. 리전은 서울(ap-northeast-2) 권장 | Project URL과 anon key는 7번 EAS 환경변수로. service role key와 access token은 본인 PC에만 둔다. 처리방침의 `[리전]`을 채운다 |
| 3 | Gemini API 키 발급과 결제 연결 | AI 수업 전부가 이 키로 돈다. 무료 등급은 입력이 Google 제품 개선에 쓰일 수 있어 실사용자 데이터는 유료 등급으로 처리한다 | Google AI Studio. 결제 계정 연결, Google Cloud 예산 알림과 지출 상한 설정 | `npx supabase secrets set GEMINI_API_KEY=<키>`. 선택: `npx supabase secrets set AI_MODEL_MAIN=gemini-3.8-flash AI_MODEL_LIGHT=gemini-3.5-flash-lite AI_DAILY_LIMIT=150 AI_GOAL_SETUP_LIMIT=30 AI_GLOBAL_DAILY_LIMIT=20000`. `AI_FAKE`는 넣지 않는다 |
| 4 | 마이그레이션 적용과 함수 배포 | 표, 권한, 상태 변경 RPC, cron, AI 함수를 운영에 올린다 | 저장소 폴더 | `npx supabase link --project-ref <ref>` → `npx supabase db push` → `npx supabase functions deploy goal-setup lesson-turn review-quiz retro reflection delete-account`. 대시보드 Integrations > Cron에서 작업(포기 확정, 정지 해제, 매시 판정, 매일 보관 삭제)이 켜졌는지 본다 |
| 5 | Supabase 인증 설정 | 로컬 `config.toml`은 운영에 적용되지 않는다. 비밀번호 가입으로 남의 이메일을 선점하는 길을 막는다 | 대시보드 > Authentication | Confirm email 켜기, Secure password change 켜기, 최소 비밀번호 12자. Email Templates의 Magic Link와 Confirm signup 본문을 `supabase/templates/otp.html` 내용으로 바꾼다(6자리 코드). 커스텀 SMTP를 연결한다(기본 SMTP는 발송량이 매우 적다). 처리방침의 `[SMTP 제공자]`를 채운다. 끝나면 OTP 가입과 재로그인을 한 번 해 본다 |
| 6 | 이메일 해시 키 확인 | 탈퇴 뒤 재가입 정지 승계에 쓰는 비밀 키다. 출시 뒤 바꾸면 정지를 피할 수 있다 | SQL Editor | `select key from app_private.config;`로 `email_hash_pepper` 행이 있는지만 본다. 값은 화면에 띄우지 않는다 |
| 7 | EAS 환경변수와 Android 재빌드 | `eas init`은 끝났다(projectId 연결됨). 지금 AAB는 운영 값 없이 빌드돼 설정 오류 화면이 뜬다 | 터미널 | `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <URL> --visibility plaintext`. 같은 방식으로 `EXPO_PUBLIC_SUPABASE_ANON_KEY`, 선택으로 `EXPO_PUBLIC_SENTRY_DSN`. preview 환경에도 넣는다. 그다음 `npx eas-cli@latest build --profile production --platform android` |
| 8 | Apple Developer Program 가입 | iOS 빌드와 제출에 필요하다. 연 99달러 | developer.apple.com | 가입 뒤 `npx eas-cli@latest build --profile production --platform ios`를 대화형으로 한 번 돌려 인증서와 프로필을 만든다. 비대화형 시도는 "Credentials are not set up"에서 멈췄다 |
| 9 | App Store Connect 앱 생성과 API 키 | `eas submit`의 자격 증명이다 | App Store Connect | 앱 숫자 ID를 `eas.json`의 `submit.production.ios.ascAppId`에 넣는다(지금 비어 있다). 메타데이터는 `store/ios-metadata.md`, 개인정보 라벨은 `store/privacy-labels.md` |
| 10 | Google Play Console 가입 | Android 제출에 필요하다. 25달러. 신규 개인 계정은 비공개 테스트 12명 14일 조건이 있다 | play.google.com/console | 앱 생성. 첫 업로드는 Console에서 손으로 한다. 등록정보 `store/android-listing.md`, 데이터 보안 양식 `store/privacy-labels.md`, 대상 연령 18세 이상 |
| 11 | Play 서비스 계정 JSON | `eas submit` Android 자격 증명이다 | Google Cloud 콘솔, Play Console API 접근 | 파일을 저장소 루트에 `google-service-account.json`으로 둔다(git 무시됨). `npx eas-cli@latest submit --platform android --profile production` |
| 12 | 처리방침과 약관 확정, 공개 URL 게시 | 스토어 등록 필수. 지금 앱 안 약관 화면에 `[운영자 이름]`, `[시행일]`, `[법무 확인]` 같은 초안 표시가 그대로 보인다. 이대로 내면 반려된다 | `docs/legal/*.md` | 자리표시자를 채우고 `[법무 확인]`을 변호사와 확인한 뒤 표시를 지운다. `npm run sync:legal`로 앱 문구에 반영한다. 처리방침, 약관, 지원, 계정 삭제 요청 웹 페이지를 게시한다(Play는 앱 안 삭제가 있어도 웹 삭제 페이지를 요구한다). URL을 스토어 등록정보와 `store/*.md` 자리표시자에 넣는다. `src/lib/api.ts`의 `TERMS_VERSION`을 시행일로 맞춘다. 웹으로 들어온 삭제 요청을 처리할 운영 절차도 정한다 |
| 13 | 심사용 데모 계정 | Apple 2.1, Play 앱 접근 심사에 필요하다. 비밀번호 로그인은 이 이메일에만 열린다 | 터미널(psql) | 추측하기 어려운 이메일과 20자 이상 비밀번호로 `psql "$SUPABASE_DB_URL" -v review_email='<이메일>' -v review_password='<비밀번호>' -f supabase/scripts/create-review-account.sql`. 값은 스토어 심사 메모에만 쓴다(`store/review-notes.md`의 `[REVIEW_EMAIL]`). 심사자가 포기나 삭제를 눌러 볼 수 있으니 제출 직전마다 다시 실행한다 |
| 14 | 정확한 알람 권한 신고 | Android 12 이상에서 1분 간격 독촉에 `SCHEDULE_EXACT_ALARM`을 쓴다. 알람 앱이 아니므로 `USE_EXACT_ALARM`은 쓰지 않는다 | Play Console 앱 콘텐츠 | 권한 선언 양식이 나오면 `store/review-risks.md` 6절 문구를 쓴다 |
| 15 | 실기기 확인 | 웹으로는 볼 수 없는 것들이다 | iOS, Android 각 1대. production 빌드 | 2절 목록 |
| 16 | AI 평가 실행과 표본 훑어보기 | AI 수업 품질은 실제 모델로만 잴 수 있다. 합격선을 하나라도 못 넘으면 출시하지 않는다(MP 7.1) | 터미널 | `GEMINI_API_KEY=<키> npm run eval`(약 250회 소량 과금 호출). 결과는 `evals/report.md`. `evals/sample-for-human.md` 20건을 읽어 본다 |
| 17 | 미실행 검증 처리 | 3절 | | |

## 2. 실기기 확인 목록

- 1분 간격 독촉이 실제로 1분마다 오는지. Android는 "알람 및 리마인더" 권한을 껐다 켜며 홈 배너, 설정 이동, 다시 예약을 본다.
- 알림을 누르면 맞는 화면으로 가는지. 이미 끝난 날의 독촉을 누르면 홈과 한 줄 안내가 뜨는지. 앱이 꺼진 상태에서 눌렀을 때도 본다.
- 학습 중 키보드가 입력창과 주 버튼을 가리지 않는지. iPhone SE와 360dp Android를 포함한다. 시스템 글자 크기 최대도 본다.
- Android 뒤로 가기가 새 목표 만들기, 반성문, 정지 안내에서 막히는지. 학습 중에는 나가지는지.
- 스플래시가 로그인 화면을 비치지 않고 넘어가는지. 세션이 보안 저장소에 남는지.
- 기기 다크 모드에서도 앱 색이 바뀌지 않는지.
- release 빌드 Hermes에서 시간대 계산(`Intl.DateTimeFormat` timeZone)이 맞는지. 서울과 다른 시간대 기기로 하루 키를 본다.
- 잠금 화면 알림 스크린샷(`store/screenshots/README.md` 2번)을 찍는다.

## 3. 미실행 또는 미검증

| 항목 | 상태 | 사유 |
|---|---|---|
| AI 수업 평가(MP 7.1) | 미실행 | Gemini 키가 없다. 하네스는 `AI_FAKE=1` 자체 점검만 통과했다. 품질 결과가 아니다 |
| 실제 Gemini 응답 전체 | 미검증 | 같은 이유. 모든 화면 확인은 고정 응답으로 했다 |
| iOS 빌드 | 미실행 | Apple Developer 계정이 없다 |
| 운영 값이 든 Android 빌드 | 미실행 | 운영 Supabase가 없다. 빌드 자체(네이티브 컴파일, 정확 알람 모듈)는 성공했다 |
| 실기기 동작 | 미검증 | 2절 목록 |
| 두 기기 같은 계정 | 미검증 | 서버가 이기는 구조만 코드로 확인했다 |
| 운영 인증 설정 | 미검증 | 로컬에서 같은 설정으로 OTP 가입과 재로그인, 비밀번호 가입 세션 미발급을 확인했다. 운영은 5번에서 확인한다 |

## 4. 출시 차단 항목

1. 처리방침과 약관의 초안 표시 제거와 법무 확인(12번).
2. AI 평가 합격(16번).
3. 0절 가입 연령 결정.
4. 운영 Supabase와 EAS 환경변수 설정 뒤 다시 빌드(2~7번).

## 5. UX 고도화 뒤 사람 확인

`feat/ux-polish` 작업(2026-10-19) 뒤 실기기에서만 볼 수 있는 것과 사람이 해야 하는 일이다. 웹 빌드는 네이티브 화면 전환, 스와이프 뒤로, 햅틱, 시스템 시각 선택기를 보여 주지 않는다.

### 5.1 개발 빌드를 다시 만든다
- 새 네이티브 의존성 `@react-native-community/datetimepicker`(9.1.0, app.json 플러그인), `expo-clipboard`가 들어갔다. 기존 개발 빌드와 Expo Go로는 열리지 않는다. `npx eas-cli@latest build --profile development --platform android`(iOS는 Apple 계정 뒤).
- 옛 개발 빌드는 이제 없는 `set_timezone`을 부른다(PGRST202). 새 빌드를 받아야 한다.

### 5.2 실기기 확인 목록

| 영역 | 확인할 것 |
|---|---|
| 한국 시간 | 기기 시간대를 뉴욕 등으로 바꾸고 홈, 목표 정하기 2/3, 목표 관리에 "한국 시간"이 보이는지. 알림이 한국 시각에 맞춰 울리는지(현지 시각으로는 다른 때). release Hermes `Intl.formatToParts`가 Asia/Seoul로 맞는지 |
| Sentry 시간대 | 해외 시간대 기기에서 Sentry를 켠 빌드로 테스트 오류를 보내고 이벤트 contexts에 `device.timezone`이나 `culture.timezone`이 들어가는지. 들어가면 privacy-labels 47행을 고치거나 beforeSend로 지운다(JS 층에는 채우는 코드가 없고 네이티브 SDK 소스는 node_modules에 없어 미검증) |
| 햅틱 | 주 버튼 누름의 가벼운 햅틱. 빠르게 연타할 때 눌림 크기와 불투명도 |
| 시트 | 쿠폰, 신고, 학습 나가기, 확인 시트의 스프링 느낌, 손잡이 끌어 닫기, Android 뒤로로 닫힘, 시트 안 키보드(iOS padding, Android 없음) |
| 토스트 | 위로 밀어 닫기 |
| 코치마크 | Android(edge-to-edge, statusBarTranslucent)에서 구멍 위치가 대상과 맞는지 |
| 입력창 | Composer가 5줄까지 늘어나는지 |
| 줄인 움직임 | 앱을 켠 채 설정을 바꿨을 때 눌림, 게이지, 스켈레톤, 점 3개, 시트가 페이드로 바뀌는지 |
| 화면 전환 | 홈→이유→학습→회고→완료가 각각 아래에서 올라오는지, 완료→홈이 아래로 내려가며 닫히는지(Android는 replace pop의 움직임을 코드로 확정하지 못함). 가입 화면 약관이 아래에서 올라오고 X로 닫히는지. 줄인 움직임이면 페이드인지 |
| 뒤로 | 학습 A·B·C와 회고에서 Android 뒤로와 iOS 스와이프가 나가기 시트를 띄우는지, 시트가 떠 있을 때 뒤로는 시트만 닫는지, 회고로 넘어가기·완료·04:00 이동이 시트에 막히지 않는지. 로그인 코드·비밀번호→이메일, 포기 2단계→1단계. 목표 정하기 1/3, 반성문, 정지 안내, 달성 축하에서 막히는지 |
| 겹친 시트 | 반성문, 정지 안내의 ⋯ → "계정 삭제하기"에서 고르기 시트가 닫히고 확인 시트가 뜨는지(iOS Modal 겹침) |
| 쿠폰 시트 | 투명 화면 위 시트의 끌어 닫기, 바탕 누르기, 뒤로, 닫을 때 깜빡임 |
| 큰 글자 | 학습 시계 첫 줄(X, 단계 이름, 오른쪽 표시)과 목표 정하기 헤더가 작은 화면에서 채팅 자리를 너무 차지하지 않는지 |
| 시각 선택기 | iOS: 시작 시각을 누르면 휠 시트가 뜨는지, 아이보리 바탕에서 휠 글자가 보이는지. Android: 시계 대화상자가 24시간제로 열리는지, 취소하면 그대로인지. 두 플랫폼 모두 해외 시간대 기기에서 22:00이 22:00으로 보이고 저장되는지 |
| 설정 알림 줄 | 알림 꺼짐 줄 → 시스템 설정에서 켜고 돌아오면 "켜짐"으로 바뀌는지. Android 정확한 시각 알림 거부면 빨강 점, 설정에서 켜고 오면 "허용됨" |
| 개발 패널 | 개발 빌드에서 "앱 버전" 7번 누름으로 개발 화면이 열리는지, 스토어 빌드에서는 반응이 없는지 |
| 문의하기 | 지원 연락처를 정하면 설정 정보 묶음에 문의하기 줄을 더한다(지금은 자리표시자라 뺐다) |
| 채팅 | 줄 길게 누르기(400ms)가 스크롤과 충돌하지 않는지. VoiceOver·TalkBack이 표시 중 줄을 처음부터 전체 문장으로 읽는지, 길게 누르기 동작을 찾을 수 있는지, 헤더 "더 보기"로 신고할 수 있는지. Hermes에서 35ms 글자 표시가 밀리지 않는지. 키보드가 올라온 채 새 메시지가 오면 맨 아래로 맞는지, 반성문 입력창 위로 새 답이 보이는지. 복습 한 줄 입력 키보드에 "보내기" 키, 자동 대문자·고침 꺼짐. 복사하기 뒤 실제 클립보드 |
| 학습 연출 | 정답·오답·보기 선택 햅틱의 세기와 1분 알림 진동과의 겹침. 첫 학습 규칙 모달에서 Android 뒤로가 아무 일도 하지 않는지. 단계 전환 중 상태 표시줄 글자색(B 밝게, A·C 어둡게). 막대 1초 선형 이동, "멈춤" 흐려짐, 오답 흔들림이 끊기지 않는지. 큰 글자 150%에서 학습 머리 줄이 X, "멈춤", "⋯"와 겹치지 않는지 |
