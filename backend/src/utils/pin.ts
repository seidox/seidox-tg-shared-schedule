import crypto from "crypto";

export function generatePin6(): string {
  // 6 цифр, включая ведущие нули
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

export function hashPin(pin: string): string {
  // Простое SHA256 достаточно, т.к. PIN живёт 10 минут и одноразовый
  return crypto.createHash("sha256").update(pin).digest("hex");
}
