import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copy, giveupLines, nagLines, type NagMaterial } from '../copy';

const m: NagMaterial = {
  targetMinutes: 15,
  remainMinutes: 15,
  goalName: '스타벅스에서 막힘없이 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  totalMinutes: 345,
  days: 9,
  lastRetro: 'I felt less stuck',
};

/** copy 안의 모든 문자열. 함수는 숫자 인자로 불러 본다 */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') allStrings((v as (...a: unknown[]) => unknown)(7, 3, 2), out);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

const strings = [...allStrings(copy), ...nagLines(m), ...giveupLines(m), ...nagLines({ ...m, remainMinutes: 5, lastRetro: null })];

test('합니다체: 해요체(-요, -죠)가 없다', () => {
  const bad = strings.filter((s) => /(요|죠|네요|잖아요)[.?!]?(\s|$)/.test(s));
  assert.deepEqual(bad, []);
});

test("'당신'을 쓰지 않는다", () => {
  assert.deepEqual(strings.filter((s) => s.includes('당신')), []);
});

test('대시와 가운뎃점으로 문장을 잇지 않는다', () => {
  assert.deepEqual(strings.filter((s) => /[—–·]/.test(s)), []);
});

test('정책이 바뀐 문구(매일 학습, 100자, 소감, 5~30분)가 없다', () => {
  const bad = strings.filter((s) => /매일 합니다|매일 언제|100자|소감|5~30분|쉬는 요일은 없습니다/.test(s));
  assert.deepEqual(bad, []);
});

test('독촉 문구는 연속해서 같은 문장이 아니다', () => {
  const lines = nagLines(m);
  assert.equal(new Set(lines).size, lines.length);
});
