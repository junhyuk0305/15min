# 심사 메모

App Store Connect의 "앱 심사 정보 > 메모"와 Play Console의 "앱 액세스 권한 > 안내"에 붙여 넣습니다.
심사자가 영어로 읽으므로 본문은 영어로 씁니다. `[ ]`는 제출 전에 채웁니다.

## 1. 제출 전 확인

| 확인 | 방법 |
|---|---|
| 데모 계정이 로그인된다 | `[REVIEW_EMAIL]`과 `[REVIEW_PASSWORD]`로 직접 로그인해 봅니다 |
| 데모 계정에 활성 목표가 있고 바로 학습을 시작할 수 있다 | 제출 당일과 심사 기간 내내 확인합니다 |
| 데모 계정이 이용 정지 상태가 아니다 | 심사자가 포기를 신청했다면 철회해 둡니다 |
| 서버와 AI가 켜져 있다 | Supabase 함수와 Gemini API 결제 상태를 봅니다 |
| 심사 기간에 데모 계정을 삭제하지 않는다 | 심사자가 계정을 삭제하면 다시 만듭니다 |

## 2. 붙여 넣을 본문

```
Thank you for reviewing Graego.

WHAT THE APP DOES
Graego is an English conversation learning app that makes users stick to a goal they set. The user picks a real-life situation (for example, ordering at a cafe), study weekdays (5 or more per week), a start time and 10 to 30 minutes per day. Each day the user writes a short reason, reviews earlier expressions, practices a role-play chat in English with AI feedback, and ends with a 3-minute English reflection chat.

DEMO ACCOUNT
Email: [REVIEW_EMAIL]
Password: [REVIEW_PASSWORD]
1. On the sign-in screen, enter the email above. Because it is the review account, a password field appears instead of the 6-digit email code. Enter the password.
2. The demo account already has an active goal. Tap the goal card on the Home tab to start today's learning right away.
3. Normal users start the day after they create a goal. The demo account is set up so you can see the learning flow without waiting.

NOTIFICATIONS (CORE FEATURE, OPT-IN)
Reminding the user is the core purpose of the app. Before we request notification permission, the onboarding screen explains exactly what will happen: if the user does not start at the time they chose, the app sends a local notification every minute, up to 60 times, on that day only. The user sees this explanation and chooses to allow notifications.
- All notifications are local notifications scheduled on the device. We do not use a push server.
- Notifications are never used for ads or marketing.
- Completing the day or using a skip coupon cancels the remaining notifications for that day.
- No notifications are sent on rest days.
- Notification permission is not required. If the user declines it, onboarding continues, and Home shows a red banner with an Open Settings button.
- Users can turn notifications off in system settings at any time. The app keeps working.

GIVE-UP AND SUSPENSION
- A user can request to give up a goal in Settings > Goal. A 24-hour waiting period starts, and the user can withdraw the request at any time during it.
- Only if the user does not withdraw, the give-up is confirmed. The goal ends and the account is suspended for 7 days (1st confirmed give-up), 14 days (2nd), or permanently (3rd). A suspended user cannot create a new goal.
- This restriction is caused only by the user's own confirmed give-ups. It is explained before sign-up and in the Terms of Use. It is not a penalty imposed by us or by other users.
- During suspension the app shows a reflection chat about why the user gave up. Text links to Delete account, Terms of Use and Privacy Policy remain on the suspension screen and on the permanent suspension screen.
- If you try the give-up request on the demo account, please withdraw it within 24 hours, or the demo account will be suspended.

ACCOUNT DELETION
Settings > Delete account. Deletion happens immediately in the app. Users can also request deletion at [ACCOUNT_DELETION_URL].

AI
Learning chats are processed by the Google Gemini API through our server. At sign-up, users give a separate, required consent to AI processing by Google Gemini API and the related overseas data transfer. The consent time is stored. It is also described in the Privacy Policy.
Users can report any coach, partner or reflection reply inside the app without leaving it. Reports are stored for us to review.
Sign-up is limited to users aged 18 or older.

There is no chat between users and no user content is shared with other users.
The app is free with no in-app purchases and no ads.

ANDROID ONLY: EXACT ALARMS
The app declares SCHEDULE_EXACT_ALARM (not USE_EXACT_ALARM). The minute-by-minute reminders the user opted into must fire at the exact minute. If the user has not granted "Alarms & reminders", the app explains why and links to the system setting. Without it, reminders still arrive but may be delayed by a few minutes.

Contact: [운영자 이름], [연락처 이메일]
```

## 3. 본문에 들어간 사실과 확인할 곳

| 본문 문장 | 지금 상태 |
|---|---|
| 데모 계정은 비밀번호 입력란이 뜬다 | 결정로그 "심사용 데모 계정 판별". `login_method` RPC |
| 데모 계정은 바로 학습을 시작할 수 있다 | 시드 데이터로 맞춰야 합니다. 심사자가 아무 시각에 열어도 시작되는지 확인 `[앱 확인 필요]` |
| 알림을 거부해도 앱이 동작한다 | 반영. 거부해도 온보딩이 이어지고 홈에 붉은 배너와 설정 열기 버튼이 뜹니다 |
| 정지 중에도 계정 삭제, 이용약관, 개인정보처리방침을 쓸 수 있다 | 반영. 정지 화면과 영구 정지 화면에 세 텍스트 링크가 있습니다 |
| 가입 때 AI 처리에 동의한다 | 반영. 가입 화면의 별도 필수 동의. 동의 시각을 저장합니다 |
| AI 응답을 앱 안에서 신고할 수 있다 | 반영. 코치, 상대, 반성문 응답의 신고 버튼. `message_reports`에 메시지 ID, 사유, 시각 저장 |
| 만 18세 이상만 가입한다 | 반영 |
| 정확한 알람 권한이 없을 때 안내한다 | 권한 확인과 설정 이동 안내가 있어야 합니다 `[앱 변경 필요]` |
| 앱 이름 영문 표기 Graego | HANDOFF 1번에서 확정합니다 `[가정]` |
