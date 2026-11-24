import type { ErrorCode, Problem } from '@shifo/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly errors?: Problem['errors'],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const TITLES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'Validation failed',
  NOT_FOUND: 'Not found',
  INTERNAL_ERROR: 'Internal server error',
};

function toProblem(err: unknown, requestId: string): Problem {
  if (err instanceof AppError) {
    return {
      type: 'about:blank',
      title: TITLES[err.code] ?? err.message,
      status: err.status,
      code: err.code,
      detail: err.message,
      errors: err.errors,
      requestId,
    };
  }
  if (err instanceof ZodError) {
    return {
      type: 'about:blank',
      title: TITLES.VALIDATION_ERROR ?? 'Validation failed',
      status: 422,
      code: 'VALIDATION_ERROR',
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      requestId,
    };
  }
  return {
    type: 'about:blank',
    title: TITLES.INTERNAL_ERROR ?? 'Internal server error',
    status: 500,
    code: 'INTERNAL_ERROR',
    requestId,
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies error handlers by arity (4 args).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    const problem = toProblem(err, req.requestId);
    if (problem.status >= 500) logger.error({ err, requestId: req.requestId }, 'unhandled error');
    res.status(problem.status).type('application/problem+json').json(problem);
  };
}
