// 개발 전용 화면(메가프롬프트 3절 개발 패널, W9). 설정의 "앱 버전"을 7번 누르면 열린다. __DEV__가 아니면 홈으로 돌려보낸다.
// 개발 도구라 설명은 영어로 둔다. DevTools는 __DEV__일 때만 require 하므로 프로덕션 번들에 들어가지 않는다.
import { Redirect, router } from 'expo-router';
import type { ComponentType } from 'react';
import { Header } from '@/components/Header';
import { Row, Screen } from '@/components/ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DevTools: ComponentType | null = __DEV__ ? require('@/components/DevTools').DevTools : null;

export default function DevToolsScreen() {
  if (!__DEV__ || !DevTools) return <Redirect href="/" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return (
    <Screen header={<Header title="Dev tools" onLeft={back} />}>
      <Row left="Component gallery" chevron onPress={() => router.push('/dev/gallery')} />
      <DevTools />
    </Screen>
  );
}
