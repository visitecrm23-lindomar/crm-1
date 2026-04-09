import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable, vehiclesTable, accommodationsTable, destinationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { z } from "zod";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateSupplierBody = z.object({
  name: z.string(),
  type: z.string(),
  cnpj: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  contactName: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
});

const UpdateSupplierBody = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  status: z.string().optional(),
  pixKey: z.string().optional().nullable(),
});

const CreateVehicleBody = z.object({
  name: z.string(),
  type: z.string(),
  plate: z.string(),
  capacity: z.number().int(),
  model: z.string().optional(),
  year: z.number().optional(),
  amenities: z.array(z.string()).optional(),
  dailyRate: z.number().optional(),
  ratePerKm: z.number().optional(),
});

const UpdateVehicleBody = z.object({
  status: z.string().optional(),
  name: z.string().optional(),
  capacity: z.number().int().optional(),
  dailyRate: z.number().optional().nullable(),
  amenities: z.array(z.string()).optional(),
});

const CreateAccommodationBody = z.object({
  name: z.string(),
  type: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  totalRooms: z.number().optional(),
  amenities: z.array(z.string()).optional(),
  pricePerNight: z.number().optional(),
});

const UpdateAccommodationBody = z.object({
  name: z.string().optional(),
  pricePerNight: z.number().optional(),
  status: z.string().optional(),
  totalRooms: z.number().int().optional().nullable(),
  amenities: z.array(z.string()).optional(),
});

const CreateDestinationBody = z.object({
  name: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string().optional(),
  description: z.string().optional(),
  mainAttractions: z.array(z.string()).optional(),
  bestSeason: z.string().optional(),
  coverImage: z.string().optional(),
});

const UpdateDestinationBody = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  mainAttractions: z.array(z.string()).optional(),
  gallery: z.array(z.string()).optional(),
});

function formatSupplier(s: typeof suppliersTable.$inferSelect) {
  return {
    id: s.id, tenantId: s.tenantId, name: s.name, type: s.type,
    cnpj: s.cnpj, email: s.email, phone: s.phone, whatsapp: s.whatsapp,
    contactName: s.contactName, addressStreet: s.addressStreet,
    addressCity: s.addressCity, addressState: s.addressState,
    bankName: s.bankName, bankAgency: s.bankAgency, bankAccount: s.bankAccount,
    pixKey: s.pixKey, status: s.status,
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

function formatVehicle(v: typeof vehiclesTable.$inferSelect) {
  return {
    id: v.id, tenantId: v.tenantId, name: v.name, type: v.type,
    plate: v.plate, capacity: v.capacity, model: v.model, year: v.year,
    amenities: v.amenities ?? [],
    dailyRate: v.dailyRate ? Number(v.dailyRate) : null,
    ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null,
    photoUrl: v.photoUrl, status: v.status,
    createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString(),
  };
}

function formatAccommodation(a: typeof accommodationsTable.$inferSelect) {
  return {
    id: a.id, tenantId: a.tenantId, name: a.name, type: a.type,
    address: a.address, city: a.city, state: a.state,
    totalRooms: a.totalRooms,
    pricePerNight: a.pricePerNight ? Number(a.pricePerNight) : null,
    amenities: a.amenities ?? [], contactName: a.contactName,
    phone: a.phone, email: a.email, status: a.status,
    rating: a.rating ? Number(a.rating) : null,
    coverImage: a.coverImage,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  };
}

function formatDestination(d: typeof destinationsTable.$inferSelect) {
  return {
    id: d.id, tenantId: d.tenantId, name: d.name, country: d.country,
    state: d.state, city: d.city, description: d.description,
    mainAttractions: d.mainAttractions ?? [],
    bestSeason: d.bestSeason, coverImage: d.coverImage,
    gallery: d.gallery ?? [],
    rating: d.rating ? Number(d.rating) : null,
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/suppliers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(suppliersTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, type: parsed.data.type,
      cnpj: parsed.data.cnpj ?? null, email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null, whatsapp: parsed.data.whatsapp ?? null,
      contactName: parsed.data.contactName ?? null,
      addressStreet: parsed.data.addressStreet ?? null,
      addressCity: parsed.data.addressCity ?? null,
      addressState: parsed.data.addressState ?? null,
      bankName: parsed.data.bankName ?? null,
      bankAgency: parsed.data.bankAgency ?? null,
      bankAccount: parsed.data.bankAccount ?? null,
      pixKey: parsed.data.pixKey ?? null,
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof suppliersTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.type != null) updates.type = parsed.data.type;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email ?? null;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
    if (parsed.data.contactName !== undefined) updates.contactName = parsed.data.contactName ?? null;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.pixKey !== undefined) updates.pixKey = parsed.data.pixKey ?? null;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    const me = await requireAuth(req, res);
    if (!me) return;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(vehiclesTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, type: parsed.data.type,
      plate: parsed.data.plate, capacity: parsed.data.capacity,
      model: parsed.data.model ?? null, year: parsed.data.year ?? null,
      amenities: parsed.data.amenities ?? [],
      dailyRate: parsed.data.dailyRate ? String(parsed.data.dailyRate) : null,
      ratePerKm: parsed.data.ratePerKm ? String(parsed.data.ratePerKm) : null,
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof vehiclesTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.capacity != null) updates.capacity = parsed.data.capacity;
    if (parsed.data.dailyRate !== undefined) updates.dailyRate = parsed.data.dailyRate != null ? String(parsed.data.dailyRate) : null;
    if (parsed.data.amenities != null) updates.amenities = parsed.data.amenities;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    const me = await requireAuth(req, res);
    if (!me) return;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(accommodationsTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name, type: parsed.data.type,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null, state: parsed.data.state ?? null,
      totalRooms: parsed.data.totalRooms ?? null,
      pricePerNight: parsed.data.pricePerNight ? String(parsed.data.pricePerNight) : null,
      amenities: parsed.data.amenities ?? [],
      contactName: parsed.data.contactName ?? null,
      phone: parsed.data.phone ?? null, email: parsed.data.email ?? null,
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof accommodationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.pricePerNight != null) updates.pricePerNight = String(parsed.data.pricePerNight);
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.totalRooms !== undefined) updates.totalRooms = parsed.data.totalRooms ?? null;
    if (parsed.data.amenities != null) updates.amenities = parsed.data.amenities;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    const me = await requireAuth(req, res);
    if (!me) return;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(destinationsTable).values({
      id, tenantId: me.tenantId,
      name: parsed.data.name,
      city: parsed.data.city,
      state: parsed.data.state,
      country: parsed.data.country ?? "Brasil",
      description: parsed.data.description ?? null,
      mainAttractions: parsed.data.mainAttractions ?? [],
      bestSeason: parsed.data.bestSeason ?? null,
      coverImage: parsed.data.coverImage ?? null,
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof destinationsTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.mainAttractions != null) updates.mainAttractions = parsed.data.mainAttractions;
    if (parsed.data.gallery != null) updates.gallery = parsed.data.gallery;
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
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(destinationsTable)
      .where(and(eq(destinationsTable.id, req.params.id), eq(destinationsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting destination");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
