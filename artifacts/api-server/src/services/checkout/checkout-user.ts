// CRM client (clientsTable) upsert that runs INSIDE the order transaction for
// atomicity. Clerk portal account creation lives in `portal-account.ts` because
// it must run OUTSIDE the transaction (external Clerk API call, fire-and-forget,
// post-commit) and is invoked from `post-booking.ts`.
import { clientsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { generateId } from "../../lib/id";
import type { Tx } from "./tx";

export interface UpsertCheckoutClientArgs {
  tenantId: string;
  email: string;
  name: string;
  phone?: string;
  cpf?: string;
  birthDate: Date | null;
  createdById: string;
}

export async function upsertCheckoutClient(tx: Tx, args: UpsertCheckoutClientArgs): Promise<string> {
  const { tenantId, email, name, phone, cpf, birthDate, createdById } = args;

  const [existing] = await tx
    .select({ id: clientsTable.id, cpf: clientsTable.cpf, birthDate: clientsTable.birthDate })
    .from(clientsTable)
    .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.email, email)))
    .limit(1);

  if (existing) {
    const updateFields: Record<string, unknown> = {};
    if (!existing.birthDate && birthDate) updateFields.birthDate = birthDate;
    if (!existing.cpf && cpf) {
      const [cpfOwner] = await tx
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.cpf, cpf)))
        .limit(1);
      if (!cpfOwner) updateFields.cpf = cpf;
    }
    if (Object.keys(updateFields).length > 0) {
      await tx.update(clientsTable).set(updateFields).where(eq(clientsTable.id, existing.id));
    }
    return existing.id;
  }

  const newClientId = generateId();
  let cpfToInsert: string | undefined;
  if (cpf) {
    const [cpfOwner] = await tx
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.cpf, cpf)))
      .limit(1);
    if (!cpfOwner) cpfToInsert = cpf;
  }
  await tx.insert(clientsTable).values({
    id: newClientId,
    tenantId,
    name,
    email,
    whatsapp: phone ?? "",
    createdById,
    ...(cpfToInsert ? { cpf: cpfToInsert } : {}),
    ...(birthDate ? { birthDate } : {}),
  });
  return newClientId;
}
