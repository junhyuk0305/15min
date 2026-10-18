/// <reference types="node" />
// docs/legal/*.md 원문을 src/lib/copy.ts의 copy.legal(terms, privacy)에 그대로 넣는다. `npm run sync:legal`.
// 한국어 문자열은 copy.ts에만 둔다는 규칙(check:static) 때문에 md를 따로 번들하지 않는다.
// src/lib/__tests__/legal-sync.test.ts가 두 곳이 같은지 검사한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
export const COPY = join(ROOT, 'src', 'lib', 'copy.ts');
export const DOCS = { terms: join(ROOT, 'docs', 'legal', '이용약관.md'), privacy: join(ROOT, 'docs', 'legal', '개인정보처리방침.md') };
const START = '    // legal:start\n';
const END = '    // legal:end\n';

/** md 줄바꿈을 \n으로 맞춘 원문 */
export const readDoc = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

export function render(copySrc: string): string {
  const a = copySrc.indexOf(START);
  const b = copySrc.indexOf(END);
  if (a < 0 || b < a) throw new Error('copy.ts에 legal:start, legal:end 표시가 없습니다');
  const body = `    terms: ${JSON.stringify(readDoc(DOCS.terms))},\n    privacy: ${JSON.stringify(readDoc(DOCS.privacy))},\n`;
  return copySrc.slice(0, a + START.length) + body + copySrc.slice(b);
}

if (require.main === module) {
  writeFileSync(COPY, render(readFileSync(COPY, 'utf8')));
  process.stdout.write('sync:legal src/lib/copy.ts\n');
}
