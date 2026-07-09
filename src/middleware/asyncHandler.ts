import { NextFunction, Request, Response } from 'express';

/**
 * Express 4 (unlike Express 5) does not await async route handlers, so a
 * rejected promise from an `async (req, res) => {...}` handler becomes an
 * unhandled rejection instead of reaching the error-handling middleware --
 * the request just hangs with no response. Wrap every async handler with
 * this so thrown/rejected errors are forwarded to `next(err)` explicitly.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
