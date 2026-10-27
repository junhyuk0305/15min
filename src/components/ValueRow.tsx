import { Pressable, Text } from 'react-native';
import { Glyph } from '@/components/Glyph';
import { tap } from '@/lib/haptics';
import { B, C, HIT, S, T } from '@/lib/theme';

/**
 * 눌러서 바꾸는 값 한 줄. 라벨은 왼쪽, 지금 값은 오른쪽 명조, 그 옆 화살표(디자인 고도화 C안).
 * 누르는 칩, 입력창, 보여 주기만 하는 숫자와 모양을 다르게 둔다. 누르면 고르는 창은 부르는 쪽이 연다.
 */
export function ValueRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: HIT + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: S.sm,
        borderBottomWidth: B.hair,
        borderBottomColor: C.line,
        backgroundColor: pressed ? C.line : 'transparent',
      })}
    >
      <Text style={[T.body, { flex: 1, color: C.ink }]}>{label}</Text>
      <Text style={[T.big, { fontSize: 22, lineHeight: 30, color: C.ink }]}>{value}</Text>
      <Glyph name="forward" size={16} color={C.sub} />
    </Pressable>
  );
}
