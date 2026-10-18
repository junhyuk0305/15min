import { useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider } from '@/components/surface';
import { C, S } from '@/lib/theme';

/**
 * 목표 설정 화면 틀. 위 머리(고정), 가운데 스크롤, 바닥 주 버튼 자리(고정).
 * 키보드가 올라오면 바닥 자리가 함께 올라간다(MP 7.5-1). KeyboardAvoidingView의 padding은 키보드와 겹친 만큼만
 * 더하므로 Android에서 창이 줄어드는 경우에도 두 번 밀리지 않는다. KeyboardProvider 유무와 상관없이 동작한다.
 * stick이면 내용이 늘 때 맨 아래로 내린다(채팅).
 */
export function Frame({ header, children, footer, stick }: { header?: ReactNode; children: ReactNode; footer: ReactNode; stick?: boolean }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  return (
    <SurfaceProvider theme="ivory">
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={{ flex: 1, backgroundColor: C.bg }}>
        {header ? (
          <View style={{ paddingTop: insets.top + S.md, paddingHorizontal: S.lg, paddingBottom: 10, gap: S.xs, borderBottomWidth: 1, borderColor: C.ink }}>
            {header}
          </View>
        ) : null}
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.lg, paddingTop: header ? S.md : insets.top + S.lg, paddingBottom: S.md, gap: S.md }}
          onContentSizeChange={() => {
            if (stick) scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          {children}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
          <PrimaryFooter>{footer}</PrimaryFooter>
        </View>
      </KeyboardAvoidingView>
    </SurfaceProvider>
  );
}
