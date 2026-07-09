import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../src/middleware/asyncHandler';

describe('asyncHandler', () => {
  it('forwards a rejected promise to next(err) instead of leaving it unhandled', async () => {
    const boom = new Error('boom');
    const wrapped = asyncHandler(async () => {
      throw boom;
    });

    const next = jest.fn() as unknown as NextFunction;
    const req = {} as Request;
    const res = {} as Response;

    wrapped(req, res, next);

    // The handler's internal promise rejection is caught asynchronously;
    // flush the microtask queue before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(boom);
  });

  it('does not call next when the wrapped handler resolves normally', async () => {
    const wrapped = asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const next = jest.fn() as unknown as NextFunction;
    const req = {} as Request;
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;

    wrapped(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true });
  });
});
