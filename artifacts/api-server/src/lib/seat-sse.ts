import type { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function addSeatClient(tripId: string, res: Response): void {
  if (!clients.has(tripId)) clients.set(tripId, new Set());
  clients.get(tripId)!.add(res);
}

export function removeSeatClient(tripId: string, res: Response): void {
  const set = clients.get(tripId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(tripId);
}

export interface SeatUpdatePayload {
  tripId: string;
  seats: Array<{ number: string; status: string }>;
}

export function emitSeatUpdate(payload: SeatUpdatePayload): void {
  const set = clients.get(payload.tripId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  const dead: Response[] = [];
  for (const res of set) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) removeSeatClient(payload.tripId, res);
}
