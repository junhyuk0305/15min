import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useInk } from '@/components/surface';
import { HIT, S, T } from '@/lib/theme';

/**
 * 보조 동작용 글자 버튼 (MP 7.5-3). 주 버튼과 모양이 다르다: 채움과 테두리 없이 밑줄 글자.
 * tone='danger'는 포기, 삭제처럼 위험한 동작의 입구. 주 버튼 자리에 두지 않는다.
 */
export function TextButton({
  title,
  onPress,
  tone = 'ink',
  disabled,
  busy,
  inverse,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  tone?: 'ink' | 'sub' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  /** 빨강 바탕 위. 생략하면 Screen danger를 따른다 */
  inverse?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const { ink, sub, alert } = useInk(inverse);
  const off = !!disabled || !!busy;
  const color = tone === 'danger' ? alert : tone === 'sub' ? sub : ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      hitSlop={S.xs}
      style={({ pressed }) => [
        { minHeight: HIT, minWidth: HIT, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: S.sm, opacity: off ? 0.5 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm }}>
        {busy ? <ActivityIndicator size="small" color={color} /> : null}
        <Text style={[T.buttonSm, { color, textDecorationLine: 'underline', textAlign: 'center' }]}>{title}</Text>
      </View>
    </Pressable>
  );
}
