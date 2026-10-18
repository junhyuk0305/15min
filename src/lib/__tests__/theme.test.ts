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

// 3절 빨강 안내: 조건을 못 채운 이유와 모자란 카운터는 바탕에 맞는 빨강(useInk().alert)으로 보인다.
// 아이보리, 흰 바탕, 카드, 다크(학습 B) 위에서는 redText, 빨강 바탕 위에서는 onRed.
const ALERT_ON: [theme: ThemeName, bg: 'bg' | 'card'][] = [
  ['ivory', 'bg'],
  ['ivory', 'card'],
  ['white', 'bg'],
  ['white', 'card'],
  ['dark', 'bg'],
  ['dark', 'card'],
];
for (const [theme, bg] of ALERT_ON) {
  test(`빨강 안내: ${theme} ${bg} 위 redText 대비 4.5 이상`, () => {
    const p = PALETTES[theme];
    const r = contrast(p.redText, p[bg]);
    assert.ok(r >= 4.5, `${p.redText} on ${p[bg]} = ${r.toFixed(2)}`);
  });
}
test('빨강 안내: 빨강 바탕 위 onRed 대비 4.5 이상', () => {
  for (const name of Object.keys(PALETTES) as ThemeName[]) {
    const p = PALETTES[name];
    assert.ok(contrast(p.onRed, p.red) >= 4.5, `${name}: ${p.onRed} on ${p.red}`);
  }
});

test('빨강은 세 테마에서 같은 값이다', () => {
  assert.equal(PALETTES.white.red, PALETTES.ivory.red);
  assert.equal(PALETTES.dark.red, PALETTES.ivory.red);
});
