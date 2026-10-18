import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Glyph } from '@/components/Glyph';
import { useInk } from '@/components/surface';
import { copy } from '@/lib/copy';
import { B, HIT, S, T } from '@/lib/theme';

/**
 * 공통 헤더(메가프롬프트 4.3, 갭분석 N1~N8). 높이 52, 왼쪽 chevron(뒤로) 또는 X(닫기) 또는 없음, 가운데 제목, 오른쪽 슬롯.
 * 강제 화면은 left='none'에 reason으로 왜 못 나가는지 한 줄을 둔다(3절).
 * scrolled면 아래 hairline. 큰 글자에서 제목은 두 줄까지 늘어난다. 바탕색은 Screen을 따른다(빨강 바탕이면 흰 글자).
 * 안전 영역 위 여백은 바깥 Screen이 준다.
 */
export function Header({
  title,
  left = 'back',
  onLeft,
  right,
  scrolled,
  reason,
}: {
  title?: string;
  left?: 'back' | 'close' | 'none';
  onLeft?: () => void;
  right?: ReactNode;
  scrolled?: boolean;
  /** 강제 화면에서 나갈 수 없는 이유 한 줄 */
  reason?: string;
}) {
  const { p, inv, ink, sub } = useInk();
  const showLeft = left !== 'none' && !!onLeft;
  return (
    <View style={{ borderBottomWidth: B.hair, borderBottomColor: scrolled ? (inv ? 'rgba(255,255,255,0.4)' : p.line) : 'transparent' }}>
      <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xs }}>
        <View style={{ width: HIT, alignItems: 'flex-start' }}>
          {showLeft ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={left === 'close' ? copy.ux.close : copy.ux.back}
              onPress={onLeft}
              style={({ pressed }) => ({ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
            >
              <Glyph name={left === 'close' ? 'close' : 'back'} color={ink} />
            </Pressable>
          ) : null}
        </View>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[T.h2, { flex: 1, color: ink, textAlign: 'center', paddingHorizontal: S.xs }]}
        >
          {title ?? ''}
        </Text>
        <View style={{ minWidth: HIT, alignItems: 'flex-end' }}>{right}</View>
      </View>
      {reason ? <Text style={[T.small, { color: sub, textAlign: 'center', paddingHorizontal: S.lg, paddingBottom: S.sm }]}>{reason}</Text> : null}
    </View>
  );
}

/** 헤더 오른쪽 "더 보기" 버튼(⋯). 누르면 ActionSheet를 연다 */
export function HeaderMore({ onPress }: { onPress: () => void }) {
  const { ink } = useInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.ux.more}
      onPress={onPress}
      style={({ pressed }) => ({ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <Glyph name="more" color={ink} />
    </Pressable>
  );
}
