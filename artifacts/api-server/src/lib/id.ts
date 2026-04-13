import { randomBytes } from "crypto";

export function generateId(): string {
  return randomBytes(12).toString("base64url");
}

export function generateVoucherCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Generates the base referral code in NOME2026 format (up to 4 letters from name + current year).
 * Uniqueness per tenant must be verified by the caller using a DB check loop.
 * @param clientName - The client's full name
 * @param _tenantId - Tenant ID (used for uniqueness enforcement in calling code)
 * @returns A base code like "JOAO2026"
 */
export function generateReferralCode(clientName: string, _tenantId?: string): string {
  const year = new Date().getFullYear();
  const namePart = (clientName ?? "REF").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "REF";
  return `${namePart}${year}`;
}
