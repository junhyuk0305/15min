// U3 내비게이션에서 더한 순수 판정: 목표 정하기 3/3의 첫 시작 안내(학습일 기준), 학습 나가기 시트의 남은 분.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstStart } from '../../components/goal/logic';
import { leftMinutes } from '../learn';
import { addDays, dayKeyOf, zonedTime } from '../rules';

const TZ = 'Asia/Seoul';
const EVERY_DAY = { weekdays: [0, 1, 2, 3, 4, 5, 6], startMinutes: 22 * 60, targetMinutes: 15 };

test('firstStart: 04:00 경계 전후. 03:59는 하루 키 10-18이라 첫 도전일 10-19, 04:00은 10-20. 둘 다 "내일"', () => {
  const before = firstStart(zonedTime('2026-10-19', 3 * 60 + 59, TZ), TZ, EVERY_DAY);
  assert.equal(before.day, '2026-10-19');
  assert.equal(before.rel, 'tomorrow');
  assert.equal(before.date, 19);
  const after = firstStart(zonedTime('2026-10-19', 4 * 60, TZ), TZ, EVERY_DAY);
  assert.equal(after.day, '2026-10-20');
  assert.equal(after.rel, 'tomorrow');
  assert.equal(after.date, 20);
});

test('firstStart: 홈 whenOf와 같은 기준. 첫 도전일이 하루 키 + 1이면 내일, 아니면 그 학습일의 날짜', () => {
  for (const minutes of [0, 60, 3 * 60 + 59, 4 * 60, 12 * 60, 23 * 60 + 59]) {
    const now = zonedTime('2026-10-21', minutes, TZ); // 수요일
    const today = dayKeyOf(now, TZ);
    // 학습 요일 일요일 하나. 첫 도전일은 다음 일요일 10-25
    const r = firstStart(now, TZ, { ...EVERY_DAY, weekdays: [0] });
    assert.equal(r.day, '2026-10-25');
    assert.equal(r.rel, r.day === addDays(today, 1) ? 'tomorrow' : 'date');
    assert.equal(r.month, 10);
    assert.equal(r.date, 25);
    assert.equal(r.weekday, 0);
  }
});

test('leftMinutes: 남은 초를 분으로 올림하고 0이어도 1분', () => {
  assert.equal(leftMinutes(15 * 60), 15);
  assert.equal(leftMinutes(14 * 60 + 1), 15);
  assert.equal(leftMinutes(59), 1);
  assert.equal(leftMinutes(0), 1);
});
