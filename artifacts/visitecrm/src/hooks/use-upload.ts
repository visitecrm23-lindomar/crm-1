import { useState } from "react";

const BASE = (import.meta.env.BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

// XHR-based upload with upload-progress support (fetch has no upload progress API)
function xhrUpload<T>(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Resposta inválida do servidor"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(err.error ?? `Erro ${xhr.status}`));
        } catch {
          reject(new Error(`Erro ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Erro de rede ao enviar arquivo"));
    xhr.onabort = () => reject(new Error("Upload cancelado"));
    xhr.send(formData);
  });
}

// POST /api/upload/image — single image
export function useUploadImage(opts?: {
  onBegin?: () => void;
  onComplete?: (url: string) => void;
  onError?: (msg: string) => void;
  onProgress?: (pct: number) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    setProgress(0);
    opts?.onBegin?.();
    const formData = new FormData();
    formData.append("file", files[0]);
    try {
      const data = await xhrUpload<{ url: string }>(
        `${BASE}/api/upload/image`,
        formData,
        (pct) => {
          setProgress(pct);
          opts?.onProgress?.(pct);
        }
      );
      opts?.onComplete?.(data.url);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar imagem");
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  return { startUpload, isUploading, progress };
}

// POST /api/upload/images — multiple images
export function useUploadImages(opts?: {
  onBegin?: () => void;
  onComplete?: (urls: string[]) => void;
  onError?: (msg: string) => void;
  onProgress?: (pct: number) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    setProgress(0);
    opts?.onBegin?.();
    const formData = new FormData();
    files.forEach((f) => formData.append("file", f));
    try {
      const data = await xhrUpload<{ urls: string[] }>(
        `${BASE}/api/upload/images`,
        formData,
        (pct) => {
          setProgress(pct);
          opts?.onProgress?.(pct);
        }
      );
      opts?.onComplete?.(data.urls);
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar imagens");
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  return { startUpload, isUploading, progress };
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
  onProgress?: (pct: number) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    const originalFile = files[0];
    setIsUploading(true);
    setProgress(0);
    opts?.onBegin?.();
    const formData = new FormData();
    formData.append("file", originalFile);
    try {
      const data = await xhrUpload<{ url: string; key: string; name: string; size: number }>(
        `${BASE}/api/upload/document`,
        formData,
        (pct) => {
          setProgress(pct);
          opts?.onProgress?.(pct);
        }
      );
      await opts?.onComplete?.({ ...data, mimeType: originalFile.type });
    } catch (err: unknown) {
      opts?.onError?.((err as Error).message ?? "Erro ao enviar documento");
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  return { startUpload, isUploading, progress };
}
