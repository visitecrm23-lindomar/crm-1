import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable, vehiclesTable, accommodationsTable, destinationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import {
  CreateSupplierBody, UpdateSupplierBody,
  CreateVehicleBody, UpdateVehicleBody,
  CreateAccommodationBody, UpdateAccommodationBody,
  CreateDestinationBody, UpdateDestinationBody,
} from "@workspace/api-zod";

const router = Router();

function formatSupplier(s: typeof suppliersTable.$inferSelect) {
  return {
    id: s.id, tenantId: s.tenantId, name: s.name, type: s.type,
    cnpj: s.cnpj, email: s.email, phone: s.phone, whatsapp: s.whatsapp,
    contactName: s.contactName, address: s.address,
    bankDetails: s.bankDetails ?? {}, isActive: s.isActive, notes: s.notes,
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

function formatVehicle(v: typeof vehiclesTable.$inferSelect) {
  return {
    id: v.id, tenantId: v.tenantId, type: v.type, model: v.model,
    licensePlate: v.licensePlate, capacity: v.capacity, year: v.year,
    color: v.color, supplierId: v.supplierId, driverName: v.driverName,
    driverPhone: v.driverPhone, status: v.status, notes: v.notes,
    features: v.features ?? [], amenities: v.amenities ?? [],
    createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString(),
  };
}

function formatAccommodation(a: typeof accommodationsTable.$inferSelect) {
  return {
    id: a.id, tenantId: a.tenantId, name: a.name, type: a.type,
    address: a.address, city: a.city, state: a.state,
    stars: a.stars, totalRooms: a.totalRooms,
    pricePerNight: Number(a.pricePerNight),
    checkInTime: a.checkInTime, checkOutTime: a.checkOutTime,
    amenities: a.amenities ?? [], contactName: a.contactName,
    contactPhone: a.contactPhone, email: a.email, website: a.website,
    isActive: a.isActive, notes: a.notes,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  };
}

function formatDestination(d: typeof destinationsTable.$inferSelect) {
  return {
    id: d.id, tenantId: d.tenantId, name: d.name, country: d.country,
    state: d.state, city: d.city, description: d.description,
    highlights: d.highlights ?? [], images: d.images ?? [],
    isActive: d.isActive,
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/suppliers", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const suppliers = await db.select().from(suppliersTable)
      .where(eq(suppliersTable.tenantId, me.tenantId))
      .orderBy(desc(suppliersTable.createdAt));
    res.json(suppliers.map(formatSupplier));
  } catch (err) {
    req.log.error({ err }, "Error listing suppliers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/suppliers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(suppliersTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, type: parsed.data.type,
      cnpj: parsed.data.cnpj ?? null, email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null, whatsapp: parsed.data.whatsapp ?? null,
      contactName: parsed.data.contactName ?? null,
      address: parsed.data.address ?? null,
      bankDetails: parsed.data.bankDetails ?? {},
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!supplier) { res.status(500).json({ error: "Failed to create supplier" }); return; }
    res.status(201).json(formatSupplier(supplier));
  } catch (err) {
    req.log.error({ err }, "Error creating supplier");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof suppliersTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.type != null) updates.type = parsed.data.type;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email ?? null;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    await db.update(suppliersTable).set(updates)
      .where(and(eq(suppliersTable.id, req.params.id), eq(suppliersTable.tenantId, me.tenantId)));
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, req.params.id), eq(suppliersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!supplier) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatSupplier(supplier));
  } catch (err) {
    req.log.error({ err }, "Error updating supplier");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.delete(suppliersTable)
      .where(and(eq(suppliersTable.id, req.params.id), eq(suppliersTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting supplier");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vehicles", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const vehicles = await db.select().from(vehiclesTable)
      .where(eq(vehiclesTable.tenantId, me.tenantId))
      .orderBy(desc(vehiclesTable.createdAt));
    res.json(vehicles.map(formatVehicle));
  } catch (err) {
    req.log.error({ err }, "Error listing vehicles");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/vehicles", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(vehiclesTable).values({
      id, tenantId: me.tenantId,
      type: parsed.data.type, model: parsed.data.model,
      licensePlate: parsed.data.licensePlate, capacity: parsed.data.capacity,
      year: parsed.data.year ?? null, color: parsed.data.color ?? null,
      supplierId: parsed.data.supplierId ?? null,
      driverName: parsed.data.driverName ?? null, driverPhone: parsed.data.driverPhone ?? null,
      features: parsed.data.features ?? [], amenities: parsed.data.amenities ?? [],
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });
    const [vehicle] = await db.select().from(vehiclesTable)
      .where(and(eq(vehiclesTable.id, id), eq(vehiclesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!vehicle) { res.status(500).json({ error: "Failed to create vehicle" }); return; }
    res.status(201).json(formatVehicle(vehicle));
  } catch (err) {
    req.log.error({ err }, "Error creating vehicle");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof vehiclesTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.driverName !== undefined) updates.driverName = parsed.data.driverName ?? null;
    if (parsed.data.driverPhone !== undefined) updates.driverPhone = parsed.data.driverPhone ?? null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    await db.update(vehiclesTable).set(updates)
      .where(and(eq(vehiclesTable.id, req.params.id), eq(vehiclesTable.tenantId, me.tenantId)));
    const [vehicle] = await db.select().from(vehiclesTable)
      .where(and(eq(vehiclesTable.id, req.params.id), eq(vehiclesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!vehicle) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatVehicle(vehicle));
  } catch (err) {
    req.log.error({ err }, "Error updating vehicle");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/vehicles/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.delete(vehiclesTable)
      .where(and(eq(vehiclesTable.id, req.params.id), eq(vehiclesTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting vehicle");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/accommodations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const accommodations = await db.select().from(accommodationsTable)
      .where(eq(accommodationsTable.tenantId, me.tenantId))
      .orderBy(desc(accommodationsTable.createdAt));
    res.json(accommodations.map(formatAccommodation));
  } catch (err) {
    req.log.error({ err }, "Error listing accommodations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accommodations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(accommodationsTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, type: parsed.data.type,
      address: parsed.data.address ?? null,
      city: parsed.data.city, state: parsed.data.state,
      stars: parsed.data.stars ?? null, totalRooms: parsed.data.totalRooms ?? null,
      pricePerNight: String(parsed.data.pricePerNight ?? 0),
      checkInTime: parsed.data.checkInTime ?? null, checkOutTime: parsed.data.checkOutTime ?? null,
      amenities: parsed.data.amenities ?? [],
      contactName: parsed.data.contactName ?? null, contactPhone: parsed.data.contactPhone ?? null,
      email: parsed.data.email ?? null, website: parsed.data.website ?? null,
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });
    const [accommodation] = await db.select().from(accommodationsTable)
      .where(and(eq(accommodationsTable.id, id), eq(accommodationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!accommodation) { res.status(500).json({ error: "Failed to create accommodation" }); return; }
    res.status(201).json(formatAccommodation(accommodation));
  } catch (err) {
    req.log.error({ err }, "Error creating accommodation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof accommodationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.pricePerNight != null) updates.pricePerNight = String(parsed.data.pricePerNight);
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    await db.update(accommodationsTable).set(updates)
      .where(and(eq(accommodationsTable.id, req.params.id), eq(accommodationsTable.tenantId, me.tenantId)));
    const [accommodation] = await db.select().from(accommodationsTable)
      .where(and(eq(accommodationsTable.id, req.params.id), eq(accommodationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!accommodation) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatAccommodation(accommodation));
  } catch (err) {
    req.log.error({ err }, "Error updating accommodation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.delete(accommodationsTable)
      .where(and(eq(accommodationsTable.id, req.params.id), eq(accommodationsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting accommodation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/destinations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const destinations = await db.select().from(destinationsTable)
      .where(eq(destinationsTable.tenantId, me.tenantId))
      .orderBy(desc(destinationsTable.createdAt));
    res.json(destinations.map(formatDestination));
  } catch (err) {
    req.log.error({ err }, "Error listing destinations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/destinations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(destinationsTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, country: parsed.data.country ?? "Brasil",
      state: parsed.data.state ?? null, city: parsed.data.city ?? null,
      description: parsed.data.description ?? null,
      highlights: parsed.data.highlights ?? [],
      images: parsed.data.images ?? [],
      createdById: me.id,
    });
    const [destination] = await db.select().from(destinationsTable)
      .where(and(eq(destinationsTable.id, id), eq(destinationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!destination) { res.status(500).json({ error: "Failed to create destination" }); return; }
    res.status(201).json(formatDestination(destination));
  } catch (err) {
    req.log.error({ err }, "Error creating destination");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/destinations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof destinationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.highlights != null) updates.highlights = parsed.data.highlights;
    if (parsed.data.images != null) updates.images = parsed.data.images;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    await db.update(destinationsTable).set(updates)
      .where(and(eq(destinationsTable.id, req.params.id), eq(destinationsTable.tenantId, me.tenantId)));
    const [destination] = await db.select().from(destinationsTable)
      .where(and(eq(destinationsTable.id, req.params.id), eq(destinationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!destination) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatDestination(destination));
  } catch (err) {
    req.log.error({ err }, "Error updating destination");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/destinations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.delete(destinationsTable)
      .where(and(eq(destinationsTable.id, req.params.id), eq(destinationsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting destination");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
