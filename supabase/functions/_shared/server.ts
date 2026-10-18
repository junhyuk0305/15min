// 함수 공통 껍데기: CORS, POST만, 인증, JSON 본문, 오류 → {error: code}.
// 함수 본문(handle)은 Deps를 받아서 테스트에서 DB와 모델을 바꿔 넣을 수 있다.
import { requireUser } from './auth.ts';
import type { Config } from './config.ts';
import type { Repo } from './repo.ts';
import { corsHeaders } from './cors.ts';
import { errorResponse, HttpError, json } from './errors.ts';
import type { AttemptEvent, Transport } from './gemini.ts';

export type Deps = {
  repo: Repo;
  config: Config;
  transport: Transport;
  now: () => number;
  observe?: (e: AttemptEvent) => void;
};

export type Ctx = Deps & { userId: string };

export type Handle = (ctx: Ctx, body: Record<string, unknown>) => Promise<unknown>;

export function makeHandler(handle: Handle, deps: () => Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (req.method !== 'POST') throw new HttpError('invalid', 'method');
      const d = deps();
      const userId = await requireUser(req, d.repo);
      let body: unknown;
      try {
        const text = await req.text();
        body = text.trim() ? JSON.parse(text) : {};
      } catch {
        throw new HttpError('invalid', 'json');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError('invalid', 'body');
      const out = await handle({ ...d, userId }, body as Record<string, unknown>);
      return json(200, out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
