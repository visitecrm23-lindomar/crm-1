export function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

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
  return roundMoney(adultTotal + childTotal + seniorTotal);
}

export function applyDiscount(totalValue: number, totalDiscount: number): number {
  return Math.max(0, roundMoney(totalValue - totalDiscount));
}
