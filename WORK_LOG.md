# Yourtime 작업 로그

최종 확인: 2026-10-18 (브랜치 `feat/mvp-launch`)

이 문서는 현재 코드와 검증 결과를 확인해 갱신했다. 확인된 구현, 문서에 적힌 방향, 아직 검증되지 않은 내용을 구분한다.
사람이 할 일은 `docs/HANDOFF.md`, 묻지 않고 정한 것은 `docs/결정로그.md`에 있다.

## 앱 목적

목표를 정하면 달성할 때까지 하게 만드는 영어 학습 앱이다. 안 하면 1분마다 독촉하고, 포기에는 이용 정지라는 대가가 있다. 정본은 `docs/기획서.md` v9다.

## 대상 학습자

수능 뒤 영어를 놓은 성인 '가짜 초보'다. 가입은 만 18세 이상만 받는다. Gemini API 약관 때문이다(결정로그).

## 구조

- 앱: Expo 57, expo-router, zustand. 서버 데이터의 캐시만 기기에 둔다.
- 서버: Supabase. 이메일 6자리 OTP 인증, Postgres 표 11개와 RLS, 상태 변경 RPC, pg_cron(포기 확정, 정지 해제, 매시 판정, 보관 삭제).
- AI: Supabase Edge Function 6개(목표 설정, 수업 턴, 복습 퀴즈, 회고, 반성문, 계정 삭제)가 Gemini Interactions API를 부른다. 기본 모델 gemini-3.8-flash, gemini-3.5-flash-lite. 키는 서버에만 있다.
- 알림: 기기 로컬 알림. Android 정확한 알람 권한은 로컬 Expo 모듈(`modules/exact-alarm`)로 확인한다.
- 정책 숫자와 판정은 `src/lib/rules.ts`, 알림 계획은 `src/lib/plan.ts`, 문구는 `src/lib/copy.ts` 한 곳에 있다. 서버 함수는 rules.ts 사본(`npm run sync:rules`)을 쓴다.

## 핵심 기능과 현재 구현

- 온보딩 4장(후킹, 문제, 약속, 경고와 알림). 알림을 거부해도 넘어가고 홈에 붉은 배너가 뜬다.
- 가입: 이메일 OTP와 필수 동의 3개(18세, 약관과 처리방침, AI 처리와 국외 이전). 심사용 계정만 비밀번호 로그인.
- 목표 설정: 코치와 채팅으로 이유, 장소, 역할, 상대, 해결할 일, 목표 이름을 정한다. 기간(7~90일), 학습 요일(주 5일 이상), 시작 시각, 하루 학습 분(10~30분)은 위젯으로 고른다. 다음 날부터 시작한다.
- 하루 학습: 오늘의 이유 → A 복습(20%) → B 상황 대화(60%, 다크) → C 오늘 복습(20%) → 3분 영어 회고 → 완료. 시간은 서버가 확인하고 화면이 켜져 있을 때만 줄어든다. 2분 무활동이면 딴짓 팝업.
- 코치 모달은 표현 1개와 단어 최대 2개. 복습 간격은 학습일 기준 1, 3, 7, 14일.
- 쿠폰, 포기 신청과 철회, 포기 확정 뒤 이용 정지(7일, 14일, 영구)와 반성문 채팅, 달성 선언.
- 기록: 달력(기호로 구분)과 카드, 단계별 대화와 회고.
- 계정 삭제는 앱 안에서 즉시. 정지 회피를 막으려고 정규화한 이메일의 HMAC과 포기 횟수, 정지 종료일만 남긴다.
- AI 응답 신고 버튼(Play 정책).

## 검증 상태

- 게이트: typecheck, lint, 앱 테스트 224개, check:static, expo-doctor 21/21, Edge Function 테스트 59개, pgTAP 349개. 모두 통과.
- 사용자 여정 S1~S17: DB 쪽은 시간을 주입한 pgTAP, 화면 쪽은 웹 빌드 Playwright로 모두 통과(`docs/시나리오검증.md`). AI는 고정 응답이었다.
- 화면 상태: 모든 라우트의 로딩, 빈 데이터, 오류, 오프라인, 정상을 캡처했다(`docs/화면상태.md`). 주 버튼 2개인 화면 없음.
- 독립 검증: verify, 조용한 실패 탐색, 처음 사용자 워크스루, 보안 점검(cso), 법무 문서 대조를 돌렸고 찾은 결함을 고친 뒤 다시 검증했다.
- 빌드: Android production 빌드 성공(EAS). iOS는 Apple 계정이 없어 미실행.

## 아직 해결되지 않았거나 미확인인 문제

- 실제 Gemini로 돌린 AI 수업 평가(MP 7.1)를 하지 않았다. 키가 없다.
- 실기기 확인(알림 1분 간격, 알림 탭 이동, 키보드, 뒤로 가기, 정확한 알람 권한)을 하지 않았다.
- 처리방침과 약관은 초안이다. 앱 안 약관 화면에 자리표시자가 그대로 보인다. 법무 확인이 필요하다.
- 운영 Supabase와 EAS 환경변수가 없어 지금 빌드는 서버에 붙지 않는다.
- 받아들인 위험 3건(기기 캐시 평문, 재가입으로 개인 AI 상한 초기화, 퀴즈 정답이 meta에 있음)은 결정로그에 있다.

## 로컬에서 직접 확인하는 법

운영 서버가 없으므로 이 PC 안에서만 돌려 본다. AI는 고정 응답이다.

1. Docker Desktop을 켠다.
2. `npx supabase start`로 로컬 DB와 인증 서버를 띄운다. 포트는 546xx다. 다른 프로젝트가 543xx를 쓰고 있다.
3. `AI_FAKE=1` 한 줄만 든 env 파일을 만든다. `npx supabase functions serve --env-file <그 파일>`로 AI 함수를 고정 응답 모드로 띄운다. 이렇게 띄우지 않으면 AI 호출이 "GEMINI_API_KEY missing"으로 실패한다.
4. `npx expo start --web --port 8081`을 실행하고 http://localhost:8081을 연다. 앱은 `.env.local`(git 무시됨)에서 로컬 주소를 읽는다.
5. 로그인:
   - 데모 계정 `review@graego.app` / `local-review-only`. 비밀번호 로그인은 이 계정에만 열린다.
   - 새 이메일로 가입하면 인증 코드가 실제 메일함으로 가지 않는다. 로컬 메일함 http://127.0.0.1:54624 에 잡힌다.
6. 새 계정은 목표를 만든 다음 날부터 학습이 열린다. 오늘 학습 화면을 보려면 데모 계정을 쓴다.
   - 데모 계정 기록을 처음 상태로 되돌리려면 그 목표의 days와 messages 행을 지운다.
   - 그다음 goals.first_day를 오늘(서울 시각에서 4시간을 뺀 날짜)로 바꾼다.
7. 표는 Supabase Studio http://127.0.0.1:54623 에서 본다. 테스트 중 에이전트가 만든 가짜 계정이 수십 개 들어 있다.

## 다음 작업

`docs/HANDOFF.md`의 0절(결정 필요)과 1절 순서를 따른다. 출시 차단 항목은 4절에 있다.
2~4번(Supabase 프로젝트, Gemini 키, 약관 확정)이 끝나면 운영 배포와 다시 빌드를 이어서 한다. 휴대폰에서 직접 보려면 개발용 앱 빌드(`eas build --profile development`)가 따로 필요하다.

## 참고 파일

- `docs/HANDOFF.md`, `docs/결정로그.md`, `docs/용어집.md`, `docs/화면상태.md`, `docs/시나리오검증.md`
- `docs/legal/`, `store/`, `evals/`
- `src/lib/rules.ts`, `src/lib/plan.ts`, `src/lib/copy.ts`, `src/lib/store.ts`, `src/lib/api.ts`, `src/lib/route.ts`
- `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`
