import { useState, useRef } from "react";

const UPLOAD_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/upload";

const MAX_RETRIES = 2;

interface UploadCallbacks {
  onBegin?: () => void;
  onComplete?: (result: { url: string; key: string; name: string; size?: number; mimeType?: string }) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

interface MultiUploadCallbacks {
  onBegin?: () => void;
  onComplete?: (results: Array<{ url: string; key: string; name: string }>) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

interface UploadOptions {
  maxSizeMB?: number;
}

class UploadHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "UploadHttpError";
  }
}

function makeAbortError(): Error {
  const err = new Error("Upload cancelado");
  err.name = "AbortError";
  return err;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return false;
  if (err instanceof UploadHttpError && err.status < 500) return false;
  return true;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  onRetrying: (attempt: number) => void,
  resetProgress: () => void,
  isCancelled: () => boolean
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      resetProgress();
      onRetrying(attempt);
      await new Promise<void>((res) => setTimeout(res, attempt * 1000));
      if (isCancelled()) throw makeAbortError();
    }
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

function xhrUpload<T>(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void,
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open("POST", url);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Resposta inválida do servidor"));
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const json = JSON.parse(xhr.responseText) as { error?: string };
          if (json.error) msg = json.error;
        } catch { /* ignore */ }
        reject(new UploadHttpError(xhr.status, msg));
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      reject(new Error("Erro de rede"));
    };

    xhr.onabort = () => {
      xhrRef.current = null;
      reject(makeAbortError());
    };

    xhr.send(form);
  });
}

export function useUploadImage(callbacks: UploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);

  async function startUpload(file: File) {
    cancelledRef.current = false;
    setIsUploading(true);
    setIsRetrying(false);
    setUploadProgress(0);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      if (options.maxSizeMB) {
        form.append("maxSizeMB", String(options.maxSizeMB));
      }
      const data = await withRetry(
        () => xhrUpload<{ url: string; key: string; name: string }>(
          `${UPLOAD_BASE}/image`, form, setUploadProgress, xhrRef
        ),
        () => setIsRetrying(true),
        () => setUploadProgress(0),
        () => cancelledRef.current
      );
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        callbacks.onCancel?.();
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      setIsRetrying(false);
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    cancelledRef.current = true;
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, isRetrying, uploadProgress, cancelUpload };
}

export function useUploadImages(callbacks: MultiUploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);

  async function startUpload(files: File[]) {
    if (!files.length) return;
    cancelledRef.current = false;
    setIsUploading(true);
    setIsRetrying(false);
    setUploadProgress(0);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
      }
      if (options.maxSizeMB) {
        form.append("maxSizeMB", String(options.maxSizeMB));
      }
      const data = await withRetry(
        () => xhrUpload<Array<{ url: string; key: string; name: string }>>(
          `${UPLOAD_BASE}/images`, form, setUploadProgress, xhrRef
        ),
        () => setIsRetrying(true),
        () => setUploadProgress(0),
        () => cancelledRef.current
      );
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        callbacks.onCancel?.();
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      setIsRetrying(false);
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    cancelledRef.current = true;
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, isRetrying, uploadProgress, cancelUpload };
}

export function useUploadDocument(callbacks: UploadCallbacks = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);

  async function startUpload(file: File) {
    cancelledRef.current = false;
    setIsUploading(true);
    setIsRetrying(false);
    setUploadProgress(0);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await withRetry(
        () => xhrUpload<{ url: string; key: string; name: string; size?: number; mimeType?: string }>(
          `${UPLOAD_BASE}/document`, form, setUploadProgress, xhrRef
        ),
        () => setIsRetrying(true),
        () => setUploadProgress(0),
        () => cancelledRef.current
      );
      callbacks.onComplete?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        callbacks.onCancel?.();
        return;
      }
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsUploading(false);
      setIsRetrying(false);
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    cancelledRef.current = true;
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, isRetrying, uploadProgress, cancelUpload };
}
