import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canAsk,
  choicesOf,
  defaultPlan,
  firstStart,
  MAX_LINES,
  mergeFields,
  missingFields,
  progressOf,
  setMinute,
  toGoalInput,
  toggleWeekday,
  weekdaysShort,
  wrapDay,
  type SetupLine,
} from '../../components/goal/logic';
import { profileFromRow } from '../model';
import { goalInputError, zonedTime } from '../rules';

const TZ = 'Asia/Seoul';
const FULL = { reason: '해외 출장 때마다 손짓으로 주문하는 게 창피해서', place: '스타벅스', my_role: '손님', partner: '바리스타', task: '옵션 바꿔 주문하기', goal_name: '스타벅스에서 막힘없이 주문하기' };

test('missingFields: 이유는 20자 미만이면 빈 것으로 본다', () => {
  assert.deepEqual(missingFields({}), ['reason', 'place', 'my_role', 'partner', 'task', 'goal_name']);
  assert.deepEqual(missingFields({ ...FULL, reason: '영어 하고 싶어서' }), ['reason']);
  assert.deepEqual(missingFields(FULL), []);
});

test('mergeFields: 서버가 비워 보낸 항목은 앞 값을 지키고 새 값은 덮는다', () => {
  const prev = { reason: FULL.reason, place: '카페' };
  assert.deepEqual(mergeFields(prev, { place: '스타벅스', my_role: '  ' }), { reason: FULL.reason, place: '스타벅스' });
  assert.deepEqual(mergeFields(prev, undefined), prev);
});

test('progressOf: 채팅은 0~1/3, 약속 2/3, 확인 1', () => {
  assert.equal(progressOf('chat', {}), 0);
  assert.equal(progressOf('chat', FULL), 1 / 3);
  assert.equal(progressOf('plan', {}), 2 / 3);
  assert.equal(progressOf('confirm', {}), 1);
});

test('canAsk: 보낼 대화가 서버 상한 40줄을 넘지 않는다', () => {
  const lines = (n: number): SetupLine[] => Array.from({ length: n }, (_, i) => ({ id: String(i), role: i % 2 ? 'user' : 'coach', text: 'x' }));
  assert.equal(canAsk(lines(MAX_LINES - 1)), true);
  assert.equal(canAsk(lines(MAX_LINES)), false);
});

test('choicesOf: "A, B, C 중 어디" 꼴의 마지막 질문에서만 보기를 뽑는다', () => {
  assert.deepEqual(choicesOf('조금 더 좁혀 보겠습니다. 카페 주문, 알바 면접, 옷가게 사이즈 문의 중 어디에 가깝습니까?'), ['카페 주문', '알바 면접', '옷가게 사이즈 문의']);
  assert.deepEqual(choicesOf('예를 들어 손님 또는 직원 중 누구입니까?'), ['손님', '직원']);
  assert.deepEqual(choicesOf('어디에서 주문하십니까? 카페, 식당, 공항처럼 실제로 가는 곳으로 말씀해 주십시오.'), []);
  assert.deepEqual(choicesOf("목표 이름을 '카페에서 주문하기'로 제안합니다. 괜찮습니까?"), []);
  assert.deepEqual(choicesOf('하나 중 어디입니까?'), []);
});

test('choicesOf: 질문 앞부분("상대는", "장소는")은 첫 보기에 붙지 않는다', () => {
  assert.deepEqual(choicesOf('카페에서는 주문하는 손님이 됩니다. 말을 주고받을 상대는 바리스타, 계산대 점원, 옆자리 손님 중 누구입니까?'), [
    '바리스타',
    '계산대 점원',
    '옆자리 손님',
  ]);
  assert.deepEqual(choicesOf('분명한 이유입니다. 영어로 말할 장소는 카페, 호텔 프런트, 회의실 중 어디입니까?'), ['카페', '호텔 프런트', '회의실']);
  assert.deepEqual(choicesOf('해결할 일은 주문, 자리 찾기 중 무엇입니까?'), ['주문', '자리 찾기']);
  // 보기 자체에 "는"이 있어도 항목 이름이 아니면 그대로 둔다
  assert.deepEqual(choicesOf('아는 사람, 처음 보는 사람 중 누구입니까?'), ['아는 사람', '처음 보는 사람']);
});

test('기본 약속: 기간 14일, 월~금, 22:00, 15분. 지난 목표가 있으면 그 시각을 이어 쓴다', () => {
  assert.deepEqual(defaultPlan(), { periodDays: 14, weekdays: [1, 2, 3, 4, 5], startMinutes: 1320, targetMinutes: 15 });
  assert.deepEqual(defaultPlan({ weekdays: [0, 1, 2, 3, 4, 5], startMinutes: 420, targetMinutes: 20 }), {
    periodDays: 14,
    weekdays: [0, 1, 2, 3, 4, 5],
    startMinutes: 420,
    targetMinutes: 20,
  });
});

test('요일과 시각 위젯 도우미', () => {
  assert.deepEqual(toggleWeekday([1, 2, 3], 0), [0, 1, 2, 3]);
  assert.deepEqual(toggleWeekday([1, 2, 3], 2), [1, 3]);
  assert.equal(weekdaysShort([1, 2, 3]), 2);
  assert.equal(weekdaysShort([1, 2, 3, 4, 5]), 0);
  assert.equal(wrapDay(-1), 1439);
  assert.equal(wrapDay(1440 + 5), 5);
  assert.equal(setMinute(22 * 60 + 7, 30), 22 * 60 + 30);
});

test('firstStart: 첫 도전일은 내일. 쉬는 요일이면 다음 학습 요일', () => {
  // 2026-10-18은 일요일. 저녁 20:00에 만들면 첫 도전일은 월요일 10-19
  const sunEvening = zonedTime('2026-10-18', 20 * 60, TZ);
  const a = firstStart(sunEvening, TZ, { weekdays: [1, 2, 3, 4, 5], startMinutes: 22 * 60, targetMinutes: 15 });
  assert.equal(a.day, '2026-10-19');
  assert.equal(a.rel, 'tomorrow');
  assert.equal(a.clock, '22:00');
  // 금요일 10-23에 만들면 토, 일은 쉬는 요일이라 월요일 10-26
  const fri = zonedTime('2026-10-23', 20 * 60, TZ);
  const b = firstStart(fri, TZ, { weekdays: [1, 2, 3, 4, 5], startMinutes: 22 * 60, targetMinutes: 15 });
  assert.equal(b.day, '2026-10-26');
  assert.equal(b.rel, 'date');
  assert.equal(b.month, 10);
  assert.equal(b.date, 26);
  assert.equal(b.weekday, 1);
});

test('firstStart: 04:00 전 새벽에 만들면 하루 키는 어제라서 첫 시작은 달력상 오늘이다', () => {
  // 10-19 02:00은 하루 키 10-18. 첫 도전일 10-19, 시작 22:00은 달력상 오늘
  const night = zonedTime('2026-10-19', 2 * 60, TZ);
  const r = firstStart(night, TZ, { weekdays: [0, 1, 2, 3, 4, 5, 6], startMinutes: 22 * 60, targetMinutes: 15 });
  assert.equal(r.day, '2026-10-19');
  assert.equal(r.rel, 'today');
});

test('firstStart: 시작이 04:00 전이면 달력상 다음 날 그 시각', () => {
  const evening = zonedTime('2026-10-18', 20 * 60, TZ);
  const r = firstStart(evening, TZ, { weekdays: [0, 1, 2, 3, 4, 5, 6], startMinutes: 60, targetMinutes: 15 });
  assert.equal(r.day, '2026-10-19');
  assert.equal(r.rel, 'date'); // 10-20 01:00
  assert.equal(r.date, 20);
  assert.equal(r.clock, '01:00');
});

test('toGoalInput: create_goal 검사를 통과하고, 하위 상황이 없으면 대신 목록을 쓴다', () => {
  const plan = { periodDays: 14, weekdays: [5, 1, 2, 3, 4], startMinutes: 1320, targetMinutes: 15 };
  const input = toGoalInput(FULL, plan, [], ['인사', '마무리']);
  assert.equal(goalInputError(input), null);
  assert.deepEqual(input.weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(input.situation, { place: '스타벅스', myRole: '손님', partner: '바리스타', task: '옵션 바꿔 주문하기' });
  assert.deepEqual(input.subsituations, ['인사', '마무리']);
  assert.deepEqual(toGoalInput(FULL, plan, ['입장', '주문'], ['인사']).subsituations, ['입장', '주문']);
});

test('profileFromRow: 정지 중 반성문 시간대를 프로필에서 읽는다', () => {
  const p = profileFromRow({ user_id: 'u', suspended_until: '2026-10-25T00:00:00Z', suspended_start_minutes: 1320, suspended_target_minutes: 15 });
  assert.equal(p.suspendedStartMinutes, 1320);
  assert.equal(p.suspendedTargetMinutes, 15);
  const q = profileFromRow({ user_id: 'u' });
  assert.equal(q.suspendedStartMinutes, null);
  assert.equal(q.suspendedTargetMinutes, null);
});
