// DB 접근 인터페이스. 함수 코드는 이것만 본다. 운영은 db.ts의 SupabaseRepo(service role),
// 테스트와 평가는 memory.ts의 MemoryRepo. 이 파일은 npm 의존이 없어 테스트가 DB 패키지 없이 돈다.
import type {
  DayRow,
  EpisodeRow,
  GoalRow,
  ItemEventRow,
  ItemRow,
  MessageRow,
  Phase,
  Profile,
  ReflectionRow,
  UsageRow,
} from './types.ts';

export type MessageQuery = {
  userId: string;
  goalId: string;
  phases: Phase[];
  day?: string;
  /** 이 날짜보다 앞선 날만 (B 이어가기 되짚기용) */
  beforeDay?: string;
  /** 최신 N개. 결과는 항상 오래된 것부터. */
  limit?: number;
};

export type UsageReservation = {
  userId: string;
  /** 사용자 시간대 기준 하루 키 */
  day: string;
  fn: string;
  prompt_version: string;
  model: string;
  limits: { daily: number; goalSetup: number; global: number };
};

export type ReserveResult = { ok: true; id: number } | { ok: false; limit: 'daily' | 'goal-setup' | 'global' };

export interface Repo {
  userIdFromToken(token: string): Promise<string | null>;
  getProfile(userId: string): Promise<Profile | null>;
  getGoal(goalId: string): Promise<GoalRow | null>;
  getDay(goalId: string, day: string): Promise<DayRow | null>;
  listDays(goalId: string): Promise<DayRow[]>;

  getMessages(ids: string[]): Promise<MessageRow[]>;
  listMessages(q: MessageQuery): Promise<MessageRow[]>;
  /** 같은 id가 이미 있으면 건너뛴다(멱등). */
  insertMessages(rows: MessageRow[]): Promise<void>;

  getOpenEpisode(goalId: string): Promise<EpisodeRow | null>;
  listEpisodes(goalId: string): Promise<EpisodeRow[]>;
  insertEpisode(row: EpisodeRow): Promise<void>;
  updateEpisode(goalId: string, index: number, patch: Partial<EpisodeRow>): Promise<void>;

  listItems(goalId: string): Promise<ItemRow[]>;
  /** (goal_id, kind, base)가 이미 있으면 건너뛴다. */
  insertItems(rows: ItemRow[]): Promise<void>;
  updateItem(id: string, patch: Partial<ItemRow>): Promise<void>;
  /** 같은 id가 이미 있으면 건너뛴다. */
  insertItemEvents(rows: ItemEventRow[]): Promise<void>;

  /** 상한(하루, 마지막 목표 생성 이후 목표 설정, 전체 하루)을 원자적으로 세고 ai_usage 한 줄(ok=false)을 잡는다. */
  reserveUsage(q: UsageReservation): Promise<ReserveResult>;
  finishUsage(id: number, patch: Pick<UsageRow, 'input_tokens' | 'output_tokens' | 'latency_ms' | 'ok'>): Promise<void>;

  listReflections(userId: string, day: string): Promise<ReflectionRow[]>;
  insertReflections(rows: ReflectionRow[]): Promise<void>;

  deleteUserData(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
}
