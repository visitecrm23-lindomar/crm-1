import { PAYMENT_STATUS, COMMISSION_STATUS } from "@workspace/permissions";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência",
  transfer: "Transferência",
  cash: "Dinheiro",
  boleto: "Boleto",
  installment: "Parcelado",
};

export const TRIP_TYPE_LABELS: Record<string, string> = {
  excursao: "Excursão",
  bate_volta: "Bate-Volta",
  trilha: "Trilha",
  rota: "Rota",
  transfer: "Transfer",
  pacote_fechado: "Pacote Fechado",
  personalizada: "Viagem Personalizada",
  excursion: "Excursão",
  package: "Pacote Fechado",
  custom: "Viagem Personalizada",
  tour: "Passeio",
  cruise: "Cruzeiro",
  hotel: "Hotel",
  service: "Serviço",
};

export const AGE_CATEGORY_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  senior: "Sênior",
  baby: "Bebê",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  [PAYMENT_STATUS.PENDING]: "Pendente",
  [PAYMENT_STATUS.PAID]: "Pago",
  [PAYMENT_STATUS.OVERDUE]: "Vencido",
  [PAYMENT_STATUS.CANCELLED]: "Cancelado",
  [PAYMENT_STATUS.APPROVED]: "Aprovado",
  [PAYMENT_STATUS.FAILED]: "Falhou",
  [PAYMENT_STATUS.REFUNDED]: "Reembolsado",
  [PAYMENT_STATUS.CHARGED_BACK]: "Estornado",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  [PAYMENT_STATUS.PENDING]: "bg-yellow-100 text-yellow-800",
  [PAYMENT_STATUS.PAID]: "bg-green-100 text-green-800",
  [PAYMENT_STATUS.OVERDUE]: "bg-red-100 text-red-800",
  [PAYMENT_STATUS.CANCELLED]: "bg-gray-100 text-gray-800",
  [PAYMENT_STATUS.APPROVED]: "bg-blue-100 text-blue-800",
  [PAYMENT_STATUS.FAILED]: "bg-red-100 text-red-800",
  [PAYMENT_STATUS.REFUNDED]: "bg-orange-100 text-orange-800",
  [PAYMENT_STATUS.CHARGED_BACK]: "bg-red-100 text-red-800",
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  [COMMISSION_STATUS.PENDING]: "Pendente",
  [COMMISSION_STATUS.APPROVED]: "Aprovada",
  [COMMISSION_STATUS.PAID]: "Paga",
  [COMMISSION_STATUS.CANCELLED]: "Cancelada",
};

export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  [COMMISSION_STATUS.PENDING]: "bg-yellow-100 text-yellow-800",
  [COMMISSION_STATUS.APPROVED]: "bg-blue-100 text-blue-800",
  [COMMISSION_STATUS.PAID]: "bg-green-100 text-green-800",
  [COMMISSION_STATUS.CANCELLED]: "bg-gray-100 text-gray-800",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  transport: "Transporte",
  accommodation: "Hospedagem",
  food: "Alimentação",
  marketing: "Marketing",
  administrative: "Administrativo",
  commission: "Comissão",
  other: "Outro",
};
