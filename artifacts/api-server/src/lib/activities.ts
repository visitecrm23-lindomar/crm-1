import { db, notesTable } from "@workspace/db";
import { generateId } from "./id";

export async function writeClientActivity(
  clientId: string,
  type: string,
  content: string,
  createdById: string,
): Promise<void> {
  await db.insert(notesTable).values({
    id: generateId(),
    clientId,
    type,
    content,
    isPrivate: false,
    createdById,
  });
}
