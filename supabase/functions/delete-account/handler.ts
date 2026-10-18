// POST {} → {ok: true} (명세 4절 delete-account, MP 3절 계정 삭제)
// 이용 정지, 영구 정지 중에도 삭제할 수 있다(정지 검사를 하지 않는다).
// 순서: public.delete_user_data(deleted_accounts에 해시, 포기 횟수, 정지 종료일을 남기고 개인 데이터 삭제) → auth 사용자 삭제.
import type { Ctx } from '../_shared/server.ts';

export async function handle(ctx: Ctx, _body: Record<string, unknown>): Promise<{ ok: true }> {
  await ctx.repo.deleteUserData(ctx.userId);
  await ctx.repo.deleteAuthUser(ctx.userId);
  return { ok: true };
}
