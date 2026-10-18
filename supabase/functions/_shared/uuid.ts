// uuid v5 (RFC 4122 4.3). 서버가 만드는 응답 id를 `${userMsgId}:${slot}`에서 결정적으로 만든다.
// 같은 사용자 메시지로 다시 요청하면 같은 id가 나와서 중복 저장과 모델 재호출을 막는다.

/** 그래고 고정 네임스페이스. 바꾸면 기존 응답 id와 이어지지 않는다. */
export const GRAEGO_NAMESPACE = '6f1c2a7e-3b8d-4e5f-9a10-7c2d4b6e8f01';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

function parse(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function uuidv5(name: string, namespace = GRAEGO_NAMESPACE): Promise<string> {
  const ns = parse(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(ns.length + nameBytes.length);
  buf.set(ns);
  buf.set(nameBytes, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', buf)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 사용자 메시지 id와 칸 이름으로 응답 id를 만든다. */
export function replyId(userMsgId: string, slot: string): Promise<string> {
  return uuidv5(`${userMsgId}:${slot}`);
}
