import { View, type ViewStyle } from 'react-native';

/**
 * 탭 바 아이콘 4개. docs/ia-screens.html의 선 아이콘을 View 선으로 그린다(SVG 패키지 없음).
 * 탭 이름 글자가 같이 보이므로 장식으로 두고 읽지 않는다.
 * 좌표는 22 칸 기준이고 size에 맞춰 늘린다.
 */
export type TabIconName = 'home' | 'coach' | 'archive' | 'settings';

/** fill이면 선 대신 채운 막대 */
type Seg = ViewStyle & { fill?: true };

function shapes(name: TabIconName, w: number): Seg[] {
  switch (name) {
    case 'home':
      return [
        // 지붕: 45도 돌린 정사각형의 위와 왼쪽 변
        { left: 5, top: 4.5, width: 12, height: 12, borderTopWidth: w, borderLeftWidth: w, transform: [{ rotate: '45deg' }] },
        // 벽
        { left: 4, top: 10, width: 14, height: 10, borderLeftWidth: w, borderRightWidth: w, borderBottomWidth: w },
        // 문
        { left: 9, top: 14, width: 4, height: 6, borderLeftWidth: w, borderRightWidth: w, borderTopWidth: w },
      ];
    case 'coach':
      return [
        { left: 3, top: 4, width: 16, height: 12, borderWidth: w, borderRadius: 2 },
        // 꼬리
        { left: 5.5, top: 13, width: 5, height: 5, borderRightWidth: w, borderBottomWidth: w, transform: [{ rotate: '45deg' }] },
      ];
    case 'archive':
      return [
        { left: 3, top: 5, width: 16, height: 15, borderWidth: w, borderRadius: 2 },
        { left: 3, top: 9, width: 16, height: w, fill: true },
        { left: 7, top: 2.5, width: w, height: 5, fill: true },
        { left: 14, top: 2.5, width: w, height: 5, fill: true },
      ];
    case 'settings':
      return [
        { left: 3, top: 6, width: 16, height: w, fill: true },
        { left: 3, top: 11, width: 16, height: w, fill: true },
        { left: 3, top: 16, width: 16, height: w, fill: true },
        { left: 8, top: 3.5, width: w, height: 6, fill: true },
        { left: 14, top: 8.5, width: w, height: 6, fill: true },
        { left: 7, top: 13.5, width: w, height: 6, fill: true },
      ];
  }
}

const NUM_KEYS = ['left', 'top', 'width', 'height', 'borderWidth', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'borderBottomWidth', 'borderRadius'] as const;

export function TabIcon({ name, color, size = 22 }: { name: TabIconName; color: string; size?: number }) {
  const k = size / 22;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      {shapes(name, 1.8).map((seg, i) => {
        const { fill, ...rest } = seg;
        const scaled: Record<string, unknown> = { ...rest };
        for (const key of NUM_KEYS) {
          const v = seg[key];
          if (typeof v === 'number') scaled[key] = v * k;
        }
        return (
          <View key={i} style={[scaled as ViewStyle, { position: 'absolute', borderColor: color, backgroundColor: fill ? color : 'transparent' }]} />
        );
      })}
    </View>
  );
}
