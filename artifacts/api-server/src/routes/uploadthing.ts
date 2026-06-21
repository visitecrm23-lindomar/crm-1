import { createUploadthing, createRouteHandler, type FileRouter } from "uploadthing/express";
import { getAuth } from "@clerk/express";

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
  if (process.env["REPLIT_DEV_DOMAIN"]) {
    return `https://${process.env["REPLIT_DEV_DOMAIN"]}/api/uploadthing`;
  }
  if (process.env["FRONTEND_URL"]) {
    return `${process.env["FRONTEND_URL"].replace(/\/$/, "")}/api/uploadthing`;
  }
  return undefined;
}

export const uploadthingRouter = createRouteHandler({
  router: uploadRouter,
  config: { callbackUrl: resolveCallbackUrl() },
});
