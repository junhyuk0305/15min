import { Pressable, Text, View } from 'react-native';
import { useSurface } from '@/components/surface';
import { B, F, R } from '@/lib/theme';

/**
 * 달력 한 칸. 색만으로 구분하지 않고 날짜 아래 기호를 같이 쓴다 (MP 7.7-3, P7-1).
 * done 완료, miss 실패, coupon 쿠폰, rest 쉬는 요일, giveup 포기 대기, open 아직 안 온 학습 요일, outside 다른 달.
 * 오늘은 칸 바깥에 검정 테두리를 한 겹 더 두른다(갭분석 M11). 빈칸인 오늘은 칸 테두리가 이미 굵다.
 * 글자는 선택되지 않는다. 웹에서 달력을 옆으로 쓸 때 글자 선택이 쓸기를 끊는다.
 */
export type DayStatus = 'done' | 'miss' | 'coupon' | 'rest' | 'giveup' | 'open' | 'outside';

/** 범례에서도 같은 기호를 쓴다 */
export const DAY_SYMBOL: Record<DayStatus, string> = {
  done: '○', // ○
  miss: '×', // ×
  coupon: '□', // □
  rest: '–', // –
  giveup: '!',
  open: '',
  outside: '',
};

export function StatusMark({
  day,
  status,
  label,
  today,
  onPress,
}: {
  day: number | string;
  status: DayStatus;
  /** 읽어 줄 이름. 예: "10월 7일 완료" */
  label: string;
  today?: boolean;
  onPress?: () => void;
}) {
  const { p } = useSurface();
  const look = {
    done: { bg: p.ink, border: p.ink, fg: p.onInk },
    miss: { bg: p.red, border: p.red, fg: p.onRed },
    coupon: { bg: 'transparent', border: p.sub, fg: p.ink },
    rest: { bg: 'transparent', border: 'transparent', fg: p.sub },
    giveup: { bg: 'transparent', border: p.red, fg: p.redText },
    open: { bg: 'transparent', border: today ? p.ink : p.line, fg: today ? p.ink : p.sub },
    outside: { bg: 'transparent', border: 'transparent', fg: p.sub },
  }[status];
  const strong = status === 'coupon' || status === 'giveup' || (status === 'open' && today);
  const symbol = DAY_SYMBOL[status];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      // 칸은 화면 폭을 7등분해 360 폭에서 41pt다. 칸 사이 간격(4)의 절반씩 넓혀 44pt를 넘긴다(MP 7.5-7)
      hitSlop={2}
      style={{
        flex: 1,
        aspectRatio: 1,
        borderRadius: R.sm,
        borderWidth: strong ? B.base : B.hair,
        borderColor: look.border,
        backgroundColor: look.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {today && status !== 'open' ? (
        // 칸 사이 간격(4) 안에 들어가는 바깥 테두리
        <View pointerEvents="none" style={{ position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: R.sm + 2, borderWidth: B.base, borderColor: p.ink }} />
      ) : null}
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 15, color: look.fg, userSelect: 'none' }}>
        {day}
      </Text>
      <View style={{ height: 12, justifyContent: 'center' }}>
        {symbol ? (
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.sansBold, fontSize: 10, lineHeight: 12, color: look.fg, userSelect: 'none' }}>
            {symbol}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
