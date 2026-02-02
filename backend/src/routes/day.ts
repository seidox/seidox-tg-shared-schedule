import { Router } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { getMembershipByUser } from "../repo";
import { resolveDay } from "../services/resolveDay";
import { db } from "../db";

export const dayRouter = Router();

dayRouter.get("/day", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const date = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "bad_date" });

  const since = req.query.since ? String(req.query.since) : null;

  const serverTime = new Date().toISOString();

  let events = resolveDay(m.spaceId, date);

  // Notes for that day
  let notes = db
    .prepare(
      `
      SELECT id, series_id as seriesId, date, author_tg_user_id as authorTgUserId, text, created_at as createdAt
      FROM notes
      WHERE space_id = ? AND date = ?
      ORDER BY created_at ASC
    `
    )
    .all(m.spaceId, date) as any[];

  if (since) {
    // filter changes since time
    events = events.filter((e) => e.updatedAt > since);
    notes = notes.filter((n) => n.createdAt > since);
  }

  // members
  const members = db
    .prepare(`SELECT tg_user_id as tgUserId FROM members WHERE space_id = ? ORDER BY role DESC, joined_at ASC`)
    .all(m.spaceId) as any[];

  return res.json({
    date,
    serverTime,
    members,
    events,
    notes,
  });
});
