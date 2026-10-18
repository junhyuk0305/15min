import { View, type ViewStyle } from 'react-native';

/**
 * 선 아이콘 몇 개(chevron, 닫기 X, 위 화살표, 더 보기 점). SVG 패키지 없이 View 테두리를 돌려 그린다(TabIcon과 같은 방식).
 * 글자나 접근성 이름이 따로 있으므로 장식으로 두고 읽지 않는다.
 */
export type GlyphName = 'back' | 'forward' | 'up' | 'close' | 'arrowUp' | 'more';

export function Glyph({ name, color, size = 24, stroke = 2 }: { name: GlyphName; color: string; size?: number; stroke?: number }) {
  const box: ViewStyle = { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={box}>
      {parts(name, size, stroke, color)}
    </View>
  );
}

function parts(name: GlyphName, s: number, w: number, color: string) {
  const abs: ViewStyle = { position: 'absolute' };
  const chevron = (side: number, borders: ViewStyle, dx: number, dy: number) => (
    <View
      style={[abs, borders, { width: side, height: side, borderColor: color, transform: [{ translateX: dx }, { translateY: dy }, { rotate: '45deg' }] }]}
    />
  );
  const c = s * 0.42;
  switch (name) {
    case 'back':
      return chevron(c, { borderLeftWidth: w, borderBottomWidth: w }, c * 0.2, 0);
    case 'forward':
      return chevron(c, { borderTopWidth: w, borderRightWidth: w }, -c * 0.2, 0);
    case 'up':
      return chevron(c, { borderTopWidth: w, borderLeftWidth: w }, 0, c * 0.2);
    case 'close':
      return [45, -45].map((deg) => (
        <View key={deg} style={[abs, { width: s * 0.72, height: w, borderRadius: w / 2, backgroundColor: color, transform: [{ rotate: `${deg}deg` }] }]} />
      ));
    case 'arrowUp':
      return [
        <View key="bar" style={[abs, { width: w, height: s * 0.62, borderRadius: w / 2, backgroundColor: color, transform: [{ translateY: s * 0.06 }] }]} />,
        <View key="head" style={[abs, { width: s * 0.4, height: s * 0.4, borderTopWidth: w, borderLeftWidth: w, borderColor: color, transform: [{ translateY: -s * 0.1 }, { rotate: '45deg' }] }]} />,
      ];
    case 'more':
      return (
        <View style={{ flexDirection: 'row', gap: w * 1.5 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: w * 2, height: w * 2, borderRadius: w, backgroundColor: color }} />
          ))}
        </View>
      );
  }
}
