// goal-setup: 목표 설정 대화. 로직은 handler.ts.
import { productionDeps } from '../_shared/prod.ts';
import { makeHandler } from '../_shared/server.ts';
import { handle } from './handler.ts';

Deno.serve(makeHandler(handle, productionDeps));
