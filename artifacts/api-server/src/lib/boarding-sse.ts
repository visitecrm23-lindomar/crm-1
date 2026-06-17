import type { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function addBoardingClient(tripId: string, res: Response): void {
  if (!clients.has(tripId)) clients.set(tripId, new Set());
  clients.get(tripId)!.add(res);
}

export function removeBoardingClient(tripId: string, res: Response): void {
  const set = clients.get(tripId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(tripId);
}

export function emitBoardingUpdate(tripId: string): void {
  const set = clients.get(tripId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify({ type: "refresh", tripId });
  const dead: Response[] = [];
  for (const res of set) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) removeBoardingClient(tripId, res);
}
