"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spaceRouter = void 0;
const express_1 = require("express");
const telegramAuth_1 = require("../auth/telegramAuth");
const pin_1 = require("../utils/pin");
const repo_1 = require("../repo");
exports.spaceRouter = (0, express_1.Router)();
exports.spaceRouter.post("/create", telegramAuth_1.requireTelegramAuth, (req, res) => {
    const tgUserId = req.user.tgUserId;
    // если уже привязан — не создаём заново
    const m = (0, repo_1.getMembershipByUser)(tgUserId);
    if (m) {
        return res.status(400).json({ error: "already_paired" });
    }
    const spaceId = (0, repo_1.createSpaceWithOwner)(tgUserId);
    const pin = (0, pin_1.generatePin6)();
    const pinHash = (0, pin_1.hashPin)(pin);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    (0, repo_1.setSpacePin)(spaceId, pinHash, expiresAt);
    return res.json({ spaceId, pin, pinExpiresAt: expiresAt });
});
exports.spaceRouter.post("/join", telegramAuth_1.requireTelegramAuth, (req, res) => {
    const tgUserId = req.user.tgUserId;
    const m = (0, repo_1.getMembershipByUser)(tgUserId);
    if (m)
        return res.status(400).json({ error: "already_paired" });
    const pin = String(req.body?.pin ?? "").trim();
    if (!/^\d{6}$/.test(pin))
        return res.status(400).json({ error: "bad_pin_format" });
    const row = (0, repo_1.findSpaceByPinHash)((0, pin_1.hashPin)(pin));
    if (!row)
        return res.status(404).json({ error: "pin_not_found" });
    if (!row.pinExpiresAt)
        return res.status(404).json({ error: "pin_not_found" });
    if (new Date(row.pinExpiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "pin_expired" });
    }
    const membersCnt = (0, repo_1.countMembers)(row.spaceId);
    if (membersCnt >= 2)
        return res.status(409).json({ error: "space_full" });
    (0, repo_1.addMember)(row.spaceId, tgUserId);
    (0, repo_1.burnSpacePin)(row.spaceId);
    return res.json({ spaceId: row.spaceId, paired: true });
});
//# sourceMappingURL=space.js.map