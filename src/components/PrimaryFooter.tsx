import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '@/lib/theme';

/**
 * 화면 바닥에 붙는 주 버튼 자리 (MP 7.5-1). 주 버튼 하나와 그 아래 글자 버튼을 둔다.
 * 키보드 회피는 바깥의 Screen(KeyboardAvoidingView)이 맡는다.
 * 탭 화면처럼 아래에 탭 바가 있으면 safeBottom={false}로 안전 영역을 두 번 더하지 않는다.
 */
export function PrimaryFooter({ children, safeBottom = true }: { children: ReactNode; safeBottom?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: (safeBottom ? insets.bottom : 0) + S.md, gap: S.sm }}>
      {children}
    </View>
  );
}
