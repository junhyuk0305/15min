import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GENERATED_HEADER } from '../../../scripts/sync-rules';

const ROOT = join(__dirname, '..', '..', '..');

test('supabase/functions/_shared/rules.ts는 src/lib/rules.ts의 사본이다', () => {
  const src = readFileSync(join(ROOT, 'src', 'lib', 'rules.ts'), 'utf8');
  const copy = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'rules.ts'), 'utf8');
  assert.ok(copy.startsWith(GENERATED_HEADER), '사본 맨 위에 생성 표시가 없습니다. npm run sync:rules');
  assert.equal(copy.slice(GENERATED_HEADER.length), src, '사본이 원본과 다릅니다. npm run sync:rules');
});
