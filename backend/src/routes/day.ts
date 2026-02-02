import { Router, type Request, type Response } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { getMembershipByUser, getDayNotes } from "../repo";
import { resolveDay } from "../services/resolveDay";
import { db } from "../db";

export const dayRouter = Router();

dayRouter.get("/day", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;

  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const spaceId = Number(m.spaceId);

  const date = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "bad_date" });

  const since = req.query.since ? String(req.query.since) : null;
  const serverTime = new Date().toISOString();

  let events = resolveDay(spaceId, date);

  // ✅ day-notes (без времени)
  let dayNotes = getDayNotes(spaceId, date) as any[];

  // Notes for that day (к событиям)
  let notes = db
    .prepare(
      `
      SELECT id, series_id as seriesId, date, author_tg_user_id as authorTgUserId, text, created_at as createdAt
      FROM notes
      WHERE space_id = ? AND date = ?
      ORDER BY created_at ASC
    `
    )
    .all(spaceId, date) as any[];

  if (since) {
    events = events.filter((e: any) => e.updatedAt > since);
    notes = notes.filter((n: any) => n.createdAt > since);
    dayNotes = dayNotes.filter((n: any) => n.createdAt > since);
  }

  // members
  const members = db
    .prepare(`SELECT tg_user_id as tgUserId FROM members WHERE space_id = ? ORDER BY role DESC, joined_at ASC`)
    .all(spaceId) as any[];

  return res.json({
    date,
    serverTime,
    members,
    events,
    notes,
    dayNotes,
  });
});

