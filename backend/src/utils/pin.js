"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePin6 = generatePin6;
exports.hashPin = hashPin;
const crypto_1 = __importDefault(require("crypto"));
function generatePin6() {
    // 6 цифр, включая ведущие нули
    const n = crypto_1.default.randomInt(0, 1_000_000);
    return n.toString().padStart(6, "0");
}
function hashPin(pin) {
    // Простое SHA256 достаточно, т.к. PIN живёт 10 минут и одноразовый
    return crypto_1.default.createHash("sha256").update(pin).digest("hex");
}
//# sourceMappingURL=pin.js.map