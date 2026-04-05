import { Router } from "express";
import { db } from "@workspace/db";
import { reservationsTable, passengersTable, tripsTable, clientsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { CreateReservationBody, UpdateReservationBody, CreatePassengerBody, UpdatePassengerBody } from "@workspace/api-zod";

const router = Router();

async function formatReservation(r: typeof reservationsTable.$inferSelect) {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, r.tripId)).limit(1);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, r.clientId)).limit(1);
  return {
    id: r.id,
    tripId: r.tripId,
    clientId: r.clientId,
    seats: r.seats ?? [],
    tripType: r.tripType,
    packageType: r.packageType,
    hasInsurance: r.hasInsurance,
    totalValue: Number(r.totalValue),
    paidValue: Number(r.paidValue),
    balance: Number(r.balance),
    paymentMethod: r.paymentMethod,
    installments: r.installments,
    commissionPercentage: r.commissionPercentage ? Number(r.commissionPercentage) : null,
    status: r.status,
    voucherCode: r.voucherCode,
    qrCode: r.qrCode,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    trip: trip ? {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      departureDate: trip.departureDate.toISOString(),
      availableSeats: trip.availableSeats,
      totalCapacity: trip.totalCapacity,
      status: trip.status,
      coverImage: trip.coverImage,
    } : { id: r.tripId, name: "Unknown", destination: "", departureDate: new Date().toISOString(), availableSeats: 0, totalCapacity: 0, status: "unknown" },
    client: client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      whatsapp: client.whatsapp,
    } : { id: r.clientId, name: "Unknown", email: "", whatsapp: "" },
  };
}

function formatPassenger(p: typeof passengersTable.$inferSelect) {
  return {
    id: p.id, reservationId: p.reservationId, name: p.name, cpf: p.cpf, rg: p.rg,
    birthDate: p.birthDate?.toISOString() ?? null, ageCategory: p.ageCategory,
    seatNumber: p.seatNumber, isChildUnder7: p.isChildUnder7,
  };
}

router.get("/reservations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { tripId, clientId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(reservationsTable.tenantId, me.tenantId)];
    if (tripId) conditions.push(eq(reservationsTable.tripId, tripId));
    if (clientId) conditions.push(eq(reservationsTable.clientId, clientId));
    if (status) conditions.push(eq(reservationsTable.status, status));

    const reservations = await db.select().from(reservationsTable)
      .where(and(...conditions))
      .orderBy(desc(reservationsTable.createdAt))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(and(...conditions));

    const data = await Promise.all(reservations.map(formatReservation));
    res.json({ data, total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Error listing reservations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateReservationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [trip] = await db.select().from(tripsTable)
      .where(and(eq(tripsTable.id, parsed.data.tripId), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(400).json({ error: "Trip not found or not in tenant" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }

    const id = generateId();
    const voucherCode = generateVoucherCode();
    const balance = parsed.data.totalValue;

    await db.insert(reservationsTable).values({
      id,
      tenantId: me.tenantId,
      tripId: parsed.data.tripId,
      clientId: parsed.data.clientId,
      seats: parsed.data.seats,
      tripType: parsed.data.tripType ?? null,
      packageType: parsed.data.packageType ?? null,
      hasInsurance: parsed.data.hasInsurance ?? false,
      totalValue: String(parsed.data.totalValue),
      paidValue: "0",
      balance: String(balance),
      paymentMethod: parsed.data.paymentMethod ?? null,
      installments: parsed.data.installments ?? 1,
      commissionPercentage: parsed.data.commissionPercentage ? String(parsed.data.commissionPercentage) : null,
      status: "pending",
      voucherCode,
      qrCode: `QR-${voucherCode}`,
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });

    const seatsCount = parsed.data.seats.length;
    await db.update(tripsTable).set({
      reservedSeats: sql`reserved_seats + ${seatsCount}`,
      availableSeats: sql`available_seats - ${seatsCount}`,
    }).where(and(eq(tripsTable.id, parsed.data.tripId), eq(tripsTable.tenantId, me.tenantId)));

    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(500).json({ error: "Failed to create reservation" }); return; }
    const formatted = await formatReservation(reservation);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error creating reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reservations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error fetching reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/reservations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateReservationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof reservationsTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentMethod != null) updates.paymentMethod = parsed.data.paymentMethod;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.seats != null) updates.seats = parsed.data.seats;

    await db.update(reservationsTable).set(updates)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error updating reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations/:id/check-in", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.update(reservationsTable).set({
      checkedInAt: new Date(),
      status: "completed",
    }).where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error checking in reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reservations/:reservationId/passengers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const passengers = await db.select().from(passengersTable)
      .where(eq(passengersTable.reservationId, req.params.reservationId));
    res.json(passengers.map(formatPassenger));
  } catch (err) {
    req.log.error({ err }, "Error listing passengers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations/:reservationId/passengers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = CreatePassengerBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(passengersTable).values({
      id,
      reservationId: req.params.reservationId,
      name: parsed.data.name,
      cpf: parsed.data.cpf ?? null,
      rg: parsed.data.rg ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      ageCategory: parsed.data.ageCategory,
      seatNumber: parsed.data.seatNumber ?? null,
      isChildUnder7: parsed.data.isChildUnder7 ?? false,
    });
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { res.status(500).json({ error: "Failed to create passenger" }); return; }
    res.status(201).json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error creating passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/reservations/:reservationId/passengers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdatePassengerBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof passengersTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.cpf !== undefined) updates.cpf = parsed.data.cpf ?? null;
    if (parsed.data.seatNumber !== undefined) updates.seatNumber = parsed.data.seatNumber ?? null;
    if (parsed.data.ageCategory != null) updates.ageCategory = parsed.data.ageCategory;
    await db.update(passengersTable).set(updates)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error updating passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/reservations/:reservationId/passengers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
