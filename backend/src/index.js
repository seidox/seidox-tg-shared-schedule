"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const telegramAuth_1 = require("./auth/telegramAuth");
const space_1 = require("./routes/space");
const repo_1 = require("./repo");
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const publicDir = path_1.default.resolve(__dirname, "../public");
app.use(express_1.default.static(publicDir));
// когда открывают сайт (/), отдаём index.html
app.get("/", (_req, res) => {
    res.sendFile(path_1.default.join(publicDir, "index.html"));
});
(0, db_1.migrate)();
// Serve frontend in production
const frontendPath = path_1.default.join(process.cwd(), "../frontend");
app.use(express_1.default.static(frontendPath));
app.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
});
app.get("/api/me", telegramAuth_1.requireTelegramAuth, (req, res) => {
    const tgUserId = req.user.tgUserId;
    const membership = (0, repo_1.getMembershipByUser)(tgUserId);
    if (!membership) {
        return res.json({
            tgUserId,
            paired: false
        });
    }
    return res.json({
        tgUserId,
        paired: true,
        spaceId: membership.spaceId,
        role: membership.role,
        otherUserId: membership.otherUserId
    });
});
app.use("/api/space", space_1.spaceRouter);
//# sourceMappingURL=index.js.map