import { router } from 'expo-router';
import { useEffect } from 'react';
import { showToast } from '@/components/Toast';
import { copy } from '@/lib/copy';

/** 없는 경로와 무효 딥링크: 홈으로 보내고 한 줄 안내 (MP 7.4-6). 홈에 갈 수 없으면 route.ts가 다시 옮긴다. 그리는 화면이 없어 헤더도 없다 */
export default function NotFound() {
  useEffect(() => {
    showToast(copy.status.notFound);
    router.replace('/');
  }, []);
  return null;
}
