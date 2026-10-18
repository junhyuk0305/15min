// 알림을 눌렀을 때 갈 곳 (MP P8-5). 순수 함수라 테스트로 검증한다. React Native를 import하지 않는다.
// 그 알림이 가리키는 상태가 이미 끝났으면(예: 완료한 날의 독촉) 홈으로 보내고 한 줄 안내를 띄운다.
import type { PlannedKind } from './plan';
import { safeNext } from './route';

/** 알림 data에 넣는 값 (notify.ts applyPlan) */
export type TapData = { url?: unknown; kind?: unknown; day?: unknown };

export type TapState = {
  hasActiveGoal: boolean;
  giveupPending: boolean;
  /** 이용 정지 중(영구 정지 제외) */
  suspended: boolean;
  /** 오늘 하루 키 */
  today: string;
  /** 오늘 행: 없음, 학습 중, 끝남(완료, 쿠폰) */
  todayStatus: 'none' | 'progress' | 'closed';
};

export type TapTarget = { path: string; stale: boolean };

const CYCLE: PlannedKind[] = ['pre', 'devil', 'start', 'nag'];
const KINDS: PlannedKind[] = [...CYCLE, 'giveup_wait', 'suspended', 'no_goal'];

function isStale(kind: PlannedKind, day: string | null, s: TapState): boolean {
  switch (kind) {
    case 'giveup_wait':
      return !s.giveupPending;
    case 'suspended':
      return !s.suspended;
    case 'no_goal':
      return s.hasActiveGoal;
    default:
      return !s.hasActiveGoal || s.giveupPending || day !== s.today || s.todayStatus === 'closed';
  }
}

export function tapTarget(data: TapData | null | undefined, s: TapState): TapTarget {
  const url = typeof data?.url === 'string' ? safeNext(data.url) : null;
  const kind = KINDS.find((k) => k === data?.kind);
  // 예전 알림(kind 없음)은 경로만 따른다. 막아야 하면 route.ts가 막는다
  if (!kind) return { path: url ?? '/', stale: false };
  const day = typeof data?.day === 'string' ? data.day : null;
  if (isStale(kind, day, s)) return { path: '/', stale: true };
  return { path: url ?? '/', stale: false };
}
