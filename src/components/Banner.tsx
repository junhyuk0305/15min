import { Pressable, Text, View } from 'react-native';
import { useSurface } from '@/components/surface';
import { F, HIT, R, S } from '@/lib/theme';

/**
 * 빨강 배너. 알림 꺼짐, 쿠폰 경고처럼 놓치면 안 되는 한 줄. 동작이 있으면 오른쪽에 밑줄 글자.
 * 빨강 바탕 화면 안에서는 흰 바탕에 빨강 글자로 뒤집는다.
 */
export function Banner({ message, actionTitle, onAction }: { message: string; actionTitle?: string; onAction?: () => void }) {
  const { p, red } = useSurface();
  const bg = red ? p.onRed : p.red;
  const fg = red ? p.red : p.onRed;
  const text = { fontFamily: F.sansBold, fontSize: 13, lineHeight: 19, color: fg };
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: bg, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: S.xs, minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: S.sm }}
    >
      <Text style={[text, { flex: 1, paddingVertical: S.sm }]}>{message}</Text>
      {actionTitle && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={S.xs} style={{ minHeight: HIT, minWidth: HIT, justifyContent: 'center' }}>
          <Text style={[text, { textDecorationLine: 'underline' }]}>{actionTitle}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
