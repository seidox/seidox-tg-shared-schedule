import { db } from "./db";

export function getMembershipByUser(tgUserId: string): {
  spaceId: number;
  role: string;
  otherUserId: string | null;
  membersCount: number;
} | null {
  const row = db
    .prepare(
      `
      SELECT m.space_id as spaceId, m.role as role
      FROM members m
      WHERE m.tg_user_id = ?
    `
    )
    .get(tgUserId) as { spaceId: number; role: string } | undefined;

  if (!row) return null;

  const other = db
    .prepare(
      `
      SELECT tg_user_id as otherUserId
      FROM members
      WHERE space_id = ? AND tg_user_id <> ?
      LIMIT 1
    `
    )
    .get(row.spaceId, tgUserId) as { otherUserId?: string } | undefined;

  const countRow = db
    .prepare(
      `
      SELECT COUNT(*) as cnt
      FROM members
      WHERE space_id = ?
    `
    )
    .get(row.spaceId) as { cnt: number };

  return {
    spaceId: row.spaceId,
    role: row.role,
    otherUserId: other?.otherUserId ?? null,
    membersCount: Number(countRow.cnt),
  };
}

export function createSpaceWithOwner(tgUserId: string) {
  const now = new Date().toISOString();
  const info = db
    .prepare(`INSERT INTO spaces (pin_hash, pin_expires_at, created_at) VALUES (NULL, NULL, ?)`)
    .run(now);

  const spaceId = Number(info.lastInsertRowid);

  db.prepare(
    `INSERT INTO members (space_id, tg_user_id, role, joined_at) VALUES (?, ?, ?, ?)`
  ).run(spaceId, tgUserId, "owner", now);

  return spaceId;
}

export function setSpacePin(spaceId: number, pinHash: string, expiresAtIso: string) {
  db.prepare(`UPDATE spaces SET pin_hash = ?, pin_expires_at = ? WHERE id = ?`).run(
    pinHash,
    expiresAtIso,
    spaceId
  );
}

export function findSpaceByPinHash(
  pinHash: string
): { spaceId: number; pinExpiresAt: string | null } | null {
  const row = db
    .prepare(`SELECT id as spaceId, pin_expires_at as pinExpiresAt FROM spaces WHERE pin_hash = ?`)
    .get(pinHash) as any;

  return row ? { spaceId: row.spaceId, pinExpiresAt: row.pinExpiresAt } : null;
}

export function countMembers(spaceId: number): number {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM members WHERE space_id = ?`).get(spaceId) as any;
  return Number(row.cnt);
}

export function addMember(spaceId: number, tgUserId: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO members (space_id, tg_user_id, role, joined_at) VALUES (?, ?, ?, ?)`
  ).run(spaceId, tgUserId, "member", now);
}

export function burnSpacePin(spaceId: number) {
  db.prepare(`UPDATE spaces SET pin_hash = NULL, pin_expires_at = NULL WHERE id = ?`).run(spaceId);
}

// ✅ список участников space (реальная таблица members)
export function getMemberIds(spaceId: number): string[] {
  const rows = db
    .prepare(
      `
      SELECT tg_user_id AS tgUserId
      FROM members
      WHERE space_id = ?
      ORDER BY tg_user_id ASC
    `
    )
    .all(spaceId) as Array<{ tgUserId: string }>;

  return rows.map((r) => String(r.tgUserId));
}

export function getOtherUserId(spaceId: number, meTgUserId: string): string | null {
  const row = db
    .prepare(
      `
      SELECT tg_user_id AS tgUserId
      FROM members
      WHERE space_id = ?
        AND tg_user_id != ?
      LIMIT 1
    `
    )
    .get(spaceId, meTgUserId) as { tgUserId?: string } | undefined;

  return row?.tgUserId ? String(row.tgUserId) : null;
}

// ✅ day notes (без времени)
export function addDayNote(spaceId: number, date: string, authorTgUserId: string, text: string) {
  db.prepare(
    `
    INSERT INTO day_notes(space_id, date, author_tg_user_id, text)
    VALUES (?, ?, ?, ?)
  `
  ).run(spaceId, date, authorTgUserId, text);
}

export function getDayNotes(spaceId: number, date: string) {
  return db
    .prepare(
      `
      SELECT
        id,
        space_id AS spaceId,
        date,
        author_tg_user_id AS authorTgUserId,
        text,
        created_at AS createdAt
      FROM day_notes
      WHERE space_id = ?
        AND date = ?
      ORDER BY created_at ASC
    `
    )
    .all(spaceId, date);
}

export function leaveSpace(tgUserId: string) {
  const tx = db.transaction((userId: string) => {
    const membership = db
      .prepare(
        `
        SELECT space_id as spaceId
        FROM members
        WHERE tg_user_id = ?
      `
      )
      .get(userId) as { spaceId: number } | undefined;

    if (!membership) return;

    const spaceId = Number(membership.spaceId);
    db.prepare(`DELETE FROM members WHERE tg_user_id = ?`).run(userId);

    const remaining = db
      .prepare(`SELECT COUNT(*) as cnt FROM members WHERE space_id = ?`)
      .get(spaceId) as { cnt: number };

    if (Number(remaining.cnt) === 0) {
      db.prepare(`DELETE FROM spaces WHERE id = ?`).run(spaceId);
    }
  });

  tx(tgUserId);
}

// Жёсткий сброс всего space (для owner)
export function resetSpaceByOwner(ownerTgUserId: string): { ok: boolean; reason?: string } {
  const m = db
    .prepare(
      `
      SELECT space_id AS spaceId, role
      FROM members
      WHERE tg_user_id = ?
    `
    )
    .get(ownerTgUserId) as { spaceId: number; role: string } | undefined;

  if (!m) return { ok: false, reason: "not_in_space" };
  if (m.role !== "owner") return { ok: false, reason: "not_owner" };

  const spaceId = Number(m.spaceId);

  const tx = db.transaction((id: number) => {
    db.prepare(`DELETE FROM members WHERE space_id = ?`).run(id);
    db.prepare(`DELETE FROM spaces WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM day_notes WHERE space_id = ?`).run(id);
    db.prepare(`DELETE FROM notes WHERE space_id = ?`).run(id);
    db.prepare(`DELETE FROM series WHERE space_id = ?`).run(id);
  });

  tx(spaceId);

  return { ok: true };
}
