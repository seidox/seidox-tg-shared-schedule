import { Router } from "express";
import { requireTelegramAuth } from "../auth/telegramAuth";
import { getMembershipByUser } from "../repo";
import { db } from "../db";

export const seriesRouter = Router();

function nowIso() {
  return new Date().toISOString();
}

function validateTime(timeKind: string, startMin: any, endMin: any) {
  if (timeKind === "anytime") return { ok: true, start: null, end: null };
  const s = Number(startMin);
  const e = Number(endMin);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { ok: false, error: "bad_time" };
  if (s < 0 || e > 1440 || s >= e) return { ok: false, error: "bad_time_range" };
  return { ok: true, start: s, end: e };
}

seriesRouter.post("/", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const {
    title,
    color,
    timeKind,
    startMin,
    endMin,
    recurrenceKind,
    singleDate,
    weeklyMask,
    cyclePattern,
    cycleAnchorDate,
  } = req.body || {};

  if (!title || String(title).trim().length === 0) return res.status(400).json({ error: "missing_title" });
  const tKind = String(timeKind || "anytime");
  if (!["exact", "approx", "anytime"].includes(tKind)) return res.status(400).json({ error: "bad_time_kind" });

  const tv = validateTime(tKind, startMin, endMin);
  if (!tv.ok) return res.status(400).json({ error: tv.error });

  const rKind = String(recurrenceKind || "none");
  if (!["none", "weekly", "cycle"].includes(rKind)) return res.status(400).json({ error: "bad_recurrence" });

  let sDate: string | null = null;
  let wMask: number | null = null;
  let cPattern: string | null = null;
  let cAnchor: string | null = null;

  if (rKind === "none") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(singleDate || ""))) return res.status(400).json({ error: "missing_single_date" });
    sDate = String(singleDate);
  } else if (rKind === "weekly") {
    const msk = Number(weeklyMask);
    if (!Number.isFinite(msk) || msk <= 0) return res.status(400).json({ error: "bad_weekly_mask" });
    wMask = msk;
  } else if (rKind === "cycle") {
    const p = String(cyclePattern || "");
    const a = String(cycleAnchorDate || "");
    if (!/^[01]{2,31}$/.test(p)) return res.status(400).json({ error: "bad_cycle_pattern" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return res.status(400).json({ error: "bad_cycle_anchor" });
    cPattern = p;
    cAnchor = a;
  }

  const ts = nowIso();
  const info = db
    .prepare(
      `
      INSERT INTO series (
        space_id, owner_tg_user_id, title, color,
        start_time_min, end_time_min, time_kind,
        recurrence_kind, single_date, weekly_mask, cycle_pattern, cycle_anchor_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      m.spaceId,
      tgUserId,
      String(title).trim(),
      String(color || "c1"),
      tv.start,
      tv.end,
      tKind,
      rKind,
      sDate,
      wMask,
      cPattern,
      cAnchor,
      ts,
      ts
    );

  return res.json({ seriesId: Number(info.lastInsertRowid) });
});

seriesRouter.put("/:id", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

  const ownerRow = db.prepare(`SELECT owner_tg_user_id as owner FROM series WHERE id = ? AND space_id = ?`).get(id, m.spaceId) as any;
  if (!ownerRow) return res.status(404).json({ error: "not_found" });
  if (ownerRow.owner !== tgUserId) return res.status(403).json({ error: "not_owner" });

  const {
    title,
    color,
    timeKind,
    startMin,
    endMin
  } = req.body || {};

  if (!title || String(title).trim().length === 0) return res.status(400).json({ error: "missing_title" });

  const tKind = String(timeKind || "anytime");
  if (!["exact", "approx", "anytime"].includes(tKind)) return res.status(400).json({ error: "bad_time_kind" });

  const tv = validateTime(tKind, startMin, endMin);
  if (!tv.ok) return res.status(400).json({ error: tv.error });

  const ts = nowIso();

  db.prepare(
    `
    UPDATE series
    SET title = ?, color = ?, start_time_min = ?, end_time_min = ?, time_kind = ?, updated_at = ?
    WHERE id = ? AND space_id = ?
  `
  ).run(String(title).trim(), String(color || "c1"), tv.start, tv.end, tKind, ts, id, m.spaceId);

  return res.json({ ok: true });
});

seriesRouter.delete("/:id", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const m = getMembershipByUser(tgUserId);
  if (!m) return res.status(403).json({ error: "not_paired" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

  const ownerRow = db.prepare(`SELECT owner_tg_user_id as owner FROM series WHERE id = ? AND space_id = ?`).get(id, m.spaceId) as any;
  if (!ownerRow) return res.status(404).json({ error: "not_found" });
  if (ownerRow.owner !== tgUserId) return res.status(403).json({ error: "not_owner" });

  db.prepare(`DELETE FROM series WHERE id = ? AND space_id = ?`).run(id, m.spaceId);
  return res.json({ ok: true });
});
