-- 테이블, 제약, 인덱스, RLS
-- 원칙: 클라이언트(authenticated)는 자기 행 SELECT만. 상태 변경은 RPC(security definer)나 service role만.

-- 프로필. 가입 트리거가 만든다.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_hash text,
  timezone text not null default 'Asia/Seoul',
  pending_timezone text,
  pending_timezone_from date,
  giveup_confirmed_count int not null default 0 check (giveup_confirmed_count >= 0),
  suspended_until timestamptz,
  suspended_goal_id uuid,
  banned boolean not null default false,
  age_confirmed_at timestamptz, -- 만 18세 이상 확인 시각
  ai_consent_at timestamptz,    -- AI 처리와 국외 이전 동의 시각
  terms_version text,
  created_at timestamptz not null default now()
);
create index profiles_email_hash_idx on public.profiles (email_hash);

-- 목표. 이름과 처음 이유는 생성 뒤 바꾸는 RPC가 없다.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  reason text not null check (char_length(reason) >= 20),
  period_days int not null check (period_days between 7 and 90),
  weekdays int[] not null check (cardinality(weekdays) >= 5 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  start_minutes int not null check (start_minutes between 0 and 1439),
  target_minutes int not null check (target_minutes between 10 and 30),
  situation jsonb not null check (jsonb_typeof(situation) = 'object'),
  subsituations jsonb not null default '[]' check (jsonb_typeof(subsituations) = 'array'),
  first_day date not null,
  status text not null default 'active' check (status in ('active', 'achieved', 'given_up')),
  coupons int not null default 3 check (coupons >= 0),
  coupon_streak_goal_weeks int not null default 2 check (coupon_streak_goal_weeks >= 1),
  coupon_progress_days int not null default 0 check (coupon_progress_days >= 0),
  settled_day date not null,
  pending_change jsonb,
  giveup_requested_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- 사용자당 활성 목표는 1개
create unique index goals_one_active_idx on public.goals (user_id) where status = 'active';
create index goals_user_idx on public.goals (user_id, created_at desc);
-- cron이 찾는 포기 대기 목표
create index goals_giveup_idx on public.goals (giveup_requested_at) where status = 'active' and giveup_requested_at is not null;

alter table public.profiles
  add constraint profiles_suspended_goal_fk foreign key (suspended_goal_id) references public.goals (id) on delete set null;

-- 하루 기록. day는 하루 키(현지 시각 - 4시간의 날짜)
create table public.days (
  goal_id uuid not null references public.goals (id) on delete cascade,
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('progress', 'done', 'coupon', 'failed', 'rest', 'giveup_wait')),
  today_reason text,
  phase text check (phase in ('A', 'B', 'C', 'retro')),
  target_minutes int not null,
  session_started_at timestamptz,
  active_seconds int not null default 0 check (active_seconds >= 0),
  retro_started_at timestamptz,
  retro_seconds int not null default 0 check (retro_seconds >= 0),
  completed_at timestamptz,
  coupon_earned boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (goal_id, day)
);
create index days_user_idx on public.days (user_id, day desc);

-- 대화 메시지. 목표 설정 대화는 goal_id, day가 없다.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete cascade,
  day date,
  phase text not null check (phase in ('setup', 'reason', 'A', 'B', 'C', 'retro')),
  role text not null check (role in ('user', 'partner', 'coach', 'system')),
  text text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index messages_goal_day_idx on public.messages (goal_id, day, created_at);
create index messages_user_idx on public.messages (user_id, created_at);

-- 배운 항목(단어, 표현)과 복습 상태
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  kind text not null check (kind in ('word', 'expression')),
  base text not null,
  ko text,
  note text,
  state text not null default 'seen' check (state in ('seen', 'taught', 'used', 'recalled')),
  srs_step int not null default 0 check (srs_step >= 0),
  next_due_day date,
  unaided_streak int not null default 0 check (unaided_streak >= 0),
  first_day date,
  created_at timestamptz not null default now(),
  unique (goal_id, kind, base)
);
create index items_due_idx on public.items (goal_id, next_due_day);
create index items_user_idx on public.items (user_id);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  day date not null,
  phase text,
  kind text not null check (kind in ('seen', 'taught', 'used', 'quiz')),
  aided boolean not null default false,
  correct boolean,
  question_type text,
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at);
create index item_events_user_day_idx on public.item_events (user_id, day);

-- 에피소드(하위 상황 묶음)와 진행 위치
create table public.episodes (
  goal_id uuid not null references public.goals (id) on delete cascade,
  index int not null check (index >= 0),
  user_id uuid not null references auth.users (id) on delete cascade,
  subsituations jsonb not null default '[]' check (jsonb_typeof(subsituations) = 'array'),
  cursor int not null default 0 check (cursor >= 0),
  finished_at timestamptz,
  primary key (goal_id, index)
);
create index episodes_user_idx on public.episodes (user_id);

-- 정지 중 반성문 채팅
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  role text not null check (role in ('user', 'coach')),
  text text not null,
  created_at timestamptz not null default now()
);
create index reflections_user_day_idx on public.reflections (user_id, day, created_at);

-- AI 호출 기록. 상한 계산에 쓴다.
create table public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  fn text not null,
  prompt_version text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, day);
create index ai_usage_user_fn_idx on public.ai_usage (user_id, fn, created_at);

-- 탈퇴 계정. 재가입 때 포기 횟수와 정지를 이어 붙인다. 개인 데이터는 없다.
create table public.deleted_accounts (
  email_hash text primary key,
  giveup_confirmed_count int not null default 0,
  suspended_until timestamptz,
  deleted_at timestamptz not null default now()
);

-- AI 생성 내용 신고(Google Play AI 생성 콘텐츠 정책). 메시지나 반성문 한 건에 사용자당 1회.
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  reflection_id uuid references public.reflections (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create unique index message_reports_message_idx on public.message_reports (user_id, message_id) where message_id is not null;
create unique index message_reports_reflection_idx on public.message_reports (user_id, reflection_id) where reflection_id is not null;

-- RLS: 모든 표
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.days enable row level security;
alter table public.messages enable row level security;
alter table public.items enable row level security;
alter table public.item_events enable row level security;
alter table public.episodes enable row level security;
alter table public.reflections enable row level security;
alter table public.ai_usage enable row level security;
alter table public.deleted_accounts enable row level security;
alter table public.message_reports enable row level security;

-- 자기 행만 읽는다. 포기 확정(given_up) 목표와 그 기록은 지우지 않고 숨긴다.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy goals_select_own on public.goals
  for select to authenticated
  using (user_id = (select auth.uid()) and status <> 'given_up');

create policy days_select_own on public.days
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = days.goal_id and g.status <> 'given_up')
  );

create policy messages_select_own on public.messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (
      goal_id is null
      or exists (select 1 from public.goals g where g.id = messages.goal_id and g.status <> 'given_up')
    )
  );

create policy items_select_own on public.items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = items.goal_id and g.status <> 'given_up')
  );

create policy item_events_select_own on public.item_events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.items i
      join public.goals g on g.id = i.goal_id
      where i.id = item_events.item_id and g.status <> 'given_up'
    )
  );

create policy episodes_select_own on public.episodes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = episodes.goal_id and g.status <> 'given_up')
  );

create policy reflections_select_own on public.reflections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy message_reports_select_own on public.message_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

-- deleted_accounts: 정책 없음(클라이언트 접근 불가)

-- 권한: anon은 아무것도, authenticated는 SELECT만. service_role은 기본 권한 유지.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on
  public.profiles,
  public.goals,
  public.days,
  public.messages,
  public.items,
  public.item_events,
  public.episodes,
  public.reflections,
  public.ai_usage,
  public.message_reports
to authenticated;
