import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import {
  getCatalog,
  purchase,
  ItemNotAvailableError,
  InvalidPlayerForItemError,
  MonthlyLimitExceededError,
} from './dustshop.service';
import { InsufficientFundsError } from '../currency/currency.service';
import { NoPlayersForRarityError } from '../../shared/errors';
import { asyncHandler } from '../../middleware/asyncHandler';

export const dustshopRouter = Router();

dustshopRouter.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const catalog = await getCatalog(userId);
    res.status(200).json(catalog);
  }),
);

dustshopRouter.post(
  '/purchase',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { itemType, playerId } = req.body as { itemType?: string; playerId?: string };
    if (!itemType) {
      res.status(400).json({ error: 'itemType is required' });
      return;
    }

    try {
      const result = await purchase(userId, itemType, playerId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ItemNotAvailableError || err instanceof InvalidPlayerForItemError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof MonthlyLimitExceededError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientFundsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      if (err instanceof NoPlayersForRarityError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);
