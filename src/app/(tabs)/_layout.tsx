import { Tabs } from 'expo-router/js-tabs';
import { copy } from '@/lib/copy';
import { C } from '@/lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.sub,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line, height: 60 },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '800' },
        tabBarIconStyle: { display: 'none' },
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: copy.tabs.home }} />
      <Tabs.Screen name="archive" options={{ title: copy.tabs.archive }} />
      <Tabs.Screen name="settings" options={{ title: copy.tabs.settings }} />
    </Tabs>
  );
}
