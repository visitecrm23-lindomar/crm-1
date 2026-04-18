import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

const UPLOADTHING_HOSTNAME_SUFFIXES = ["utfs.io", "ufs.io", "uploadthing.com"];
const UPLOADTHING_PATH_PREFIX = "/f/";

export function extractVerifiedUploadThingKey(url: string): string | null {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const isKnownHost = UPLOADTHING_HOSTNAME_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
    if (!isKnownHost) return null;
    if (!u.pathname.startsWith(UPLOADTHING_PATH_PREFIX)) return null;
    const key = u.pathname.slice(UPLOADTHING_PATH_PREFIX.length);
    return key || null;
  } catch {
    return null;
  }
}

type Logger = { warn: (obj: object, msg: string) => void };

export async function deleteOrphanedFile(
  oldUrl: string | null | undefined,
  newUrl: string | null | undefined,
  log: Logger
): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  const key = extractVerifiedUploadThingKey(oldUrl);
  if (!key) {
    log.warn({ oldUrl }, "Skipped orphaned file deletion: URL did not match known UploadThing hosts");
    return;
  }
  try {
    await utapi.deleteFiles(key);
  } catch (err) {
    log.warn({ err, fileKey: key }, "Failed to delete orphaned file from UploadThing");
  }
}

export async function deleteOrphanedImages(
  oldImages: string[] | null | undefined,
  newImages: string[] | null | undefined,
  log: Logger
): Promise<void> {
  if (!oldImages || oldImages.length === 0) return;
  const newSet = new Set(newImages ?? []);
  const toDelete = oldImages.filter((url) => !newSet.has(url));
  for (const url of toDelete) {
    await deleteOrphanedFile(url, null, log);
  }
}
