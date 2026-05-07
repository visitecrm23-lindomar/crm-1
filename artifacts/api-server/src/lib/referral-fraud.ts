export interface FraudDetectionInput {
  conversionIp: string | null;
  trackerIp: string | null;
  firstVisit: Date | null;
  conversionAt: Date;
  referredEmail: string;
  referrerEmail: string | null;
}

export interface FraudDetectionResult {
  flagged: boolean;
  reason: string | null;
}

function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  const atIdx = lower.indexOf("@");
  if (atIdx < 0) return lower;
  const domain = lower.slice(atIdx + 1);
  const localRaw = lower.slice(0, atIdx);
  const localWithoutAlias = localRaw.split("+")[0];
  return `${localWithoutAlias}@${domain}`;
}

export function detectReferralFraud(input: FraudDetectionInput): FraudDetectionResult {
  const reasons: string[] = [];

  if (
    input.conversionIp &&
    input.trackerIp &&
    input.conversionIp === input.trackerIp
  ) {
    reasons.push("Mesmo IP do indicador e indicado");
  }

  if (input.firstVisit) {
    const elapsedMs = input.conversionAt.getTime() - input.firstVisit.getTime();
    if (elapsedMs >= 0 && elapsedMs < 60_000) {
      reasons.push(`Conversão imediata (${Math.round(elapsedMs / 1000)}s após o clique)`);
    }
  }

  if (input.referrerEmail && input.referredEmail) {
    const normReferrer = normalizeEmail(input.referrerEmail);
    const normReferred = normalizeEmail(input.referredEmail);
    if (normReferrer === normReferred) {
      reasons.push("E-mail suspeito (alias do mesmo endereço)");
    }
  }

  if (reasons.length > 0) {
    return { flagged: true, reason: reasons.join("; ") };
  }
  return { flagged: false, reason: null };
}
