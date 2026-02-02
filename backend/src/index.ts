import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { migrate } from "./db";
import { requireTelegramAuth } from "./auth/telegramAuth";
import { spaceRouter } from "./routes/space";
import { getMembershipByUser } from "./repo";
import path from "path";
import { dayRouter } from "./routes/day";
import { seriesRouter } from "./routes/series";
import { notesRouter } from "./routes/notes";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));

// когда открывают сайт (/), отдаём index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});


migrate();

// Serve frontend in production
const frontendPath = path.join(process.cwd(), "../frontend");
app.use(express.static(frontendPath));


app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;


app.get("/api/me", requireTelegramAuth, (req, res) => {
  const tgUserId = req.user!.tgUserId;

  const membership = getMembershipByUser(tgUserId);
  if (!membership) {
    return res.json({
      tgUserId,
      spaceId: null,
      paired: false,
      otherUserId: null,
      membersCount: 0,
    });
  }

  const membersCount = Number(membership.membersCount);
  const paired = membersCount === 2;

  return res.json({
    tgUserId,
    spaceId: Number(membership.spaceId),
    paired,
    otherUserId: membership.otherUserId,
    membersCount,
  });
});


app.use("/api/space", spaceRouter);
app.use("/api", dayRouter);
app.use("/api/series", seriesRouter);
app.use("/api/note", notesRouter);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
