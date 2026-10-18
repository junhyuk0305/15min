import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_TIME_ZONE } from '../rules';
import { EMPTY_CACHE, planInputOf, showsKstLabel, todayKeyOf } from '../selectors';

test('한국 시간 표시: 기기 오프셋이 UTC+9(-540)일 때만 숨긴다', () => {
  assert.equal(showsKstLabel(-540), false);
  assert.equal(showsKstLabel(240), true); // 뉴욕 서머타임
  assert.equal(showsKstLabel(0), true);
  assert.equal(showsKstLabel(-600), true); // 시드니
});

test('하루 키와 알림 계획은 기기 시간대와 상관없이 한국 시간이다', () => {
  assert.equal(APP_TIME_ZONE, 'Asia/Seoul');
  // 한국 04:00이 하루 경계. UTC 18:59는 한국 03:59(전날), 19:00은 한국 04:00(그날)
  assert.equal(todayKeyOf(Date.UTC(2026, 9, 18, 18, 59)), '2026-10-18');
  assert.equal(todayKeyOf(Date.UTC(2026, 9, 18, 19, 0)), '2026-10-19');
  assert.equal(planInputOf(EMPTY_CACHE, Date.UTC(2026, 9, 18)).timeZone, 'Asia/Seoul');
});
