import { Banner } from '@/components/Banner';
import { copy } from '@/lib/copy';
import { useApp } from '@/lib/store';

/** 서버 읽기가 실패했을 때 캐시 화면 위에 띄우는 배너 (MP 7.3 서버 점검, 오프라인) */
export function StatusBanner() {
  const loadFailed = useApp((s) => s.loadFailed);
  const offline = useApp((s) => s.offline);
  const loading = useApp((s) => s.loading);
  const refresh = useApp((s) => s.refresh);
  if (!loadFailed) return null;
  return (
    <Banner
      message={offline ? copy.status.offline : copy.status.loadFailed}
      actionTitle={loading ? undefined : copy.status.reload}
      onAction={() => void refresh()}
    />
  );
}
