# 스토어 반려 위험과 대응

Apple과 Google 심사 기준 중 그래고가 걸릴 수 있는 항목입니다. 2026-10-18에 공식 페이지에서 조항을 확인했습니다.
"앱 변경 필요"는 제출 전에 코드를 고쳐야 하는 항목입니다. "사람 필요"는 콘솔이나 웹에서 사람이 할 일입니다.

확인한 페이지:
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play AI 생성 콘텐츠: https://support.google.com/googleplay/android-developer/answer/13985936
- Google Play 계정 삭제 요구사항: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play 데이터 보안: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play 민감한 권한(정확한 알람): https://support.google.com/googleplay/android-developer/answer/13161072
- Google Play 시스템 기능 모방: https://support.google.com/googleplay/android-developer/answer/9969861
- Android 정확한 알람: https://developer.android.com/develop/background-work/services/alarms/schedule
- Gemini API 추가 약관: https://ai.google.dev/gemini-api/terms

## 요약

| # | 위험 | 등급 | 상태 |
|---|---|---|---|
| 1 | AI 공급자 약관의 만 18세 기준 | 높음 | 반영(만 18세 이상 가입) |
| 2 | Play AI 생성 콘텐츠 신고 기능 | 높음 | 반영(길게 누르기와 헤더 ⋯ 메뉴). 운영 절차는 사람 필요 |
| 3 | 제3자 AI로 보내는 데이터의 명시 동의 (Apple 5.1.2(i)) | 높음 | 반영 |
| 4 | 알림을 거부하면 진행이 막힘 (Apple 4.5.4, 5.1.1(iv)) | 높음 | 반영 |
| 5 | 알림 빈도 | 중간 | 문서로 대응 |
| 6 | 정확한 알람 권한 | 중간 | 반영. 실기기 확인은 사람 필요 |
| 7 | 이용 정지 기능과 정지 중 계정 삭제 | 중간 | 반영 |
| 8 | 계정 삭제 웹 링크 (Play) | 중간 | 사람 필요 |
| 9 | 데모 계정 | 중간 | 사람 필요 |
| 10 | 최소 기능 | 낮음 | 문서로 대응 |
| 11 | 꼬집는 말투 | 낮음 | 문서로 대응 |
| 12 | 데이터 보안 양식과 개인정보 라벨 정확성 | 중간 | 문서로 대응 |
| 13 | 연령 등급 | 낮음 | 문서로 대응 |
| 14 | 개인정보 국외 이전 고지 | 중간 | 법무 확인 |
| 15 | 메타데이터의 자리 표시 | 중간 | 사람 필요 |

## 1. AI 공급자 약관의 만 18세 기준

근거: Gemini API 추가 약관 "Age Requirements". "You also will not use the Services as part of a website, application, or other service (collectively, 'API Clients') that is directed towards or is likely to be accessed by individuals under the age of 18."
스토어 조항은 아닙니다. 그래도 어기면 Google이 API 이용을 끊을 수 있고, 그러면 학습 기능 전체가 멈춥니다.
대응:
- 가입은 만 18세 이상만 받습니다. 가입 화면 체크 문구, 약관 제4조, 처리방침 8절, 스토어 설명, Play 타겟층(18세 이상만)이 같은 기준입니다.
- 만 14세 미만 법정대리인 동의 문제도 생기지 않습니다.
- `[결정 필요]` 가입 연령을 만 14세로 낮추면 Gemini API 약관 위반입니다. 낮추려면 AI 공급자를 바꾸고 그 공급자의 연령 기준을 먼저 확인해야 합니다.
상태: 반영.

## 2. Play AI 생성 콘텐츠 신고 기능

근거: Google Play AI 생성 콘텐츠 정책. "Apps that generate content using AI must contain in-app user reporting or flagging features that allow users to report or flag offensive content to developers without needing to exit the app."
적용 범위 설명은 "Text-to-text AI chatbot apps, in which the AI generated chatbot interaction is a central feature of the app"를 예로 듭니다. 그래고는 AI 상대와의 영어 대화가 학습의 중심입니다. 대상에 들어갑니다.
Apple 1.2도 "AI content creation apps"에 신고 방법과 연락처를 요구합니다. 그래고는 이용자끼리 콘텐츠를 공유하지 않습니다. 그래서 차단 기능은 해당하지 않는다고 봅니다. 신고 기능은 Apple 쪽 위험도 함께 줄입니다.
대응:
- 신고 수단은 두 곳입니다(2026-10-19 UX 고도화에서 바꿈). 줄마다 붙던 밑줄 "신고" 글자는 없앴습니다.
  - 상대와 코치 줄을 길게 누르면 아래에서 시트가 올라옵니다. "신고하기"를 누르고 이유 3개 중 하나를 고르면 끝납니다. 같은 시트에 "복사하기"도 있습니다.
  - 학습, 회고, 목표 정하기, 반성문 화면의 헤더 오른쪽 "⋯" 메뉴에 "신고하기"가 늘 있습니다. 그 화면의 가장 최근 AI 응답을 신고합니다. 복습의 상황 적용 문항은 상대 대사를 길게 누르거나 "⋯"로 신고합니다.
- 길게 누르기는 처음 보는 사람이 모를 수 있습니다. 그래서 첫 AI 응답 아래에 "이상한 답은 길게 눌러 신고할 수 있습니다." 말풍선을 한 번 띄웁니다. 헤더 "⋯"는 눈에 보이는 메뉴라 길게 누르기를 몰라도 찾을 수 있습니다. 두 정책 문장("in-app user reporting or flagging features", Apple 1.2의 신고 방법)은 이 두 수단으로 충족한다고 봅니다.
- 어느 쪽이든 앱을 나가지 않고 신고가 끝나고, 끝나면 화면 위에 "신고했습니다." 토스트가 뜹니다.
- 학습, 회고, 복습, 반성문 응답은 `report_message`로 `message_reports` 표에 메시지 ID, 사유, 시각을 저장합니다.
- 목표 설정 대화(`goal-setup`)는 서버에 저장하지 않아 가리킬 행이 없습니다. `report_ai_text`로 응답 글을 함께 보내 같은 표에 저장합니다(24시간에 20건).
- 처리방침 2.1과 9절 5, 데이터 보안 양식 2.2, 두 스토어 설명에 같은 내용을 적었습니다.
- 심사 메모에 신고 위치를 적습니다: "AI 응답을 길게 누르거나 화면 오른쪽 위 ⋯ 메뉴에서 신고하기".
- 남은 일: 운영자가 신고를 정기적으로 확인하고 대응하는 절차를 정합니다. 사람 필요.
상태: 반영(학습, 회고, 복습, 목표 설정 대화, 반성문). 운영 절차는 사람 필요.

## 3. 제3자 AI로 보내는 데이터의 명시 동의

근거: Apple 5.1.2(i). "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
학습 대화와 처음 이유는 Google Gemini API로 갑니다. 처리방침에만 적으면 부족합니다. 데이터를 보내기 전에 화면에서 명시적으로 동의를 받아야 합니다.
대응:
- 가입 화면에 Google Gemini API의 AI 처리와 국외 이전에 대한 별도 필수 동의가 있습니다.
- 동의하지 않으면 가입되지 않습니다. 동의 시각을 저장합니다.
- 한국 개인정보 보호법 제28조의8의 국외 이전 고지도 같은 동의로 처리합니다(14번).
상태: 반영.

## 4. 알림을 거부하면 진행이 막힘

근거:
- Apple 4.5.4. "Push Notifications must not be required for the app to function."
- Apple 5.1.1(iv). "Apps must respect the user's permission settings and not attempt to manipulate, trick, or force people to consent to unnecessary data access." "Where possible, provide alternative solutions for users who don't grant consent."
4.5.4는 푸시 알림 조항이고 그래고는 로컬 알림입니다. 그래도 권한을 주지 않으면 앱을 못 쓰게 하면 심사자는 이 조항으로 볼 가능성이 큽니다.
대응:
- 알림을 거부해도 온보딩이 이어지고 목표를 만들고 학습할 수 있습니다.
- 홈에 알림이 꺼졌다는 붉은 배너와 설정 열기 버튼이 뜹니다. 기획서 12.2와 같습니다.
- 권한 요청 전 화면에서 1분마다 최대 60회 알림을 미리 설명합니다.
상태: 반영.

## 5. 알림 빈도

근거:
- Apple 4.5.4. 알림을 광고와 마케팅에 쓰려면 명시적 동의와 거부 방법이 필요합니다. 민감한 개인 정보를 알림으로 보내면 안 됩니다.
- Google Play 스팸 정책. "We don't allow apps that spam users or Google Play, such as apps that send users unsolicited messages"
- Google Play 시스템 기능 모방 정책. "System level notifications may only be used for an app's integral features"
1분마다 최대 60회는 스팸으로 보일 수 있습니다.
대응:
- 알림은 앱의 핵심 기능입니다. 이용자가 고른 시각에, 이용자가 미리 설명을 듣고 허용한 경우에만 보냅니다.
- 광고, 마케팅, 다른 앱 홍보에 쓰지 않습니다.
- 학습 요일에만 보내고, 완료하거나 쿠폰을 쓰면 남은 알림을 취소합니다.
- 기기 설정에서 언제든 끌 수 있고, 꺼도 앱은 동작합니다.
- 심사 메모와 스토어 설명에 같은 내용을 씁니다.
남은 위험: 알림 문구에 이용자가 쓴 처음 이유가 들어가 잠금 화면에 보일 수 있습니다. 4.5.4의 "sensitive personal or confidential information"에 걸릴 여지가 있습니다. 약관 제8조 9에 알렸습니다. 설정에 "알림에 이유 숨기기"를 두면 위험이 더 줄어듭니다. `[권장 앱 변경]`
상태: 문서로 대응.

## 6. 정확한 알람 권한

근거:
- Google Play 민감한 권한 정책. `USE_EXACT_ALARM`은 핵심 기능이 정확한 알람인 앱(알람 시계, 타이머, 캘린더)만 쓸 수 있습니다. 대상이 아니면 게시가 막힐 수 있습니다.
- Android 문서. "The SCHEDULE_EXACT_ALARM permission is not pre-granted to fresh installs of apps targeting Android 13 (API level 33) and higher." 권한이 철회되면 앱이 멈추고 예약된 정확한 알람이 모두 취소됩니다.
- 같은 정책. "Offer a different way to perform a function if a user denies a permission."
그래고는 알람 앱도 캘린더 앱도 아닙니다. `USE_EXACT_ALARM`을 쓰면 반려 위험이 큽니다.
대응:
- `SCHEDULE_EXACT_ALARM`만 선언합니다. `app.json`이 지금 그렇게 되어 있습니다. `USE_EXACT_ALARM`은 넣지 않습니다.
- 앱이 권한 상태를 확인합니다. 없으면 왜 필요한지 설명하고 "알람 및 리마인더" 설정으로 보냅니다.
- 권한이 없어도 알림은 예약합니다. 몇 분 늦을 수 있다고 홈에 알립니다.
- 권한을 다시 받으면 알림을 다시 예약합니다.
- expo-notifications가 권한이 없을 때 어떻게 예약하는지 문서에 없습니다. 실기기에서 확인합니다.
- Play Console에 정확한 알람 신고 질문이 나오면 "이용자가 정한 시각에 1분 간격 학습 알림"으로 답합니다.
상태: 반영(홈 배너, 설정 이동, 다시 허용하면 알림 재예약). 사람 필요(실기기 확인).

## 7. 이용 정지 기능과 정지 중 계정 삭제

근거:
- Apple 5.1.1(v). "If your app supports account creation, you must also offer account deletion within the app."
- Apple 2.3. 메타데이터는 앱의 핵심 경험을 정확히 보여야 합니다.
심사자는 정지된 계정을 보고 운영자가 이용자를 처벌하는 기능으로 오해할 수 있습니다. 또 기획서 8.4는 정지 중 "반성문 채팅 화면만 보인다"고 정했습니다. 이대로면 정지된 이용자가 계정을 삭제할 수 없습니다.
대응:
- 정지는 이용자 본인이 포기를 신청하고 24시간 안에 철회하지 않았을 때만 생긴다고 심사 메모, 약관 제10조, 스토어 설명에 씁니다.
- 가입 전 온보딩 4장의 경고 카드에서 포기 24시간 대기와 정지 7일, 14일, 영구 정지를 보여 줍니다.
- 정지 화면과 영구 정지 화면에 계정 삭제, 이용약관, 개인정보처리방침 텍스트 링크가 있습니다.
상태: 반영.

## 8. 계정 삭제 웹 링크

근거: Google Play 계정 삭제 요구사항. 앱 안 삭제 경로와 함께 "provide a web link resource where users can request app account deletion and associated data deletion"이 필요합니다. 앱 안에서 바로 삭제되어도 필요합니다. 웹 페이지는 Play 등록정보의 앱 이름이나 개발자 이름을 보여야 합니다. 데이터 일부를 남기면 처리방침에 알려야 합니다.
대응:
- 웹 페이지를 하나 게시합니다. 앱 이름 "그래고", 운영자 이름, 삭제 요청 방법(가입 이메일로 [연락처 이메일]에 요청), 삭제되는 데이터, 남는 데이터(이메일 해시, 포기 확정 횟수, 정지 종료일, 반성문 시간, 삭제 일시, 1년)를 적습니다.
- 처리방침 3.2에 남는 데이터를 이미 적었습니다.
- 요청을 받으면 운영자가 처리할 방법이 필요합니다. 예: `delete-account`와 같은 내부 함수를 이메일로 호출하는 관리자 스크립트. `[앱 변경 필요]`
- Play 데이터 보안 양식에 이 URL을 넣습니다.
상태: 사람 필요.

## 9. 데모 계정

근거: Apple 2.1(a). "include demo account info (and turn on your back-end service!) if your app includes a login."
그래고는 목표를 만든 다음 날부터 학습이 열립니다. 이메일 인증번호 로그인이라 심사자가 메일을 받을 수도 없습니다.
대응:
- 심사용 계정은 비밀번호로 로그인합니다. 서버가 `REVIEW_EMAIL`일 때만 비밀번호 입력을 보입니다.
- 심사용 계정에는 바로 시작할 수 있는 활성 목표를 미리 넣어 둡니다.
- 심사 기간에 서버와 Gemini API 결제를 켜 둡니다.
- 심사자가 포기를 신청하면 정지될 수 있습니다. 심사 메모에 24시간 안에 철회해 달라고 적었습니다.
상태: 사람 필요(비밀번호 설정, 시드 확인).

## 10. 최소 기능

근거: Apple 4.2. "Your app should include features, content, and UI that elevate it beyond a repackaged website." Google Play 최소 기능 정책도 기능이 적은 앱을 막습니다.
대응: 목표 설정 대화, 상황 역할극 학습, 복습 문제와 채점, 회고, 기록 달력, 로컬 알림, 쿠폰이 있습니다. 웹 페이지를 감싼 앱이 아닙니다. 데모 계정으로 하루 학습 전체를 볼 수 있게 합니다.
상태: 문서로 대응.

## 11. 꼬집는 말투

근거: Apple 1.1. "Apps should not include content that is offensive, insensitive, upsetting". 1.1.1은 특정 집단을 비하하는 내용을 막습니다.
그래고의 알림과 포기 흐름은 이용자의 옛 모습을 꼬집습니다.
대응:
- 재료는 이용자가 직접 쓴 말과 기록뿐입니다. 성격과 의지를 단정하는 말은 쓰지 않습니다. 인종, 성별, 종교 같은 집단을 언급하지 않습니다.
- 반성문과 알림 문구는 이용자가 쓴 이유에 외모가 있을 때만 외모를 언급합니다. 앱이 먼저 꺼내지 않습니다.
- 가입 전에 이 말투를 알립니다.
- 참고: 외모 언급은 이용자가 먼저 썼어도 심사자가 불쾌하게 볼 수 있습니다. 1차 출시에서 아예 빼면 위험이 더 줄어듭니다.
상태: 문서로 대응.

## 12. 데이터 보안 양식과 개인정보 라벨 정확성

근거:
- Apple 2.3. "all your app metadata, including privacy information ... accurately reflect the app's core experience"
- Apple 5.1.1(i). 처리방침은 수집 데이터, 제3자, 보관과 삭제 정책을 밝혀야 합니다.
- Google Play 데이터 보안. 수탁자 전송은 공유가 아닙니다. 수집 여부와 목적은 정확해야 합니다.
대응:
- `store/privacy-labels.md`는 처리방침 2절과 같은 항목만 씁니다. 3절에 대응표를 두었습니다.
- Sentry DSN을 넣은 빌드를 낼 때는 충돌 데이터와 진단 줄을 함께 답합니다.
- 신고 내용(`message_reports`)과 Expo 앱 업데이트 식별값을 양식에 넣었습니다.
- 제출 전에 `legal-doc-audit` 스킬로 문서, 코드, DB를 다시 맞춰 봅니다.
상태: 문서로 대응.

## 13. 연령 등급

근거: Apple 2.3.6. "Answer the age rating questions in App Store Connect honestly". Google Play는 IARC 설문으로 등급을 매깁니다.
대응: `store/ios-metadata.md` 6절과 `store/android-listing.md` 6, 7절에 답과 근거를 적었습니다. 이용자끼리 대화하는 기능이 없어 "메시지와 채팅"은 아니요로 답합니다. AI 문항이 있으면 예로 답합니다. 가입이 만 18세 이상이므로 Play 타겟층은 18세 이상만 고릅니다.
상태: 문서로 대응.

## 14. 개인정보 국외 이전 고지

근거: 개인정보 보호법 제28조의8. 국외로 이전하려면 별도 동의를 받거나, 계약 이행에 필요한 위탁과 보관이면 처리방침에 아래를 공개해야 합니다. 이전 항목, 이전 국가와 시기와 방법, 이전받는 자의 이름과 연락처, 목적과 보유 기간, 거부 방법과 거부했을 때의 결과. 시행령 제31조는 국외 이전의 근거도 처리방침에 적게 합니다.
대응:
- 처리방침 7절에 Google, Supabase, [SMTP 제공자], Expo, Sentry의 이전 표를 두었습니다.
- Supabase 리전과 SMTP 제공자를 정하면 표를 채웁니다.
- 3번의 가입 동의 항목으로 별도 동의도 받습니다. 처리방침 공개와 동의를 함께 두는 쪽이 안전합니다. `[법무 확인]`
- Google, Supabase, Expo의 연락처를 채웁니다.
- 제28조의8 제2항은 제1호 동의를 받을 때 다섯 가지(항목, 국가와 시기와 방법, 받는 자와 연락처, 목적과 보유 기간, 거부 방법과 효과)를 미리 알리게 합니다. 지금 가입 화면의 AI 동의 체크에는 이 내용이 바로 보이지 않습니다. 옆의 "처리방침 보기"로 충분한지 확인합니다. `[법무 확인]`
상태: 법무 확인.

## 15. 메타데이터의 자리 표시

근거: Apple 2.1(a). "placeholder text, empty websites, and other temporary content should be scrubbed before submission."
처리방침, 약관, 스토어 문서에 `[운영자 이름]`, `[연락처 이메일]`, `[시행일]`, `[법무 확인]` 같은 표시가 남아 있습니다.
대응: 게시 전에 모든 `[`를 검색해 채우거나 지웁니다. 처리방침과 약관 URL, 지원 URL, 계정 삭제 URL이 실제로 열리는지 확인합니다.
상태: 사람 필요.
