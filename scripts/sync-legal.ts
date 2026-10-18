/// <reference types="node" />
// docs/legal/*.md 원문을 src/lib/copy.ts의 copy.legal(terms, privacy)에 그대로 넣는다. `npm run sync:legal`.
// 한국어 문자열은 copy.ts에만 둔다는 규칙(check:static) 때문에 md를 따로 번들하지 않는다.
// src/lib/__tests__/cache.test.ts가 두 곳이 같은지, legal-sync.test.ts가 줄바꿈과 상관없이 도는지 검사한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
export const COPY = join(ROOT, 'src', 'lib', 'copy.ts');
export const DOCS = { terms: join(ROOT, 'docs', 'legal', '이용약관.md'), privacy: join(ROOT, 'docs', 'legal', '개인정보처리방침.md') };
// 작업 사본이 CRLF여도(Windows, core.autocrlf) 표시 줄을 찾는다. 새로 쓰는 줄은 그 파일의 줄바꿈을 따른다
const START = /^ {4}\/\/ legal:start(\r?\n)/m;
const END = /^ {4}\/\/ legal:end\r?\n/m;

/** md 줄바꿈을 \n으로 맞춘 원문 */
export const readDoc = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

export function render(copySrc: string, docs = { terms: readDoc(DOCS.terms), privacy: readDoc(DOCS.privacy) }): string {
  const a = START.exec(copySrc);
  const b = END.exec(copySrc);
  if (!a || !b || b.index < a.index) throw new Error('copy.ts에 legal:start, legal:end 표시가 없습니다');
  const eol = a[1];
  const body = `    terms: ${JSON.stringify(docs.terms)},${eol}    privacy: ${JSON.stringify(docs.privacy)},${eol}`;
  return copySrc.slice(0, a.index + a[0].length) + body + copySrc.slice(b.index);
}

if (require.main === module) {
  writeFileSync(COPY, render(readFileSync(COPY, 'utf8')));
  process.stdout.write('sync:legal src/lib/copy.ts\n');
}
