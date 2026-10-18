// Gemini 호출. Interactions API(REST)에 구조화 출력(JSON 스키마)을 요청하고, 서버에서 다시 검증한다.
// 문서(2026-10-18 확인):
//   https://ai.google.dev/gemini-api/docs  (Interactions API가 기본, generateContent는 legacy)
//   https://ai.google.dev/api/interactions  (요청: model, input, system_instruction, response_format,
//     generation_config.thinking_level, store / 응답: status, steps[].content[].text, usage.total_*_tokens)
//   https://ai.google.dev/gemini-api/docs/structured-output  (response_format: {type:'text', mime_type, schema})
// 흐름: 호출 1회(타임아웃 20초) → 네트워크 오류나 5xx, 429면 1회 재시도 → JSON 파싱과 스키마 검사, 내용 검사
//   → 실패하면 문제를 적어 1회 재요청 → 그래도 실패면 ai_failed. 빈 출력은 성공이 아니다.
import { AI_TIMEOUT_MS, type Config, THINKING, type Tier } from './config.ts';
import { HttpError } from './errors.ts';
import { fakeResponse } from './fake.ts';
import { type JsonSchema, validateSchema } from './validate.ts';

export const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export type TransportRequest = {
  model: string;
  tier: Tier;
  system: string;
  input: string;
  schema: JsonSchema;
  maxOutputTokens: number;
  promptId: string;
  context: unknown;
};

export type TransportResult = { text: string; inputTokens: number; outputTokens: number };

export class TransportError extends Error {
  constructor(public kind: 'timeout' | 'retryable' | 'fatal', detail: string) {
    super(`${kind}: ${detail}`);
  }
}

export type Transport = (r: TransportRequest) => Promise<TransportResult>;

type InteractionResponse = {
  status?: string;
  output_text?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number; total_thought_tokens?: number; total_tokens?: number };
};

/** 응답에서 모델 글을 꺼낸다. model_output 단계의 text 내용들을 잇는다. */
export function extractText(j: InteractionResponse): string {
  const parts: string[] = [];
  for (const step of j.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const c of step.content ?? []) if ((c.type ?? 'text') === 'text' && typeof c.text === 'string') parts.push(c.text);
  }
  if (parts.length > 0) return parts.join('');
  return typeof j.output_text === 'string' ? j.output_text : '';
}

export function geminiTransport(apiKey: string, fetchFn: typeof fetch = fetch, timeoutMs = AI_TIMEOUT_MS): Transport {
  return async (r) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(INTERACTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          model: r.model,
          system_instruction: r.system,
          input: r.input,
          response_format: { type: 'text', mime_type: 'application/json', schema: r.schema },
          generation_config: { thinking_level: THINKING[r.tier], max_output_tokens: r.maxOutputTokens },
          // 학습 대화를 Google 쪽에 저장하지 않는다. 대화 이력은 매번 input에 넣는다(무상태).
          store: false,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        const kind = res.status >= 500 || res.status === 429 ? 'retryable' : 'fatal';
        throw new TransportError(kind, `http ${res.status} ${body}`);
      }
      const j = (await res.json()) as InteractionResponse;
      const u = j.usage ?? {};
      const input = u.total_input_tokens ?? 0;
      // 생각 토큰도 출력 요금이다. total_tokens가 있으면 입력을 뺀 나머지를 출력으로 센다.
      const output = u.total_tokens !== undefined ? Math.max(0, u.total_tokens - input) : (u.total_output_tokens ?? 0) + (u.total_thought_tokens ?? 0);
      const text = j.status && j.status !== 'completed' ? '' : extractText(j);
      return { text, inputTokens: input, outputTokens: output };
    } catch (e) {
      if (e instanceof TransportError) throw e;
      if (ctrl.signal.aborted) throw new TransportError('timeout', `>${timeoutMs}ms`);
      throw new TransportError('retryable', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  };
}

export const fakeTransport: Transport = (r) =>
  Promise.resolve({ text: JSON.stringify(fakeResponse(r.promptId, r.context)), inputTokens: 0, outputTokens: 0 });

export type ModelRequest<T> = {
  /** ai_usage.fn. 함수 이름. */
  fn: string;
  /** 함수 안 프롬프트 종류. 가짜 응답과 평가 기록에 쓴다. */
  promptId: string;
  promptVersion: string;
  tier: Tier;
  system: string;
  input: string;
  schema: JsonSchema;
  /** 프롬프트를 만든 구조 데이터. 가짜 응답이 이것을 보고 답한다. */
  context: unknown;
  /** 스키마 통과 뒤 내용 규칙 검사. 문제 목록을 돌려준다. */
  check?: (value: T) => string[];
  maxOutputTokens?: number;
};

export type AttemptEvent = {
  fn: string;
  promptId: string;
  model: string;
  attempt: number;
  schemaOk: boolean;
  ok: boolean;
  errors: string[];
  latencyMs: number;
  raw: string;
};

export type Ai = {
  generate<T>(req: ModelRequest<T>): Promise<T>;
};

export type UsageMeta = { fn: string; prompt_version: string; model: string };
export type UsageResult = { input_tokens: number; output_tokens: number; latency_ms: number; ok: boolean };

/** 모델 호출 한 번마다(재시도, 재요청 포함) 상한을 확인하고 ai_usage 한 줄을 잡는다. */
export type Meter = {
  /** 호출 직전. 상한을 넘었으면 HttpError('limit')를 던진다. 잡은 줄의 id를 돌려준다. */
  reserve(meta: UsageMeta): Promise<number>;
  /** 잡은 줄에 결과를 적는다. */
  finish(id: number, result: UsageResult): Promise<void>;
};

export type AiDeps = {
  config: Config;
  transport: Transport;
  meter: Meter;
  observe?: (e: AttemptEvent) => void;
  now?: () => number;
};

export function transportFor(config: Config): Transport {
  if (config.fake) return fakeTransport;
  if (!config.apiKey) {
    console.error('config', 'GEMINI_API_KEY missing');
    throw new HttpError('server', 'GEMINI_API_KEY missing');
  }
  return geminiTransport(config.apiKey);
}

export function createAi(d: AiDeps): Ai {
  const now = d.now ?? Date.now;
  const safeFinish = async (id: number, result: UsageResult) => {
    try {
      await d.meter.finish(id, result);
    } catch (e) {
      // 기록 실패로 이미 받은 답을 버리지 않는다. 잡은 줄은 ok=false로 남아 상한에 들어간다. 서버 로그에 남긴다.
      console.error('usage record failed', e instanceof Error ? e.message : String(e));
    }
  };

  async function callOnce(tr: TransportRequest, fn: string, version: string): Promise<{ res: TransportResult; latencyMs: number; usageId: number }> {
    let lastErr: TransportError | null = null;
    for (let i = 0; i < 2; i++) {
      // 상한은 호출마다 원자적으로 센다(동시 요청, 재시도 포함). 넘었으면 여기서 limit.
      const usageId = await d.meter.reserve({ fn, prompt_version: version, model: tr.model });
      const t0 = now();
      try {
        const res = await d.transport(tr);
        return { res, latencyMs: now() - t0, usageId };
      } catch (e) {
        const err = e instanceof TransportError ? e : new TransportError('retryable', String(e));
        console.error('model call failed', fn, err.kind, err.message.slice(0, 200));
        await safeFinish(usageId, { input_tokens: 0, output_tokens: 0, latency_ms: now() - t0, ok: false });
        if (err.kind === 'timeout') throw new HttpError('timeout');
        if (err.kind === 'fatal') throw new HttpError('ai_failed', 'model http error');
        lastErr = err;
      }
    }
    throw new HttpError('ai_failed', lastErr?.message ?? 'transport');
  }

  return {
    async generate<T>(req: ModelRequest<T>): Promise<T> {
      const model = d.config.fake ? 'fake' : d.config.models[req.tier];
      let input = req.input;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const tr: TransportRequest = {
          model,
          tier: req.tier,
          system: req.system,
          input,
          schema: req.schema,
          maxOutputTokens: req.maxOutputTokens ?? 1024,
          promptId: req.promptId,
          context: req.context,
        };
        const { res, latencyMs, usageId } = await callOnce(tr, req.fn, req.promptVersion);
        const errors: string[] = [];
        let value: unknown = undefined;
        let schemaOk = false;
        const text = res.text.trim();
        if (!text) errors.push('빈 응답');
        else {
          try {
            value = JSON.parse(text);
            const se = validateSchema(req.schema, value);
            schemaOk = se.length === 0;
            errors.push(...se);
          } catch {
            errors.push('JSON 파싱 실패');
          }
        }
        if (schemaOk && req.check) errors.push(...req.check(value as T));
        const ok = errors.length === 0;
        await safeFinish(usageId, { input_tokens: res.inputTokens, output_tokens: res.outputTokens, latency_ms: latencyMs, ok });
        d.observe?.({ fn: req.fn, promptId: req.promptId, model, attempt, schemaOk, ok, errors, latencyMs, raw: text });
        if (ok) return value as T;
        console.error('model output rejected', req.fn, req.promptId, attempt, errors.slice(0, 5).join('; '));
        input = `${req.input}\n\n<rejected_previous_output>\n${errors.slice(0, 8).join('\n')}\n</rejected_previous_output>\nThe previous output broke the rules above. Write a new output that follows every rule.`;
      }
      throw new HttpError('ai_failed', `${req.fn} output invalid`);
    },
  };
}
