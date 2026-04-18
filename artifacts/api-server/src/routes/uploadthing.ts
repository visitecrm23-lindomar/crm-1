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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accommodationGallery: f({ image: { maxFileSize: "5MB" as any, maxFileCount: 10 } })
    .middleware(async ({ req }) => {
      const { userId } = getAuth(req);
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export const uploadthingRouter = createRouteHandler({ router: uploadRouter });
