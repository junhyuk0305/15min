// reflection: 이용 정지 중 반성문 채팅. 로직은 handler.ts.
import { productionDeps } from '../_shared/prod.ts';
import { makeHandler } from '../_shared/server.ts';
import { handle } from './handler.ts';

Deno.serve(makeHandler(handle, productionDeps));
