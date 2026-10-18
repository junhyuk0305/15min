import type { Bot } from './bots';
import type { Msg } from './store';

// MVP: 서버(Supabase Edge Function) 연결 전 시험용 응답이다.
// 연결할 때는 이 함수 본문만 서버 호출로 바꾼다. 모델 키는 앱에 두지 않는다.
export const AI_IS_STUB = true;

const FOLLOW_UPS = [
  'Good effort. Now make your second sentence shorter and more direct. Rewrite it.',
  'One phrase sounds unnatural. Replace "very" with a stronger single word and try again.',
  'Clear point. Add one concrete example with a number. Write it now.',
  'Now say the same thing more politely, as if writing to a senior manager.',
  'Nice. Next question: what would you do differently tomorrow? Answer in full sentences.',
];

export async function reply(bot: Bot, history: Msg[]): Promise<string> {
  await new Promise((r) => setTimeout(r, 1200));
  const turns = history.filter((m) => m.role === 'user').length;
  const base = FOLLOW_UPS[(turns - 1 + FOLLOW_UPS.length) % FOLLOW_UPS.length];
  return `[${bot.name}] ${base}`;
}
