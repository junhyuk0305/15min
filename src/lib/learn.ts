// 학습 화면(A, B, C, 회고)의 순수 판정. 시계, 단계 전환, 다시 보내기, 대화 표시.
// React Native를 import하지 않는다(Node 테스트용). 정책 숫자는 rules.ts에서 가져온다.
import type { Message } from './model';
import { isIdle, phaseAt, phaseBounds, RETRO_SECONDS, type Phase } from './rules';

/** 진행 저장 간격(초). 나갈 때도 바로 저장한다 */
export const SAVE_EVERY = 5;
/** 단계가 바뀔 때 다음 단계 이름과 남은 시간을 보여 주는 시간 */
export const OVERLAY_MS = 1000;
/** 복습 정답 안내를 보여 주고 다음 문항으로 넘어가기까지 */
export const FEEDBACK_MS = 1200;
/** 연결이 끊겼을 때 다시 확인하는 간격 */
export const PROBE_MS = 4000;

// ---------- 시계 ----------

/** 시간이 줄어드는 조건(기획서 11.2, MP P6). 하나라도 거짓이면 멈춘다 */
export type ClockGates = {
  /** 앱이 앞에 있다 */
  appActive: boolean;
  /** 이 화면이 보이고 있다 */
  focused: boolean;
  /** 응답을 기다리는 중이다 */
  waiting: boolean;
  /** 연결이 끊겼다 */
  offline: boolean;
  /** 응답 실패 안내가 떠 있다 */
  failed: boolean;
  /** 단계 전환 안내가 떠 있다 */
  overlay: boolean;
  /** 한도 초과처럼 학습을 이어 갈 수 없다 */
  blocked: boolean;
};

export function clockRunning(g: ClockGates): boolean {
  return g.appActive && g.focused && !g.waiting && !g.offline && !g.failed && !g.overlay && !g.blocked;
}

/**
 * secs: 센 시간(초). quietMs: 시계가 도는 동안 활동 없이 지난 시간.
 * 딴짓 판정은 시계가 도는 시간만 센다. 응답을 기다리거나 앱 밖에 있던 시간은 딴짓이 아니다.
 */
export type ClockState = { secs: number; quietMs: number; idle: boolean };

export type TickResult = { state: ClockState; becameIdle: boolean; save: boolean };

/** 1초. 딴짓 팝업이 뜨는 순간의 1초는 세지 않는다 */
export function tick(s: ClockState, total: number, running: boolean, stepMs = 1000): TickResult {
  if (s.idle || !running || s.secs >= total) return { state: s, becameIdle: false, save: false };
  const quietMs = s.quietMs + stepMs;
  if (isIdle(0, quietMs)) return { state: { ...s, quietMs, idle: true }, becameIdle: true, save: true };
  const secs = Math.min(total, s.secs + 1);
  return { state: { secs, quietMs, idle: false }, becameIdle: false, save: secs % SAVE_EVERY === 0 || secs === total };
}

/** 타이핑, 선택지 탭, 카드 뒤집기, 모달 열고 닫기(결정안 4). 팝업이 떠 있으면 팝업 버튼으로만 닫는다 */
export function touch(s: ClockState): ClockState {
  return s.idle ? s : { ...s, quietMs: 0 };
}

export function dismissIdle(s: ClockState): ClockState {
  return { ...s, quietMs: 0, idle: false };
}

// ---------- 단계 ----------

/** save_progress에 넣는 단계. 서버는 A, B, C만 받는다 */
export function savePhase(secs: number, targetMinutes: number): 'A' | 'B' | 'C' {
  const p = phaseAt(secs, targetMinutes);
  return p === 'retro' ? 'C' : p;
}

/** 그 단계의 남은 시간(초). 회고는 retroSeconds 기준 */
export function phaseRemaining(phase: Phase, secs: number, targetMinutes: number, retroSeconds = 0): number {
  const b = phaseBounds(targetMinutes);
  if (phase === 'A') return Math.max(0, b.aEnd - secs);
  if (phase === 'B') return Math.max(0, b.bEnd - Math.max(secs, b.aEnd));
  if (phase === 'C') return Math.max(0, b.total - Math.max(secs, b.bEnd));
  return Math.max(0, RETRO_SECONDS - retroSeconds);
}

/** 그 단계가 끝나는 센 시간(초). 시계가 여기서 멈추고 다음 단계 안내가 뜬다 */
export function phaseEnd(phase: Phase, targetMinutes: number): number {
  const b = phaseBounds(targetMinutes);
  return phase === 'A' ? b.aEnd : phase === 'B' ? b.bEnd : b.total;
}

export type Overlay = { phase: Phase; remaining: number };

/**
 * 단계 전환 안내. 화면에 띄운 단계(shown)와 시간으로 정한 단계(next)가 다르면 다음 단계 안내를 낸다.
 * 처음 들어올 때(shown null)도 지금 단계를 한 번 보여 준다.
 */
export function overlayFor(shown: Phase | null, secs: number, targetMinutes: number, retroSeconds = 0): Overlay | null {
  const next = phaseAt(secs, targetMinutes);
  if (shown === next) return null;
  return { phase: next, remaining: phaseRemaining(next, secs, targetMinutes, retroSeconds) };
}

// ---------- 보내기 ----------

/** 실패한 문장을 다시 보낼 때 같은 id를 쓴다(서버가 한 번만 저장). 문장을 고쳤으면 새 id */
export function sendId(pending: { id: string; text: string } | null, text: string, makeId: () => string): string {
  return pending && pending.text === text.trim() ? pending.id : makeId();
}

/** 이 실패는 연결 문제인가. 연결이 돌아오면 저절로 다시 보낸다 */
export const isNetworkKind = (kind: string) => kind === 'network';

// ---------- 대화 표시 ----------

export type Line =
  | { key: string; kind: 'partner' | 'me'; text: string; id: string; pending: boolean; reportable: boolean }
  | { key: string; kind: 'coach'; text: string; id: string; modal: CoachModalView | null; reportable: boolean };

export type ModalEntry = { en: string; ko: string; note: string };
export type CoachModalView = { expression: ModalEntry | null; words: ModalEntry[] };

const entry = (v: unknown): ModalEntry | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o.en === 'string' && o.en.trim() ? { en: o.en, ko: String(o.ko ?? ''), note: String(o.note ?? '') } : null;
};

/** lesson-turn 코치 모달(meta.modal 또는 응답 modal). 표현 1개, 단어 최대 2개만 보인다 */
export function coachModalOf(v: unknown): CoachModalView | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const expression = entry(o.expression);
  const words = (Array.isArray(o.words) ? o.words.map(entry) : []).filter((w): w is ModalEntry => !!w).slice(0, 2);
  return expression || words.length ? { expression, words } : null;
}

/** review-quiz 채점의 항목 설명(결정안 12). 수준 확인 문항은 없다 */
export function quizModalOf(v: unknown): (ModalEntry & { kind: 'word' | 'expression' }) | null {
  const e = entry(v);
  if (!e) return null;
  const kind = (v as Record<string, unknown>).kind === 'word' ? 'word' : 'expression';
  return { ...e, kind };
}

/**
 * 그 단계의 대화 줄. hidden은 코치 모달을 닫기 전까지 숨길 줄(모달 뒤에 올 상대의 새 질문).
 * 같은 id는 store가 서버 행으로 바꿔 둔다(mergeById). 여기서는 순서대로 그리기만 한다.
 */
export function linesOf(messages: readonly Message[], phase: Message['phase'], hidden: ReadonlySet<string> = new Set()): Line[] {
  const out: Line[] = [];
  for (const m of messages) {
    if (m.phase !== phase || hidden.has(m.id)) continue;
    if (m.role === 'user') out.push({ key: m.id, kind: 'me', text: m.text, id: m.id, pending: !!m.pending, reportable: false });
    else if (m.role === 'partner') out.push({ key: m.id, kind: 'partner', text: m.text, id: m.id, pending: false, reportable: true });
    else if (m.role === 'coach') {
      const modal = coachModalOf(m.meta.modal);
      if (!m.text.trim() && !modal) continue;
      out.push({ key: m.id, kind: 'coach', text: m.text, id: m.id, modal, reportable: true });
    }
  }
  return out;
}

/** 이번 응답에서 모달을 닫기 전까지 숨길 줄: 내 문장 뒤에 온 코치와 상대 줄 */
export function hiddenUntilClosed(reply: readonly Message[], mineId: string): string[] {
  return reply.filter((m) => m.id !== mineId && (m.role === 'partner' || m.role === 'coach')).map((m) => m.id);
}
