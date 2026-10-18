import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useInk } from '@/components/surface';
import { B, HIT, S, T } from '@/lib/theme';

/** 체크 상자와 글자. 줄 전체가 눌린다. right에는 "보기" 같은 글자 버튼을 둔다 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  right,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  right?: ReactNode;
}) {
  const { p, ink } = useInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        style={({ pressed }) => ({ flex: 1, minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            borderWidth: B.base,
            borderColor: p.ink,
            backgroundColor: checked ? p.ink : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? (
            <View
              style={{ width: 11, height: 6, marginTop: -3, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: p.onInk, transform: [{ rotate: '-45deg' }] }}
            />
          ) : null}
        </View>
        <Text style={[T.body, { color: ink, flexShrink: 1 }]}>{label}</Text>
      </Pressable>
      {right}
    </View>
  );
}
