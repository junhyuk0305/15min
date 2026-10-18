import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { archiveTabTarget, TabBarTint, TabIcon } from '@/components/TabIcon';
import { copy } from '@/lib/copy';
import { C, F } from '@/lib/theme';

// 홈이 빨강(독촉, 이탈, 포기 대기)이면 홈 화면이 탭 바 글자색을 흰색으로 바꾸고 바탕은 TabBarTint가 칠한다(갭분석 N12)
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.sub,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line, height: 60 },
        tabBarLabelStyle: { fontFamily: F.sansBold, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: copy.tabs.home, tabBarBackground: () => <TabBarTint />, tabBarIcon: ({ color }) => <TabIcon name="home" color={String(color)} /> }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: copy.tabs.archive,
          tabBarIcon: ({ color }) => (
            // 첫 홈 안내가 이 아이콘을 가리킨다
            <View ref={archiveTabTarget} collapsable={false}>
              <TabIcon name="archive" color={String(color)} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="settings" options={{ title: copy.tabs.settings, tabBarIcon: ({ color }) => <TabIcon name="settings" color={String(color)} /> }} />
    </Tabs>
  );
}
