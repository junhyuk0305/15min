import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSurface } from '@/components/surface';
import { B, HIT, R, T } from '@/lib/theme';

/** 세그먼트 토글. 예: 영어 답변 / 속마음. 고른 칸은 검정 채움 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  disabled,
  style,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { p } = useSurface();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[{ flexDirection: 'row', borderWidth: B.base, borderColor: p.ink, borderRadius: R.md, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }, style]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => {
              if (!on) onChange(o.value);
            }}
            style={{ flex: 1, minHeight: HIT, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.ink : 'transparent' }}
          >
            <Text style={[T.buttonSm, { fontSize: 13, lineHeight: 18, textAlign: 'center', color: on ? p.onInk : p.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
