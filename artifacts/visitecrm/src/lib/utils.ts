import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@workspace/shared";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(v: number): string {
  return formatBRL(v);
}

export function formatCurrencyBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Grátis";
  const num = Number(value);
  if (num === 0) return "Grátis";
  return formatCurrency(num);
}

export function formatDate(d: string): string {
  try {
    return format(new Date(d.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return d;
  }
}

export function formatDateShort(d?: string | null): string | null {
  if (!d) return null;
  try {
    const clean = d.length <= 10 ? d + "T12:00:00" : d;
    return new Date(clean).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function formatDateTime(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export { isValidCpf as validateCpf, formatCpf } from "@workspace/shared";

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    // Mobile: area code (2 digits) + 9 + 8 digits
    return /^[1-9]{2}9[0-9]{8}$/.test(digits);
  }
  if (digits.length === 10) {
    // Landline: area code (2 digits) + 8 digits (starting with 2-8)
    return /^[1-9]{2}[2-8][0-9]{7}$/.test(digits);
  }
  return false;
}
