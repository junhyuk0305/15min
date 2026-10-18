import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateOf, LEARN_PATH, redirectFor, RETRO_PATH, safeNext, type RouteInput } from '../route';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const base: RouteInput = {
  authed: true,
  onboarded: true,
  profile: { banned: false, suspendedUntil: null },
  hasActiveGoal: true,
  giveupPending: false,
  today: 'none',
  loadFailed: false,
  now: NOW,
};
const at = (o: Partial<RouteInput>): RouteInput => ({ ...base, ...o });

test('세션 없음: 이 기기에서 처음이면 온보딩, 아니면 로그인', () => {
  assert.equal(gateOf(at({ authed: false, onboarded: false })), 'onboarding');
  assert.equal(redirectFor('/', at({ authed: false, onboarded: false })), '/onboarding');
  assert.equal(redirectFor('/onboarding', at({ authed: false, onboarded: false })), null);
  assert.equal(redirectFor('/', at({ authed: false })), '/auth');
  assert.equal(redirectFor('/auth', at({ authed: false })), null);
});

test('세션 없음: 원래 경로를 next로 붙이고, 로그인 뒤 그리로 돌아간다', () => {
  assert.equal(redirectFor('/coupon', at({ authed: false })), '/auth?next=%2Fcoupon');
  assert.equal(redirectFor('/auth', base, '/coupon'), '/coupon');
  // 돌아갈 곳이 지금 열 수 없는 화면이면 홈
  assert.equal(redirectFor('/auth', at({ hasActiveGoal: false }), '/coupon'), '/');
  assert.equal(redirectFor('/auth', base, '//evil.example'), '/');
  assert.equal(redirectFor('/auth', base), '/');
});

test('법무 문서는 로그인 전과 정지 중에도 열린다', () => {
  for (const i of [at({ authed: false }), at({ authed: false, onboarded: false }), at({ profile: { banned: true, suspendedUntil: null } })]) {
    assert.equal(redirectFor('/settings/legal/terms', i), null);
  }
});

test('영구 정지는 안내 화면만', () => {
  const i = at({ profile: { banned: true, suspendedUntil: NOW + 1000 } });
  assert.equal(gateOf(i), 'banned');
  assert.equal(redirectFor('/', i), '/banned');
  assert.equal(redirectFor('/suspended', i), '/banned');
  assert.equal(redirectFor('/banned', i), null);
});

test('기간 정지는 반성문 화면만. 끝나면 홈으로', () => {
  const i = at({ profile: { banned: false, suspendedUntil: NOW + 60_000 }, hasActiveGoal: false });
  assert.equal(redirectFor('/', i), '/suspended');
  assert.equal(redirectFor('/goal/new', i), '/suspended');
  assert.equal(redirectFor('/suspended', i), null);
  const over = at({ profile: { banned: false, suspendedUntil: NOW - 1 }, hasActiveGoal: false });
  assert.equal(redirectFor('/suspended', over), '/');
});

test('목표 없음: 홈(목표 정하기)은 열리고, 목표가 필요한 화면은 홈으로', () => {
  const i = at({ hasActiveGoal: false });
  assert.equal(redirectFor('/', i), null);
  assert.equal(redirectFor('/goal/new', i), null);
  for (const p of ['/coupon', '/settings/goal', '/settings/giveup', '/session/reason', LEARN_PATH]) assert.equal(redirectFor(p, i), '/', p);
  // 달성 선언 화면은 선언 직후 목표가 없어도 남는다
  assert.equal(redirectFor('/goal/achieve', i), null);
});

test('목표가 있으면 새 목표 화면은 홈으로', () => {
  assert.equal(redirectFor('/goal/new', base), '/');
});

test('오늘의 이유: 학습 중이면 학습 화면, 끝났거나 포기 대기면 홈', () => {
  assert.equal(redirectFor('/session/reason', base), null);
  assert.equal(redirectFor('/session/reason', at({ today: 'progress' })), LEARN_PATH);
  assert.equal(redirectFor('/session/reason', at({ today: 'closed' })), '/');
  assert.equal(redirectFor('/session/reason', at({ giveupPending: true })), '/');
});

test('학습 경로: A, B, C 한 화면(/session/learn)과 회고(/session/retro)', () => {
  assert.equal(LEARN_PATH, '/session/learn');
  assert.equal(RETRO_PATH, '/session/retro');
});

test('학습 화면은 진행 중일 때만, 회고 화면은 완료 직후에도', () => {
  assert.equal(redirectFor(LEARN_PATH, base), '/');
  assert.equal(redirectFor(LEARN_PATH, at({ today: 'progress' })), null);
  assert.equal(redirectFor(LEARN_PATH, at({ today: 'closed' })), '/');
  assert.equal(redirectFor(RETRO_PATH, at({ today: 'progress' })), null);
  assert.equal(redirectFor(RETRO_PATH, at({ today: 'closed' })), null);
  assert.equal(redirectFor(RETRO_PATH, base), '/');
});

test('읽기 실패: 화면을 옮기지 않는다(홈은 캐시와 배너)', () => {
  const i = at({ loadFailed: true });
  assert.equal(redirectFor('/', i), null);
  assert.equal(redirectFor('/archive', i), null);
  // 프로필을 한 번도 못 받았어도 로그인 상태면 앱 안에 둔다
  assert.equal(redirectFor('/', at({ loadFailed: true, profile: null, hasActiveGoal: false })), null);
});

test('로그인 상태에서 로그인, 온보딩, 정지 화면은 홈으로', () => {
  for (const p of ['/auth', '/onboarding', '/banned', '/suspended']) assert.equal(redirectFor(p, base), '/', p);
});

test('safeNext', () => {
  assert.equal(safeNext('/archive'), '/archive');
  assert.equal(safeNext('https://x'), null);
  assert.equal(safeNext('//x'), null);
  assert.equal(safeNext(undefined), null);
});
