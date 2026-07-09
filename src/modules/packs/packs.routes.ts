import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { openPack, PackTypeNotFoundError, NoPlayersForRarityError } from './packs.service';
import { InsufficientFundsError } from '../currency/currency.service';
import { asyncHandler } from '../../middleware/asyncHandler';

export const packsRouter = Router();

packsRouter.post(
  '/:packTypeName/open',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { packTypeName } = req.params;

    try {
      const result = await openPack(userId, packTypeName);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PackTypeNotFoundError) {
        res.status(404).json({ error: err.message });
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
