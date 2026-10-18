// 오류 코드와 HTTP 상태 (명세 4절). 응답 본문은 항상 {error: code}.
import { corsHeaders } from './cors.ts';

export const ERROR_STATUS = {
  auth: 401,
  limit: 429,
  suspended: 403,
  banned: 403,
  closed: 403,
  invalid: 400,
  not_found: 404,
  ai_failed: 502,
  timeout: 504,
  server: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class HttpError extends Error {
  constructor(public code: ErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json(ERROR_STATUS[e.code], { error: e.code });
  // 알 수 없는 오류는 server. 메시지에 비밀값이 섞이지 않도록 이름과 메시지만 남긴다.
  console.error('unhandled', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  return json(500, { error: 'server' });
}
