import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";
import type { AnyFileRoute } from "uploadthing/types";

type OurFileRouter = {
  tripCoverImage: AnyFileRoute;
  tripGalleryImages: AnyFileRoute;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const url = `${BASE}/api/uploadthing`;

export const { useUploadThing, uploadFiles } =
  generateReactHelpers<OurFileRouter>({ url });

export const UploadButton = generateUploadButton<OurFileRouter>({ url });

export const UploadDropzone = generateUploadDropzone<OurFileRouter>({ url });
