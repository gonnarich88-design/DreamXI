import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';
import { cardsRouter } from './modules/cards/cards.routes';
import { dustshopRouter } from './modules/dustshop/dustshop.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);
  app.use('/cards', cardsRouter);
  app.use('/dustshop', dustshopRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
