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

export interface UpsertCheckoutClientResult {
  clientId: string;
  isNew: boolean;
}

export async function upsertCheckoutClient(tx: Tx, args: UpsertCheckoutClientArgs): Promise<UpsertCheckoutClientResult> {
  const { tenantId, email, name, phone, cpf, birthDate, createdById } = args;

  const [existing] = await tx
    .select({ id: clientsTable.id, cpf: clientsTable.cpf, birthDate: clientsTable.birthDate })
    .from(clientsTable)
    .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.email, email)))
    .limit(1);

  if (existing) {
    // Do NOT enrich existing records with CPF or birthDate from an anonymous
    // storefront checkout. The caller has not verified ownership of the email
    // address, CPF, or birthDate — overwriting a real customer's sensitive
    // fields with attacker-supplied values is an integrity violation.
    // Fields can only be updated through authenticated, staff-gated CRM flows.
    return { clientId: existing.id, isNew: false };
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
  return { clientId: newClientId, isNew: true };
}
