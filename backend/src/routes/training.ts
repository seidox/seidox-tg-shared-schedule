import { Router, type Request, type Response } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { db } from "../db";

export const trainingRouter = Router();

function parseDate(value: unknown): string | null {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function parsePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

trainingRouter.get("/exercises", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const rows = db
    .prepare(
      `
      SELECT id, name, category, created_at as createdAt
      FROM exercises
      WHERE tg_user_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `
    )
    .all(tgUserId);
  res.json({ exercises: rows });
});

trainingRouter.post("/exercise", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  if (!name) return res.status(400).json({ error: "missing_name" });

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO exercises (tg_user_id, name, category, created_at)
      VALUES (?, ?, ?, ?)
    `
    )
    .run(tgUserId, name, category || null, now);

  res.json({ id: Number(info.lastInsertRowid), name, category: category || null });
});

trainingRouter.post("/workout", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const body = req.body || {};
  const date = parseDate(body.date);
  if (!date) return res.status(400).json({ error: "bad_date" });

  const exerciseId = Number(body.exerciseId);
  if (!exerciseId) return res.status(400).json({ error: "bad_exercise" });

  const weight = parseNumber(body.weight);
  const reps = parseNumber(body.reps);
  const setsCount = parsePositiveInt(body.setsCount) ?? 1;
  if (weight === null || reps === null || reps <= 0) {
    return res.status(400).json({ error: "bad_set" });
  }
  if (setsCount > 20) return res.status(400).json({ error: "bad_sets_count" });

  const exists = db
    .prepare(`SELECT id FROM exercises WHERE id = ? AND tg_user_id = ?`)
    .get(exerciseId, tgUserId);
  if (!exists) return res.status(404).json({ error: "exercise_not_found" });

  const insertSet = db.prepare(
    `
      INSERT INTO workout_sets (tg_user_id, date, exercise_id, weight, reps, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );

  const createdIds = db.transaction(() => {
    const ids: number[] = [];
    for (let i = 0; i < setsCount; i += 1) {
      const now = new Date().toISOString();
      const info = insertSet.run(tgUserId, date, exerciseId, weight, Math.round(reps), now);
      ids.push(Number(info.lastInsertRowid));
    }
    return ids;
  })();

  res.json({ ok: true, ids: createdIds, setsCount: createdIds.length });
});

trainingRouter.get("/day", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const date = parseDate(req.query.date);
  if (!date) return res.status(400).json({ error: "bad_date" });

  const rows = db
    .prepare(
      `
      SELECT
        ws.id,
        ws.exercise_id as exerciseId,
        ws.weight,
        ws.reps,
        ws.created_at as createdAt,
        e.name as exerciseName,
        e.category as category
      FROM workout_sets ws
      JOIN exercises e ON e.id = ws.exercise_id
      WHERE ws.tg_user_id = ? AND ws.date = ?
      ORDER BY ws.created_at DESC
    `
    )
    .all(tgUserId, date) as Array<{
    id: number;
    exerciseId: number;
    weight: number;
    reps: number;
    createdAt: string;
    exerciseName: string;
    category: string | null;
  }>;

  const grouped = new Map<number, {
    exerciseId: number;
    name: string;
    category: string | null;
    sets: Array<{ id: number; weight: number; reps: number; createdAt: string }>;
  }>();

  for (const row of rows) {
    if (!grouped.has(row.exerciseId)) {
      grouped.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        name: row.exerciseName,
        category: row.category,
        sets: [],
      });
    }
    grouped.get(row.exerciseId)!.sets.push({
      id: row.id,
      weight: row.weight,
      reps: row.reps,
      createdAt: row.createdAt,
    });
  }

  res.json({ date, items: Array.from(grouped.values()) });
});

trainingRouter.get(
  "/exercise/:id/history",
  requireTelegramAuth,
  (req: Request, res: Response) => {
    const tgUserId = req.user!.tgUserId;
    const exerciseId = Number(req.params.id);
    if (!exerciseId) return res.status(400).json({ error: "bad_exercise" });

    const rows = db
      .prepare(
        `
        SELECT date, weight, reps, created_at as createdAt
        FROM workout_sets
        WHERE tg_user_id = ? AND exercise_id = ?
        ORDER BY date DESC, created_at DESC
        LIMIT 10
      `
      )
      .all(tgUserId, exerciseId);

    res.json({ exerciseId, history: rows });
  }
);
