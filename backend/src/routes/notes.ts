import { Router } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { getMembershipByUser } from "../repo";
import { db } from "../db";

export const notesRouter = Router();

notesRouter.post("/", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const { seriesId, date, text } = req.body || {};
  const sid = Number(seriesId);
  if (!Number.isFinite(sid)) return res.status(400).json({ error: "bad_series_id" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return res.status(400).json({ error: "bad_date" });

  const t = String(text || "").trim();
  if (!t) return res.status(400).json({ error: "empty_text" });
  if (t.length > 500) return res.status(400).json({ error: "too_long" });

  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO notes (series_id, date, space_id, author_tg_user_id, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sid, String(date), m.spaceId, tgUserId, t, createdAt);

  return res.json({ ok: true, createdAt });
});
