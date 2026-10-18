// 글자 단위 표시의 순수 계산(메가프롬프트 3절 "글자 단위 표시", 갭분석 C2).
// 서버가 준 완성 문장을 어절 단위로 나눠 차례로 보인다. React Native를 import하지 않는다(Node 테스트용).
// 시간 값은 motion.ts의 REVEAL을 넘겨받는다.

export type RevealConfig = { msPerWord: number; maxMs: number };

/** 어절 나누기. 공백은 앞 어절에 붙여 그대로 둔다. 이어 붙이면 원래 문장이다 */
export function splitWords(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

/** 어절당 간격(ms). 어절 수 × 간격이 maxMs를 넘지 않게 줄인다 */
export function wordInterval(words: number, cfg: RevealConfig): number {
  return words > 0 ? Math.min(cfg.msPerWord, cfg.maxMs / words) : 0;
}

/** 다 보이기까지 걸리는 시간(ms). maxMs 이하 */
export function revealDuration(text: string, cfg: RevealConfig): number {
  const n = splitWords(text).length;
  return n * wordInterval(n, cfg);
}

/** 표시를 시작하고 elapsedMs가 지났을 때 보일 글자 수. 첫 어절은 바로 보인다 */
export function visibleChars(text: string, elapsedMs: number, cfg: RevealConfig): number {
  const words = splitWords(text);
  if (words.length === 0) return text.length;
  const k = Math.min(words.length, Math.floor(Math.max(0, elapsedMs) / wordInterval(words.length, cfg)) + 1);
  return k === words.length ? text.length : words.slice(0, k).reduce((sum, w) => sum + w.length, 0);
}
