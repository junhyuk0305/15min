// Authorization: Bearer <JWT> → 사용자 id. 없거나 무효면 401 auth.
// https://supabase.com/docs/guides/functions/auth-legacy-jwt (auth.getUser(token))
import type { Repo } from './repo.ts';
import { HttpError } from './errors.ts';
import type { Profile } from './types.ts';

export async function requireUser(req: Request, repo: Repo): Promise<string> {
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) throw new HttpError('auth', 'no bearer');
  const userId = await repo.userIdFromToken(m[1]);
  if (!userId) throw new HttpError('auth', 'invalid token');
  return userId;
}

export function isSuspended(p: Profile, now: number): boolean {
  return !!p.suspended_until && Date.parse(p.suspended_until) > now;
}

/** 학습과 목표 설정은 정지, 영구 정지면 막는다. */
export function assertActiveAccount(p: Profile, now: number): void {
  if (p.banned) throw new HttpError('banned');
  if (isSuspended(p, now)) throw new HttpError('suspended');
}
