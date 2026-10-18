// 움직임 값은 여기 한 곳에 둔다(메가프롬프트 4.1, 영향지도 B-6).
// 줄인 움직임 설정이면 이동, 확대, 반복을 끄고 150ms 이하 페이드만 남긴다. 레이아웃 프리셋은 기본(ReduceMotion.System)으로 그 설정을 따른다.
// 웹은 springify를 지원하지 않는다. 프리셋은 모두 시간 기반이다.
import { Platform } from 'react-native';
import { Easing, Keyframe } from 'react-native-reanimated';

export const DUR = {
  fast: 120,
  base: 200,
  slow: 320,
  /** 숫자 카운트업 */
  count: 800,
  /** 눌림 들어감, 나옴 */
  pressIn: 100,
  pressOut: 150,
  /** 새 채팅 줄 등장 */
  line: 220,
  /** 게이지 채움 */
  gauge: 600,
  /** 줄인 움직임일 때 남기는 페이드 상한 */
  reduced: 150,
  /** 스켈레톤 밝기 한 주기 */
  pulse: 1000,
  /** 입력 중 점 한 주기와 점 사이 간격 */
  dots: 1200,
  dotGap: 150,
  /** 토스트가 떠 있는 시간 */
  toast: 4000,
} as const;

export const EASE = Easing.out(Easing.cubic);

/** 시트 스프링. 웹은 같은 느낌의 시간 기반(DUR.slow)으로 대신한다 */
export const SPRING = { damping: 20, stiffness: 220 } as const;
export const SPRING_OK = Platform.OS !== 'web';

/** 레이아웃 등장 프리셋 (entering=) */
export const enter = {
  /** 줄 등장: 페이드 + 8px 올라옴 */
  line: new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 8 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
  }).duration(DUR.line),
  fade: new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: EASE } }).duration(DUR.base),
  /** 시트 내용: 아래에서 올라옴 */
  sheet: new Keyframe({
    0: { transform: [{ translateY: 400 }] },
    100: { transform: [{ translateY: 0 }], easing: EASE },
  }).duration(DUR.slow),
  /** 가운데 모달: 0.96 → 1 + 페이드 */
  modal: new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.96 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE },
  }).duration(DUR.base),
};

/** 글자 단위 표시(3절): 어절당 35ms, 메시지당 최대 1.5초 */
export const REVEAL = { msPerWord: 35, maxMs: 1500 } as const;
