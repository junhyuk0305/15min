import { Tabs } from 'expo-router/js-tabs';
import { TabIcon } from '@/components/TabIcon';
import { copy } from '@/lib/copy';
import { C, F } from '@/lib/theme';

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
      <Tabs.Screen name="index" options={{ title: copy.tabs.home, tabBarIcon: ({ color }) => <TabIcon name="home" color={String(color)} /> }} />
      <Tabs.Screen name="archive" options={{ title: copy.tabs.archive, tabBarIcon: ({ color }) => <TabIcon name="archive" color={String(color)} /> }} />
      <Tabs.Screen name="settings" options={{ title: copy.tabs.settings, tabBarIcon: ({ color }) => <TabIcon name="settings" color={String(color)} /> }} />
    </Tabs>
  );
}
