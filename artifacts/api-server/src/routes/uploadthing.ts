import type { FileRouter } from "uploadthing/express";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

// Dynamic require: uploadthing is external in esbuild (see build.mjs), so the
// require() below executes at runtime — after patchGlobalFetch() in lib/uploadthing.ts
// has already run and globalThis.fetch is the patched version.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createUploadthing, createRouteHandler } = require("uploadthing/express") as {
  createUploadthing: typeof import("uploadthing/express").createUploadthing;
  createRouteHandler: typeof import("uploadthing/express").createRouteHandler;
};

const f = createUploadthing();

export const uploadRouter = {
  tripCoverImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  tripGalleryImages: f({ image: { maxFileSize: "4MB", maxFileCount: 3 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  storeLogo: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  storeBanner: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  storeProductImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  agencyLogo: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  accommodationGallery: f({ image: { maxFileSize: "8MB", maxFileCount: 10 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  clientDocument: f({
    image: { maxFileSize: "16MB", maxFileCount: 1 },
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
    "application/msword": { maxFileSize: "16MB", maxFileCount: 1 },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { maxFileSize: "16MB", maxFileCount: 1 },
    "application/vnd.ms-excel": { maxFileSize: "16MB", maxFileCount: 1 },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { maxFileSize: "16MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl, key: file.key, name: file.name, size: file.size };
    }),
} satisfies FileRouter;

function resolveCallbackUrl(): string | undefined {
  if (process.env["UPLOADTHING_CALLBACK_URL"]) {
    return process.env["UPLOADTHING_CALLBACK_URL"];
  }
  // In development, UploadThing uses a dev-hook: the server calls itself.
  // Use the internal URL to avoid a slow internet roundtrip that silently times out.
  if (process.env["NODE_ENV"] === "development") {
    const port = process.env["PORT"] ?? "8080";
    return `http://localhost:${port}/api/uploadthing`;
  }
  // In production, UploadThing's CDN makes the callback — must be the public URL.
  if (process.env["FRONTEND_URL"]) {
    return `${process.env["FRONTEND_URL"].replace(/\/$/, "")}/api/uploadthing`;
  }
  // Fallback: use first domain from REPLIT_DOMAINS (platform-injected in deployment).
  // This variable is already used for CORS/authorizedParties and reliably contains
  // the public hostname in Replit-deployed environments.
  const firstReplitDomain = (process.env["REPLIT_DOMAINS"] ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)[0];
  if (firstReplitDomain) {
    return `https://${firstReplitDomain}/api/uploadthing`;
  }
  return undefined;
}

const callbackUrl = resolveCallbackUrl();
logger.info({ callbackUrl: callbackUrl ?? "(undefined — UploadThing will use its own default)" }, "[uploadthing] resolved callback URL");

export const uploadthingRouter = createRouteHandler({
  router: uploadRouter,
  config: { callbackUrl },
});
