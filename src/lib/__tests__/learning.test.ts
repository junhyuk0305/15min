import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expressionPattern,
  newItemCap,
  nextSrs,
  questionCount,
  quizTypeAt,
  quizTypesFor,
  REVIEW_INTERVALS,
  todayStats,
  typeForItem,
  wordBase,
  type Item,
  type ItemEvent,
} from '../rules';

// 문항 (결정안 5, 11)

test('문항 수는 단계 분당 1개, 최소 1개', () => {
  assert.equal(questionCount(180), 3);
  assert.equal(questionCount(120), 2);
  assert.equal(questionCount(156), 2);
  assert.equal(questionCount(59), 1);
  assert.equal(questionCount(360), 6);
});

test('A 문항 유형: n=1~5', () => {
  assert.deepEqual(quizTypesFor('A', 1), ['situation']);
  assert.deepEqual(quizTypesFor('A', 2), ['word_recall', 'situation']);
  assert.deepEqual(quizTypesFor('A', 3), ['word_recall', 'expression_recall', 'situation']);
  assert.deepEqual(quizTypesFor('A', 4), ['word_recall', 'expression_recall', 'expression_recall', 'situation']);
  assert.deepEqual(quizTypesFor('A', 5), ['word_recall', 'expression_recall', 'expression_recall', 'expression_recall', 'situation']);
});

test('C 문항 유형: n=1~5', () => {
  assert.deepEqual(quizTypesFor('C', 1), ['situation']);
  assert.deepEqual(quizTypesFor('C', 2), ['meaning_choice', 'situation']);
  assert.deepEqual(quizTypesFor('C', 3), ['meaning_choice', 'expression_recall', 'situation']);
  assert.deepEqual(quizTypesFor('C', 4), ['meaning_choice', 'expression_recall', 'expression_recall', 'situation']);
  assert.deepEqual(quizTypesFor('C', 5), ['meaning_choice', 'expression_recall', 'expression_recall', 'expression_recall', 'situation']);
});

test('첫날 A는 수준 확인: 상황 적용만', () => {
  assert.deepEqual(quizTypesFor('A', 3, { levelCheck: true }), ['situation', 'situation', 'situation']);
});

test('시간이 남으면 마지막 유형을 계속 낸다', () => {
  assert.equal(quizTypeAt('C', 2, 0), 'meaning_choice');
  assert.equal(quizTypeAt('C', 2, 1), 'situation');
  assert.equal(quizTypeAt('C', 2, 5), 'situation');
  assert.equal(quizTypeAt('A', 3, 1, { levelCheck: true }), 'situation');
});

test('도움 없이 2회 연속 회상한 항목은 상황 적용으로만 낸다', () => {
  assert.equal(typeForItem('word_recall', 1), 'word_recall');
  assert.equal(typeForItem('word_recall', 2), 'situation');
  assert.equal(typeForItem('meaning_choice', 3), 'situation');
});

// 새 항목 상한 (결정안 9)

test('하루 새 항목 상한: 10분 2개, 15분 3개, 30분 5개', () => {
  assert.equal(newItemCap(10), 2);
  assert.equal(newItemCap(15), 3);
  assert.equal(newItemCap(20), 3);
  assert.equal(newItemCap(25), 4);
  assert.equal(newItemCap(30), 5);
});

// 복습 간격 (결정안 13)

test('복습 간격은 학습일 1, 3, 7, 14', () => {
  assert.deepEqual(REVIEW_INTERVALS, [1, 3, 7, 14]);
});

test('SRS: 도움 없이 맞히면 다음 칸, 14칸 통과면 기억 확인', () => {
  let s = { srsStep: 0, unaidedStreak: 0 };
  const ok = { correct: true, aided: false };
  const r1 = nextSrs(s, ok);
  assert.deepEqual(r1, { srsStep: 1, unaidedStreak: 1, recalled: false, intervalDays: 3 });
  s = r1;
  const r2 = nextSrs(s, ok);
  assert.deepEqual(r2, { srsStep: 2, unaidedStreak: 2, recalled: false, intervalDays: 7 });
  const r3 = nextSrs(r2, ok);
  assert.deepEqual(r3, { srsStep: 3, unaidedStreak: 3, recalled: false, intervalDays: 14 });
  const r4 = nextSrs(r3, ok);
  assert.equal(r4.recalled, true);
  assert.equal(r4.unaidedStreak, 4);
});

test('SRS: 도움을 받거나 틀리면 1칸으로, 연속은 0', () => {
  const at2 = { srsStep: 2, unaidedStreak: 2 };
  assert.deepEqual(nextSrs(at2, { correct: true, aided: true }), { srsStep: 0, unaidedStreak: 0, recalled: false, intervalDays: 1 });
  assert.deepEqual(nextSrs(at2, { correct: false, aided: false }), { srsStep: 0, unaidedStreak: 0, recalled: false, intervalDays: 1 });
  assert.deepEqual(nextSrs({ srsStep: 3, unaidedStreak: 3 }, { correct: false, aided: true }), { srsStep: 0, unaidedStreak: 0, recalled: false, intervalDays: 1 });
});

// 집계 기준 (결정안 15)

test('단어는 기본형으로 묶는다', () => {
  assert.equal(wordBase('Drinks'), 'drink');
  assert.equal(wordBase('drink'), 'drink');
  assert.equal(wordBase('berries'), 'berry');
  assert.equal(wordBase('boxes'), 'box');
  assert.equal(wordBase('glasses'), 'glass');
  assert.equal(wordBase('bus'), 'bus');
  assert.equal(wordBase('is'), 'is');
  assert.equal(wordBase(' coffee. '), 'coffee');
});

test('표현은 빈칸 패턴으로 묶는다', () => {
  const a = expressionPattern('Could I have … instead?');
  assert.equal(a, expressionPattern('could I have ... instead'));
  assert.equal(a, expressionPattern('Could  I have ___ instead?'));
  assert.notEqual(a, expressionPattern("I'd like to order …"));
});

const DAY = '2026-10-20';
const PREV = '2026-10-19';

const item = (id: string, kind: Item['kind'], base: string): Item => ({
  id,
  goalId: 'g',
  kind,
  base,
  ko: '',
  note: '',
  state: 'taught',
  srsStep: 0,
  nextDueDay: null,
  unaidedStreak: 0,
  firstDay: null,
  createdAt: 0,
});

let seq = 0;
const ev = (itemId: string, day: string, kind: ItemEvent['kind'], over: Partial<ItemEvent> = {}): ItemEvent => ({
  id: `e${seq++}`,
  itemId,
  day,
  phase: null,
  kind,
  aided: false,
  correct: null,
  questionType: null,
  createdAt: seq,
  ...over,
});

test('오늘 성과: drink/drinks는 하나, Could I have … instead?는 하나', () => {
  const items = [
    item('i1', 'word', 'drink'),
    item('i2', 'word', 'drinks'),
    item('i3', 'expression', 'Could I have … instead?'),
    item('i4', 'expression', 'could I have ... instead'),
    item('i5', 'word', 'instead'),
    item('i6', 'expression', "I'd like to order …"),
    item('i7', 'word', 'latte'),
  ];
  const events = [
    ev('i1', DAY, 'taught'),
    ev('i2', DAY, 'taught'),
    ev('i3', DAY, 'taught'),
    ev('i4', DAY, 'taught'),
    ev('i5', PREV, 'taught'),
    ev('i6', PREV, 'taught'),
    ev('i7', DAY, 'seen'),
    // 오늘 C에서 회상: 오늘 배운 것이라 '이후 회상'은 아니다
    ev('i1', DAY, 'quiz', { correct: true, phase: 'C', questionType: 'meaning_choice' }),
    ev('i2', DAY, 'quiz', { correct: true, phase: 'C', questionType: 'meaning_choice' }),
    // 어제 배운 것을 오늘 A에서 도움 없이 회상
    ev('i5', DAY, 'quiz', { correct: true, phase: 'A', questionType: 'word_recall' }),
    // 도움 받고 맞힘: 다시 복습
    ev('i6', DAY, 'quiz', { correct: true, aided: true, phase: 'A', questionType: 'expression_recall' }),
    // 문장에 쓴 항목. 모달 직후는 도움 후 적용
    ev('i3', DAY, 'used', { aided: true, phase: 'B' }),
    ev('i4', DAY, 'used', { aided: false, phase: 'B' }),
    ev('i5', DAY, 'used', { aided: false, phase: 'retro' }),
    // 다른 날 기록은 오늘 성과에 안 들어간다
    ev('i7', PREV, 'used'),
  ];
  assert.deepEqual(todayStats(items, events, DAY), {
    newWords: 1,
    newExpressions: 1,
    recalledToday: 2,
    recalledLater: 1,
    applied: 2,
    appliedAided: 0,
    toReview: 1,
  });
});

test('오늘 성과: 도움 후 적용만 있으면 appliedAided로 센다', () => {
  const items = [item('i1', 'expression', 'Could I have … instead?')];
  const events = [ev('i1', DAY, 'taught'), ev('i1', DAY, 'used', { aided: true })];
  const s = todayStats(items, events, DAY);
  assert.equal(s.applied, 1);
  assert.equal(s.appliedAided, 1);
});

test('오늘 성과: 이미 배운 항목을 다시 설명해도 새 항목이 아니다', () => {
  const items = [item('i1', 'word', 'instead')];
  const events = [ev('i1', PREV, 'taught'), ev('i1', DAY, 'taught')];
  assert.equal(todayStats(items, events, DAY).newWords, 0);
});

test('오늘 성과: 틀린 뒤 도움 없이 다시 맞히면 복습 대상이 아니다', () => {
  const items = [item('i1', 'word', 'instead')];
  const events = [
    ev('i1', PREV, 'taught'),
    ev('i1', DAY, 'quiz', { correct: false }),
    ev('i1', DAY, 'quiz', { correct: true }),
  ];
  const s = todayStats(items, events, DAY);
  assert.equal(s.toReview, 0);
  assert.equal(s.recalledLater, 1);
});
