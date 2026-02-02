import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { migrate } from "./db";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

migrate();


app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;


app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
