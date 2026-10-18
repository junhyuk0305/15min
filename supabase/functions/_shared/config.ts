// 서버 환경변수. 비밀값은 Supabase secrets에만 둔다.
import { HttpError } from './errors.ts';

// 기본 모델: 2026-10-18 https://ai.google.dev/gemini-api/docs/models 에서 확인한 최신 안정판.
// preview, experimental은 쓰지 않는다. 바꾸려면 AI_MODEL_MAIN, AI_MODEL_LIGHT 시크릿을 넣는다.
export const DEFAULT_MODEL_MAIN = 'gemini-3.8-flash';
export const DEFAULT_MODEL_LIGHT = 'gemini-3.5-flash-lite';
// thinking_level: 3.8 Flash는 low가 가장 낮고, 3.5 Flash-Lite는 minimal을 받는다.
// https://ai.google.dev/gemini-api/docs/thinking
export const THINKING = { main: 'low', light: 'minimal' } as const;

export const AI_TIMEOUT_MS = 20_000;
export const DEFAULT_DAILY_LIMIT = 150;
export const DEFAULT_GOAL_SETUP_LIMIT = 30;
/** 모든 사용자를 합친 하루 AI 호출 상한. 비용 안전판. */
export const DEFAULT_GLOBAL_DAILY_LIMIT = 20_000;

export type Tier = 'main' | 'light';

export type Config = {
  fake: boolean;
  apiKey: string | null;
  models: Record<Tier, string>;
  dailyLimit: number;
  goalSetupLimit: number;
  globalDailyLimit: number;
};

type Env = { get(name: string): string | undefined };

function int(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : d;
}

/** 로컬 Supabase(CLI)에서 도는지. AI_FAKE는 여기서만 허용한다. URL이 없으면 로컬로 보지 않는다. */
function isLocal(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost|kong|host\.docker\.internal)(:\d+)?(\/|$)/.test(url);
}

export function loadConfig(env: Env = Deno.env): Config {
  const fake = env.get('AI_FAKE') === '1';
  if (fake && !isLocal(env.get('SUPABASE_URL'))) {
    // 프로덕션 시크릿에 AI_FAKE가 들어가면 가짜 수업을 내보내지 않고 멈춘다.
    console.error('config', 'AI_FAKE=1 is only allowed on local Supabase');
    throw new HttpError('server', 'AI_FAKE on remote');
  }
  return {
    fake,
    apiKey: env.get('GEMINI_API_KEY') || null,
    models: {
      main: env.get('AI_MODEL_MAIN') || DEFAULT_MODEL_MAIN,
      light: env.get('AI_MODEL_LIGHT') || DEFAULT_MODEL_LIGHT,
    },
    dailyLimit: int(env.get('AI_DAILY_LIMIT'), DEFAULT_DAILY_LIMIT),
    goalSetupLimit: int(env.get('AI_GOAL_SETUP_LIMIT'), DEFAULT_GOAL_SETUP_LIMIT),
    globalDailyLimit: int(env.get('AI_GLOBAL_DAILY_LIMIT'), DEFAULT_GLOBAL_DAILY_LIMIT),
  };
}
