import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { migrate } from "./db";
import { requireTelegramAuth } from "./auth/telegramAuth";
import { spaceRouter } from "./routes/space";
import { getMembershipByUser } from "./repo";
import path from "path";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

migrate();

// Serve frontend in production
const frontendPath = path.join(process.cwd(), "../frontend");
app.use(express.static(frontendPath));


app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;


app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

app.get("/api/me", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;
  const membership = getMembershipByUser(tgUserId);

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

app.use("/api/space", spaceRouter);

