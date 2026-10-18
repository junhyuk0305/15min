import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PALETTES, type ThemeName } from '../theme';

// WCAG 2.x 상대 휘도와 대비. MP 7.7-3: 본문 글자와 배경 대비 4.5:1 이상.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('대비 계산 기준값: 검정과 흰색은 21:1', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
});

const PAIRS: [fg: keyof (typeof PALETTES)['ivory'], bg: keyof (typeof PALETTES)['ivory']][] = [
  ['ink', 'bg'],
  ['sub', 'bg'],
  ['ink', 'card'],
  ['sub', 'card'],
  ['redText', 'bg'],
  ['onInk', 'ink'],
  ['onRed', 'red'],
];

for (const name of Object.keys(PALETTES) as ThemeName[]) {
  const p = PALETTES[name];
  for (const [fg, bg] of PAIRS) {
    test(`${name}: ${fg} / ${bg} 대비 4.5 이상`, () => {
      const r = contrast(p[fg], p[bg]);
      assert.ok(r >= 4.5, `${p[fg]} on ${p[bg]} = ${r.toFixed(2)}`);
    });
  }
}

test('빨강은 세 테마에서 같은 값이다', () => {
  assert.equal(PALETTES.white.red, PALETTES.ivory.red);
  assert.equal(PALETTES.dark.red, PALETTES.ivory.red);
});
