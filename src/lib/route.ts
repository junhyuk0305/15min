// 어느 화면에 있어야 하는지 한 곳에서 정한다(MP 7.4-5). 화면은 따로 판단하지 않는다.
// _layout이 지금 경로와 store 상태로 redirectFor를 부르고, 결과가 있으면 router.replace 한다.

export type RouteInput = {
  /** 이 기기에 세션이 있나 */
  authed: boolean;
  /** 이 기기에서 온보딩을 끝냈나 */
  onboarded: boolean;
  /** 서버 프로필(캐시 포함). 아직 못 받았으면 null */
  profile: { banned: boolean; suspendedUntil: number | null } | null;
  hasActiveGoal: boolean;
  /** 활성 목표에 포기 신청이 걸려 있나 */
  giveupPending: boolean;
  /** 오늘 행: 없음, 학습 중(progress), 끝남(done, coupon) */
  today: 'none' | 'progress' | 'closed';
  /** 마지막 서버 읽기가 실패했나. 홈이 캐시와 오류 배너를 보인다 */
  loadFailed: boolean;
  now: number;
};

export type Gate = 'onboarding' | 'auth' | 'banned' | 'suspended' | 'app';

/** 학습 화면 경로. 학습 화면을 바꾸면 여기만 바꾼다 */
export const LEARN_PATH = '/session/learn';
export const RETRO_PATH = '/session/retro';

const GATE_HOME: Record<Exclude<Gate, 'app'>, string> = {
  onboarding: '/onboarding',
  auth: '/auth',
  banned: '/banned',
  suspended: '/suspended',
};

const GATE_PATHS = ['/onboarding', '/auth', '/banned', '/suspended'];

/** 지금 상태에서 열 수 있는 화면 묶음 */
export function gateOf(i: RouteInput): Gate {
  if (!i.authed) return i.onboarded ? 'auth' : 'onboarding';
  if (i.profile?.banned) return 'banned';
  if (i.profile?.suspendedUntil != null && i.profile.suspendedUntil > i.now) return 'suspended';
  return 'app';
}

const isLegal = (path: string) => path.startsWith('/settings/legal/');

/** 앱 안 경로만 next로 받는다 (//host 같은 외부 주소 막기) */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

/** 활성 목표가 있어야 열리는 화면 */
const NEEDS_GOAL = ['/coupon', '/settings/goal', '/settings/giveup', '/session/done'];

function appRedirect(path: string, i: RouteInput): string | null {
  if (path === '/goal/new') return i.hasActiveGoal ? '/' : null;
  if (path === '/session/reason') {
    if (!i.hasActiveGoal || i.giveupPending || i.today === 'closed') return '/';
    return i.today === 'progress' ? LEARN_PATH : null;
  }
  if (path === LEARN_PATH) return i.hasActiveGoal && i.today === 'progress' ? null : '/';
  // 회고 화면은 완료 직후에도 잠깐 남아 있다가 완료 화면으로 간다
  if (path === RETRO_PATH) return i.hasActiveGoal && i.today !== 'none' ? null : '/';
  if (NEEDS_GOAL.includes(path)) return i.hasActiveGoal ? null : '/';
  return null;
}

/**
 * 지금 경로가 맞지 않으면 갈 경로, 맞으면 null.
 * next는 /auth?next=... 로 받은 원래 경로다. 로그인이 끝나면 그리로 돌아간다.
 */
export function redirectFor(path: string, i: RouteInput, next?: string | null): string | null {
  const gate = gateOf(i);
  if (gate !== 'app') {
    const home = GATE_HOME[gate];
    if (path === home || isLegal(path)) return null;
    if (gate === 'auth') {
      if (path === '/onboarding') return null;
      const back = path !== '/' && !GATE_PATHS.includes(path) ? path : null;
      return back ? `/auth?next=${encodeURIComponent(back)}` : '/auth';
    }
    return home;
  }

  if (GATE_PATHS.includes(path)) {
    const target = safeNext(next);
    if (target && !GATE_PATHS.includes(target.split('?')[0]) && appRedirect(target.split('?')[0], i) === null) return target;
    return '/';
  }
  return appRedirect(path, i);
}
