// 글자와 숫자만 쓴다. 빨강은 독촉과 포기 흐름에만 쓴다.
export const C = {
  bg: '#F3EFE6',
  ink: '#111111',
  sub: '#6B655B',
  line: '#D9D2C4',
  card: '#FBF9F4',
  red: '#C8201A',
  redInk: '#FFFFFF',
  redSoft: '#F7DEDB',
  disabled: '#BDB6A8',
} as const;

export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const T = {
  hero: { fontSize: 64, fontWeight: '900' as const, letterSpacing: -2, fontVariant: ['tabular-nums' as const] },
  big: { fontSize: 40, fontWeight: '900' as const, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
  h1: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.5, lineHeight: 36 },
  h2: { fontSize: 20, fontWeight: '800' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
  small: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 1 },
};

export const FRAME_MAX = 460;
