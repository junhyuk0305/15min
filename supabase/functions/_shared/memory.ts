// 메모리 Repo. 단위 테스트와 평가(evals)에서 DB 없이 함수 흐름을 돌린다. 운영 코드는 쓰지 않는다.
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

export type Tables = {
  tokens: Record<string, string>;
  profiles: Profile[];
  goals: GoalRow[];
  days: DayRow[];
  messages: MessageRow[];
  episodes: EpisodeRow[];
  items: ItemRow[];
  item_events: ItemEventRow[];
  ai_usage: UsageRow[];
  reflections: ReflectionRow[];
  deleted: string[];
};

const byTime = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export class MemoryRepo implements Repo {
  t: Tables;
  constructor(init: Partial<Tables> = {}) {
    this.t = {
      tokens: {},
      profiles: [],
      goals: [],
      days: [],
      messages: [],
      episodes: [],
      items: [],
      item_events: [],
      ai_usage: [],
      reflections: [],
      deleted: [],
      ...structuredClone(init),
    };
  }

  userIdFromToken(token: string) {
    return Promise.resolve(this.t.tokens[token] ?? null);
  }
  getProfile(userId: string) {
    return Promise.resolve(this.t.profiles.find((p) => p.user_id === userId) ?? null);
  }
  getGoal(goalId: string) {
    return Promise.resolve(this.t.goals.find((g) => g.id === goalId) ?? null);
  }
  lastGoalCreatedAt(userId: string) {
    const rows = this.t.goals.filter((g) => g.user_id === userId).map((g) => g.created_at).sort();
    return Promise.resolve(rows.at(-1) ?? null);
  }
  getDay(goalId: string, day: string) {
    return Promise.resolve(this.t.days.find((d) => d.goal_id === goalId && d.day === day) ?? null);
  }
  listDays(goalId: string) {
    return Promise.resolve(this.t.days.filter((d) => d.goal_id === goalId).sort((a, b) => (a.day < b.day ? -1 : 1)));
  }
  getMessages(ids: string[]) {
    return Promise.resolve(this.t.messages.filter((m) => ids.includes(m.id)));
  }
  listMessages(q: MessageQuery) {
    let rows = this.t.messages
      .filter((m) => m.user_id === q.userId && m.goal_id === q.goalId && q.phases.includes(m.phase))
      .filter((m) => (q.day ? m.day === q.day : true))
      .filter((m) => (q.beforeDay ? (m.day ?? '') < q.beforeDay : true))
      .sort(byTime);
    if (q.limit !== undefined) rows = rows.slice(-q.limit);
    return Promise.resolve(rows.map((r) => structuredClone(r)));
  }
  insertMessages(rows: MessageRow[]) {
    for (const r of rows) if (!this.t.messages.some((m) => m.id === r.id)) this.t.messages.push(structuredClone(r));
    return Promise.resolve();
  }
  getOpenEpisode(goalId: string) {
    const open = this.t.episodes.filter((e) => e.goal_id === goalId && !e.finished_at).sort((a, b) => b.index - a.index);
    return Promise.resolve(open[0] ? structuredClone(open[0]) : null);
  }
  listEpisodes(goalId: string) {
    return Promise.resolve(this.t.episodes.filter((e) => e.goal_id === goalId).sort((a, b) => a.index - b.index));
  }
  insertEpisode(row: EpisodeRow) {
    if (!this.t.episodes.some((e) => e.goal_id === row.goal_id && e.index === row.index)) this.t.episodes.push(structuredClone(row));
    return Promise.resolve();
  }
  updateEpisode(goalId: string, index: number, patch: Partial<EpisodeRow>) {
    const e = this.t.episodes.find((x) => x.goal_id === goalId && x.index === index);
    if (e) Object.assign(e, patch);
    return Promise.resolve();
  }
  listItems(goalId: string) {
    return Promise.resolve(this.t.items.filter((i) => i.goal_id === goalId).map((i) => structuredClone(i)));
  }
  insertItems(rows: ItemRow[]) {
    for (const r of rows) {
      const dup = this.t.items.some((i) => i.goal_id === r.goal_id && i.kind === r.kind && i.base === r.base);
      if (!dup) this.t.items.push(structuredClone(r));
    }
    return Promise.resolve();
  }
  updateItem(id: string, patch: Partial<ItemRow>) {
    const i = this.t.items.find((x) => x.id === id);
    if (i) Object.assign(i, patch);
    return Promise.resolve();
  }
  insertItemEvents(rows: ItemEventRow[]) {
    for (const r of rows) if (!this.t.item_events.some((e) => e.id === r.id)) this.t.item_events.push(structuredClone(r));
    return Promise.resolve();
  }
  countUsage(q: { userId: string; day?: string; fn?: string; since?: string | null }) {
    const n = this.t.ai_usage.filter(
      (u) =>
        u.user_id === q.userId &&
        (q.day ? u.day === q.day : true) &&
        (q.fn ? u.fn === q.fn : true) &&
        (q.since ? (u.created_at ?? '') > q.since : true),
    ).length;
    return Promise.resolve(n);
  }
  insertUsage(row: UsageRow) {
    this.t.ai_usage.push({ created_at: new Date().toISOString(), ...row });
    return Promise.resolve();
  }
  listReflections(userId: string, day: string) {
    return Promise.resolve(this.t.reflections.filter((r) => r.user_id === userId && r.day === day).sort(byTime));
  }
  insertReflections(rows: ReflectionRow[]) {
    for (const r of rows) if (!this.t.reflections.some((x) => x.id === r.id)) this.t.reflections.push(structuredClone(r));
    return Promise.resolve();
  }
  deleteUserData(userId: string) {
    this.t.deleted.push(userId);
    this.t.messages = this.t.messages.filter((m) => m.user_id !== userId);
    this.t.items = this.t.items.filter((i) => i.user_id !== userId);
    return Promise.resolve();
  }
  deleteAuthUser(userId: string) {
    for (const [k, v] of Object.entries(this.t.tokens)) if (v === userId) delete this.t.tokens[k];
    this.t.profiles = this.t.profiles.filter((p) => p.user_id !== userId);
    return Promise.resolve();
  }
}
