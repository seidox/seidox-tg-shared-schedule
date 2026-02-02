import { db } from "./db";

export function getMembershipByUser(tgUserId: string): {
  spaceId: number;
  role: string;
  otherUserId: string | null;
} | null {
  const row = db
    .prepare(
      `
      SELECT m.space_id as spaceId, m.role as role
      FROM members m
      WHERE m.tg_user_id = ?
    `
    )
    .get(tgUserId) as any;

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
    .get(row.spaceId, tgUserId) as any;

  return {
    spaceId: row.spaceId,
    role: row.role,
    otherUserId: other?.otherUserId ?? null,
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

export function findSpaceByPinHash(pinHash: string): { spaceId: number; pinExpiresAt: string | null } | null {
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
