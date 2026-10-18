// review-quiz: A, C단계 복습 문항과 채점. 로직은 handler.ts.
import { productionDeps } from '../_shared/prod.ts';
import { makeHandler } from '../_shared/server.ts';
import { handle } from './handler.ts';

Deno.serve(makeHandler(handle, productionDeps));
