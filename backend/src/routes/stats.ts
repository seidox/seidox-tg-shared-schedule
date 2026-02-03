import { Router, type Request, type Response } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { db } from "../db";

export const statsRouter = Router();

function parseDate(value: unknown): string | null {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

statsRouter.get("/day", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const date = parseDate(req.query.date);
  if (!date) return res.status(400).json({ error: "bad_date" });

  const row = db
    .prepare(
      `
      SELECT weight_kg as weightKg, water_ml as waterMl
      FROM daily_stats
      WHERE tg_user_id = ? AND date = ?
    `
    )
    .get(tgUserId, date) as { weightKg: number | null; waterMl: number | null } | undefined;

  res.json({
    date,
    weightKg: row?.weightKg ?? null,
    waterMl: row?.waterMl ?? null,
  });
});

statsRouter.put("/weight", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const date = parseDate(req.body?.date);
  const kg = parseNumber(req.body?.kg);
  if (!date) return res.status(400).json({ error: "bad_date" });
  if (kg === null || kg <= 0) return res.status(400).json({ error: "bad_weight" });

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO daily_stats (tg_user_id, date, weight_kg, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tg_user_id, date)
    DO UPDATE SET weight_kg = excluded.weight_kg, updated_at = excluded.updated_at
  `
  ).run(tgUserId, date, kg, now);

  res.json({ ok: true });
});

statsRouter.put("/water", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const date = parseDate(req.body?.date);
  const ml = parseNumber(req.body?.ml);
  if (!date) return res.status(400).json({ error: "bad_date" });
  if (ml === null || ml < 0) return res.status(400).json({ error: "bad_water" });

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO daily_stats (tg_user_id, date, water_ml, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tg_user_id, date)
    DO UPDATE SET water_ml = excluded.water_ml, updated_at = excluded.updated_at
  `
  ).run(tgUserId, date, Math.round(ml), now);

  res.json({ ok: true });
});
