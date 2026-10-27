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
  reply,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  role?: 'button' | 'checkbox' | 'radio';
  /** 채팅 빠른 답. 아래 입력창(검정 테두리)과 헷갈리지 않게 테두리 없이 낮고 채운 모양으로 둔다 */
  reply?: boolean;
}) {
  const state = role === 'button' ? { disabled: !!disabled } : { checked: !!on, disabled: !!disabled };
  const height = reply ? 34 : HIT;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      disabled={disabled}
      onPress={onPress}
      hitSlop={(HIT - height) / 2}
      style={({ pressed }) => ({
        minHeight: height,
        minWidth: HIT,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: reply ? S.md - 4 : S.md - 2,
        borderRadius: 999,
        borderWidth: reply ? 0 : B.base,
        borderColor: C.ink,
        backgroundColor: on ? C.ink : reply ? C.line : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={[T.buttonSm, { fontSize: reply ? 13 : 14, color: on ? C.onInk : C.ink, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}
