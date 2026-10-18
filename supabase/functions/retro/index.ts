// retro: 3분 영어 회고. 로직은 handler.ts.
import { productionDeps } from '../_shared/prod.ts';
import { makeHandler } from '../_shared/server.ts';
import { handle } from './handler.ts';

Deno.serve(makeHandler(handle, productionDeps));
