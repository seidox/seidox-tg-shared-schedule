import { Router, type Request, type Response } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { generatePin6, hashPin } from "../utils/pin";
import {
  getMembershipByUser,
  createSpaceWithOwner,
  setSpacePin,
  findSpaceByPinHash,
  countMembers,
  addMember,
  burnSpacePin,
  addDayNote,
} from "../repo";

export const spaceRouter = Router();

spaceRouter.post("/create", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;

  // если уже в space — не создаём заново
  const m = getMembershipByUser(tgUserId);
  if (m) {
    return res.status(400).json({ error: "already_paired" });
  }

  const spaceId = createSpaceWithOwner(tgUserId);

  const pin = generatePin6();
  const pinHash = hashPin(pin);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  setSpacePin(spaceId, pinHash, expiresAt);

  return res.json({ spaceId, pin, pinExpiresAt: expiresAt });
});

spaceRouter.post("/join", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;

  const m = getMembershipByUser(tgUserId);
  if (m) return res.status(400).json({ error: "already_paired" });

  const pin = String(req.body?.pin ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "bad_pin_format" });

  const row = findSpaceByPinHash(hashPin(pin));
  if (!row) return res.status(404).json({ error: "pin_not_found" });
  if (!row.pinExpiresAt) return res.status(404).json({ error: "pin_not_found" });

  if (new Date(row.pinExpiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: "pin_expired" });
  }

  const membersCnt = countMembers(row.spaceId);
  if (membersCnt >= 2) return res.status(409).json({ error: "space_full" });

  addMember(row.spaceId, tgUserId);
  burnSpacePin(row.spaceId);

  return res.json({ spaceId: row.spaceId, paired: true });
});

// ✅ заметка по ДАТЕ (без времени)
spaceRouter.post("/daynote", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;

  const membership = getMembershipByUser(tgUserId);
  if (!membership) return res.status(403).json({ error: "not_in_space" });

  const spaceId = Number(membership.spaceId);
  const { date, text } = req.body || {};

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: "bad_date" });
  }
  const cleanText = String(text || "").trim();
  if (!cleanText) return res.status(400).json({ error: "empty_text" });
  if (cleanText.length > 2000) return res.status(400).json({ error: "too_long" });

  addDayNote(spaceId, String(date), tgUserId, cleanText);
  return res.json({ ok: true });
});

