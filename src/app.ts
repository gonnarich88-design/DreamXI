import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
