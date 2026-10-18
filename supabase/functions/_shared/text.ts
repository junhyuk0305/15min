// 코드로 잴 수 있는 글 규칙. 서버 검증과 평가(evals)가 같은 함수를 쓴다.

const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;

export function hasHangul(s: string): boolean {
  return HANGUL_RE.test(s);
}

/** 영어 토큰. 소문자, 곧은 따옴표, 문장부호 제거. 빈칸 표시(…)는 버린다. */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\.\.\.|…/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== "'");
}

/** 단어 회상 비교용. 앞의 관사와 끝 문장부호는 무시한다. */
export function normalizeAnswer(s: string): string {
  return tokens(s)
    .filter((t, i) => !(i === 0 && (t === 'a' || t === 'an' || t === 'the')))
    .join(' ');
}

/** items.base 규칙: 단어는 소문자 기본형, 표현은 빈칸을 '…'로 쓴 패턴. */
export function normalizeBase(kind: 'word' | 'expression', en: string): string {
  const s = en.trim().replace(/\.\.\./g, '…').replace(/\s+/g, ' ');
  return kind === 'word' ? s.toLowerCase().replace(/[.!?,]+$/, '') : s;
}

function wordForms(base: string): string[] {
  const b = base.toLowerCase();
  const forms = new Set([b, `${b}s`, `${b}es`, `${b}ed`, `${b}d`, `${b}ing`]);
  if (b.endsWith('e')) forms.add(`${b.slice(0, -1)}ing`);
  // 자음 겹침: prefer → preferred, stop → stopping
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(b)) {
    forms.add(`${b}${b.at(-1)}ed`);
    forms.add(`${b}${b.at(-1)}ing`);
  }
  if (b.endsWith('y')) {
    forms.add(`${b.slice(0, -1)}ies`);
    forms.add(`${b.slice(0, -1)}ied`);
  }
  return [...forms];
}

function containsSeq(hay: string[], needle: string[], from = 0): number {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i + needle.length;
  }
  return -1;
}

/** 항목이 글에 들어갔는지. 단어는 간단한 활용형까지, 표현은 빈칸 밖 고정 부분이 순서대로 다 있어야 한다. */
export function itemAppearsIn(kind: 'word' | 'expression', base: string, text: string): boolean {
  const t = tokens(text);
  if (kind === 'word') {
    const forms = wordForms(base);
    const parts = tokens(base);
    if (parts.length > 1) return containsSeq(t, parts) >= 0;
    return t.some((x) => forms.includes(x));
  }
  const parts = base
    .replace(/\.\.\./g, '…')
    .split('…')
    .map((p) => tokens(p))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  let at = 0;
  for (const p of parts) {
    at = containsSeq(t, p, at);
    if (at < 0) return false;
  }
  return true;
}

/**
 * 완성 답안 노출. 모델이 따로 낸 교정 문장(hidden_correction)이 화면에 보이는 글에 들어갔는지 본다.
 * 그대로 들어갔거나, 4단어 이상 문장의 단어 85% 이상이 한 칸에 모여 있으면 노출로 본다.
 */
export function leaksFullAnswer(shown: string[], hiddenCorrection: string | null): boolean {
  if (!hiddenCorrection) return false;
  const h = tokens(hiddenCorrection);
  if (h.length === 0) return false;
  for (const s of shown) {
    const t = tokens(s);
    if (containsSeq(t, h) >= 0) return true;
    if (h.length >= 4) {
      const pool = [...t];
      let hit = 0;
      for (const w of h) {
        const k = pool.indexOf(w);
        if (k >= 0) {
          hit++;
          pool.splice(k, 1);
        }
      }
      if (hit / h.length >= 0.85) return true;
    }
  }
  return false;
}

/** 같은 질문 반복. 낱말 겹침(Jaccard) 0.7 이상이면 같은 질문으로 본다. */
export function sameQuestion(a: string, b: string): boolean {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (x.size === 0 || y.size === 0) return false;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter) >= 0.7;
}

/** 합니다체 위반. '당신', 해요체 끝맺음(-요, -죠). */
export function toneProblems(s: string): string[] {
  const out: string[] = [];
  if (s.includes('당신')) out.push("'당신' 사용");
  // 따옴표 안(사용자 글 인용)은 사용자가 쓴 말이라 말투 검사에서 뺀다.
  const own = s.replace(/'[^']*'|"[^"]*"|‘[^’]*’|“[^”]*”/g, '');
  if (/[요죠](?=\s*[.?!~…)\]]|\s*$|\s+[^\s])/u.test(own.replace(/필요|중요|요청|요일|요소|요약|요금|요리|요구|요가/g, ''))) {
    out.push('해요체 끝맺음');
  }
  return out;
}

/** 기획서 9.1 금지: 성격이나 의지를 단정하는 말. 코드로 잡히는 표현만. 나머지는 평가의 판정 모델이 본다. */
export const FORBIDDEN_JUDGMENT: RegExp[] = [
  /의지\s*(가|는|도|력이?)?\s*(약|없|부족|박약)/,
  /의지박약/,
  /끈기\s*(가|는|도)?\s*(없|부족)/,
  /성격/,
  /(게으른|나약한|한심한|무책임한|못난|형편없는)\s*(분|사람|편)/,
  /원래\s*(그런|그러한)\s*(분|사람)/,
];

export function forbiddenJudgment(s: string): string[] {
  return FORBIDDEN_JUDGMENT.filter((re) => re.test(s)).map((re) => re.source);
}

/** 프롬프트에 넣는 사용자 글. 태그를 닫아 지시문 영역으로 빠져나가지 못하게 꺾쇠를 바꾼다. */
export function asData(s: string, max = 2000): string {
  return s.slice(0, max).replace(/</g, '‹').replace(/>/g, '›');
}

export function charCount(s: string): number {
  return [...s.trim()].length;
}
