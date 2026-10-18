import { Pressable, Text } from 'react-native';
import { B, C, HIT, S, T } from '@/lib/theme';

/** 둥근 칩. on이면 검정 채움. 보기 답, 요일, 빠른 값에 쓴다 */
export function Chip({
  label,
  on,
  onPress,
  disabled,
  accessibilityLabel,
  role = 'button',
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  role?: 'button' | 'checkbox' | 'radio';
}) {
  const state = role === 'button' ? { disabled: !!disabled } : { checked: !!on, disabled: !!disabled };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: HIT,
        minWidth: HIT,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: S.md - 2,
        borderRadius: 999,
        borderWidth: B.base,
        borderColor: C.ink,
        backgroundColor: on ? C.ink : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={[T.buttonSm, { fontSize: 14, color: on ? C.onInk : C.ink, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}
