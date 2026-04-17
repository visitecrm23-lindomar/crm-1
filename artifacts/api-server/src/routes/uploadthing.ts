import { createUploadthing, createRouteHandler, type FileRouter } from "uploadthing/express";
import { getAuth } from "@clerk/express";

const f = createUploadthing();

const requireAuth = async ({ req }: Parameters<Parameters<typeof f>[0]["middleware"]>[0]) => {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return { userId };
};

export const uploadRouter = {
  tripCoverImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(requireAuth)
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  tripGalleryImages: f({ image: { maxFileSize: "4MB", maxFileCount: 3 } })
    .middleware(requireAuth)
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  storeLogo: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(requireAuth)
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  storeBanner: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(requireAuth)
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter;

export const uploadthingRouter = createRouteHandler({ router: uploadRouter });
