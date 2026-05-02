export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência Bancária",
  transfer: "Transferência Bancária",
  cash: "Dinheiro",
  boleto: "Boleto Bancário",
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
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  approved: "Aprovado",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  approved: "bg-blue-100 text-blue-800",
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Paga",
  cancelled: "Cancelada",
};

export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
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
