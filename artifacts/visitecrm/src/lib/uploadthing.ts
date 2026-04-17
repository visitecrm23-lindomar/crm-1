import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";
import type { AnyFileRoute } from "uploadthing/types";

export type OurFileRouter = {
  tripCoverImage: AnyFileRoute;
  tripGalleryImages: AnyFileRoute;
  storeLogo: AnyFileRoute;
  storeBanner: AnyFileRoute;
};

const url =
  (import.meta.env.VITE_UPLOADTHING_URL as string | undefined) ??
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/uploadthing`;

export const { useUploadThing, uploadFiles } =
  generateReactHelpers<OurFileRouter>({ url });

export const UploadButton = generateUploadButton<OurFileRouter>({ url });

export const UploadDropzone = generateUploadDropzone<OurFileRouter>({ url });
