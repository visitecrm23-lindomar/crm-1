import { Router } from "express";
import { db, tenantsTable, usersTable, plansTable, storesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { getAuth } from "@clerk/express";

const router = Router();

function requireAuthLight(req: import("express").Request, res: import("express").Response): Promise<{ clerkId: string } | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return Promise.resolve(null);
  }
  return Promise.resolve({ clerkId: userId });
}

router.get("/onboarding/status", async (req, res): Promise<void> => {
  try {
    const auth = await requireAuthLight(req, res);
    if (!auth) return;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.clerkId)).limit(1);
    if (!user) {
      res.json({ onboardingComplete: false, hasTenant: false, user: null });
      return;
    }
    res.json({
      onboardingComplete: !!user.tenantId,
      hasTenant: !!user.tenantId,
      tenantId: user.tenantId ?? null,
      role: user.role,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching onboarding status");
    res.status(500).json({ error: "Internal server error" });
  }
});

const AgencyOnboardingBody = z.object({
  name: z.string().min(2, "Nome da agência deve ter pelo menos 2 caracteres"),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  slug: z.string()
    .min(2, "Slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  planId: z.string().optional().default("starter"),
});

router.post("/onboarding/agency", async (req, res): Promise<void> => {
  try {
    const auth = await requireAuthLight(req, res);
    if (!auth) return;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.clerkId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found. Please sync first." });
      return;
    }
    if (user.tenantId) {
      res.status(409).json({ error: "User already has a tenant assigned" });
      return;
    }

    const parsed = AgencyOnboardingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, cnpj, phone, slug, planId } = parsed.data;

    const [existingSlug] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1);
    if (existingSlug) {
      res.status(409).json({ error: "Esse slug já está em uso. Escolha outro." });
      return;
    }

    const tenantId = generateId();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    let tenant: typeof tenantsTable.$inferSelect;
    try {
      [tenant] = await db.transaction(async (tx) => {
        await tx.insert(tenantsTable).values({
          id: tenantId,
          name,
          slug,
          email: user.email,
          cnpj: cnpj ?? null,
          phone: phone ?? null,
          planId: planId ?? "starter",
          status: "trial",
          trialEndsAt,
          limits: { users: 10, clients: 1000, trips: 50 },
          settings: { onboardingCompleted: true },
        });
        await tx.update(usersTable)
          .set({ tenantId, role: "agencia" })
          .where(eq(usersTable.clerkId, auth.clerkId));

        const [existingStore] = await tx
          .select({ id: storesTable.id })
          .from(storesTable)
          .where(eq(storesTable.tenantId, tenantId))
          .limit(1);

        if (!existingStore) {
          await tx.insert(storesTable).values({
            id: generateId(),
            tenantId,
            name,
            slug,
            email: user.email,
            phone: phone ?? null,
            whatsapp: phone ?? null,
            notificationEmail: user.email,
            paymentMethods: ["pix", "credit_card", "boleto", "cash"],
            isActive: true,
          });
        }

        return tx.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
      });
    } catch (txErr) {
      req.log.error({ txErr }, "Onboarding transaction failed");
      res.status(500).json({ error: "Erro ao criar agência. Tente novamente." });
      return;
    }

    res.status(201).json({ tenant, onboardingComplete: true });
  } catch (err) {
    req.log.error({ err }, "Error completing agency onboarding");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/onboarding/plans", async (req, res): Promise<void> => {
  try {
    const plans = await db.select().from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.sortOrder), asc(plansTable.createdAt));
    res.json(plans);
  } catch (err) {
    req.log.error({ err }, "Error listing plans for onboarding");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/onboarding/check-slug", async (req, res): Promise<void> => {
  try {
    const slug = req.query["slug"] as string;
    if (!slug) {
      res.status(400).json({ error: "slug query param required" });
      return;
    }
    const [existing] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1);
    res.json({ available: !existing });
  } catch (err) {
    req.log.error({ err }, "Error checking slug");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
