import { Text } from 'react-native';
import { Appear } from '@/components/Appear';
import { useInk } from '@/components/surface';
import { T } from '@/lib/theme';

/** 요청 실패 안내 두 문장. 바탕에 맞는 빨강(빨강 바탕이면 흰색). 나타날 때 페이드(영향지도 B-7) */
export function ErrorLine({ message }: { message: string | null }) {
  const { alert } = useInk();
  if (!message) return null;
  return (
    <Appear>
      <Text accessibilityRole="alert" style={[T.small, { color: alert }]}>
        {message}
      </Text>
    </Appear>
  );
}
