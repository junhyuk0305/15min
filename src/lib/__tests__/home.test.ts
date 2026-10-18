import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppGoal, Message } from '../model';
import { tapTarget, type TapState } from '../notifyTarget';
import type { DayStatus } from '../rules';
import { EMPTY_CACHE, homeBanners, homeNoteOf, lastStudyResult, loadPhaseOf, longWaitOf, nextStudyDay, planInputOf, retroFirstLine } from '../selectors';

// 2026-10-19 월요일부터 월~금
const goal = (over: Partial<AppGoal> = {}): AppGoal => ({
  id: 'g',
  name: '카페에서 영어로 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  periodDays: 14,
  weekdays: [1, 2, 3, 4, 5],
  startMinutes: 22 * 60,
  targetMinutes: 15,
  situation: { place: '카페', myRole: '손님', partner: '바리스타', task: '주문' },
  subsituations: [],
  firstDay: '2026-10-19',
  status: 'active',
  coupons: 3,
  couponStreakGoalWeeks: 2,
  couponProgressDays: 0,
  settledDay: '2026-10-18',
  pendingChange: null,
  giveupRequestedAt: null,
  createdAt: 0,
  endedAt: null,
  ...over,
});
const row = (day: string, status: DayStatus) => ({ day, status });

// ---------- 배너 ----------

test('배너: 아무 문제 없으면 없다', () => {
  assert.deepEqual(homeBanners({ permission: 'granted', exactAlarm: 'granted', loadFailed: false, offline: false }), []);
});

test('배너: 알림이 꺼지면 설정 열기 배너 하나. 정확한 알람 배너는 같이 띄우지 않는다', () => {
  assert.deepEqual(homeBanners({ permission: 'denied', exactAlarm: 'denied', loadFailed: false, offline: false }), ['notif_off']);
});

test('배너: 알림은 켜졌는데 정확한 알람 권한이 없으면 그 배너', () => {
  assert.deepEqual(homeBanners({ permission: 'granted', exactAlarm: 'denied', loadFailed: false, offline: false }), ['exact_alarm']);
});

test('배너: 정확한 알람 권한을 알 수 없으면(Expo Go, 웹) 띄우지 않는다', () => {
  assert.deepEqual(homeBanners({ permission: 'granted', exactAlarm: 'unknown', loadFailed: false, offline: false }), []);
});

test('배너: 권한을 아직 묻지 않았으면 알림 배너는 없다', () => {
  assert.deepEqual(homeBanners({ permission: 'undetermined', exactAlarm: 'denied', loadFailed: false, offline: false }), []);
});

test('배너: 읽기 실패는 맨 위. 네트워크면 오프라인, 아니면 불러오기 실패', () => {
  assert.deepEqual(homeBanners({ permission: 'denied', exactAlarm: 'granted', loadFailed: true, offline: true }), ['offline', 'notif_off']);
  assert.deepEqual(homeBanners({ permission: 'granted', exactAlarm: 'granted', loadFailed: true, offline: false }), ['load_failed']);
});

// ---------- 학습일 ----------

test('다음 학습일: 금요일 다음은 월요일', () => {
  assert.equal(nextStudyDay(goal(), '2026-10-24'), '2026-10-26');
  assert.equal(nextStudyDay(goal(), '2026-10-23'), '2026-10-23');
});

test('다음 학습일: 첫 도전일 전이면 첫 도전일부터 센다', () => {
  assert.equal(nextStudyDay(goal({ firstDay: '2026-10-24' }), '2026-10-20'), '2026-10-26');
});

test('다음 학습일: 예약 변경(내일부터 주말 포함)을 따른다', () => {
  const g = goal({ pendingChange: { startMinutes: 1320, targetMinutes: 15, weekdays: [0, 1, 2, 3, 4, 5, 6], fromDay: '2026-10-24' } });
  assert.equal(nextStudyDay(g, '2026-10-24'), '2026-10-24');
});

test('지난 학습일 결과: 주말을 건너 금요일을 본다', () => {
  assert.deepEqual(lastStudyResult(goal(), [row('2026-10-23', 'done')], '2026-10-26'), { day: '2026-10-23', status: 'done' });
});

test('지난 학습일 결과: 판정 전이라 행이 없으면 실패로 본다', () => {
  assert.deepEqual(lastStudyResult(goal(), [], '2026-10-21'), { day: '2026-10-20', status: 'failed' });
});

test('지난 학습일 결과: 포기 대기일과 쉬는 요일 행은 건너뛴다', () => {
  const days = [row('2026-10-19', 'coupon'), row('2026-10-20', 'giveup_wait'), row('2026-10-21', 'rest')];
  assert.deepEqual(lastStudyResult(goal(), days, '2026-10-22'), { day: '2026-10-19', status: 'coupon' });
});

test('지난 학습일 결과: 첫 도전일이면 없다', () => {
  assert.equal(lastStudyResult(goal(), [], '2026-10-19'), null);
});

// ---------- 홈 한 줄 안내 ----------

test('어제 실패(S9)면 실패 안내', () => {
  assert.equal(homeNoteOf(goal(), [row('2026-10-20', 'failed')], '2026-10-21'), 'failed');
});

test('쿠폰 다음 학습일에 돌아오면 9.2 복귀 문장', () => {
  assert.equal(homeNoteOf(goal(), [row('2026-10-23', 'coupon')], '2026-10-26'), 'back_from_coupon');
});

test('오늘을 끝냈으면 지난 날 안내는 없다', () => {
  assert.equal(homeNoteOf(goal(), [row('2026-10-20', 'failed'), row('2026-10-21', 'done')], '2026-10-21'), null);
});

test('어제 완료면 안내 없음', () => {
  assert.equal(homeNoteOf(goal(), [row('2026-10-20', 'done')], '2026-10-21'), null);
});

// ---------- 완료 상태의 회고 첫 줄 ----------

const msg = (over: Partial<Message>): Message => ({
  id: 'm',
  goalId: 'g',
  day: '2026-10-21',
  phase: 'retro',
  role: 'user',
  text: '',
  meta: {},
  createdAt: 0,
  ...over,
});

test('회고 첫 답의 첫 줄만 보인다', () => {
  const ms = [
    msg({ id: 'b', text: 'Second answer', createdAt: 2 }),
    msg({ id: 'q', role: 'coach', text: 'What did you learn?', createdAt: 0 }),
    msg({ id: 'a', text: 'I learned "instead".\nTomorrow sizes.', createdAt: 1 }),
    msg({ id: 'x', phase: 'B', text: 'Latte please', createdAt: -1 }),
  ];
  assert.equal(retroFirstLine(ms), 'I learned "instead".');
});

test('회고 답이 없으면 null', () => {
  assert.equal(retroFirstLine([msg({ role: 'coach', text: 'Q1' })]), null);
});

// ---------- 로딩 단계 ----------

test('로딩: 300ms 전에는 띄우지 않고, 10초를 넘으면 오류', () => {
  assert.equal(loadPhaseOf(null, false), 'idle');
  assert.equal(loadPhaseOf(0, false), 'pending');
  assert.equal(loadPhaseOf(299, false), 'pending');
  assert.equal(loadPhaseOf(300, false), 'loading');
  assert.equal(loadPhaseOf(9_999, false), 'loading');
  assert.equal(loadPhaseOf(10_000, false), 'error');
  assert.equal(loadPhaseOf(null, true), 'error');
});

// ---------- 알림 탭 ----------

const state = (over: Partial<TapState> = {}): TapState => ({
  hasActiveGoal: true,
  giveupPending: false,
  suspended: false,
  today: '2026-10-21',
  todayStatus: 'none',
  ...over,
});

test('알림 탭: 오늘 독촉은 오늘의 이유로 간다', () => {
  assert.deepEqual(tapTarget({ url: '/session/reason', kind: 'nag', day: '2026-10-21' }, state()), { path: '/session/reason', stale: false });
});

test('알림 탭: 이미 완료한 날의 독촉은 홈과 안내', () => {
  assert.deepEqual(tapTarget({ url: '/session/reason', kind: 'nag', day: '2026-10-21' }, state({ todayStatus: 'closed' })), { path: '/', stale: true });
});

test('알림 탭: 지난 날의 시작 알림은 끝난 것', () => {
  assert.deepEqual(tapTarget({ url: '/session/reason', kind: 'start', day: '2026-10-20' }, state()), { path: '/', stale: true });
});

test('알림 탭: 학습 중 나간 뒤 독촉은 그대로 연다(route.ts가 학습 화면으로 보낸다)', () => {
  assert.deepEqual(tapTarget({ url: '/session/reason', kind: 'nag', day: '2026-10-21' }, state({ todayStatus: 'progress' })), {
    path: '/session/reason',
    stale: false,
  });
});

test('알림 탭: 포기 신청 중이면 사이클 알림은 끝난 것', () => {
  assert.equal(tapTarget({ url: '/session/reason', kind: 'nag', day: '2026-10-21' }, state({ giveupPending: true })).stale, true);
});

test('알림 탭: 철회한 뒤의 포기 대기 알림은 끝난 것, 대기 중이면 홈', () => {
  assert.deepEqual(tapTarget({ url: '/', kind: 'giveup_wait', day: '2026-10-20' }, state()), { path: '/', stale: true });
  assert.deepEqual(tapTarget({ url: '/', kind: 'giveup_wait', day: '2026-10-20' }, state({ giveupPending: true })), { path: '/', stale: false });
});

test('알림 탭: 정지가 끝난 뒤의 반성문 알림은 끝난 것', () => {
  assert.equal(tapTarget({ url: '/suspended', kind: 'suspended', day: '2026-10-21' }, state({ hasActiveGoal: false })).stale, true);
  assert.deepEqual(tapTarget({ url: '/suspended', kind: 'suspended', day: '2026-10-21' }, state({ hasActiveGoal: false, suspended: true })), {
    path: '/suspended',
    stale: false,
  });
});

test('알림 탭: 새 목표를 이미 만들었으면 목표 없음 알림은 끝난 것', () => {
  assert.equal(tapTarget({ url: '/goal/new', kind: 'no_goal', day: '2026-10-21' }, state()).stale, true);
  assert.deepEqual(tapTarget({ url: '/goal/new', kind: 'no_goal', day: '2026-10-21' }, state({ hasActiveGoal: false })), {
    path: '/goal/new',
    stale: false,
  });
});

test('알림 탭: 종류가 없는 예전 알림은 경로만 따르고, 외부 주소는 막는다', () => {
  assert.deepEqual(tapTarget({ url: '/session/reason' }, state()), { path: '/session/reason', stale: false });
  assert.deepEqual(tapTarget({ url: '//evil.example' }, state()), { path: '/', stale: false });
  assert.deepEqual(tapTarget(null, state()), { path: '/', stale: false });
});

// ---------- 정지 중 알림 시각 ----------

test('정지 중 알림: 프로필의 원래 시작 시각을 먼저 쓰고, 없으면 캐시한 목표 시각을 쓴다', () => {
  const NOW = Date.UTC(2026, 9, 21, 3);
  const profile = {
    userId: 'u',
    giveupConfirmedCount: 1,
    suspendedUntil: NOW + 7 * 86400_000,
    suspendedGoalId: 'g0',
    suspendedStartMinutes: 1260,
    suspendedTargetMinutes: 15,
    banned: false,
  };
  const cached = { id: 'g0', startMinutes: 1320, targetMinutes: 15 };
  assert.equal(planInputOf({ ...EMPTY_CACHE, profile, suspendedGoal: cached }, NOW).suspension?.startMinutes, 1260);
  const old = { ...profile, suspendedStartMinutes: null, suspendedTargetMinutes: null };
  assert.equal(planInputOf({ ...EMPTY_CACHE, profile: old, suspendedGoal: cached }, NOW).suspension?.startMinutes, 1320);
  assert.equal(planInputOf({ ...EMPTY_CACHE, profile: old }, NOW).suspension, null);
});

test('홈 카운트다운: 24시간 이상이면 일과 시간, 그보다 짧으면 null', () => {
  const H = 3_600_000;
  assert.equal(longWaitOf(23 * H + 59 * 60_000), null);
  assert.deepEqual(longWaitOf(24 * H), { days: 1, hours: 0 });
  // 33:33:17 → 1일 9시간
  assert.deepEqual(longWaitOf(33 * H + 33 * 60_000 + 17_000), { days: 1, hours: 9 });
  assert.deepEqual(longWaitOf(50 * H), { days: 2, hours: 2 });
});
