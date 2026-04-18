import { Router } from "express";
import { db } from "@workspace/db";
import { tripsTable, reservationsTable, passengersTable, clientsTable, tenantsTable, vehicleLayoutsTable } from "@workspace/db";
import type { LayoutCell, FixedCostItem, VariableCostItem } from "@workspace/db";
import { eq, and, ilike, sql, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { deleteOrphanedFile } from "../lib/uploadthing";
import { deriveAgeCategory, getAgeYears } from "../lib/passenger";
import { CreateTripBody, UpdateTripBody } from "@workspace/api-zod";

type SeatMapEntry = { row: number; col: number; status: string; type?: string };

function generateSeatMapFromLayout(
  cells: LayoutCell[],
  numberingType: string,
): Record<string, SeatMapEntry> {
  const seatMap: Record<string, SeatMapEntry> = {};
  const seatTypes = ["seat", "vip", "accessible"] as const;
  const seatCells = cells
    .filter(c => seatTypes.includes(c.type as (typeof seatTypes)[number]))
    .sort((a, b) => {
      const fa = a.floor ?? 1, fb = b.floor ?? 1;
      if (fa !== fb) return fa - fb;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

  const keyOf = (c: LayoutCell) => `${c.floor ?? 1}-${c.row}-${c.col}`;
  const seatLabels = new Map<string, string>();

  const maxFloor = Math.max(...cells.map(c => c.floor ?? 1), 1);
  const isMultiFloor = maxFloor > 1;

  if (numberingType === "by_row") {
    // Group by (floor, row) to avoid label collisions across floors
    const floorRowGroups = new Map<string, LayoutCell[]>();
    for (const cell of seatCells) {
      const floor = cell.floor ?? 1;
      const groupKey = `${floor}-${cell.row}`;
      if (!floorRowGroups.has(groupKey)) floorRowGroups.set(groupKey, []);
      floorRowGroups.get(groupKey)!.push(cell);
    }
    for (const [groupKey, groupCells] of [...floorRowGroups.entries()].sort(([a], [b]) => {
      const [fa, ra] = a.split("-").map(Number);
      const [fb, rb] = b.split("-").map(Number);
      return fa !== fb ? fa - fb : ra - rb;
    })) {
      const [floor, row] = groupKey.split("-").map(Number);
      groupCells.sort((a, b) => a.col - b.col);
      groupCells.forEach((cell, i) => {
        const floorPrefix = isMultiFloor ? `A${floor}-` : "";
        seatLabels.set(keyOf(cell), `${floorPrefix}${row}${String.fromCharCode(65 + i)}`);
      });
    }
  } else {
    seatCells.forEach((cell, i) => {
      seatLabels.set(keyOf(cell), cell.label ?? String(i + 1));
    });
  }

  const nonSeatCounters: Record<string, number> = {};
  const typePrefix: Record<string, string> = { wc: "WC", stairs: "ESC", fridge: "FRG", blocked: "BLQ" };

  for (const cell of cells) {
    if (cell.type === "empty") continue;
    const k = keyOf(cell);
    if (seatTypes.includes(cell.type as (typeof seatTypes)[number])) {
      const label = cell.label || seatLabels.get(k) || String(cells.indexOf(cell) + 1);
      seatMap[label] = { row: cell.row, col: cell.col, status: "available", type: cell.type };
    } else {
      nonSeatCounters[cell.type] = (nonSeatCounters[cell.type] ?? 0) + 1;
      const n = nonSeatCounters[cell.type];
      const prefix = typePrefix[cell.type] ?? cell.type.toUpperCase();
      const label = `${prefix}${n > 1 ? n : ""}`;
      seatMap[label] = { row: cell.row, col: cell.col, status: cell.type, type: cell.type };
    }
  }

  return seatMap;
}

const router = Router();

function formatTrip(t: typeof tripsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    destination: t.destination,
    destinationCity: t.destinationCity,
    destinationState: t.destinationState,
    type: t.type,
    category: t.category,
    departureDate: t.departureDate.toISOString(),
    returnDate: t.returnDate?.toISOString() ?? null,
    totalCapacity: t.totalCapacity,
    availableSeats: t.availableSeats,
    reservedSeats: t.reservedSeats,
    confirmedSeats: t.confirmedSeats,
    priceAdult: Number(t.priceAdult),
    priceChild: t.priceChild ? Number(t.priceChild) : null,
    priceSenior: t.priceSenior ? Number(t.priceSenior) : null,
    inclusions: t.inclusions ?? [],
    exclusions: t.exclusions ?? [],
    coverImage: t.coverImage,
    gallery: t.gallery ?? [],
    itinerary: t.itinerary ?? [],
    boardingPoints: t.boardingPoints ?? [],
    status: t.status,
    isPublic: t.isPublic,
    isFeatured: t.isFeatured,
    vehiclePlate: t.vehiclePlate,
    vehicleType: t.vehicleType,
    driverName: t.driverName,
    tourGuide: t.tourGuide,
    tripOrganizer: t.tripOrganizer,
    seatLayout: t.seatLayout,
    layoutId: t.layoutId ?? null,
    fixedCosts: Array.isArray(t.fixedCosts) ? t.fixedCosts as FixedCostItem[] : [],
    variableCosts: Array.isArray(t.variableCosts) ? t.variableCosts as VariableCostItem[] : [],
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/trips", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { search, status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(tripsTable.tenantId, me.tenantId)];
    if (search) conditions.push(ilike(tripsTable.name, `%${search}%`) as ReturnType<typeof eq>);
    if (status) conditions.push(eq(tripsTable.status, status));

    const trips = await db.select().from(tripsTable)
      .where(and(...conditions))
      .orderBy(desc(tripsTable.departureDate))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(tripsTable).where(and(...conditions));

    res.json({ data: trips.map(formatTrip), total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Error listing trips");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trips", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) {
      res.status(403).json({ error: "Apenas administradores podem criar viagens" });
      return;
    }
    const parsed = CreateTripBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    const slug = parsed.data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + id.slice(0, 4);

    let seatMap: Record<string, unknown> = {};
    const layout = parsed.data.seatLayout ?? "2x2";
    let totalCapacity = parsed.data.totalCapacity;
    let layoutId: string | null = parsed.data.layoutId ?? null;

    if (layoutId) {
      const [layoutRow] = await db.select().from(vehicleLayoutsTable)
        .where(and(eq(vehicleLayoutsTable.id, layoutId), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!layoutRow) { res.status(400).json({ error: "Layout não encontrado" }); return; }
      const cells = (layoutRow.cells ?? []) as LayoutCell[];
      seatMap = generateSeatMapFromLayout(cells, layoutRow.numberingType);
      const seatCount = cells.filter(c => ["seat", "vip", "accessible"].includes(c.type)).length;
      totalCapacity = seatCount;
    } else {
      const cols = layout === "2x1" ? 3 : 4;
      const rows = Math.ceil(totalCapacity / cols);
      let seatNum = 1;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          if (seatNum <= totalCapacity) {
            seatMap[`${seatNum}`] = { row: r, col: c, status: "available" };
            seatNum++;
          }
        }
      }
    }

    await db.insert(tripsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      destination: parsed.data.destination,
      destinationCity: parsed.data.destinationCity,
      destinationState: parsed.data.destinationState,
      type: parsed.data.type,
      category: parsed.data.category,
      departureDate: new Date(parsed.data.departureDate),
      returnDate: parsed.data.returnDate ? new Date(parsed.data.returnDate) : null,
      totalCapacity,
      availableSeats: totalCapacity,
      priceAdult: String(parsed.data.priceAdult),
      priceChild: parsed.data.priceChild ? String(parsed.data.priceChild) : null,
      priceSenior: parsed.data.priceSenior ? String(parsed.data.priceSenior) : null,
      inclusions: parsed.data.inclusions ?? [],
      exclusions: parsed.data.exclusions ?? [],
      coverImage: parsed.data.coverImage ?? null,
      seatLayout: layout,
      layoutId: layoutId ?? null,
      itinerary: parsed.data.itinerary ?? null,
      boardingPoints: parsed.data.boardingPoints ?? [],
      fixedCosts: Array.isArray(parsed.data.fixedCosts) ? (parsed.data.fixedCosts as FixedCostItem[]) : [],
      variableCosts: Array.isArray(parsed.data.variableCosts) ? (parsed.data.variableCosts as VariableCostItem[]) : [],
      gallery: parsed.data.gallery ?? [],
      seatMap,
      vehiclePlate: parsed.data.vehiclePlate ?? null,
      vehicleType: parsed.data.vehicleType ?? null,
      driverName: parsed.data.driverName ?? null,
      tourGuide: parsed.data.tourGuide ?? null,
      tripOrganizer: parsed.data.tripOrganizer ?? null,
      createdById: me.id,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(500).json({ error: "Failed to create trip" }); return; }
    res.status(201).json(formatTrip(trip));
  } catch (err) {
    req.log.error({ err }, "Error creating trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trips/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatTrip(trip));
  } catch (err) {
    req.log.error({ err }, "Error fetching trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/trips/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateTripBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof tripsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.isPublic != null) updates.isPublic = parsed.data.isPublic;
    if (parsed.data.isFeatured != null) updates.isFeatured = parsed.data.isFeatured;
    if (parsed.data.departureDate != null) updates.departureDate = new Date(parsed.data.departureDate);
    if (parsed.data.returnDate !== undefined) updates.returnDate = parsed.data.returnDate ? new Date(parsed.data.returnDate) : null;
    if (parsed.data.priceAdult != null) updates.priceAdult = String(parsed.data.priceAdult);
    if (parsed.data.priceChild !== undefined) updates.priceChild = parsed.data.priceChild ? String(parsed.data.priceChild) : null;
    if (parsed.data.priceSenior !== undefined) updates.priceSenior = parsed.data.priceSenior ? String(parsed.data.priceSenior) : null;
    if (parsed.data.totalCapacity != null) updates.totalCapacity = parsed.data.totalCapacity;
    if (parsed.data.coverImage !== undefined) updates.coverImage = parsed.data.coverImage ?? null;
    if (parsed.data.seatLayout !== undefined) updates.seatLayout = parsed.data.seatLayout ?? null;
    if (parsed.data.layoutId !== undefined) updates.layoutId = parsed.data.layoutId ?? null;

    const capacityOrLayoutChanged =
      parsed.data.totalCapacity != null || parsed.data.seatLayout !== undefined || parsed.data.layoutId !== undefined;
    const coverImageChanged = parsed.data.coverImage !== undefined;

    if (parsed.data.inclusions != null) updates.inclusions = parsed.data.inclusions;
    if (parsed.data.exclusions != null) updates.exclusions = parsed.data.exclusions;
    if (parsed.data.vehiclePlate !== undefined) updates.vehiclePlate = parsed.data.vehiclePlate ?? null;
    if (parsed.data.vehicleType !== undefined) updates.vehicleType = parsed.data.vehicleType ?? null;
    if (parsed.data.driverName !== undefined) updates.driverName = parsed.data.driverName ?? null;
    if (parsed.data.tourGuide !== undefined) updates.tourGuide = parsed.data.tourGuide ?? null;
    if (parsed.data.tripOrganizer !== undefined) updates.tripOrganizer = parsed.data.tripOrganizer ?? null;
    if (parsed.data.destination !== undefined) updates.destination = parsed.data.destination ?? "";
    if (parsed.data.destinationCity !== undefined) updates.destinationCity = parsed.data.destinationCity ?? "";
    if (parsed.data.destinationState !== undefined) updates.destinationState = parsed.data.destinationState ?? "";
    if (parsed.data.type !== undefined) updates.type = parsed.data.type ?? "";
    if (parsed.data.category !== undefined) updates.category = parsed.data.category ?? "";
    if (parsed.data.itinerary !== undefined) updates.itinerary = parsed.data.itinerary ?? null;
    if (parsed.data.boardingPoints !== undefined) updates.boardingPoints = parsed.data.boardingPoints ?? [];
    if (parsed.data.fixedCosts !== undefined) updates.fixedCosts = Array.isArray(parsed.data.fixedCosts) ? (parsed.data.fixedCosts as FixedCostItem[]) : [];
    if (parsed.data.variableCosts !== undefined) updates.variableCosts = Array.isArray(parsed.data.variableCosts) ? (parsed.data.variableCosts as VariableCostItem[]) : [];
    if (parsed.data.gallery !== undefined) updates.gallery = parsed.data.gallery ?? [];

    let oldCoverImage: string | null | undefined;
    if (capacityOrLayoutChanged || coverImageChanged) {
      const [currentTrip] = await db.select().from(tripsTable)
        .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!currentTrip) { res.status(404).json({ error: "Not found" }); return; }
      if (coverImageChanged) oldCoverImage = currentTrip.coverImage;

      if (capacityOrLayoutChanged) {
        const newLayoutId = parsed.data.layoutId !== undefined
          ? (parsed.data.layoutId ?? null)
          : (currentTrip.layoutId ?? null);

        let newSeatMap: Record<string, { row: number; col: number; status: string; type?: string }> = {};
        let newCapacity = parsed.data.totalCapacity ?? currentTrip.totalCapacity;

        if (newLayoutId) {
          const [layoutRow] = await db.select().from(vehicleLayoutsTable)
            .where(and(eq(vehicleLayoutsTable.id, newLayoutId), eq(vehicleLayoutsTable.tenantId, me.tenantId)))
            .limit(1);
          if (!layoutRow) { res.status(400).json({ error: "Layout não encontrado" }); return; }
          const cells = (layoutRow.cells ?? []) as LayoutCell[];
          const generated = generateSeatMapFromLayout(cells, layoutRow.numberingType);
          newSeatMap = generated as typeof newSeatMap;
          newCapacity = cells.filter(c => ["seat", "vip", "accessible"].includes(c.type)).length;
          updates.totalCapacity = newCapacity;
        } else {
          const newLayout = parsed.data.seatLayout ?? currentTrip.seatLayout ?? "2x2";
          const newCols = newLayout === "2x1" ? 3 : 4;
          const newRows = Math.ceil(newCapacity / newCols);
          let seatNum = 1;
          for (let r = 1; r <= newRows; r++) {
            for (let c = 1; c <= newCols; c++) {
              if (seatNum <= newCapacity) {
                newSeatMap[`${seatNum}`] = { row: r, col: c, status: "available" };
                seatNum++;
              }
            }
          }
        }

        const activeReservations = await db.select().from(reservationsTable)
          .where(and(
            eq(reservationsTable.tripId, req.params.id),
            eq(reservationsTable.tenantId, me.tenantId),
            inArray(reservationsTable.status, ["pending", "confirmed"]),
          ));

        let reservedSeats = 0;
        let confirmedSeats = 0;
        for (const r of activeReservations) {
          for (const seat of r.seats) {
            if (newSeatMap[seat]) {
              newSeatMap[seat].status = r.status === "confirmed" ? "confirmed" : "reserved";
              if (r.status === "confirmed") confirmedSeats++;
              else reservedSeats++;
            }
          }
        }
        const occupiedTotal = reservedSeats + confirmedSeats;
        updates.seatMap = newSeatMap;
        updates.availableSeats = Math.max(0, newCapacity - occupiedTotal);
        updates.reservedSeats = reservedSeats;
        updates.confirmedSeats = confirmedSeats;
      }
    }

    await db.update(tripsTable).set(updates)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)));

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Not found" }); return; }
    if (coverImageChanged) {
      await deleteOrphanedFile(oldCoverImage, parsed.data.coverImage, req.log);
    }
    res.json(formatTrip(trip));
  } catch (err) {
    req.log.error({ err }, "Error updating trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/trips/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [existing] = await db.select({ coverImage: tripsTable.coverImage })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    await db.delete(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)));
    if (existing?.coverImage) {
      await deleteOrphanedFile(existing.coverImage, null, req.log);
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trips/:id/seat-map", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Not found" }); return; }

    const ACTIVE_STATUSES = ["pending", "confirmed"] as const;
    const reservations = await db.select().from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, req.params.id),
        eq(reservationsTable.tenantId, me.tenantId),
        inArray(reservationsTable.status, [...ACTIVE_STATUSES]),
      ));

    const occupiedSeats: Record<string, { reservationId: string; passengerName: string; seatStatus: string }> = {};
    for (const r of reservations) {
      const seatStatus = r.status === "confirmed" ? "confirmed" : "reserved";
      for (const seat of r.seats) {
        occupiedSeats[seat] = { reservationId: r.id, passengerName: "", seatStatus };
      }
    }

    const seatMap = trip.seatMap as Record<string, { row: number; col: number; status: string; type?: string }>;
    const seats = Object.entries(seatMap).map(([num, data]) => ({
      number: num,
      row: data.row,
      col: data.col,
      type: data.type ?? "seat",
      status: occupiedSeats[num]
        ? occupiedSeats[num].seatStatus
        : (data.type && !["seat", "vip", "accessible"].includes(data.type) ? data.type : "available"),
      passengerName: occupiedSeats[num]?.passengerName ?? null,
      reservationId: occupiedSeats[num]?.reservationId ?? null,
    }));

    const maxCol = Math.max(...seats.map(s => s.col), 4);
    res.json({
      tripId: trip.id,
      layout: trip.seatLayout ?? "2x2",
      totalSeats: trip.totalCapacity,
      cols: maxCol,
      seats,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching seat map");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trips/:id/boarding-panel", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

    const reservations = await db.select().from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, trip.id),
        eq(reservationsTable.tenantId, me.tenantId),
        sql`${reservationsTable.status} NOT IN ('cancelled', 'refunded')`,
      ));

    if (reservations.length === 0) {
      const [tenantEarly] = await db.select({ name: tenantsTable.name, cnpj: tenantsTable.cnpj }).from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1);
      res.json({
        tripId: trip.id,
        tripName: trip.name,
        departureDate: trip.departureDate.toISOString(),
        totalPassengers: 0,
        checkedIn: 0,
        passengers: [],
        tenantName: tenantEarly?.name ?? "",
        tenantCnpj: tenantEarly?.cnpj ?? null,
      });
      return;
    }

    const reservationIds = reservations.map(r => r.id);
    const clientIds = [...new Set(reservations.map(r => r.clientId))];

    const [passengers, clients, [tenant]] = await Promise.all([
      db.select().from(passengersTable).where(inArray(passengersTable.reservationId, reservationIds)),
      db.select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, whatsapp: clientsTable.whatsapp }).from(clientsTable).where(inArray(clientsTable.id, clientIds)),
      db.select({ name: tenantsTable.name, cnpj: tenantsTable.cnpj }).from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1),
    ]);

    const reservationMap = new Map(reservations.map(r => [r.id, r]));
    const clientMap = new Map(clients.map(c => [c.id, c]));

    const boardingPassengers = passengers.map(p => {
      const reservation = reservationMap.get(p.reservationId);
      const client = reservation ? clientMap.get(reservation.clientId) : undefined;
      return {
        id: p.id,
        reservationId: p.reservationId,
        voucherCode: reservation?.voucherCode ?? "",
        reservationNumber: reservation?.reservationNumber ?? null,
        clientName: client?.name ?? "—",
        name: p.name,
        cpf: p.cpf ?? null,
        seatNumber: p.seatNumber ?? null,
        ageCategory: p.ageCategory,
        checkedInAt: p.checkedInAt?.toISOString() ?? null,
        birthDate: p.birthDate?.toISOString() ?? null,
        phone: client?.phone ?? null,
        whatsapp: client?.whatsapp ?? null,
      };
    });

    const checkedIn = boardingPassengers.filter(p => p.checkedInAt !== null).length;

    res.json({
      tripId: trip.id,
      tripName: trip.name,
      departureDate: trip.departureDate.toISOString(),
      totalPassengers: boardingPassengers.length,
      checkedIn,
      passengers: boardingPassengers,
      tenantName: tenant?.name ?? "",
      tenantCnpj: tenant?.cnpj ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching boarding panel");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trips/:id/sync-passengers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [trip] = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

    const reservations = await db.select().from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, trip.id),
        eq(reservationsTable.tenantId, me.tenantId),
        sql`${reservationsTable.status} NOT IN ('cancelled', 'refunded')`,
      ));

    if (reservations.length === 0) {
      res.json({ created: 0 });
      return;
    }

    const reservationIds = reservations.map(r => r.id);
    const existingPassengers = await db.select({ reservationId: passengersTable.reservationId })
      .from(passengersTable)
      .where(inArray(passengersTable.reservationId, reservationIds));
    const reservationIdsWithPassengers = new Set(existingPassengers.map(p => p.reservationId));

    const reservationsNeedingPassenger = reservations.filter(r => !reservationIdsWithPassengers.has(r.id));

    if (reservationsNeedingPassenger.length === 0) {
      res.json({ created: 0 });
      return;
    }

    const clientIds = [...new Set(reservationsNeedingPassenger.map(r => r.clientId))];
    const clients = await db.select().from(clientsTable)
      .where(inArray(clientsTable.id, clientIds));
    const clientMap = new Map(clients.map(c => [c.id, c]));

    let created = 0;
    for (const r of reservationsNeedingPassenger) {
      const client = clientMap.get(r.clientId);
      if (!client) continue;
      const inserted = await db.insert(passengersTable).values({
        id: generateId(),
        reservationId: r.id,
        name: client.name,
        cpf: client.cpf ?? null,
        rg: client.rg ?? null,
        birthDate: client.birthDate ?? null,
        ageCategory: deriveAgeCategory(client.birthDate ?? null),
        seatNumber: r.seats?.[0] ?? null,
        isChildUnder7: getAgeYears(client.birthDate ?? null) < 7,
        isPrimary: true,
      }).onConflictDoNothing().returning({ id: passengersTable.id });
      if (inserted.length > 0) created++;
    }

    res.json({ created });
  } catch (err) {
    req.log.error({ err }, "Error syncing passengers");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
