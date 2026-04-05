import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable, vehiclesTable, accommodationsTable, destinationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import {
  CreateSupplierBody, UpdateSupplierBody,
  CreateVehicleBody, UpdateVehicleBody,
  CreateAccommodationBody, UpdateAccommodationBody,
  CreateDestinationBody, UpdateDestinationBody,
} from "@workspace/api-zod";

const router = Router();

async function getTenantInfo(req: any) {
  const auth = req.auth;
  if (!auth?.userId) return null;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  return me;
}

// Suppliers
router.get("/suppliers", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const suppliers = await db.select().from(suppliersTable)
      .where(eq(suppliersTable.tenantId, me.tenantId)).orderBy(desc(suppliersTable.createdAt));
    res.json(suppliers.map(s => ({
      id: s.id, name: s.name, type: s.type, cnpj: s.cnpj, contactName: s.contactName,
      email: s.email, whatsapp: s.whatsapp, phone: s.phone,
      addressCity: s.addressCity, addressState: s.addressState, pixKey: s.pixKey,
      status: s.status, createdAt: s.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/suppliers", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(suppliersTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, type: parsed.data.type,
      cnpj: parsed.data.cnpj ?? null, contactName: parsed.data.contactName ?? null,
      email: parsed.data.email ?? null, whatsapp: parsed.data.whatsapp ?? null,
      addressCity: parsed.data.addressCity ?? null, addressState: parsed.data.addressState ?? null,
      pixKey: parsed.data.pixKey ?? null,
    });
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id)).limit(1);
    res.status(201).json({ id: s.id, name: s.name, type: s.type, cnpj: s.cnpj, contactName: s.contactName,
      email: s.email, whatsapp: s.whatsapp, phone: s.phone, addressCity: s.addressCity,
      addressState: s.addressState, pixKey: s.pixKey, status: s.status, createdAt: s.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateSupplierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.contactName !== undefined) updates.contactName = parsed.data.contactName;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email;
    if (parsed.data.pixKey !== undefined) updates.pixKey = parsed.data.pixKey;
    await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, req.params.id));
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, req.params.id)).limit(1);
    if (!s) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: s.id, name: s.name, type: s.type, cnpj: s.cnpj, contactName: s.contactName,
      email: s.email, whatsapp: s.whatsapp, phone: s.phone, addressCity: s.addressCity,
      addressState: s.addressState, pixKey: s.pixKey, status: s.status, createdAt: s.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(suppliersTable).where(eq(suppliersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// Vehicles
router.get("/vehicles", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const vehicles = await db.select().from(vehiclesTable)
      .where(eq(vehiclesTable.tenantId, me.tenantId)).orderBy(desc(vehiclesTable.createdAt));
    res.json(vehicles.map(v => ({
      id: v.id, name: v.name, type: v.type, plate: v.plate, capacity: v.capacity,
      model: v.model, year: v.year, amenities: v.amenities ?? [],
      dailyRate: v.dailyRate ? Number(v.dailyRate) : null, photoUrl: v.photoUrl,
      status: v.status, createdAt: v.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/vehicles", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(vehiclesTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, type: parsed.data.type, plate: parsed.data.plate,
      capacity: parsed.data.capacity, model: parsed.data.model ?? null,
      year: parsed.data.year ?? null, amenities: parsed.data.amenities ?? [],
      dailyRate: parsed.data.dailyRate ? String(parsed.data.dailyRate) : null,
      photoUrl: parsed.data.photoUrl ?? null,
    });
    const [v] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
    res.status(201).json({ id: v.id, name: v.name, type: v.type, plate: v.plate, capacity: v.capacity,
      model: v.model, year: v.year, amenities: v.amenities ?? [],
      dailyRate: v.dailyRate ? Number(v.dailyRate) : null, photoUrl: v.photoUrl,
      status: v.status, createdAt: v.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateVehicleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.capacity != null) updates.capacity = parsed.data.capacity;
    if (parsed.data.dailyRate !== undefined) updates.dailyRate = parsed.data.dailyRate ? String(parsed.data.dailyRate) : null;
    await db.update(vehiclesTable).set(updates).where(eq(vehiclesTable.id, req.params.id));
    const [v] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, req.params.id)).limit(1);
    if (!v) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: v.id, name: v.name, type: v.type, plate: v.plate, capacity: v.capacity,
      model: v.model, year: v.year, amenities: v.amenities ?? [],
      dailyRate: v.dailyRate ? Number(v.dailyRate) : null, photoUrl: v.photoUrl,
      status: v.status, createdAt: v.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/vehicles/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(vehiclesTable).where(eq(vehiclesTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// Accommodations
router.get("/accommodations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const accs = await db.select().from(accommodationsTable)
      .where(eq(accommodationsTable.tenantId, me.tenantId)).orderBy(desc(accommodationsTable.createdAt));
    res.json(accs.map(a => ({
      id: a.id, name: a.name, type: a.type, address: a.address, city: a.city, state: a.state,
      contactName: a.contactName, phone: a.phone, email: a.email, totalRooms: a.totalRooms,
      amenities: a.amenities ?? [], pricePerNight: a.pricePerNight ? Number(a.pricePerNight) : null,
      coverImage: a.coverImage, rating: a.rating ? Number(a.rating) : null,
      status: a.status, createdAt: a.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/accommodations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(accommodationsTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, type: parsed.data.type,
      address: parsed.data.address ?? null, city: parsed.data.city ?? null, state: parsed.data.state ?? null,
      contactName: parsed.data.contactName ?? null, phone: parsed.data.phone ?? null, email: parsed.data.email ?? null,
      totalRooms: parsed.data.totalRooms ?? null, amenities: parsed.data.amenities ?? [],
      pricePerNight: parsed.data.pricePerNight ? String(parsed.data.pricePerNight) : null,
    });
    const [a] = await db.select().from(accommodationsTable).where(eq(accommodationsTable.id, id)).limit(1);
    res.status(201).json({ id: a.id, name: a.name, type: a.type, address: a.address, city: a.city, state: a.state,
      contactName: a.contactName, phone: a.phone, email: a.email, totalRooms: a.totalRooms,
      amenities: a.amenities ?? [], pricePerNight: a.pricePerNight ? Number(a.pricePerNight) : null,
      coverImage: a.coverImage, rating: a.rating ? Number(a.rating) : null,
      status: a.status, createdAt: a.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateAccommodationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.pricePerNight !== undefined) updates.pricePerNight = parsed.data.pricePerNight ? String(parsed.data.pricePerNight) : null;
    if (parsed.data.totalRooms !== undefined) updates.totalRooms = parsed.data.totalRooms;
    await db.update(accommodationsTable).set(updates).where(eq(accommodationsTable.id, req.params.id));
    const [a] = await db.select().from(accommodationsTable).where(eq(accommodationsTable.id, req.params.id)).limit(1);
    if (!a) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: a.id, name: a.name, type: a.type, address: a.address, city: a.city, state: a.state,
      contactName: a.contactName, phone: a.phone, email: a.email, totalRooms: a.totalRooms,
      amenities: a.amenities ?? [], pricePerNight: a.pricePerNight ? Number(a.pricePerNight) : null,
      coverImage: a.coverImage, rating: a.rating ? Number(a.rating) : null,
      status: a.status, createdAt: a.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(accommodationsTable).where(eq(accommodationsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

// Destinations
router.get("/destinations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }
    const dests = await db.select().from(destinationsTable)
      .where(eq(destinationsTable.tenantId, me.tenantId)).orderBy(desc(destinationsTable.createdAt));
    res.json(dests.map(d => ({
      id: d.id, name: d.name, city: d.city, state: d.state, country: d.country,
      description: d.description, mainAttractions: d.mainAttractions ?? [],
      bestSeason: d.bestSeason, coverImage: d.coverImage, rating: d.rating ? Number(d.rating) : null,
      createdAt: d.createdAt.toISOString(),
    })));
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/destinations", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(destinationsTable).values({
      id, tenantId: me.tenantId ?? "default-tenant",
      name: parsed.data.name, city: parsed.data.city, state: parsed.data.state,
      country: parsed.data.country ?? "Brasil",
      description: parsed.data.description ?? null,
      mainAttractions: parsed.data.mainAttractions ?? [],
      bestSeason: parsed.data.bestSeason ?? null, coverImage: parsed.data.coverImage ?? null,
    });
    const [d] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, id)).limit(1);
    res.status(201).json({ id: d.id, name: d.name, city: d.city, state: d.state, country: d.country,
      description: d.description, mainAttractions: d.mainAttractions ?? [],
      bestSeason: d.bestSeason, coverImage: d.coverImage, rating: d.rating ? Number(d.rating) : null,
      createdAt: d.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/destinations/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateDestinationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.mainAttractions != null) updates.mainAttractions = parsed.data.mainAttractions;
    if (parsed.data.bestSeason !== undefined) updates.bestSeason = parsed.data.bestSeason;
    if (parsed.data.coverImage !== undefined) updates.coverImage = parsed.data.coverImage;
    if (parsed.data.rating !== undefined) updates.rating = parsed.data.rating ? String(parsed.data.rating) : null;
    await db.update(destinationsTable).set(updates).where(eq(destinationsTable.id, req.params.id));
    const [d] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, req.params.id)).limit(1);
    if (!d) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: d.id, name: d.name, city: d.city, state: d.state, country: d.country,
      description: d.description, mainAttractions: d.mainAttractions ?? [],
      bestSeason: d.bestSeason, coverImage: d.coverImage, rating: d.rating ? Number(d.rating) : null,
      createdAt: d.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/destinations/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(destinationsTable).where(eq(destinationsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "Error"); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
