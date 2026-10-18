import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScroll } from '@/components/ChatScroll';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider } from '@/components/surface';
import { C, S } from '@/lib/theme';

/**
 * 목표 설정 화면 틀. 위 머리(고정), 가운데 스크롤, 바닥 주 버튼 자리(고정).
 * 키보드가 올라오면 바닥 자리가 키보드와 같은 곡선으로 함께 올라간다(MP 7.5-1, 갭분석 M20). 학습 화면(LearnShell)과 같은
 * react-native-keyboard-controller의 KeyboardAvoidingView를 쓴다. 웹에서는 아무것도 하지 않는다.
 * stick이면 내용이 늘 때 맨 아래로 내린다(채팅). 채팅이면 chat(메시지 수 등)을 넘겨 읽는 중 새 메시지 알약과 글자 표시 끝내기를 켠다(ChatScroll).
 */
export function Frame({
  header,
  children,
  footer,
  stick,
  chat,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  stick?: boolean;
  chat?: { count: number; mineLast: boolean; revealing: boolean; onTouch: () => void };
}) {
  const insets = useSafeAreaInsets();
  return (
    <SurfaceProvider theme="ivory">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
        {header ? (
          <View style={{ paddingTop: insets.top + S.sm, paddingBottom: 10, gap: S.xs, borderBottomWidth: 1, borderColor: C.ink }}>
            {header}
          </View>
        ) : null}
        <ChatScroll
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.lg, paddingTop: header ? S.md : insets.top + S.lg, paddingBottom: S.md, gap: S.md }}
          follow={stick}
          {...chat}
        >
          {children}
        </ChatScroll>
        <View style={{ borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
          <PrimaryFooter>{footer}</PrimaryFooter>
        </View>
      </KeyboardAvoidingView>
    </SurfaceProvider>
  );
}
