import { useState } from "react";

const BASE = (import.meta.env.BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

// POST /api/upload/image — single image
export function useUploadImage(opts?: {
  onBegin?: () => void;
  onComplete?: (url: string) => void;
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
      const data = await res.json() as { url: string };
      opts?.onComplete?.(data.url);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar imagem");
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}

// POST /api/upload/images — multiple images
export function useUploadImages(opts?: {
  onBegin?: () => void;
  onComplete?: (urls: string[]) => void;
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
      const data = await res.json() as { urls: string[] };
      opts?.onComplete?.(data.urls);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar imagens");
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}

// POST /api/upload/document — single document (image/pdf/word/excel)
export function useUploadDocument(opts?: {
  onBegin?: () => void;
  onComplete?: (result: {
    url: string;
    key: string;
    name: string;
    size: number;
    mimeType: string;
  }) => void | Promise<void>;
  onError?: (msg: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    const originalFile = files[0];
    setIsUploading(true);
    opts?.onBegin?.();
    const formData = new FormData();
    formData.append("file", originalFile);
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
      const data = await res.json() as { url: string; key: string; name: string; size: number };
      await opts?.onComplete?.({ ...data, mimeType: originalFile.type });
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar documento");
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}
