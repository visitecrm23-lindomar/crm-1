import type { Trip } from "@workspace/api-client-react";
import type { TripStatus } from "@workspace/permissions";

export interface BoardingPoint { id: string; name: string; time?: string; address?: string; boardingLocationId?: string; }
export interface ItineraryDay { day: number; title: string; description: string; }
export interface FixedCostItem { id: string; category: string; description: string; value: number; }
export interface VariableCostItem { id: string; category: string; description: string; valuePax: number; }
export interface FreePassenger { id: string; name: string; cpf: string; whatsapp: string; role: "organizer" | "guide"; seatNumber: string | null; }

export interface TripFormData {
  name: string; description: string;
  destination: string; destinationCity: string; destinationState: string;
  originCity: string; originState: string;
  type: string; category: string;
  departureDate: string; returnDate: string;
  departureTime: string; returnTime: string;
  totalCapacity: string; seatLayout: string;
  layoutId: string;
  priceAdult: string; priceChild: string; priceSenior: string;
  inclusions: string[]; exclusions: string[];
  coverImage: string;
  vehicleType: string; vehiclePlate: string; driverName: string; tourGuide: string; tripOrganizer: string;
  driver1Cpf: string; driver1Cnh: string; driver1CnhCategory: string; driver1CnhExpiry: string;
  driver2Name: string; driver2Cpf: string; driver2Cnh: string; driver2CnhCategory: string; driver2CnhExpiry: string;
  tourGuideCpf: string; tourGuideRegistration: string;
  status: TripStatus;
  boardingPoints: BoardingPoint[];
  itinerary: ItineraryDay[];
  fixedCostItems: FixedCostItem[];
  variableCostItems: VariableCostItem[];
  gallery: string[];
  freeOrganizers: string;
  freeGuides: string;
  freePassengers: FreePassenger[];
}

export interface TripFinancialReport {
  reservationCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalPending: number;
  totalExpenses: number;
  netProfit: number;
  revenueByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
}

export const newBP = (): BoardingPoint => ({ id: crypto.randomUUID(), name: "", time: "", address: "" });
export const newDay = (day: number): ItineraryDay => ({ day, title: "", description: "" });

export const EMPTY_FORM: TripFormData = {
  name: "", description: "", destination: "", destinationCity: "", destinationState: "",
  originCity: "", originState: "",
  type: "excursao", category: "standard", departureDate: "", returnDate: "",
  departureTime: "", returnTime: "",
  totalCapacity: "46", seatLayout: "2x2", layoutId: "",
  priceAdult: "", priceChild: "", priceSenior: "",
  inclusions: ["Transporte ida e volta", "Café da manhã", "Guia turístico", "Seguro de viagem"],
  exclusions: ["Despesas pessoais", "Almoço e jantar", "Ingresso para atrações opcionais"],
  coverImage: "",
  vehicleType: "", vehiclePlate: "", driverName: "", tourGuide: "", tripOrganizer: "", status: "draft",
  driver1Cpf: "", driver1Cnh: "", driver1CnhCategory: "", driver1CnhExpiry: "",
  driver2Name: "", driver2Cpf: "", driver2Cnh: "", driver2CnhCategory: "", driver2CnhExpiry: "",
  tourGuideCpf: "", tourGuideRegistration: "",
  boardingPoints: [newBP()], itinerary: [newDay(1)], fixedCostItems: [], variableCostItems: [], gallery: [],
  freeOrganizers: "0", freeGuides: "0", freePassengers: [],
};

export const toTripFormData = (trip: Trip): TripFormData => ({
  name: trip.name,
  description: trip.description ?? "",
  destination: trip.destination,
  destinationCity: trip.destinationCity,
  destinationState: trip.destinationState,
  originCity: trip.originCity ?? "",
  originState: trip.originState ?? "",
  type: trip.type,
  category: trip.category,
  departureDate: trip.departureDate.split("T")[0],
  returnDate: trip.returnDate?.split("T")[0] ?? "",
  departureTime: trip.departureTime ?? "",
  returnTime: trip.returnTime ?? "",
  totalCapacity: String(trip.totalCapacity),
  seatLayout: trip.seatLayout ?? "2x2",
  layoutId: trip.layoutId ?? "",
  priceAdult: String(trip.priceAdult),
  priceChild: trip.priceChild ? String(trip.priceChild) : "",
  priceSenior: trip.priceSenior ? String(trip.priceSenior) : "",
  inclusions: trip.inclusions ?? [],
  exclusions: trip.exclusions ?? [],
  coverImage: trip.coverImage ?? "",
  vehicleType: trip.vehicleType ?? "",
  vehiclePlate: trip.vehiclePlate ?? "",
  driverName: trip.driverName ?? "",
  tourGuide: trip.tourGuide ?? "",
  tripOrganizer: trip.tripOrganizer ?? "",
  driver1Cpf: trip.driver1Cpf ?? "",
  driver1Cnh: trip.driver1Cnh ?? "",
  driver1CnhCategory: trip.driver1CnhCategory ?? "",
  driver1CnhExpiry: trip.driver1CnhExpiry ?? "",
  driver2Name: trip.driver2Name ?? "",
  driver2Cpf: trip.driver2Cpf ?? "",
  driver2Cnh: trip.driver2Cnh ?? "",
  driver2CnhCategory: trip.driver2CnhCategory ?? "",
  driver2CnhExpiry: trip.driver2CnhExpiry ?? "",
  tourGuideCpf: trip.tourGuideCpf ?? "",
  tourGuideRegistration: trip.tourGuideRegistration ?? "",
  status: trip.status as TripStatus,
  boardingPoints: trip.boardingPoints?.length ? (trip.boardingPoints as BoardingPoint[]) : [newBP()],
  itinerary: trip.itinerary?.length ? (trip.itinerary as unknown as ItineraryDay[]) : [newDay(1)],
  fixedCostItems: Array.isArray(trip.fixedCosts) ? (trip.fixedCosts as unknown as FixedCostItem[]) : [],
  variableCostItems: Array.isArray(trip.variableCosts) ? (trip.variableCosts as unknown as VariableCostItem[]) : [],
  gallery: trip.gallery ?? [],
  freeOrganizers: String(trip.freeOrganizers ?? 0),
  freeGuides: String(trip.freeGuides ?? 0),
  freePassengers: Array.isArray(trip.freePassengers) ? (trip.freePassengers as FreePassenger[]) : [],
});
