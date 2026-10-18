import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useInk } from '@/components/surface';
import { B, F, R, S } from '@/lib/theme';

/**
 * 6칸 코드 입력(갭분석 V10). 입력은 칸 위에 겹친 투명한 TextInput 하나라 붙여넣기, 자동 채우기, 웹 입력이 그대로 된다.
 * 칸은 보이기만 한다. 다음에 칠 칸(다 차면 마지막 칸)이 굵은 테두리로 포커스를 보인다.
 * 숫자만 받고 length자리가 차면 onFull을 부른다. 붙여넣은 글의 공백과 기호는 버린다.
 * 입력칸은 완전히 투명(0)이 아니라 0.01이다. iOS 자동 채우기가 보이지 않는 칸을 건너뛰는 일을 피한다.
 */
export function CodeInput({
  value,
  onChange,
  onFull,
  length = 6,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onFull: (v: string) => void;
  length?: number;
  label: string;
}) {
  const { p } = useInk();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const at = Math.min(value.length, length - 1);
  const change = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, length);
    onChange(v);
    if (v.length === length && v !== value) onFull(v);
  };
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false} style={{ flexDirection: 'row', gap: S.sm }}>
      {Array.from({ length }, (_, i) => {
        const on = focused && i === at;
        return (
          <View
            key={i}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              flex: 1,
              height: 56,
              borderRadius: R.md,
              borderWidth: on ? 2.5 : B.base,
              borderColor: on || value[i] ? p.ink : p.line,
              backgroundColor: p.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: F.serifBlack, fontSize: 24, lineHeight: 30, color: p.ink }}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        caretHidden
        selectionColor="transparent"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.01, color: 'transparent', fontSize: 16 }}
      />
    </Pressable>
  );
}
