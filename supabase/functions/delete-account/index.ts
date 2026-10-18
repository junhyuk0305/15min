// delete-account: 앱 안 계정 삭제. 로직은 handler.ts.
import { productionDeps } from '../_shared/prod.ts';
import { makeHandler } from '../_shared/server.ts';
import { handle } from './handler.ts';

Deno.serve(makeHandler(handle, productionDeps));
