export function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export function formatCPF(cpf: string): string {
  const c = cleanCPF(cpf);
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function isValidCPF(cpf: string): boolean {
  const c = cleanCPF(cpf);
  if (c.length !== 11) return false;

  const allSame = /^(\d)\1{10}$/.test(c);
  if (allSame) return false;

  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(c[i - 1]) * (11 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(c[9])) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(c[i - 1]) * (12 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(c[10])) return false;

  return true;
}

export function validateCPF(cpf: string): string {
  if (!cpf || !cpf.trim()) throw new Error("CPF é obrigatório");
  const cleaned = cleanCPF(cpf);
  if (!isValidCPF(cleaned)) throw new Error("CPF inválido");
  return cleaned;
}
