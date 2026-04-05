import { randomBytes } from "crypto";

export function generateId(): string {
  return randomBytes(12).toString("base64url");
}

export function generateVoucherCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
