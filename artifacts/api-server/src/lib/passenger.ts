export function deriveAgeCategory(birthDate: Date | null): "child" | "adult" | "senior" {
  if (!birthDate) return "adult";
  const ageMs = Date.now() - birthDate.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 12) return "child";
  if (age >= 60) return "senior";
  return "adult";
}

export function getAgeYears(birthDate: Date | null): number {
  if (!birthDate) return 30;
  return Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
