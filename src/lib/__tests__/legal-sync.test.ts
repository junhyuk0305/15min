import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from '../../../scripts/sync-legal';

const docs = { terms: '# 약관\n본문', privacy: '# 방침\n본문' };
const src = (eol: string) =>
  ['  legal: {', '    // legal:start', "    terms: '옛 약관',", "    privacy: '옛 방침',", '    // legal:end', '  },', ''].join(eol);

test('sync:legal은 LF 파일의 표시 사이를 바꾼다', () => {
  const out = render(src('\n'), docs);
  assert.ok(out.includes(`    terms: ${JSON.stringify(docs.terms)},\n    privacy: ${JSON.stringify(docs.privacy)},\n    // legal:end`));
  assert.ok(!out.includes('옛 약관'));
});

test('sync:legal은 CRLF 작업 사본에서도 표시를 찾고 CRLF를 지킨다', () => {
  const out = render(src('\r\n'), docs);
  assert.ok(!out.includes('옛 약관'));
  assert.ok(out.includes(`    terms: ${JSON.stringify(docs.terms)},\r\n    privacy: ${JSON.stringify(docs.privacy)},\r\n    // legal:end\r\n`));
  assert.ok(!/[^\r]\n/.test(out), 'LF만 있는 줄이 섞였다');
});

test('표시가 없으면 실패한다', () => {
  assert.throws(() => render('  legal: {},\n', docs));
});
