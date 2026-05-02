import { Router, type NextFunction } from "express";
import { db, tenantsTable, usersTable, plansTable, storesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { getAuth } from "@clerk/express";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../lib/errors";

const router = Router();

function requireAuthLight(req: import("express").Request): { clerkId: string } {
  const { userId } = getAuth(req);
  if (!userId) {
    throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
  }
  return { clerkId: userId };
}

router.get("/onboarding/status", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = requireAuthLight(req);
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
    next(err);
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

router.post("/onboarding/agency", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const auth = requireAuthLight(req);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.clerkId)).limit(1);
    if (!user) {
      next(new NotFoundError("User not found. Please sync first.", "USER_NOT_FOUND"));
      return;
    }
    if (user.tenantId) {
      next(new ConflictError("User already has a tenant assigned", "TENANT_ALREADY_ASSIGNED"));
      return;
    }

    const parsed = AgencyOnboardingBody.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError(String(parsed.error.message)));
      return;
    }

    const { name, cnpj, phone, slug, planId } = parsed.data;

    const [[existingTenantSlug], [existingStoreSlug]] = await Promise.all([
      db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1),
      db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.slug, slug)).limit(1),
    ]);
    if (existingTenantSlug || existingStoreSlug) {
      next(new ConflictError("Esse slug já está em uso. Escolha outro.", "SLUG_CONFLICT"));
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
      const dbErr = txErr as { code?: string };
      if (dbErr?.code === "23505") {
        next(new ConflictError("Esse slug já está em uso. Escolha outro.", "SLUG_CONFLICT"));
        return;
      }
      req.log.error({ txErr }, "Onboarding transaction failed");
      next(new AppError("Erro ao criar agência. Tente novamente.", 500, "ONBOARDING_TX_FAILED"));
      return;
    }

    res.status(201).json({ tenant, onboardingComplete: true });
  } catch (err) {
    req.log.error({ err }, "Error completing agency onboarding");
    next(err);
  }
});

router.get("/onboarding/plans", async (req, res, next: NextFunction): Promise<void> => {
  try {
    requireAuthLight(req);
    const plans = await db.select().from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.sortOrder), asc(plansTable.createdAt));
    res.json(plans);
  } catch (err) {
    req.log.error({ err }, "Error listing plans for onboarding");
    next(err);
  }
});

router.get("/onboarding/check-slug", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const slug = req.query["slug"] as string;
    if (!slug) {
      next(new ValidationError("slug query param required", "MISSING_PARAM"));
      return;
    }
    const [[existingTenant], [existingStore]] = await Promise.all([
      db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1),
      db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.slug, slug)).limit(1),
    ]);
    res.json({ available: !existingTenant && !existingStore });
  } catch (err) {
    req.log.error({ err }, "Error checking slug");
    next(err);
  }
});

export default router;
