// 색은 아이보리, 검정, 빨강. 빨강은 독촉과 이탈, 포기 흐름에 쓴다. 입력 검증(못 채운 이유, 모자란 카운터)은 작은 빨강 글자로 예외다.
// 기기 다크 모드와 상관없이 이 값만 쓴다(app.json userInterfaceStyle: light). 학습 B단계만 dark 테마다.
// 이 파일은 react-native를 불러오지 않는다. 테스트(node)에서 바로 읽는다.

export type ThemeName = 'ivory' | 'white' | 'dark';

export type Palette = {
  /** 화면 바탕 */
  bg: string;
  /** 카드, 입력창 바탕 */
  card: string;
  /** 구분선, 게이지 바탕 */
  line: string;
  /** 본문 글자, 주 버튼 바탕, 테두리 */
  ink: string;
  /** 보조 글자, 라벨, 속마음, 지문 */
  sub: string;
  /** 비활성 버튼 바탕, 플레이스홀더 */
  disabled: string;
  /** 비활성 버튼 글자 */
  onDisabled: string;
  /** ink 바탕 위의 글자 */
  onInk: string;
  /** 독촉 바탕, 위험 버튼 */
  red: string;
  /** red 바탕 위의 글자와 버튼 */
  onRed: string;
  /** 바탕 위에 쓰는 빨강 글자(미달, 오류, 긁는 한 줄) */
  redText: string;
};

const RED = '#C8201A';

/** ivory: 앱 기본. white: 학습 A, C단계. dark: 학습 B단계 (기획서 11.4, MP P6-2) */
export const PALETTES: Record<ThemeName, Palette> = {
  ivory: {
    bg: '#F3EFE6',
    card: '#FBF9F4',
    line: '#D9D2C4',
    ink: '#111111',
    sub: '#6B655B',
    disabled: '#BDB6A8',
    onDisabled: '#FBF9F4',
    onInk: '#FFFFFF',
    red: RED,
    onRed: '#FFFFFF',
    redText: RED,
  },
  white: {
    bg: '#FFFFFF',
    card: '#FAF8F3',
    line: '#E4DFD5',
    ink: '#111111',
    sub: '#6B655B',
    disabled: '#C4BEB2',
    onDisabled: '#FFFFFF',
    onInk: '#FFFFFF',
    red: RED,
    onRed: '#FFFFFF',
    redText: RED,
  },
  dark: {
    bg: '#141311',
    card: '#1E1D1A',
    line: '#3A3731',
    ink: '#ECE8DF',
    sub: '#A39C8E',
    disabled: '#4A463F',
    onDisabled: '#A39C8E',
    onInk: '#141311',
    red: RED,
    onRed: '#FFFFFF',
    redText: '#FF6F61',
  },
};

/** 기존 화면용. ivory 팔레트에 옛 키(redInk, redSoft)를 더한 것 */
export const C = {
  ...PALETTES.ivory,
  redInk: '#FFFFFF',
  redSoft: '#F7DEDB',
} as const;

export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/**
 * 글꼴 이름. src/lib/fonts.ts가 이 이름으로 불러온다.
 * 굵기는 fontFamily로 고른다. fontWeight를 같이 주면 Android가 가짜 굵게를 덧입힐 수 있어 주지 않는다.
 * 명조는 대사와 숫자, 고딕은 나머지.
 */
export const F = {
  sans: 'NotoSansKR_500Medium',
  sansBold: 'NotoSansKR_800ExtraBold',
  serif: 'NotoSerifKR_400Regular',
  serifBlack: 'NotoSerifKR_900Black',
} as const;

const tabular = ['tabular-nums' as const];

export const T = {
  /** 화면의 가장 큰 숫자. 명조 900 */
  hero: { fontFamily: F.serifBlack, fontSize: 48, lineHeight: 56, letterSpacing: -1, fontVariant: tabular },
  /** 두 번째 숫자. 명조 900 */
  big: { fontFamily: F.serifBlack, fontSize: 34, lineHeight: 42, letterSpacing: -1, fontVariant: tabular },
  h1: { fontFamily: F.sansBold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  /** 명조 제목(온보딩, 포기 확인) */
  h1Serif: { fontFamily: F.serifBlack, fontSize: 24, lineHeight: 34, letterSpacing: -0.3 },
  h2: { fontFamily: F.sansBold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: F.sans, fontSize: 15, lineHeight: 24 },
  /** 명조 본문(이유, 홈 가운데 문장) */
  bodySerif: { fontFamily: F.serif, fontSize: 15, lineHeight: 25 },
  small: { fontFamily: F.sans, fontSize: 13, lineHeight: 19 },
  /** 라벨. 한글 11px에 자간 1은 띄엄띄엄 읽혀 12px, 자간 0.5(갭분석 V4) */
  label: { fontFamily: F.sansBold, fontSize: 12, lineHeight: 17, letterSpacing: 0.5 },
  /** 주 버튼 글자 */
  button: { fontFamily: F.sansBold, fontSize: 18, lineHeight: 24 },
  /** 보조 버튼, 글자 버튼, 세그먼트 글자 */
  buttonSm: { fontFamily: F.sansBold, fontSize: 15, lineHeight: 21 },
};

/** 모서리. 버튼과 입력창 12, 세그먼트와 스테퍼 10, 모달 14, 시트 20 */
export const R = { sm: 6, md: 10, lg: 12, xl: 14, sheet: 20 } as const;

/** 테두리 굵기. 버튼, 입력창, 세그먼트는 1.5. 구분선과 카드는 1 */
export const B = { hair: 1, base: 1.5 } as const;

/** 터치 영역 최소 크기 (MP 7.5-7) */
export const HIT = 44;

/** 채팅 간격. 같은 화자가 이어 말하면 4, 화자가 바뀌면 14 */
export const CHAT_GAP = { same: 4, change: 14 } as const;

export const FRAME_MAX = 460;
