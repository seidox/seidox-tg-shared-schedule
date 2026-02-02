"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMembershipByUser = getMembershipByUser;
exports.createSpaceWithOwner = createSpaceWithOwner;
exports.setSpacePin = setSpacePin;
exports.findSpaceByPinHash = findSpaceByPinHash;
exports.countMembers = countMembers;
exports.addMember = addMember;
exports.burnSpacePin = burnSpacePin;
const db_1 = require("./db");
function getMembershipByUser(tgUserId) {
    const row = db_1.db
        .prepare(`
      SELECT m.space_id as spaceId, m.role as role
      FROM members m
      WHERE m.tg_user_id = ?
    `)
        .get(tgUserId);
    if (!row)
        return null;
    const other = db_1.db
        .prepare(`
      SELECT tg_user_id as otherUserId
      FROM members
      WHERE space_id = ? AND tg_user_id <> ?
      LIMIT 1
    `)
        .get(row.spaceId, tgUserId);
    return {
        spaceId: row.spaceId,
        role: row.role,
        otherUserId: other?.otherUserId ?? null,
    };
}
function createSpaceWithOwner(tgUserId) {
    const now = new Date().toISOString();
    const info = db_1.db
        .prepare(`INSERT INTO spaces (pin_hash, pin_expires_at, created_at) VALUES (NULL, NULL, ?)`)
        .run(now);
    const spaceId = Number(info.lastInsertRowid);
    db_1.db.prepare(`INSERT INTO members (space_id, tg_user_id, role, joined_at) VALUES (?, ?, ?, ?)`).run(spaceId, tgUserId, "owner", now);
    return spaceId;
}
function setSpacePin(spaceId, pinHash, expiresAtIso) {
    db_1.db.prepare(`UPDATE spaces SET pin_hash = ?, pin_expires_at = ? WHERE id = ?`).run(pinHash, expiresAtIso, spaceId);
}
function findSpaceByPinHash(pinHash) {
    const row = db_1.db
        .prepare(`SELECT id as spaceId, pin_expires_at as pinExpiresAt FROM spaces WHERE pin_hash = ?`)
        .get(pinHash);
    return row ? { spaceId: row.spaceId, pinExpiresAt: row.pinExpiresAt } : null;
}
function countMembers(spaceId) {
    const row = db_1.db.prepare(`SELECT COUNT(*) as cnt FROM members WHERE space_id = ?`).get(spaceId);
    return Number(row.cnt);
}
function addMember(spaceId, tgUserId) {
    const now = new Date().toISOString();
    db_1.db.prepare(`INSERT INTO members (space_id, tg_user_id, role, joined_at) VALUES (?, ?, ?, ?)`).run(spaceId, tgUserId, "member", now);
}
function burnSpacePin(spaceId) {
    db_1.db.prepare(`UPDATE spaces SET pin_hash = NULL, pin_expires_at = NULL WHERE id = ?`).run(spaceId);
}
//# sourceMappingURL=repo.js.map