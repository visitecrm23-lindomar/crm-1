import { generateReactHelpers } from "@uploadthing/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { useUploadThing } = generateReactHelpers<any>({
  url: `${BASE}/api/uploadthing`,
});
