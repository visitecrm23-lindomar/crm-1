import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import { addSeatClient, removeSeatClient } from "../lib/seat-sse";
import { tripsTable, reservationsTable, passengersTable, clientsTable, tenantsTable, vehicleLayoutsTable, auditLogsTable } from "@workspace/db";
import { checkPlanLimit } from "../lib/planLimits";
import type { LayoutCell, FixedCostItem, VariableCostItem } from "@workspace/db";
import { eq, and, ilike, sql, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { deleteOrphanedFile } from "../lib/uploadthing";
import { deriveAgeCategory, getAgeYears } from "../lib/passenger";
import { CreateTripBody, UpdateTripBody } from "@workspace/api-zod";
import { CalendarSyncService } from "../lib/google-calendar/sync-service";
import { sendManifestEmail } from "@workspace/email";
import { getPdfQueue } from "../queues/index";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { ADMIN_ROLES } from '../lib/tenant';
import { RESERVATION_STATUS, type TripStatus } from "@workspace/permissions";
import { parseTripStatus } from "../lib/status-validators";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";

type SeatMapEntry = { row: number; col: number; floor?: number; status: string; type?: string };

function generateSeatMapFromLayout(
  cells: LayoutCell[],
  numberingType: string,
): Record<string, SeatMapEntry> {
  const seatMap: Record<string, SeatMapEntry> = {};
  const seatTypes = ["seat", "vip", "accessible"] as const;

  const upperFirst = numberingType.endsWith("_upper_first");
  const baseType = upperFirst ? numberingType.replace("_upper_first", "") : numberingType;

  const seatCells = cells
    .filter(c => seatTypes.includes(c.type as (typeof seatTypes)[number]))
    .sort((a, b) => {
      const fa = a.floor ?? 1, fb = b.floor ?? 1;
      if (fa !== fb) return upperFirst ? fb - fa : fa - fb;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

  const keyOf = (c: LayoutCell) => `${c.floor ?? 1}-${c.row}-${c.col}`;
  const seatLabels = new Map<string, string>();

  const maxFloor = Math.max(...cells.map(c => c.floor ?? 1), 1);
  const isMultiFloor = maxFloor > 1;

  if (baseType === "by_row") {
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
      if (fa !== fb) return upperFirst ? fb - fa : fa - fb;
      return ra - rb;
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
      seatMap[label] = { row: cell.row, col: cell.col, floor: cell.floor ?? 1, status: "available", type: cell.type };
    } else {
      nonSeatCounters[cell.type] = (nonSeatCounters[cell.type] ?? 0) + 1;
      const n = nonSeatCounters[cell.type];
      const prefix = typePrefix[cell.type] ?? cell.type.toUpperCase();
      const label = `${prefix}${n > 1 ? n : ""}`;
      seatMap[label] = { row: cell.row, col: cell.col, floor: cell.floor ?? 1, status: cell.type, type: cell.type };
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
    driver1Cpf: t.driver1Cpf ?? null,
    driver1Cnh: t.driver1Cnh ?? null,
    driver1CnhCategory: t.driver1CnhCategory ?? null,
    driver1CnhExpiry: t.driver1CnhExpiry ?? null,
    driver2Name: t.driver2Name ?? null,
    driver2Cpf: t.driver2Cpf ?? null,
    driver2Cnh: t.driver2Cnh ?? null,
    driver2CnhCategory: t.driver2CnhCategory ?? null,
    driver2CnhExpiry: t.driver2CnhExpiry ?? null,
    tourGuideCpf: t.tourGuideCpf ?? null,
    tourGuideRegistration: t.tourGuideRegistration ?? null,
    manifestNumber: t.manifestNumber ?? null,
    seatLayout: t.seatLayout,
    layoutId: t.layoutId ?? null,
    fixedCosts: Array.isArray(t.fixedCosts) ? t.fixedCosts as FixedCostItem[] : [],
    variableCosts: Array.isArray(t.variableCosts) ? t.variableCosts as VariableCostItem[] : [],
    freeOrganizers: t.freeOrganizers ?? null,
    freeGuides: t.freeGuides ?? null,
    originCity: t.originCity ?? null,
    originState: t.originState ?? null,
    departureTime: t.departureTime ?? null,
    returnTime: t.returnTime ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/trips", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { search, status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(tripsTable.tenantId, me.tenantId)];
    if (search) conditions.push(ilike(tripsTable.name, `%${search}%`) as ReturnType<typeof eq>);
    if (status) conditions.push(eq(tripsTable.status, parseTripStatus(status)));

    const trips = await db.select().from(tripsTable)
      .where(and(...conditions))
      .orderBy(desc(tripsTable.departureDate))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(tripsTable).where(and(...conditions));

    res.json({ data: trips.map(formatTrip), total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    next(err);
  }
});

router.post("/trips", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Apenas administradores podem criar viagens", "FORBIDDEN_ROLE")); return; }
    if (me.tenantId) {
      const allowed = await checkPlanLimit(me.tenantId, "trips", req, res);
      if (!allowed) return;
    }
    const parsed = CreateTripBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

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
      if (!layoutRow) { next(new ValidationError("Layout não encontrado", "VALIDATION_ERROR")); return; }
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
      freeOrganizers: parsed.data.freeOrganizers ?? null,
      freeGuides: parsed.data.freeGuides ?? null,
      originCity: parsed.data.originCity ?? null,
      originState: parsed.data.originState ?? null,
      departureTime: parsed.data.departureTime ?? null,
      returnTime: parsed.data.returnTime ?? null,
      createdById: me.id,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      driver1Cpf: parsed.data.driver1Cpf ?? null,
      driver1Cnh: parsed.data.driver1Cnh ?? null,
      driver1CnhCategory: parsed.data.driver1CnhCategory ?? null,
      driver1CnhExpiry: parsed.data.driver1CnhExpiry ?? null,
      driver2Name: parsed.data.driver2Name ?? null,
      driver2Cpf: parsed.data.driver2Cpf ?? null,
      driver2Cnh: parsed.data.driver2Cnh ?? null,
      driver2CnhCategory: parsed.data.driver2CnhCategory ?? null,
      driver2CnhExpiry: parsed.data.driver2CnhExpiry ?? null,
      tourGuideCpf: parsed.data.tourGuideCpf ?? null,
      tourGuideRegistration: parsed.data.tourGuideRegistration ?? null,
    });

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new AppError("Failed to create trip", 500, "TRIP_CREATE_FAILED")); return; }
    res.status(201).json(formatTrip(trip));
    CalendarSyncService.syncTrip(id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.get("/trips/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Trip not found", "TRIP_NOT_FOUND")); return; }
    res.json(formatTrip(trip));
  } catch (err) {
    next(err);
  }
});

router.patch("/trips/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const parsed = UpdateTripBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    const updates: Partial<typeof tripsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.status != null) updates.status = parseTripStatus(parsed.data.status);
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
    if (parsed.data.freeOrganizers !== undefined) updates.freeOrganizers = parsed.data.freeOrganizers ?? null;
    if (parsed.data.freeGuides !== undefined) updates.freeGuides = parsed.data.freeGuides ?? null;
    if (parsed.data.originCity !== undefined) updates.originCity = parsed.data.originCity ?? null;
    if (parsed.data.originState !== undefined) updates.originState = parsed.data.originState ?? null;
    if (parsed.data.departureTime !== undefined) updates.departureTime = parsed.data.departureTime ?? null;
    if (parsed.data.returnTime !== undefined) updates.returnTime = parsed.data.returnTime ?? null;
    if (parsed.data.driver1Cpf !== undefined) updates.driver1Cpf = parsed.data.driver1Cpf ?? null;
    if (parsed.data.driver1Cnh !== undefined) updates.driver1Cnh = parsed.data.driver1Cnh ?? null;
    if (parsed.data.driver1CnhCategory !== undefined) updates.driver1CnhCategory = parsed.data.driver1CnhCategory ?? null;
    if (parsed.data.driver1CnhExpiry !== undefined) updates.driver1CnhExpiry = parsed.data.driver1CnhExpiry ?? null;
    if (parsed.data.driver2Name !== undefined) updates.driver2Name = parsed.data.driver2Name ?? null;
    if (parsed.data.driver2Cpf !== undefined) updates.driver2Cpf = parsed.data.driver2Cpf ?? null;
    if (parsed.data.driver2Cnh !== undefined) updates.driver2Cnh = parsed.data.driver2Cnh ?? null;
    if (parsed.data.driver2CnhCategory !== undefined) updates.driver2CnhCategory = parsed.data.driver2CnhCategory ?? null;
    if (parsed.data.driver2CnhExpiry !== undefined) updates.driver2CnhExpiry = parsed.data.driver2CnhExpiry ?? null;
    if (parsed.data.tourGuideCpf !== undefined) updates.tourGuideCpf = parsed.data.tourGuideCpf ?? null;
    if (parsed.data.tourGuideRegistration !== undefined) updates.tourGuideRegistration = parsed.data.tourGuideRegistration ?? null;

    let oldCoverImage: string | null | undefined;
    if (capacityOrLayoutChanged || coverImageChanged) {
      const [currentTrip] = await db.select().from(tripsTable)
        .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!currentTrip) { next(new NotFoundError("Trip not found", "TRIP_NOT_FOUND")); return; }
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
          if (!layoutRow) { next(new ValidationError("Layout não encontrado", "VALIDATION_ERROR")); return; }
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
            inArray(reservationsTable.status, [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED]),
          ));

        let reservedSeats = 0;
        let confirmedSeats = 0;
        for (const r of activeReservations) {
          for (const seat of r.seats) {
            if (newSeatMap[seat]) {
              newSeatMap[seat].status = r.status === RESERVATION_STATUS.CONFIRMED ? "confirmed" : "reserved";
              if (r.status === RESERVATION_STATUS.CONFIRMED) confirmedSeats++;
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
    if (!trip) { next(new NotFoundError("Trip not found", "TRIP_NOT_FOUND")); return; }
    if (coverImageChanged) {
      await deleteOrphanedFile(oldCoverImage, parsed.data.coverImage, req.log);
    }
    res.json(formatTrip(trip));
    CalendarSyncService.syncTrip(req.params.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.delete("/trips/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
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
    CalendarSyncService.deleteEventsForTrip(req.params.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.get("/trips/:id/seat-map", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

    const ACTIVE_STATUSES = [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED];
    const reservations = await db.select().from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, req.params.id),
        eq(reservationsTable.tenantId, me.tenantId),
        inArray(reservationsTable.status, ACTIVE_STATUSES),
      ));

    const occupiedSeats: Record<string, { reservationId: string; passengerName: string; seatStatus: string }> = {};
    for (const r of reservations) {
      const seatStatus = r.status === RESERVATION_STATUS.CONFIRMED ? "confirmed" : "reserved";
      for (const seat of r.seats) {
        occupiedSeats[seat] = { reservationId: r.id, passengerName: "", seatStatus };
      }
    }

    const seatMap = trip.seatMap as Record<string, { row: number; col: number; floor?: number; status: string; type?: string }>;
    const seats = Object.entries(seatMap).map(([num, data]) => ({
      number: num,
      row: data.row,
      col: data.col,
      floor: data.floor ?? 1,
      type: data.type ?? "seat",
      status: occupiedSeats[num]
        ? occupiedSeats[num].seatStatus
        : (data.type && !["seat", "vip", "accessible"].includes(data.type) ? data.type : "available"),
      passengerName: occupiedSeats[num]?.passengerName ?? null,
      reservationId: occupiedSeats[num]?.reservationId ?? null,
    }));

    const maxCol = Math.max(...seats.map(s => s.col), 4);
    const maxFloor = Math.max(...seats.map(s => s.floor ?? 1), 1);
    res.json({
      tripId: trip.id,
      layout: trip.seatLayout ?? "2x2",
      floors: maxFloor,
      totalSeats: trip.totalCapacity,
      cols: maxCol,
      seats,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/trips/:id/seats/stream", async (req, res, next: NextFunction): Promise<void> => {
  const me = await requireAuth(req, res);
  if (!me) return;

  const [trip] = await db.select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
    .limit(1);
  if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

  const tripId = trip.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  addSeatClient(tripId, res);
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 30000);
  req.on("close", () => {
    clearInterval(ping);
    removeSeatClient(tripId, res);
  });
});

router.get("/trips/:id/boarding-panel", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

    if (!trip.manifestNumber) {
      const year = trip.departureDate.getFullYear();
      let assigned: string | null | undefined = null;
      for (let attempt = 0; attempt < 5 && !assigned; attempt++) {
        const [countRow] = await db.select({ count: sql<number>`count(*)` })
          .from(tripsTable)
          .where(and(
            eq(tripsTable.tenantId, me.tenantId),
            sql`manifest_number IS NOT NULL`,
            sql`EXTRACT(YEAR FROM departure_date) = ${year}`,
          ));
        const seq = (Number(countRow?.count ?? 0) + 1 + attempt).toString().padStart(6, "0");
        const candidate = `MAN-${year}-${seq}`;
        try {
          await db.update(tripsTable).set({ manifestNumber: candidate })
            .where(and(
              eq(tripsTable.id, trip.id),
              eq(tripsTable.tenantId, me.tenantId),
              sql`manifest_number IS NULL`,
            ));
        } catch {
          continue;
        }
        const [refreshed] = await db.select({ manifestNumber: tripsTable.manifestNumber })
          .from(tripsTable)
          .where(and(eq(tripsTable.id, trip.id), eq(tripsTable.tenantId, me.tenantId)))
          .limit(1);
        assigned = refreshed?.manifestNumber;
      }
      if (!assigned) {
        const [final] = await db.select({ manifestNumber: tripsTable.manifestNumber })
          .from(tripsTable)
          .where(and(eq(tripsTable.id, trip.id), eq(tripsTable.tenantId, me.tenantId)))
          .limit(1);
        assigned = final?.manifestNumber;
      }
      if (!assigned) {
        req.log.error({ tripId: trip.id }, "Failed to assign manifest number after 5 attempts");
        next(new AppError("Não foi possível gerar o número do manifesto. Tente novamente.", 500, "MANIFEST_NUMBER_FAILED"));
        return;
      }
      trip.manifestNumber = assigned;
    }

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
        boardingPoints: (trip.boardingPoints ?? []) as Array<{ id: string; name: string; time?: string; address?: string }>,
        manifestNumber: trip.manifestNumber ?? null,
        vehiclePlate: trip.vehiclePlate ?? null,
        vehicleType: trip.vehicleType ?? null,
        driverName: trip.driverName ?? null,
        driver1Cpf: trip.driver1Cpf ?? null,
        driver1Cnh: trip.driver1Cnh ?? null,
        driver1CnhCategory: trip.driver1CnhCategory ?? null,
        driver1CnhExpiry: trip.driver1CnhExpiry ?? null,
        driver2Name: trip.driver2Name ?? null,
        driver2Cpf: trip.driver2Cpf ?? null,
        driver2Cnh: trip.driver2Cnh ?? null,
        driver2CnhCategory: trip.driver2CnhCategory ?? null,
        driver2CnhExpiry: trip.driver2CnhExpiry ?? null,
        tourGuide: trip.tourGuide ?? null,
        tourGuideCpf: trip.tourGuideCpf ?? null,
        tourGuideRegistration: trip.tourGuideRegistration ?? null,
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
      const effectiveBoardingLocationId = p.boardingLocationId ?? reservation?.boardingLocationId ?? null;
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
        boardingLocationId: effectiveBoardingLocationId,
        disembarkLocationId: p.disembarkLocationId ?? null,
        passengerPhone: p.phone ?? null,
        observations: p.observations ?? null,
        specialNeeds: p.specialNeeds ?? null,
        documentType: p.documentType ?? null,
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
      boardingPoints: (trip.boardingPoints ?? []) as Array<{ id: string; name: string; time?: string; address?: string }>,
      manifestNumber: trip.manifestNumber ?? null,
      vehiclePlate: trip.vehiclePlate ?? null,
      vehicleType: trip.vehicleType ?? null,
      driverName: trip.driverName ?? null,
      driver1Cpf: trip.driver1Cpf ?? null,
      driver1Cnh: trip.driver1Cnh ?? null,
      driver1CnhCategory: trip.driver1CnhCategory ?? null,
      driver1CnhExpiry: trip.driver1CnhExpiry ?? null,
      driver2Name: trip.driver2Name ?? null,
      driver2Cpf: trip.driver2Cpf ?? null,
      driver2Cnh: trip.driver2Cnh ?? null,
      driver2CnhCategory: trip.driver2CnhCategory ?? null,
      driver2CnhExpiry: trip.driver2CnhExpiry ?? null,
      tourGuide: trip.tourGuide ?? null,
      tourGuideCpf: trip.tourGuideCpf ?? null,
      tourGuideRegistration: trip.tourGuideRegistration ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/trips/:id/sync-passengers", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }

    const [trip] = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

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
        boardingLocationId: r.boardingLocationId ?? null,
      }).onConflictDoNothing().returning({ id: passengersTable.id });
      if (inserted.length > 0) created++;
    }

    res.json({ created });
  } catch (err) {
    next(err);
  }
});

router.patch("/trips/:tripId/passengers/:passengerId", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }

    const { tripId, passengerId } = req.params;
    const { boardingLocationId, disembarkLocationId, passengerPhone, observations, specialNeeds, documentType } = req.body as {
      boardingLocationId?: string | null;
      disembarkLocationId?: string | null;
      passengerPhone?: string | null;
      observations?: string | null;
      specialNeeds?: string | null;
      documentType?: string | null;
    };

    const [trip] = await db.select({ id: tripsTable.id, boardingPoints: tripsTable.boardingPoints })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Trip not found", "NOT_FOUND")); return; }

    const [passenger] = await db.select({ id: passengersTable.id, reservationId: passengersTable.reservationId })
      .from(passengersTable)
      .where(eq(passengersTable.id, passengerId))
      .limit(1);
    if (!passenger) { next(new NotFoundError("Passenger not found", "NOT_FOUND")); return; }

    const [reservation] = await db.select({ tripId: reservationsTable.tripId })
      .from(reservationsTable)
      .where(and(eq(reservationsTable.id, passenger.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation || reservation.tripId !== trip.id) { next(new NotFoundError("Passenger not found", "NOT_FOUND")); return; }

    if (boardingLocationId === undefined && disembarkLocationId === undefined &&
        passengerPhone === undefined && observations === undefined &&
        specialNeeds === undefined && documentType === undefined) {
      next(new AppError("At least one field must be provided", 422, "VALIDATION_ERROR"));
      return;
    }

    const VALID_DOCUMENT_TYPES = ["RG", "CNH", "PASSAPORTE", "Certidão de Nascimento"];
    if (documentType !== undefined && documentType !== null && !VALID_DOCUMENT_TYPES.includes(documentType)) {
      next(new AppError(`Invalid documentType. Must be one of: ${VALID_DOCUMENT_TYPES.join(", ")}`, 422, "VALIDATION_ERROR")); return;
    }

    const boardingPointIds = new Set(
      ((trip.boardingPoints ?? []) as Array<{ id: string }>).map(bp => bp.id)
    );

    if (boardingLocationId !== undefined && boardingLocationId !== null && !boardingPointIds.has(boardingLocationId)) {
      next(new AppError("Invalid boardingLocationId: not in trip boarding points", 422, "VALIDATION_ERROR"));
      return;
    }
    if (disembarkLocationId !== undefined && disembarkLocationId !== null && !boardingPointIds.has(disembarkLocationId)) {
      next(new AppError("Invalid disembarkLocationId: not in trip boarding points", 422, "VALIDATION_ERROR"));
      return;
    }

    const updateData: Partial<typeof passengersTable.$inferSelect> = {};
    if (boardingLocationId !== undefined) updateData.boardingLocationId = boardingLocationId;
    if (disembarkLocationId !== undefined) updateData.disembarkLocationId = disembarkLocationId;
    if (passengerPhone !== undefined) updateData.phone = passengerPhone;
    if (observations !== undefined) updateData.observations = observations;
    if (specialNeeds !== undefined) updateData.specialNeeds = specialNeeds;
    if (documentType !== undefined) updateData.documentType = documentType;

    const [updated] = await db.update(passengersTable)
      .set(updateData)
      .where(eq(passengersTable.id, passengerId))
      .returning();

    res.json({
      id: updated.id,
      boardingLocationId: updated.boardingLocationId ?? null,
      disembarkLocationId: updated.disembarkLocationId ?? null,
      passengerPhone: updated.phone ?? null,
      observations: updated.observations ?? null,
      specialNeeds: updated.specialNeeds ?? null,
      documentType: updated.documentType ?? null,
    });
  } catch (err) {
    next(err);
  }
});

function escapeHtmlServer(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCpfServer(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return cpf;
}

type ManifestPassenger = {
  name: string;
  cpf: string | null;
  birthDate: string | null;
  ageCategory: string;
  seatNumber: string | null;
  boardingLocationId: string | null;
  documentType: string | null;
  specialNeeds: string | null;
  observations: string | null;
};

type ManifestPanel = {
  tripName: string;
  departureDate: string;
  tenantName: string;
  tenantCnpj: string | null;
  manifestNumber: string | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  driverName: string | null;
  driver1Cpf: string | null;
  driver1Cnh: string | null;
  driver1CnhCategory: string | null;
  driver1CnhExpiry: string | null;
  driver2Name: string | null;
  driver2Cpf: string | null;
  driver2Cnh: string | null;
  driver2CnhCategory: string | null;
  driver2CnhExpiry: string | null;
  tourGuide: string | null;
  tourGuideCpf: string | null;
  tourGuideRegistration: string | null;
  boardingPoints: Array<{ id: string; name: string; time?: string }>;
  passengers: ManifestPassenger[];
  destinationCity?: string;
  destinationState?: string;
};

const AGE_CATEGORY_LABELS_SERVER: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  senior: "Idoso",
  baby: "Gratuidade",
  pcd: "PCD",
};

function generateManifestHtml(p: ManifestPanel): string {
  const e = escapeHtmlServer;
  const tripName = e(p.tripName);
  const destination = p.destinationCity && p.destinationState ? e(`${p.destinationCity}/${p.destinationState}`) : "";
  const depDate = p.departureDate ? format(parseISO(p.departureDate), "dd/MM/yyyy", { locale: ptBR }) : "";
  const depTimeRaw = p.departureDate ? format(parseISO(p.departureDate), "HH:mm") : "";
  const depTime = depTimeRaw && depTimeRaw !== "00:00" ? e(depTimeRaw) : "";
  const emitidoEm = e(new Date().toLocaleString("pt-BR"));
  const organizador = e(p.tenantName ?? "");
  const cnpj = e(p.tenantCnpj ?? "");
  const manifestNumber = e(p.manifestNumber ?? "");
  const vehiclePlate = e(p.vehiclePlate ?? "");
  const vehicleType = e(p.vehicleType ?? "");
  const driverName = e(p.driverName ?? "");
  const driver1Cpf = e(p.driver1Cpf ?? "");
  const driver1Cnh = e(p.driver1Cnh ?? "");
  const driver1CnhCat = e(p.driver1CnhCategory ?? "");
  const driver1CnhExp = e(p.driver1CnhExpiry ?? "");
  const driver2Name = e(p.driver2Name ?? "");
  const driver2Cpf = e(p.driver2Cpf ?? "");
  const driver2Cnh = e(p.driver2Cnh ?? "");
  const driver2CnhCat = e(p.driver2CnhCategory ?? "");
  const driver2CnhExp = e(p.driver2CnhExpiry ?? "");
  const tourGuide = e(p.tourGuide ?? "");
  const tourGuideCpf = e(p.tourGuideCpf ?? "");
  const tourGuideReg = e(p.tourGuideRegistration ?? "");

  const bpMap = new Map(p.boardingPoints.map(bp => [bp.id, bp.name]));
  const getBpName = (id: string | null | undefined) => (id ? bpMap.get(id) ?? id : "—");

  const anttBucket: Record<string, string> = { adult: "adulto", child: "crianca", senior: "idoso", baby: "gratuidade", pcd: "pcd" };
  const catOrder = ["adulto", "crianca", "idoso", "pcd", "gratuidade"];
  const catLabel: Record<string, string> = { adulto: "Adultos", crianca: "Crianças", idoso: "Idosos", pcd: "PCDs", gratuidade: "Gratuidades" };
  const categoryCounts: Record<string, number> = {};
  for (const pass of p.passengers) {
    const bucket = anttBucket[pass.ageCategory] ?? "adulto";
    categoryCounts[bucket] = (categoryCounts[bucket] ?? 0) + 1;
  }

  const rows = p.passengers.map((pass, i) => {
    const nome = e(pass.name);
    const cpfStr = e(formatCpfServer(pass.cpf));
    const nasc = pass.birthDate ? e(new Date(pass.birthDate).toLocaleDateString("pt-BR")) : "—";
    const cat = e(AGE_CATEGORY_LABELS_SERVER[pass.ageCategory] ?? pass.ageCategory);
    const poltrona = e(pass.seatNumber ?? "—");
    const embarque = e(getBpName(pass.boardingLocationId));
    const obsLines = [pass.documentType, pass.specialNeeds, pass.observations].filter(Boolean).map(s => e(s!));
    const obs = obsLines.length > 0 ? obsLines.join(" | ") : "";
    return `<tr>
      <td class="num">${String(i + 1).padStart(2, "0")}</td>
      <td>${nome}</td>
      <td>${cpfStr}</td>
      <td>${nasc}</td>
      <td>${cat}</td>
      <td class="seat">${poltrona}</td>
      <td>${embarque}</td>
      <td class="obs-cell">${obs}</td>
    </tr>`;
  }).join("");

  const totalsRow = catOrder
    .filter(c => categoryCounts[c])
    .map(c => `<span><strong>${catLabel[c] ?? c}:</strong> ${categoryCounts[c]}</span>`)
    .join("&nbsp;&nbsp;|&nbsp;&nbsp;");

  const crewRows = [
    driverName || driver1Cpf || driver1Cnh
      ? `<tr><td>Motorista 1</td><td>${driverName || "—"}</td><td>CNH ${driver1Cnh || "—"}${driver1CnhCat ? ` — Cat. ${driver1CnhCat}` : ""}${driver1CnhExp ? ` — Val. ${driver1CnhExp}` : ""}</td><td>CPF: ${driver1Cpf || "—"}</td></tr>`
      : "",
    driver2Name || driver2Cpf || driver2Cnh
      ? `<tr><td>Motorista 2</td><td>${driver2Name || "—"}</td><td>CNH ${driver2Cnh || "—"}${driver2CnhCat ? ` — Cat. ${driver2CnhCat}` : ""}${driver2CnhExp ? ` — Val. ${driver2CnhExp}` : ""}</td><td>CPF: ${driver2Cpf || "—"}</td></tr>`
      : "",
    tourGuide || tourGuideCpf || tourGuideReg
      ? `<tr><td>Guia de Turismo</td><td>${tourGuide || "—"}</td><td>CADASTUR: ${tourGuideReg || "—"}</td><td>CPF: ${tourGuideCpf || "—"}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Manifesto ANTT — ${tripName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10.5px; margin: 12mm 14mm; color: #000; }
  .header { border: 2px solid #1a1a1a; padding: 8px 10px; margin-bottom: 6px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .title { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .subtitle { font-size: 9px; color: #555; }
  .manifest-no { font-size: 13px; font-weight: bold; font-family: monospace; color: #1a3a6e; }
  .section { border: 1px solid #ccc; padding: 5px 8px; margin-bottom: 5px; font-size: 10.5px; }
  .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 4px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; }
  .meta-item label { font-weight: bold; margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 4px 5px; font-size: 9.5px; }
  td { padding: 3px 5px; border-bottom: 1px solid #e8e8e8; font-size: 10px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .num { width: 22px; text-align: center; }
  .seat { width: 50px; text-align: center; }
  .obs-cell { font-size: 9px; color: #555; max-width: 120px; }
  .crew-table td { border-bottom: 1px solid #e8e8e8; }
  .crew-table td:first-child { font-weight: bold; width: 110px; }
  .totals { margin-top: 6px; padding: 4px 8px; background: #f0f0f0; border: 1px solid #ccc; font-size: 10.5px; }
  .footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #555; }
  .sig-block { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sig-line { border-top: 1px solid #000; padding-top: 3px; font-size: 9px; text-align: center; color: #555; }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div>
      <div class="title">Manifesto de Passageiros — ANTT</div>
      <div class="subtitle">Resolução ANTT nº 4.777/2015 — Transporte rodoviário de passageiros em excursão</div>
    </div>
    ${manifestNumber ? `<div class="manifest-no">${manifestNumber}</div>` : ""}
  </div>
</div>
<div class="section">
  <div class="section-title">Dados da Excursão</div>
  <div class="meta-grid">
    <div class="meta-item"><label>Excursão:</label>${tripName}</div>
    ${destination ? `<div class="meta-item"><label>Destino:</label>${destination}</div>` : ""}
    <div class="meta-item"><label>Saída:</label>${depDate}${depTime ? ` às ${depTime}` : ""}</div>
    ${organizador ? `<div class="meta-item"><label>Organizador:</label>${organizador}</div>` : ""}
    ${cnpj ? `<div class="meta-item"><label>CNPJ:</label>${cnpj}</div>` : ""}
    <div class="meta-item"><label>Total Passageiros:</label>${p.passengers.length}</div>
    <div class="meta-item"><label>Emitido em:</label>${emitidoEm}</div>
  </div>
</div>
<div class="section">
  <div class="section-title">Veículo</div>
  <div class="meta-grid">
    ${vehicleType ? `<div class="meta-item"><label>Tipo:</label>${vehicleType}</div>` : ""}
    ${vehiclePlate ? `<div class="meta-item"><label>Placa:</label>${vehiclePlate}</div>` : ""}
  </div>
</div>
${crewRows ? `<div class="section">
  <div class="section-title">Tripulação</div>
  <table class="crew-table"><tbody>${crewRows}</tbody></table>
</div>` : ""}
<table>
  <thead>
    <tr>
      <th class="num">Nº</th>
      <th>Nome Completo</th>
      <th>CPF</th>
      <th>Data Nasc.</th>
      <th>Categoria</th>
      <th class="seat">Assento</th>
      <th>Embarque</th>
      <th>Obs.</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <strong>Totais por categoria:</strong>&nbsp;&nbsp;${totalsRow || `Total: ${p.passengers.length}`}
</div>
<div class="sig-block">
  <div class="sig-line">Assinatura do Responsável pela Excursão</div>
  <div class="sig-line">Assinatura do Motorista</div>
</div>
<div class="footer">
  <span>Nº Manifesto: <strong>${manifestNumber || "—"}</strong> &nbsp;|&nbsp; VisiteCRM — Gestão de Agências de Turismo</span>
  <span>Emitido em ${emitidoEm}</span>
</div>
</body>
</html>`;
}

function generateManifestPdf(p: ManifestPanel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bpMap = new Map(p.boardingPoints.map(bp => [bp.id, bp.name]));
    const getBpName = (id: string | null | undefined) => (id ? bpMap.get(id) ?? id : "—");
    const depDate = p.departureDate ? format(parseISO(p.departureDate), "dd/MM/yyyy", { locale: ptBR }) : "";
    const depTimeRaw = p.departureDate ? format(parseISO(p.departureDate), "HH:mm") : "";
    const depTime = depTimeRaw && depTimeRaw !== "00:00" ? ` às ${depTimeRaw}` : "";
    const emitidoEm = new Date().toLocaleString("pt-BR");
    const pageWidth = 595 - 72;

    doc.rect(36, 36, pageWidth, 48).stroke();
    doc.font("Helvetica-Bold").fontSize(12).text("MANIFESTO DE PASSAGEIROS — ANTT", 40, 44, { width: pageWidth - 8, align: "center" });
    doc.font("Helvetica").fontSize(7).text("Resolução ANTT nº 4.777/2015 — Transporte rodoviário de passageiros em excursão", 40, 62, { width: pageWidth - 8, align: "center" });
    if (p.manifestNumber) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#1a3a6e").text(p.manifestNumber, pageWidth - 60, 52, { width: 90 });
      doc.fillColor("black");
    }

    let y = 90;
    const labelVal = (label: string, value: string, xOff = 0, yOff = y) => {
      doc.font("Helvetica-Bold").fontSize(8).text(label, 40 + xOff, yOff, { continued: true });
      doc.font("Helvetica").fontSize(8).text(" " + value);
    };

    doc.rect(36, y, pageWidth, 44).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#555").text("DADOS DA EXCURSÃO", 40, y + 3);
    doc.fillColor("black");
    y += 12;
    const colW = pageWidth / 3;
    labelVal("Excursão:", p.tripName.slice(0, 40), 0, y);
    if (p.destinationCity) labelVal("Destino:", `${p.destinationCity}/${p.destinationState ?? ""}`, colW, y);
    labelVal("Saída:", depDate + depTime, colW * 2, y);
    y += 12;
    if (p.tenantName) labelVal("Organizador:", p.tenantName, 0, y);
    if (p.tenantCnpj) labelVal("CNPJ:", p.tenantCnpj, colW, y);
    labelVal("Total Passageiros:", String(p.passengers.length), colW * 2, y);
    y += 12;
    labelVal("Emitido em:", emitidoEm, 0, y);
    y += 20;

    if (p.vehiclePlate || p.vehicleType) {
      doc.rect(36, y, pageWidth, 28).stroke();
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#555").text("VEÍCULO", 40, y + 3);
      doc.fillColor("black");
      y += 12;
      if (p.vehicleType) labelVal("Tipo:", p.vehicleType, 0, y);
      if (p.vehiclePlate) labelVal("Placa:", p.vehiclePlate, colW, y);
      y += 20;
    }

    const hasDriver1 = !!(p.driverName || p.driver1Cpf || p.driver1Cnh);
    const hasDriver2 = !!(p.driver2Name || p.driver2Cpf || p.driver2Cnh);
    const hasGuide = !!(p.tourGuide || p.tourGuideCpf || p.tourGuideRegistration);
    if (hasDriver1 || hasDriver2 || hasGuide) {
      const crewRows = [
        hasDriver1 ? ["Motorista 1", p.driverName ?? "—", `CNH: ${p.driver1Cnh ?? "—"}${p.driver1CnhCategory ? " Cat." + p.driver1CnhCategory : ""}`, `CPF: ${p.driver1Cpf ?? "—"}`] : null,
        hasDriver2 ? ["Motorista 2", p.driver2Name ?? "—", `CNH: ${p.driver2Cnh ?? "—"}${p.driver2CnhCategory ? " Cat." + p.driver2CnhCategory : ""}`, `CPF: ${p.driver2Cpf ?? "—"}`] : null,
        hasGuide ? ["Guia de Turismo", p.tourGuide ?? "—", `CADASTUR: ${p.tourGuideRegistration ?? "—"}`, `CPF: ${p.tourGuideCpf ?? "—"}`] : null,
      ].filter((r): r is string[] => r !== null);
      const crewH = 14 + crewRows.length * 14;
      doc.rect(36, y, pageWidth, crewH).stroke();
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#555").text("TRIPULAÇÃO", 40, y + 3);
      doc.fillColor("black");
      y += 14;
      for (const row of crewRows) {
        const cw = pageWidth / 4;
        doc.font("Helvetica-Bold").fontSize(7.5).text(row[0], 40, y, { width: cw - 4 });
        doc.font("Helvetica").fontSize(7.5).text(row[1], 40 + cw, y, { width: cw - 4 });
        doc.text(row[2], 40 + cw * 2, y, { width: cw - 4 });
        doc.text(row[3], 40 + cw * 3, y, { width: cw - 4 });
        y += 14;
      }
      y += 6;
    }

    const colDefs = [
      { label: "Nº", w: 20 },
      { label: "Nome Completo", w: 120 },
      { label: "CPF", w: 72 },
      { label: "Nasc.", w: 48 },
      { label: "Cat.", w: 48 },
      { label: "Assento", w: 40 },
      { label: "Embarque", w: 80 },
      { label: "Obs.", w: 95 },
    ];
    const totalColW = colDefs.reduce((s, c) => s + c.w, 0);
    const scale = pageWidth / totalColW;
    const cols = colDefs.map(c => ({ ...c, w: c.w * scale }));

    doc.rect(36, y, pageWidth, 14).fillAndStroke("#1a1a1a", "#1a1a1a");
    let xOff = 40;
    for (const col of cols) {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("white").text(col.label, xOff, y + 3, { width: col.w - 2, lineBreak: false });
      xOff += col.w;
    }
    doc.fillColor("black");
    y += 14;

    const AGE_LABELS: Record<string, string> = { adult: "Adulto", child: "Criança", senior: "Idoso", baby: "Gratuidade", pcd: "PCD" };
    for (let i = 0; i < p.passengers.length; i++) {
      const pass = p.passengers[i];
      if (i % 2 === 0) doc.rect(36, y, pageWidth, 13).fillAndStroke("#f8f8f8", "white");
      doc.rect(36, y, pageWidth, 13).stroke();
      xOff = 40;
      const rowData = [
        String(i + 1).padStart(2, "0"),
        pass.name.slice(0, 25),
        formatCpfServer(pass.cpf),
        pass.birthDate ? new Date(pass.birthDate).toLocaleDateString("pt-BR") : "—",
        AGE_LABELS[pass.ageCategory] ?? pass.ageCategory,
        pass.seatNumber ?? "—",
        getBpName(pass.boardingLocationId),
        [pass.documentType, pass.specialNeeds, pass.observations].filter(Boolean).join(" | ").slice(0, 20),
      ];
      for (let ci = 0; ci < cols.length; ci++) {
        doc.font("Helvetica").fontSize(7).fillColor("black").text(rowData[ci], xOff, y + 3, { width: cols[ci].w - 2, lineBreak: false });
        xOff += cols[ci].w;
      }
      y += 13;
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
    }

    const anttBucket: Record<string, string> = { adult: "adulto", child: "criança", senior: "idoso", baby: "gratuidade", pcd: "pcd" };
    const catCount: Record<string, number> = {};
    for (const pass of p.passengers) {
      const bucket = anttBucket[pass.ageCategory] ?? "adulto";
      catCount[bucket] = (catCount[bucket] ?? 0) + 1;
    }
    const totalsText = Object.entries(catCount).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join("  |  ");
    y += 4;
    doc.rect(36, y, pageWidth, 14).fill("#f0f0f0").stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("black").text("Totais por categoria: ", 40, y + 3, { continued: true });
    doc.font("Helvetica").text(totalsText || `Total: ${p.passengers.length}`);
    y += 20;

    if (y + 40 > 800) { doc.addPage(); y = 40; }
    const sigW = (pageWidth - 20) / 2;
    doc.moveTo(40, y + 20).lineTo(40 + sigW, y + 20).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor("#555").text("Assinatura do Responsável pela Excursão", 40, y + 22, { width: sigW, align: "center" });
    doc.moveTo(40 + sigW + 20, y + 20).lineTo(40 + pageWidth, y + 20).stroke();
    doc.text("Assinatura do Motorista", 40 + sigW + 20, y + 22, { width: sigW, align: "center" });
    y += 40;

    doc.moveTo(36, y).lineTo(36 + pageWidth, y).stroke();
    doc.fontSize(7).fillColor("#555").text(`Nº Manifesto: ${p.manifestNumber ?? "—"} | VisiteCRM — Gestão de Agências de Turismo`, 40, y + 4, { width: pageWidth / 2 });
    doc.text(`Emitido em ${emitidoEm}`, 40 + pageWidth / 2, y + 4, { width: pageWidth / 2, align: "right" });

    doc.end();
  });
}

const SendManifestBody = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("email"), to: z.string().email("Endereço de e-mail inválido") }),
  z.object({ channel: z.literal("whatsapp"), to: z.string().min(8, "Número de WhatsApp muito curto").max(20, "Número de WhatsApp muito longo").regex(/^[\d\s\(\)\-\+]+$/, "Número de WhatsApp inválido") }),
]);

router.post("/trips/:id/manifest/send", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }

    const parsed = SendManifestBody.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      next(new ValidationError(firstIssue?.message ?? "Dados inválidos", "VALIDATION_ERROR")); return;
    }
    const { channel, to } = parsed.data;

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { next(new NotFoundError("Excursão não encontrada", "NOT_FOUND")); return; }

    const reservations = await db.select().from(reservationsTable)
      .where(and(
        eq(reservationsTable.tripId, trip.id),
        eq(reservationsTable.tenantId, me.tenantId),
        sql`${reservationsTable.status} NOT IN ('cancelled', 'refunded')`,
      ));

    const reservationIds = reservations.map(r => r.id);

    const [passengers, [tenant]] = await Promise.all([
      reservationIds.length > 0
        ? db.select().from(passengersTable).where(inArray(passengersTable.reservationId, reservationIds))
        : Promise.resolve([]),
      db.select({ name: tenantsTable.name, cnpj: tenantsTable.cnpj }).from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1),
    ]);

    const reservationMap = new Map(reservations.map(r => [r.id, r]));

    const manifestPassengers: ManifestPassenger[] = passengers.map(p => {
      const reservation = reservationMap.get(p.reservationId);
      const effectiveBoardingLocationId = p.boardingLocationId ?? reservation?.boardingLocationId ?? null;
      return {
        name: p.name,
        cpf: p.cpf ?? null,
        birthDate: p.birthDate?.toISOString() ?? null,
        ageCategory: p.ageCategory,
        seatNumber: p.seatNumber ?? null,
        boardingLocationId: effectiveBoardingLocationId,
        documentType: p.documentType ?? null,
        specialNeeds: p.specialNeeds ?? null,
        observations: p.observations ?? null,
      };
    });

    const panel: ManifestPanel = {
      tripName: trip.name,
      departureDate: trip.departureDate.toISOString(),
      tenantName: tenant?.name ?? "",
      tenantCnpj: tenant?.cnpj ?? null,
      manifestNumber: trip.manifestNumber ?? null,
      vehiclePlate: trip.vehiclePlate ?? null,
      vehicleType: trip.vehicleType ?? null,
      driverName: trip.driverName ?? null,
      driver1Cpf: trip.driver1Cpf ?? null,
      driver1Cnh: trip.driver1Cnh ?? null,
      driver1CnhCategory: trip.driver1CnhCategory ?? null,
      driver1CnhExpiry: trip.driver1CnhExpiry ?? null,
      driver2Name: trip.driver2Name ?? null,
      driver2Cpf: trip.driver2Cpf ?? null,
      driver2Cnh: trip.driver2Cnh ?? null,
      driver2CnhCategory: trip.driver2CnhCategory ?? null,
      driver2CnhExpiry: trip.driver2CnhExpiry ?? null,
      tourGuide: trip.tourGuide ?? null,
      tourGuideCpf: trip.tourGuideCpf ?? null,
      tourGuideRegistration: trip.tourGuideRegistration ?? null,
      boardingPoints: (trip.boardingPoints ?? []) as Array<{ id: string; name: string; time?: string }>,
      passengers: manifestPassengers,
      destinationCity: trip.destinationCity,
      destinationState: trip.destinationState,
    };

    const auditMeta: Record<string, string> = { channel, to: channel === "whatsapp" ? to : to.replace(/(.{2}).+(@.+)/, "$1***$2") };

    if (channel === "email") {
      const [html, pdfBuffer] = await Promise.all([
        Promise.resolve(generateManifestHtml(panel)),
        generateManifestPdf(panel),
      ]);

      const pdfQueue = getPdfQueue();
      if (pdfQueue) {
        await pdfQueue.add("manifest", {
          type: "manifest",
          tenantId: me.tenantId,
          tripId: trip.id,
          tripName: trip.name,
          manifestNumber: trip.manifestNumber ?? null,
          agencyName: tenant?.name ?? "VisiteCRM",
          recipientEmail: to,
          htmlContent: html,
          pdfBase64: pdfBuffer.toString("base64"),
          userId: me.userId,
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        });
        res.status(202).json({ success: true, channel: "email", queued: true });
        return;
      }

      const result = await sendManifestEmail({
        to,
        tripName: trip.name,
        manifestNumber: trip.manifestNumber ?? null,
        agencyName: tenant?.name ?? "VisiteCRM",
        htmlContent: html,
        pdfAttachment: pdfBuffer,
      });

      if (!result.success) {
        req.log.error({ error: result.error }, "Failed to send manifest email");
        next(new AppError(result.error ?? "Falha ao enviar e-mail", 500, "MANIFEST_EMAIL_FAILED"));
        return;
      }

      await db.insert(auditLogsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        userId: me.userId,
        action: "manifest_sent",
        entityType: "trip",
        entityId: trip.id,
        after: auditMeta,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, channel: "email" });
    } else {
      const depDate = trip.departureDate ? format(trip.departureDate, "dd/MM/yyyy", { locale: ptBR }) : "";
      const proto = req.headers["x-forwarded-proto"] ?? "https";
      const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
      const manifestLink = `${proto}://${host}/trips/${trip.id}/passengers`;

      const messageParts = [
        `📋 *Manifesto ANTT — ${trip.name}*`,
        trip.manifestNumber ? `Nº Manifesto: ${trip.manifestNumber}` : null,
        panel.destinationCity ? `Destino: ${panel.destinationCity}${panel.destinationState ? `/${panel.destinationState}` : ""}` : null,
        depDate ? `Saída: ${depDate}` : null,
        `Total de passageiros: ${manifestPassengers.length}`,
        ``,
        `🔗 Acesso ao manifesto: ${manifestLink}`,
        ``,
        `_Emitido via VisiteCRM_`,
      ].filter((l): l is string => l !== null).join("\n");

      const digits = to.replace(/\D/g, "");
      const phone = digits.startsWith("55") ? digits : `55${digits}`;
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(messageParts)}`;

      await db.insert(auditLogsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        userId: me.userId,
        action: "manifest_sent",
        entityType: "trip",
        entityId: trip.id,
        after: auditMeta,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, channel: "whatsapp", whatsappUrl });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
