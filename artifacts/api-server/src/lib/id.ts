import { randomBytes } from "crypto";

export function generateId(): string {
  return randomBytes(12).toString("base64url");
}

export function generateVoucherCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Generates a referral code in NOME2026 format (up to 4 letters from name + current year).
 * @param clientName - The client's full name
 * @returns A deterministic base code like "JOAO2026"
 */
export function generateReferralCode(clientName: string): string {
  const year = new Date().getFullYear();
  const namePart = (clientName ?? "REF").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
  return `${namePart}${year}`;
}
