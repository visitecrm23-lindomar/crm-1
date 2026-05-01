export function computeReservationTotal(priceAdult: number, seats: string[]): number {
  return priceAdult * seats.length;
}

export interface PassengerPrices {
  priceAdult: number;
  adultSeats: string[];
  priceChild?: number | null;
  childSeats?: string[];
  priceSenior?: number | null;
  seniorSeats?: string[];
}

export function computeDetailedTotal(prices: PassengerPrices): number {
  const adultTotal = prices.priceAdult * prices.adultSeats.length;
  const childTotal = (prices.priceChild ?? prices.priceAdult) * (prices.childSeats?.length ?? 0);
  const seniorTotal = (prices.priceSenior ?? prices.priceAdult) * (prices.seniorSeats?.length ?? 0);
  return Math.round((adultTotal + childTotal + seniorTotal) * 100) / 100;
}

export function applyDiscount(totalValue: number, totalDiscount: number): number {
  return Math.max(0, Math.round((totalValue - totalDiscount) * 100) / 100);
}
