import dayjs from "dayjs";
import { db } from "../db";

function dayIndexMon0(dateYYYYMMDD: string): number {
  // dayjs().day(): Sunday=0..Saturday=6
  const d = dayjs(dateYYYYMMDD);
  const sunday0 = d.day();
  // convert to Monday=0..Sunday=6
  return (sunday0 + 6) % 7;
}

function weeklyActive(mask: number, dateYYYYMMDD: string): boolean {
  const idx = dayIndexMon0(dateYYYYMMDD); // 0..6 Mon..Sun
  return (mask & (1 << idx)) !== 0;
}

function cycleActive(pattern: string, anchorYYYYMMDD: string, dateYYYYMMDD: string): boolean {
  const a = dayjs(anchorYYYYMMDD);
  const d = dayjs(dateYYYYMMDD);
  const len = pattern.length;
  if (!len) return false;

  const diff = d.diff(a, "day"); // can be negative
  const mod = ((diff % len) + len) % len;
  return pattern.charAt(mod) === "1";
}

function applyOverride(base: any, ov: any) {
  if (!ov) return base;
  if (ov.is_cancelled === 1) return null;

  return {
    ...base,
    title: ov.title_override ?? base.title,
    color: ov.color_override ?? base.color,
    timeKind: ov.time_kind_override ?? base.timeKind,
    startMin: ov.start_time_min_override ?? base.startMin,
    endMin: ov.end_time_min_override ?? base.endMin,
    overrideId: ov.id,
    updatedAt: ov.updated_at || base.updatedAt,
  };
}

export function resolveDay(spaceId: number, dateYYYYMMDD: string) {
  // Load all series in this space
  const all = db
    .prepare(
      `
      SELECT
        id, space_id, owner_tg_user_id, title, color,
        start_time_min, end_time_min, time_kind,
        recurrence_kind, single_date, weekly_mask, cycle_pattern, cycle_anchor_date,
        updated_at
      FROM series
      WHERE space_id = ?
    `
    )
    .all(spaceId) as any[];

  if (all.length === 0) return [];

  const ids = all.map((s) => s.id);

  // Overrides for this date
  const overrides = db
    .prepare(
      `
      SELECT *
      FROM overrides
      WHERE series_id IN (${ids.map(() => "?").join(",")})
        AND date = ?
    `
    )
    .all(...ids, dateYYYYMMDD) as any[];

  const ovBySeries = new Map<number, any>();
  for (const ov of overrides) ovBySeries.set(ov.series_id, ov);

  const events: any[] = [];

  for (const s of all) {
    const rec = s.recurrence_kind;

    let active = false;
    if (rec === "none") {
      active = s.single_date === dateYYYYMMDD;
    } else if (rec === "weekly") {
      if (typeof s.weekly_mask === "number") active = weeklyActive(s.weekly_mask, dateYYYYMMDD);
    } else if (rec === "cycle") {
      if (s.cycle_pattern && s.cycle_anchor_date)
        active = cycleActive(s.cycle_pattern, s.cycle_anchor_date, dateYYYYMMDD);
    }

    if (!active) continue;

    const base = {
      eventKey: `s_${s.id}@${dateYYYYMMDD}`,
      seriesId: s.id,
      overrideId: null,
      ownerTgUserId: s.owner_tg_user_id,
      title: s.title,
      color: s.color,
      timeKind: s.time_kind,
      startMin: s.start_time_min,
      endMin: s.end_time_min,
      isApprox: s.time_kind === "approx",
      updatedAt: s.updated_at,
    };

    const ov = ovBySeries.get(s.id);
    const resolved = applyOverride(base, ov);
    if (resolved) events.push(resolved);
  }

  return events;
}
