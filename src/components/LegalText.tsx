import { Text, View } from 'react-native';
import { useInk } from '@/components/surface';
import { S, T } from '@/lib/theme';

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1');

/** 법무 문서 마크다운을 글자로 보인다. 제목, 인용, 목록, 표 줄만 구분한다 */
export function LegalText({ source }: { source: string }) {
  const { ink, sub } = useInk();
  const blocks = source.split('\n');
  return (
    <View style={{ gap: S.sm }}>
      {blocks.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        if (/^\|[\s:|-]+\|$/.test(line)) return null; // 표 구분 줄
        if (line.startsWith('# ')) return <Text key={i} accessibilityRole="header" style={[T.h1, { color: ink }]}>{plain(line.slice(2))}</Text>;
        if (/^#{2,}\s/.test(line)) {
          return <Text key={i} accessibilityRole="header" style={[T.h2, { color: ink, marginTop: S.md }]}>{plain(line.replace(/^#+\s/, ''))}</Text>;
        }
        if (line.startsWith('>')) return <Text key={i} style={[T.small, { color: sub }]}>{plain(line.replace(/^>\s?/, ''))}</Text>;
        if (line.startsWith('|')) {
          const cells = line.split('|').slice(1, -1).map((c) => plain(c.trim()));
          return <Text key={i} style={[T.small, { color: ink }]}>{cells.join('   ')}</Text>;
        }
        const indent = /^\s+/.exec(raw)?.[0].length ?? 0;
        return <Text key={i} style={[T.body, { color: ink, paddingLeft: Math.min(indent, 6) * 4 }]}>{plain(line.trim())}</Text>;
      })}
    </View>
  );
}
