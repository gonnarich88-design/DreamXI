import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import {
  disenchant,
  fuse,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
  AllSpecialsOwnedError,
} from './cards.service';
import { InvalidRarityError, NoPlayersForRarityError } from '../../shared/errors';
import { asyncHandler } from '../../middleware/asyncHandler';

export const cardsRouter = Router();

cardsRouter.post(
  '/disenchant',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { playerId, quantity } = req.body as { playerId?: string; quantity?: number };
    if (!playerId || typeof quantity !== 'number') {
      res.status(400).json({ error: 'playerId and quantity are required' });
      return;
    }

    try {
      const result = await disenchant(userId, playerId, quantity);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof CardNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidQuantityError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientDuplicatesError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidRarityError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

cardsRouter.post(
  '/fusion',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { rarity } = req.body as { rarity?: string };
    if (!rarity) {
      res.status(400).json({ error: 'rarity is required' });
      return;
    }

    try {
      const result = await fuse(userId, rarity);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof InvalidRarityError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientDuplicatesError || err instanceof AllSpecialsOwnedError) {
        res.status(409).json({ error: err.message });
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
