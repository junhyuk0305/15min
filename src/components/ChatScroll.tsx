import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSurface } from '@/components/surface';
import { copy } from '@/lib/copy';
import { enter } from '@/lib/motion';
import { S, T } from '@/lib/theme';

/** 바닥에서 이만큼 안이면 맨 아래에 있는 것으로 본다 */
const NEAR = 48;

/**
 * 채팅 스크롤(갭분석 C5, F13). follow면 내용이 늘 때 맨 아래로 내린다. topKey가 바뀌면 맨 위로 올린다(복습의 새 문항).
 * count(메시지 수)가 늘었는데 사용자가 위로 올려 읽는 중이면 내리지 않고 아래에 "새 메시지" 알약을 띄운다. 누르면 내린다.
 * mineLast면(내가 막 보낸 줄) 읽던 자리와 상관없이 내린다. revealing이 끝날 때 맨 아래에 있으면 한 번 더 맞춘다(영향지도 B-5).
 * onTouch는 안쪽 어디를 누르든 먼저 불린다(글자 표시를 바로 끝낸다). 누름을 가로채지 않는다.
 */
export function ChatScroll({
  children,
  contentContainerStyle,
  follow,
  topKey,
  count,
  mineLast,
  revealing,
  onTouch,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  follow?: boolean;
  topKey?: string;
  count?: number;
  mineLast?: boolean;
  revealing?: boolean;
  onTouch?: () => void;
}) {
  const { p } = useSurface();
  const ref = useRef<ScrollView>(null);
  const bottom = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [pill, setPill] = useState(false);
  const [seen, setSeen] = useState(count);
  // 메시지가 늘었는데 읽는 중이면 알약을 띄운다(렌더 중 상태 맞추기)
  if (count !== seen) {
    setSeen(count);
    if (follow && count !== undefined && seen !== undefined && count > seen && !atBottom && !mineLast) setPill(true);
  }
  // 저절로 내릴 때는 바로 옮긴다. 부드럽게 내리는 도중에 내용이 또 늘면 중간 위치를 "읽는 중"으로 잘못 보고 끝까지 못 내려간다
  // (반성문에서 확인). 새 줄은 스스로 페이드와 8px 올라옴으로 들어오므로 움직임은 남는다. 알약을 누를 때만 부드럽게 내린다
  const toEnd = useCallback(() => ref.current?.scrollToEnd({ animated: false }), []);
  const followRef = useRef(follow);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    if (topKey !== undefined) ref.current?.scrollTo({ y: 0, animated: false });
  }, [topKey]);
  // follow가 켜지는 순간(복습 채점 결과)에도 내린다. 바닥 버튼이 함께 커지면 내용 크기 변화만으로는 내려가지 않는다
  useEffect(() => {
    if (!follow) return;
    const id = requestAnimationFrame(toEnd);
    return () => cancelAnimationFrame(id);
  }, [follow, toEnd]);
  // 내가 보낸 줄은 읽던 자리와 상관없이 보이게 내린다
  useEffect(() => {
    if (!follow || !mineLast) return;
    const id = requestAnimationFrame(toEnd);
    return () => cancelAnimationFrame(id);
  }, [follow, mineLast, count, toEnd]);
  // 글자 표시가 끝나면(표현 카드 페이드인 포함) 맨 아래를 다시 맞춘다
  useEffect(() => {
    if (!follow || revealing !== false || !bottom.current) return;
    const id = requestAnimationFrame(toEnd);
    return () => cancelAnimationFrame(id);
  }, [follow, revealing, toEnd]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const near = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR;
    bottom.current = near;
    setAtBottom(near);
    if (near) setPill(false);
  };

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        onTouch?.();
        return false;
      }}
    >
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        // 두 처리기는 늘 넘긴다. react-native-web은 처음 그릴 때 onContentSizeChange가 없으면 크기 감시를 다시 걸지 않는다
        // (반성문처럼 follow가 나중에 켜지는 화면에서 새 답으로 내려가지 않았다, F13)
        onScroll={onScroll}
        onContentSizeChange={() => {
          if (followRef.current && bottom.current) toEnd();
        }}
        // 키보드가 올라와 보이는 높이가 줄면 내용 크기는 그대로라 위 처리기가 불리지 않는다. 맨 아래를 읽던 중이면 다시 맞춘다
        onLayout={() => {
          if (followRef.current && bottom.current) toEnd();
        }}
      >
        {children}
      </ScrollView>
      {pill ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: S.sm, alignItems: 'center' }}>
          <Animated.View entering={enter.fade}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPill(false);
                ref.current?.scrollToEnd({ animated: true });
              }}
              hitSlop={4}
              style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', paddingHorizontal: S.md, borderRadius: 18, backgroundColor: p.ink, opacity: pressed ? 0.8 : 1 })}
            >
              <Text style={[T.small, { color: p.onInk }]}>{copy.ux.newMessage}</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}
