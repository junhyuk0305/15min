import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minutesToPickerDate, pickerDateToMinutes } from '../timePick';

test('시각 선택기: 분 숫자는 한국 시각의 Date가 된다', () => {
  // 한국 22:00 = UTC 13:00
  assert.equal(minutesToPickerDate(22 * 60).toISOString(), '2000-01-03T13:00:00.000Z');
  // 한국 00:05 = 전날 UTC 15:05
  assert.equal(minutesToPickerDate(5).toISOString(), '2000-01-02T15:05:00.000Z');
});

test('시각 선택기: 하루 모든 분이 왕복해도 같다', () => {
  for (let m = 0; m < 1440; m++) assert.equal(pickerDateToMinutes(minutesToPickerDate(m)), m);
});

test('시각 선택기: 돌려받은 Date는 날짜와 초에 상관없이 한국 벽시계로 읽는다', () => {
  // UTC 01:30:42 = 한국 10:30
  assert.equal(pickerDateToMinutes(new Date(Date.UTC(2026, 9, 19, 1, 30, 42))), 10 * 60 + 30);
  // UTC 15:00 = 다음 날 한국 00:00
  assert.equal(pickerDateToMinutes(new Date(Date.UTC(2026, 9, 19, 15, 0))), 0);
});
