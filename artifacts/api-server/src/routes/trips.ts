import { Router } from "express";
import { db } from "@workspace/db";
import { tripsTable, reservationsTable } from "@workspace/db";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { CreateTripBody, UpdateTripBody } from "@workspace/api-zod";

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
    status: t.status,
    isPublic: t.isPublic,
    isFeatured: t.isFeatured,
    vehiclePlate: t.vehiclePlate,
    vehicleType: t.vehicleType,
    driverName: t.driverName,
    seatLayout: t.seatLayout,
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

    const seatMap: Record<string, unknown> = {};
    const layout = parsed.data.seatLayout ?? "2x2";
    const cols = layout === "2x1" ? 3 : 4;
    const rows = Math.ceil(parsed.data.totalCapacity / cols);
    let seatNum = 1;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        if (seatNum <= parsed.data.totalCapacity) {
          seatMap[`${seatNum}`] = { row: r, col: c, status: "available" };
          seatNum++;
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
      totalCapacity: parsed.data.totalCapacity,
      availableSeats: parsed.data.totalCapacity,
      priceAdult: String(parsed.data.priceAdult),
      priceChild: parsed.data.priceChild ? String(parsed.data.priceChild) : null,
      priceSenior: parsed.data.priceSenior ? String(parsed.data.priceSenior) : null,
      inclusions: parsed.data.inclusions ?? [],
      exclusions: parsed.data.exclusions ?? [],
      coverImage: parsed.data.coverImage ?? null,
      seatLayout: layout,
      seatMap,
      vehiclePlate: parsed.data.vehiclePlate ?? null,
      vehicleType: parsed.data.vehicleType ?? null,
      driverName: parsed.data.driverName ?? null,
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
    if (parsed.data.inclusions != null) updates.inclusions = parsed.data.inclusions;
    if (parsed.data.exclusions != null) updates.exclusions = parsed.data.exclusions;
    if (parsed.data.vehiclePlate !== undefined) updates.vehiclePlate = parsed.data.vehiclePlate ?? null;
    if (parsed.data.vehicleType !== undefined) updates.vehicleType = parsed.data.vehicleType ?? null;
    if (parsed.data.driverName !== undefined) updates.driverName = parsed.data.driverName ?? null;

    await db.update(tripsTable).set(updates)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)));
    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Not found" }); return; }
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
    await db.delete(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)));
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

    const reservations = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.tripId, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));

    const occupiedSeats: Record<string, { reservationId: string; passengerName: string }> = {};
    for (const r of reservations) {
      for (const seat of r.seats) {
        occupiedSeats[seat] = { reservationId: r.id, passengerName: "" };
      }
    }

    const seatMap = trip.seatMap as Record<string, { row: number; col: number; status: string }>;
    const seats = Object.entries(seatMap).map(([num, data]) => ({
      number: num,
      row: data.row,
      col: data.col,
      status: occupiedSeats[num] ? "occupied" : data.status,
      passengerName: occupiedSeats[num]?.passengerName ?? null,
      reservationId: occupiedSeats[num]?.reservationId ?? null,
    }));

    res.json({
      tripId: trip.id,
      layout: trip.seatLayout ?? "2x2",
      totalSeats: trip.totalCapacity,
      seats,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching seat map");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
