// DB 행 모양 (명세 3절). service role로 읽고 쓰는 열만 적는다.

export type Profile = {
  user_id: string;
  suspended_until: string | null;
  suspended_goal_id: string | null;
  /** 포기 확정 때 그 목표의 시작 시각과 학습 분을 복사해 둔다. 재가입으로 이어 붙은 정지에도 있다. */
  suspended_start_minutes: number | null;
  suspended_target_minutes: number | null;
  banned: boolean;
  giveup_confirmed_count: number;
};

export type Situation = { place: string; my_role: string; partner: string; task: string };

export type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  reason: string;
  period_days: number;
  weekdays: number[];
  start_minutes: number;
  target_minutes: number;
  situation: Situation | null;
  subsituations: string[] | null;
  first_day: string;
  status: 'active' | 'achieved' | 'given_up';
  created_at: string;
};

export type DayStatus = 'progress' | 'done' | 'coupon' | 'failed' | 'rest' | 'giveup_wait';

export type DayRow = {
  goal_id: string;
  day: string;
  user_id: string;
  status: DayStatus;
  today_reason: string | null;
  phase: 'A' | 'B' | 'C' | 'retro' | null;
  target_minutes: number;
  session_started_at: string | null;
  active_seconds: number;
  retro_started_at: string | null;
  retro_seconds: number;
  completed_at: string | null;
};

export type Phase = 'setup' | 'reason' | 'A' | 'B' | 'C' | 'retro';
export type Role = 'user' | 'partner' | 'coach' | 'system';

export type MessageRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  day: string | null;
  phase: Phase;
  role: Role;
  text: string;
  meta: Record<string, unknown>;
  created_at: string;
};

/** 앱에 돌려주는 메시지 모양 (명세 4절 Message). */
export type Message = Omit<MessageRow, 'user_id'>;

export type EpisodeRow = {
  goal_id: string;
  index: number;
  user_id: string;
  subsituations: string[];
  cursor: number;
  finished_at: string | null;
};

export type ItemKind = 'word' | 'expression';
export type ItemState = 'seen' | 'taught' | 'used' | 'recalled';

export type ItemRow = {
  id: string;
  user_id: string;
  goal_id: string;
  kind: ItemKind;
  base: string;
  ko: string | null;
  note: string | null;
  state: ItemState;
  srs_step: number;
  next_due_day: string | null;
  unaided_streak: number;
  first_day: string | null;
  created_at: string;
};

export type ItemEventRow = {
  id: string;
  user_id: string;
  item_id: string;
  day: string;
  phase: string;
  kind: 'seen' | 'taught' | 'used' | 'quiz';
  aided: boolean;
  correct: boolean | null;
  question_type: string | null;
};

export type ReflectionRow = {
  id: string;
  user_id: string;
  day: string;
  role: 'user' | 'coach';
  text: string;
  created_at: string;
};

export type UsageRow = {
  id?: number;
  user_id: string;
  day: string;
  fn: string;
  prompt_version: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  ok: boolean;
  created_at?: string;
};

export function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    goal_id: r.goal_id,
    day: r.day,
    phase: r.phase,
    role: r.role,
    text: r.text,
    meta: r.meta ?? {},
    created_at: r.created_at,
  };
}
