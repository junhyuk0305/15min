/// <reference types="node" />
// 정적 검사 (메가프롬프트 7.7-1). 하나라도 걸리면 종료 코드 1.
// 1) src/ 안 copy.ts 밖의 한국어 문자열. 주석과 테스트는 제외.
// 2) 빈 catch 블록, 오류를 버리는 .catch(() => {}).
// 3) 프로덕션 코드의 console.log.
// 4) 용어집(docs/용어집.md)의 "쓰지 않는 말"이 copy.ts 문구에 있음. copy.legal(법무 문서 원문)은 제외.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = join(__dirname, '..');
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const COPY_FILE = join('src', 'lib', 'copy.ts');

// 쓰지 않는 말. 다른 낱말 안에 들어간 경우(오프라인 등)는 정규식으로 피한다.
export const FORBIDDEN: { word: string; re: RegExp }[] = [
  { word: '미션', re: /미션/ },
  { word: '챌린지', re: /챌린지/ },
  { word: '세션', re: /세션/ },
  { word: '수업', re: /수업/ },
  { word: '공부', re: /공부/ },
  { word: '나의 이유', re: /나의 이유/ },
  { word: '목표 이유', re: /목표 이유/ },
  { word: '오늘 이유', re: /오늘 이유/ },
  { word: '시작 이유', re: /시작 이유/ },
  { word: '소감', re: /소감/ },
  { word: '리뷰', re: /리뷰/ },
  { word: '봇', re: /봇/ },
  { word: 'AI', re: /(^|[^A-Za-z])AI([^A-Za-z]|$)/ },
  { word: '선생님', re: /선생님/ },
  { word: '직원', re: /직원/ },
  { word: '캐릭터', re: /캐릭터/ },
  { word: '예외 쿠폰', re: /예외 쿠폰/ },
  { word: '생략권', re: /생략권/ },
  { word: '휴식권', re: /휴식권/ },
  { word: '스트릭', re: /스트릭/ },
  { word: '연속 일수', re: /연속 일수/ },
  { word: '휴일', re: /휴일/ },
  { word: '오프', re: /오프(?!라인)/ },
  { word: '그만두기', re: /그만두기/ },
  { word: '포기 취소', re: /포기 취소/ },
  { word: '차단', re: /차단/ },
  { word: '정지 처분', re: /정지 처분/ },
  { word: '졸업', re: /졸업/ },
];

type Hit = { file: string; line: number; rule: string; text: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  if (ts.isJsxText(node)) return node.text;
  return null;
}

function isEmptyFn(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const b = node.body;
  return ts.isBlock(b) && b.statements.length === 0;
}

/** copy 객체의 legal 속성 안인지 */
function insideLegal(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'legal') return true;
  }
  return false;
}

export function checkSource(file: string, code: string): Hit[] {
  const rel = relative(ROOT, file);
  const isCopy = rel === COPY_FILE;
  const inSrc = rel.startsWith(`src${sep}`);
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: Hit[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (n: ts.Node, rule: string, text: string) => hits.push({ file: rel, line: at(n), rule, text: text.trim().slice(0, 60) });

  const visit = (node: ts.Node) => {
    const text = literalText(node);
    if (text !== null) {
      if (inSrc && !isCopy && HANGUL.test(text)) add(node, '한국어 문자열은 copy.ts에만', text);
      if (isCopy && !insideLegal(node)) {
        for (const f of FORBIDDEN) if (f.re.test(text)) add(node, `쓰지 않는 말 '${f.word}'`, text);
      }
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) add(node, '빈 catch 블록', 'catch {}');
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch' &&
      node.arguments.length > 0 &&
      isEmptyFn(node.arguments[0])
    ) {
      add(node, '오류를 버리는 .catch(() => {})', node.getText(sf));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console' &&
      node.expression.name.text === 'log'
    ) {
      add(node, 'console.log 금지', node.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function main() {
  const dirs = ['src', join('supabase', 'functions')].map((d) => join(ROOT, d)).filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  const hits = dirs.flatMap((d) => walk(d)).flatMap((f) => checkSource(f, readFileSync(f, 'utf8')));
  if (hits.length === 0) {
    process.stdout.write('check:static 통과\n');
    return;
  }
  for (const h of hits) process.stderr.write(`${h.file}:${h.line}  ${h.rule}  ${h.text}\n`);
  process.stderr.write(`check:static 실패 ${hits.length}건\n`);
  process.exit(1);
}

if (require.main === module) main();
