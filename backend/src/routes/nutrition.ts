import { Router, type Request, type Response } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { db } from "../db";

export const nutritionRouter = Router();

type FoodRow = {
  id: number;
  name: string;
  base_grams: number | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

function parseDate(value: unknown): string | null {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

nutritionRouter.get("/foods", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const rows = db
    .prepare(
      `
      SELECT id, name, base_grams, kcal, protein, fat, carbs, created_at as createdAt
      FROM foods
      WHERE tg_user_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `
    )
    .all(tgUserId);
  res.json({ foods: rows });
});

nutritionRouter.post("/food", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const baseGrams = parseNumber(body.baseGrams);
  const kcal = parseNumber(body.kcal);
  const protein = parseNumber(body.protein);
  const fat = parseNumber(body.fat);
  const carbs = parseNumber(body.carbs);

  if (!name) return res.status(400).json({ error: "missing_name" });
  const normalizedBase = baseGrams && baseGrams > 0 ? Math.round(baseGrams) : 100;

  if (
    kcal === null ||
    protein === null ||
    fat === null ||
    carbs === null
  ) {
    return res.status(400).json({ error: "missing_macros" });
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO foods (tg_user_id, name, base_grams, kcal, protein, fat, carbs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(tgUserId, name, normalizedBase, kcal, protein, fat, carbs, now);

  return res.json({
    id: Number(info.lastInsertRowid),
    name,
    baseGrams: normalizedBase,
    kcal,
    protein,
    fat,
    carbs,
  });
});

nutritionRouter.get("/day", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const date = parseDate(req.query.date);
  if (!date) return res.status(400).json({ error: "bad_date" });

  const rows = db
    .prepare(
      `
      SELECT id, food_id as foodId, name, grams, kcal, protein, fat, carbs, created_at as createdAt
      FROM nutrition_entries
      WHERE tg_user_id = ? AND date = ?
      ORDER BY created_at DESC
    `
    )
    .all(tgUserId, date) as Array<{
    id: number;
    foodId: number | null;
    name: string;
    grams: number;
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
    createdAt: string;
  }>;

  let totalKcal = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;

  const entries = rows.map((row) => {
    const factor = row.grams / 100;
    const kcal = row.kcal * factor;
    const protein = row.protein * factor;
    const fat = row.fat * factor;
    const carbs = row.carbs * factor;

    totalKcal += kcal;
    totalProtein += protein;
    totalFat += fat;
    totalCarbs += carbs;

    return {
      id: row.id,
      foodId: row.foodId,
      name: row.name,
      grams: row.grams,
      kcalPer100: row.kcal,
      proteinPer100: row.protein,
      fatPer100: row.fat,
      carbsPer100: row.carbs,
      kcal,
      protein,
      fat,
      carbs,
      createdAt: row.createdAt,
    };
  });

  res.json({
    date,
    entries,
    totals: {
      kcal: totalKcal,
      protein: totalProtein,
      fat: totalFat,
      carbs: totalCarbs,
    },
  });
});

nutritionRouter.post("/entry", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const body = req.body || {};
  const date = parseDate(body.date);
  if (!date) return res.status(400).json({ error: "bad_date" });

  const grams = parseNumber(body.grams);
  if (grams === null || grams <= 0) return res.status(400).json({ error: "bad_grams" });

  let name = String(body.name || "").trim();
  let kcalPer100 = parseNumber(body.kcal);
  let proteinPer100 = parseNumber(body.protein);
  let fatPer100 = parseNumber(body.fat);
  let carbsPer100 = parseNumber(body.carbs);
  let foodId: number | null = null;

  if (body.foodId) {
    const food = db
      .prepare(
        `
        SELECT id, name, base_grams, kcal, protein, fat, carbs
        FROM foods
        WHERE id = ? AND tg_user_id = ?
      `
      )
      .get(Number(body.foodId), tgUserId) as FoodRow | undefined;

    if (!food) return res.status(404).json({ error: "food_not_found" });

    const base = food.base_grams && food.base_grams > 0 ? food.base_grams : 100;
    const scale = 100 / base;
    name = food.name;
    kcalPer100 = food.kcal * scale;
    proteinPer100 = food.protein * scale;
    fatPer100 = food.fat * scale;
    carbsPer100 = food.carbs * scale;
    foodId = food.id;
  }

  if (!name) return res.status(400).json({ error: "missing_name" });
  if (
    kcalPer100 === null ||
    proteinPer100 === null ||
    fatPer100 === null ||
    carbsPer100 === null
  ) {
    return res.status(400).json({ error: "missing_macros" });
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO nutrition_entries
        (tg_user_id, date, food_id, name, grams, kcal, protein, fat, carbs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      tgUserId,
      date,
      foodId,
      name,
      grams,
      kcalPer100,
      proteinPer100,
      fatPer100,
      carbsPer100,
      now
    );

  return res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

nutritionRouter.put("/entry/:id", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const entryId = Number(req.params.id);
  const grams = parseNumber(req.body?.grams);
  if (!entryId || grams === null || grams <= 0) {
    return res.status(400).json({ error: "bad_grams" });
  }

  const info = db
    .prepare(
      `
      UPDATE nutrition_entries
      SET grams = ?
      WHERE id = ? AND tg_user_id = ?
    `
    )
    .run(grams, entryId, tgUserId);

  if (info.changes === 0) return res.status(404).json({ error: "entry_not_found" });

  return res.json({ ok: true });
});

nutritionRouter.delete("/entry/:id", requireTelegramAuth, (req: Request, res: Response) => {
  const tgUserId = req.user!.tgUserId;
  const entryId = Number(req.params.id);
  if (!entryId) return res.status(400).json({ error: "bad_id" });

  const info = db
    .prepare(`DELETE FROM nutrition_entries WHERE id = ? AND tg_user_id = ?`)
    .run(entryId, tgUserId);

  if (info.changes === 0) return res.status(404).json({ error: "entry_not_found" });

  return res.json({ ok: true });
});
