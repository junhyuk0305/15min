import { Text } from 'react-native';
import { useInk } from '@/components/surface';
import { T } from '@/lib/theme';

/** 요청 실패 안내 두 문장. 바탕에 맞는 빨강(빨강 바탕이면 흰색) */
export function ErrorLine({ message }: { message: string | null }) {
  const { alert } = useInk();
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={[T.small, { color: alert }]}>
      {message}
    </Text>
  );
}
