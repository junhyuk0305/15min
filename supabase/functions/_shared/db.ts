// 운영 DB 접근: service role 클라이언트로 Repo를 구현한다. index.ts(prod.ts)에서만 불러온다.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './errors.ts';
import type { MessageQuery, Repo } from './repo.ts';
import type {
  DayRow,
  EpisodeRow,
  GoalRow,
  ItemEventRow,
  ItemRow,
  MessageRow,
  Profile,
  ReflectionRow,
  UsageRow,
} from './types.ts';

function serviceKey(): string {
  // 새 키(SUPABASE_SECRET_KEYS, JSON 사전)를 먼저 보고, 없으면 옛 service_role 키를 쓴다.
  // https://supabase.com/docs/guides/functions/secrets
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new HttpError('server', 'service key missing');
  return legacy;
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new HttpError('server', 'SUPABASE_URL missing');
  return createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

type Result<T> = { data: T | null; error: { message: string } | null; count?: number | null };

function must<T>(r: Result<T>, what: string): T {
  if (r.error) {
    console.error('db', what, r.error.message);
    throw new HttpError('server', what);
  }
  return r.data as T;
}

export class SupabaseRepo implements Repo {
  constructor(private db: SupabaseClient = adminClient()) {}

  async userIdFromToken(token: string) {
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  }

  async getProfile(userId: string) {
    return must<Profile | null>(await this.db.from('profiles').select('*').eq('user_id', userId).maybeSingle(), 'profile');
  }

  async getGoal(goalId: string) {
    return must<GoalRow | null>(await this.db.from('goals').select('*').eq('id', goalId).maybeSingle(), 'goal');
  }

  async lastGoalCreatedAt(userId: string) {
    const rows = must<{ created_at: string }[]>(
      await this.db.from('goals').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
      'last goal',
    );
    return rows[0]?.created_at ?? null;
  }

  async getDay(goalId: string, day: string) {
    return must<DayRow | null>(await this.db.from('days').select('*').eq('goal_id', goalId).eq('day', day).maybeSingle(), 'day');
  }

  async listDays(goalId: string) {
    return must<DayRow[]>(await this.db.from('days').select('*').eq('goal_id', goalId).order('day'), 'days');
  }

  async getMessages(ids: string[]) {
    if (ids.length === 0) return [];
    return must<MessageRow[]>(await this.db.from('messages').select('*').in('id', ids), 'messages by id');
  }

  async listMessages(q: MessageQuery) {
    let query = this.db.from('messages').select('*').eq('user_id', q.userId).eq('goal_id', q.goalId).in('phase', q.phases);
    if (q.day) query = query.eq('day', q.day);
    if (q.beforeDay) query = query.lt('day', q.beforeDay);
    const desc = q.limit !== undefined;
    query = query.order('created_at', { ascending: !desc }).order('id', { ascending: !desc });
    if (q.limit !== undefined) query = query.limit(q.limit);
    const rows = must<MessageRow[]>(await query, 'messages');
    return desc ? rows.reverse() : rows;
  }

  async insertMessages(rows: MessageRow[]) {
    if (rows.length === 0) return;
    must(await this.db.from('messages').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }), 'insert messages');
  }

  async getOpenEpisode(goalId: string) {
    const rows = must<EpisodeRow[]>(
      await this.db.from('episodes').select('*').eq('goal_id', goalId).is('finished_at', null).order('index', { ascending: false }).limit(1),
      'open episode',
    );
    return rows[0] ?? null;
  }

  async listEpisodes(goalId: string) {
    return must<EpisodeRow[]>(await this.db.from('episodes').select('*').eq('goal_id', goalId).order('index'), 'episodes');
  }

  async insertEpisode(row: EpisodeRow) {
    must(await this.db.from('episodes').upsert(row, { onConflict: 'goal_id,index', ignoreDuplicates: true }), 'insert episode');
  }

  async updateEpisode(goalId: string, index: number, patch: Partial<EpisodeRow>) {
    must(await this.db.from('episodes').update(patch).eq('goal_id', goalId).eq('index', index), 'update episode');
  }

  async listItems(goalId: string) {
    return must<ItemRow[]>(await this.db.from('items').select('*').eq('goal_id', goalId).order('created_at'), 'items');
  }

  async insertItems(rows: ItemRow[]) {
    if (rows.length === 0) return;
    must(await this.db.from('items').upsert(rows, { onConflict: 'goal_id,kind,base', ignoreDuplicates: true }), 'insert items');
  }

  async updateItem(id: string, patch: Partial<ItemRow>) {
    must(await this.db.from('items').update(patch).eq('id', id), 'update item');
  }

  async insertItemEvents(rows: ItemEventRow[]) {
    if (rows.length === 0) return;
    must(await this.db.from('item_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }), 'insert item events');
  }

  async countUsage(q: { userId: string; day?: string; fn?: string; since?: string | null }) {
    let query = this.db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', q.userId);
    if (q.day) query = query.eq('day', q.day);
    if (q.fn) query = query.eq('fn', q.fn);
    if (q.since) query = query.gt('created_at', q.since);
    const r = await query;
    must(r, 'count usage');
    return r.count ?? 0;
  }

  async insertUsage(row: UsageRow) {
    must(await this.db.from('ai_usage').insert(row), 'insert usage');
  }

  async listReflections(userId: string, day: string) {
    return must<ReflectionRow[]>(
      await this.db.from('reflections').select('*').eq('user_id', userId).eq('day', day).order('created_at').order('id'),
      'reflections',
    );
  }

  async insertReflections(rows: ReflectionRow[]) {
    if (rows.length === 0) return;
    must(await this.db.from('reflections').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }), 'insert reflections');
  }

  async deleteUserData(userId: string) {
    // app_private는 API에 노출되지 않는다. service_role만 실행할 수 있는 공개 래퍼를 부른다(마이그레이션 rpc.sql).
    must(await this.db.rpc('delete_user_data', { p_user_id: userId }), 'delete user data');
  }

  async deleteAuthUser(userId: string) {
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) {
      console.error('db', 'delete auth user', error.message);
      throw new HttpError('server', 'delete auth user');
    }
  }
}
