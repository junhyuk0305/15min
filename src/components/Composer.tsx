import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Glyph } from '@/components/Glyph';
import { useInk } from '@/components/surface';
import { copy } from '@/lib/copy';
import { B, HIT, S, T } from '@/lib/theme';

const LINE = 24; // T.body lineHeight
const PAD_V = 10;
const MIN_H = LINE + PAD_V * 2; // 한 줄 44
const MAX_H = LINE * 5 + PAD_V * 2; // 다섯 줄
const SEND = 36;
const COUNTER = 18;
const web = Platform.OS === 'web';

/**
 * 공용 채팅 입력창(메가프롬프트 4.4, 갭분석 C4). 학습 B, 회고, 목표 정하기, 반성문이 같이 쓴다.
 * 둥근 입력창 안 오른쪽에 원형 보내기 아이콘. 비었거나 조건이 모자라면 회색이고 눌리지 않는다. 빈 입력 안내 문장은 두지 않는다.
 * 한 줄 44에서 시작해 다섯 줄까지 늘어난다. min이 있으면 안쪽 오른쪽 아래에 글자 수 카운터(쓰기 시작했는데 모자라면 빨강).
 * error가 있으면 입력창 위에 빨강 두 문장(실패 안내)을 보이고 문장은 그대로 둔다. 다시 누르면 다시 보낸다(MP 7.3).
 * onInputStart는 입력창을 누르거나 글자를 칠 때 부른다(글자 단위 표시를 바로 끝내는 데 쓴다).
 * 키보드는 감싸는 화면(LearnShell의 keyboard-controller)이 맡는다. 지금 learn/parts.tsx Composer와 같다.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  error,
  min,
  blocked,
  placeholder,
  onInputStart,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy?: boolean;
  /** 보내기 실패 안내. 없으면 null */
  error?: string | null;
  /** 최소 글자 수. 있으면 카운터를 보인다 */
  min?: number;
  /** 그 밖의 조건 미달. true면 보내기가 회색이다 */
  blocked?: boolean;
  placeholder?: string;
  onInputStart?: () => void;
}) {
  const { p, alert } = useInk();
  // 카운터 자리
  const extra = min !== undefined ? COUNTER : 0;
  const [h, setH] = useState(MIN_H + extra);
  const n = value.trim().length;
  const short = min !== undefined && n < min;
  const off = n === 0 || short || !!blocked || !!busy;
  const counterColor = n === 0 ? p.sub : short ? alert : p.sub;
  return (
    <View style={{ gap: S.xs }}>
      <ErrorLine message={error ?? null} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          borderWidth: B.base,
          borderColor: p.ink,
          borderRadius: 22,
          backgroundColor: p.card,
          paddingLeft: S.md,
          paddingRight: (MIN_H - SEND) / 2,
        }}
      >
        <TextInput
          value={value}
          onChangeText={(t) => {
            onInputStart?.();
            onChange(t);
          }}
          onFocus={onInputStart}
          placeholder={placeholder}
          placeholderTextColor={p.sub}
          accessibilityLabel={placeholder}
          multiline
          editable={!busy}
          // 네이티브는 minHeight와 maxHeight 사이에서 저절로 늘어난다. 웹 textarea는 scrollHeight(안쪽 여백 포함)로 높이를 맞춘다
          onContentSizeChange={web ? (e) => setH(Math.min(MAX_H + extra, Math.max(MIN_H + extra, Math.ceil(e.nativeEvent.contentSize.height)))) : undefined}
          style={[
            T.body,
            {
              flex: 1,
              color: p.ink,
              minHeight: MIN_H + extra,
              maxHeight: MAX_H + extra,
              paddingTop: PAD_V,
              paddingBottom: PAD_V + extra,
              textAlignVertical: 'top',
            },
            web && { height: value ? h : MIN_H + extra },
          ]}
        />
        {min !== undefined ? (
          <Text
            accessibilityLabel={`${n}/${min}`}
            style={[T.small, { position: 'absolute', right: SEND + (MIN_H - SEND) / 2 + S.sm, bottom: 6, color: counterColor }]}
          >
            {`${n}/${min}`}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.ux.send}
          accessibilityState={{ disabled: off, busy: !!busy }}
          disabled={off}
          onPress={onSend}
          hitSlop={(HIT - SEND) / 2}
          style={({ pressed }) => ({
            width: SEND,
            height: SEND,
            borderRadius: SEND / 2,
            marginBottom: (MIN_H - SEND) / 2 - B.base,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: off && !busy ? p.disabled : p.ink,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {busy ? <ActivityIndicator size="small" color={p.onInk} /> : <Glyph name="arrowUp" size={20} color={off ? p.onDisabled : p.onInk} />}
        </Pressable>
      </View>
    </View>
  );
}
