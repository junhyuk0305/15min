import { router } from 'expo-router';
import { useEffect } from 'react';
import { copy } from '@/lib/copy';
import { useRuntime } from '@/lib/runtime';

/** 없는 경로와 무효 딥링크: 홈으로 보내고 한 줄 안내 (MP 7.4-6). 홈에 갈 수 없으면 route.ts가 다시 옮긴다 */
export default function NotFound() {
  useEffect(() => {
    useRuntime.getState().setNotice(copy.status.notFound);
    router.replace('/');
  }, []);
  return null;
}
