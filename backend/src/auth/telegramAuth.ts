import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Telegram WebApp initData validation.
 * Client sends initData (raw query string) in header X-TG-INIT-DATA.
 *
 * Ref algorithm:
 * 1) Parse initData as URLSearchParams.
 * 2) Extract `hash`.
 * 3) Build data_check_string from sorted key=value pairs (excluding hash), joined with '\n'.
 * 4) secret_key = HMAC_SHA256("WebAppData", bot_token)
 * 5) calculated_hash = HMAC_SHA256_HEX(data_check_string, secret_key)
 * 6) Compare with received hash (timing safe).
 */
function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function validateTelegramInitData(initDataRaw: string, botToken: string) {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) return { ok: false as const, error: "missing_hash" };

  // auth_date is useful to prevent very old initData re-use
  const authDateStr = params.get("auth_date");
  if (!authDateStr) return { ok: false as const, error: "missing_auth_date" };

  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate)) return { ok: false as const, error: "bad_auth_date" };

  // Optional: reject initData older than 24 hours
  const nowSec = Math.floor(Date.now() / 1000);
  const maxAgeSec = 24 * 60 * 60;
  if (nowSec - authDate > maxAgeSec) return { ok: false as const, error: "initdata_too_old" };

  // Build data check string
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort(); // lexicographic by key (and value if same)
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeEqualHex(calculatedHash, hash)) {
    return { ok: false as const, error: "bad_hash" };
  }

  const userJson = params.get("user");
  if (!userJson) return { ok: false as const, error: "missing_user" };

  let user: any;
  try {
    user = JSON.parse(userJson);
  } catch {
    return { ok: false as const, error: "bad_user_json" };
  }

  if (!user?.id) return { ok: false as const, error: "missing_user_id" };

  return {
    ok: true as const,
    user: {
      tgUserId: String(user.id),
      firstName: user.first_name ?? "",
      username: user.username ?? "",
    },
  };
}

export type AuthedUser = {
  tgUserId: string;
  firstName: string;
  username: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function requireTelegramAuth(req: Request, res: Response, next: NextFunction) {
  const initData = req.header("X-TG-INIT-DATA");
  const botToken = process.env.BOT_TOKEN;

  if (!initData) return res.status(401).json({ error: "missing_initdata" });
  if (!botToken) return res.status(500).json({ error: "server_missing_bot_token" });

  const result = validateTelegramInitData(initData, botToken);
  if (!result.ok) return res.status(401).json({ error: result.error });

  req.user = result.user;
  next();
}
