import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revealDuration, splitWords, visibleChars, wordInterval } from '../reveal';

// motion.ts REVEAL과 같은 값(motion.ts는 react-native를 불러 Node에서 읽지 못한다)
const CFG = { msPerWord: 35, maxMs: 1500 };

test('글자 표시: 어절은 공백 기준으로 나누고 공백을 그대로 둔다', () => {
  const text = 'Hi there,  what would you\nlike? ';
  const words = splitWords(text);
  assert.deepEqual(words, ['Hi ', 'there,  ', 'what ', 'would ', 'you\n', 'like? ']);
  assert.equal(words.join(''), text);
  assert.deepEqual(splitWords('  앞 공백'), ['  앞 ', '공백']);
});

test('글자 표시: 짧은 문장은 어절당 35ms', () => {
  assert.equal(wordInterval(3, CFG), 35);
  assert.equal(revealDuration('one two three', CFG), 105);
});

test('글자 표시: 긴 문장도 1.5초를 넘지 않는다', () => {
  const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
  assert.equal(revealDuration(long, CFG), 1500);
  assert.equal(wordInterval(200, CFG), 7.5);
  assert.equal(visibleChars(long, 1500, CFG), long.length);
});

test('글자 표시: 시점별로 어절 단위로 늘어난다. 첫 어절은 바로 보인다', () => {
  const text = 'one two three';
  assert.equal(visibleChars(text, 0, CFG), 'one '.length);
  assert.equal(visibleChars(text, 34, CFG), 'one '.length);
  assert.equal(visibleChars(text, 35, CFG), 'one two '.length);
  assert.equal(visibleChars(text, 70, CFG), text.length);
  assert.equal(visibleChars(text, 10_000, CFG), text.length);
});

test('글자 표시: 빈 문장은 걸리는 시간이 0이다', () => {
  assert.deepEqual(splitWords(''), []);
  assert.equal(revealDuration('', CFG), 0);
  assert.equal(visibleChars('', 0, CFG), 0);
  assert.equal(revealDuration('   ', CFG), 0);
});
