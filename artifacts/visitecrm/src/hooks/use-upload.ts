import { useState } from "react";

const BASE = (import.meta.env.BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export interface UploadImageResult {
  url: string;
  key: string;
}

export interface UploadDocumentResult {
  url: string;
  key: string;
  name: string;
  size: number;
  mimeType: string;
}

export function useUploadImage(opts?: {
  onBegin?: () => void;
  onComplete?: (result: UploadImageResult) => void;
  onError?: (msg: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    opts?.onBegin?.();
    const formData = new FormData();
    formData.append("file", files[0]);
    try {
      const res = await fetch(`${BASE}/api/upload/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const data = (await res.json()) as UploadImageResult;
      opts?.onComplete?.(data);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}

export function useUploadImages(opts?: {
  onBegin?: () => void;
  onComplete?: (results: UploadImageResult[]) => void;
  onError?: (msg: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    opts?.onBegin?.();
    const formData = new FormData();
    files.forEach((f) => formData.append("file", f));
    try {
      const res = await fetch(`${BASE}/api/upload/images`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const data = (await res.json()) as { urls: string[] };
      opts?.onComplete?.(data.urls.map((url, i) => ({ url, key: `img-${i}` })));
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}

export function useUploadDocument(opts?: {
  onBegin?: () => void;
  onComplete?: (result: UploadDocumentResult) => void;
  onError?: (msg: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    opts?.onBegin?.();
    const formData = new FormData();
    formData.append("file", files[0]);
    try {
      const res = await fetch(`${BASE}/api/upload/document`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const data = (await res.json()) as UploadDocumentResult;
      opts?.onComplete?.(data);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}
