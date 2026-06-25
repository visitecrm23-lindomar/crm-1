import { useState, useRef } from "react";

const UPLOAD_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/upload";

interface UploadCallbacks {
  onBegin?: () => void;
  onComplete?: (result: { url: string; key: string; name: string; size?: number; mimeType?: string }) => void;
  onError?: (error: Error) => void;
}

interface MultiUploadCallbacks {
  onBegin?: () => void;
  onComplete?: (results: Array<{ url: string; key: string; name: string }>) => void;
  onError?: (error: Error) => void;
}

interface UploadOptions {
  maxSizeMB?: number;
}

export function useUploadImage(callbacks: UploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function startUpload(file: File) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsUploading(true);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      if (options.maxSizeMB) {
        form.append("maxSizeMB", String(options.maxSizeMB));
      }
      const resp = await fetch(`${UPLOAD_BASE}/image`, {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json() as { url: string; key: string; name: string };
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  }

  function cancelUpload() {
    abortControllerRef.current?.abort();
  }

  return { startUpload, isUploading, cancelUpload };
}

export function useUploadImages(callbacks: MultiUploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function startUpload(files: File[]) {
    if (!files.length) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsUploading(true);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
      }
      if (options.maxSizeMB) {
        form.append("maxSizeMB", String(options.maxSizeMB));
      }
      const resp = await fetch(`${UPLOAD_BASE}/images`, {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json() as Array<{ url: string; key: string; name: string }>;
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  }

  function cancelUpload() {
    abortControllerRef.current?.abort();
  }

  return { startUpload, isUploading, cancelUpload };
}

export function useUploadDocument(callbacks: UploadCallbacks = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function startUpload(file: File) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsUploading(true);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${UPLOAD_BASE}/document`, {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json() as { url: string; key: string; name: string; size?: number; mimeType?: string };
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  }

  function cancelUpload() {
    abortControllerRef.current?.abort();
  }

  return { startUpload, isUploading, cancelUpload };
}
