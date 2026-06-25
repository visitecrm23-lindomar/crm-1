import { useState, useRef } from "react";

const UPLOAD_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/upload";

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
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      reject(new Error("Erro de rede"));
    };

    xhr.onabort = () => {
      xhrRef.current = null;
      const err = new Error("Upload cancelado");
      err.name = "AbortError";
      reject(err);
    };

    xhr.send(form);
  });
}

export function useUploadImage(callbacks: UploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function startUpload(file: File) {
    setIsUploading(true);
    setUploadProgress(0);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      if (options.maxSizeMB) {
        form.append("maxSizeMB", String(options.maxSizeMB));
      }
      const data = await xhrUpload<{ url: string; key: string; name: string }>(
        `${UPLOAD_BASE}/image`,
        form,
        setUploadProgress,
        xhrRef
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
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, uploadProgress, cancelUpload };
}

export function useUploadImages(callbacks: MultiUploadCallbacks = {}, options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function startUpload(files: File[]) {
    if (!files.length) return;
    setIsUploading(true);
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
      const data = await xhrUpload<Array<{ url: string; key: string; name: string }>>(
        `${UPLOAD_BASE}/images`,
        form,
        setUploadProgress,
        xhrRef
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
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, uploadProgress, cancelUpload };
}

export function useUploadDocument(callbacks: UploadCallbacks = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function startUpload(file: File) {
    setIsUploading(true);
    setUploadProgress(0);
    callbacks.onBegin?.();
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await xhrUpload<{ url: string; key: string; name: string; size?: number; mimeType?: string }>(
        `${UPLOAD_BASE}/document`,
        form,
        setUploadProgress,
        xhrRef
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
      setUploadProgress(0);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
  }

  return { startUpload, isUploading, uploadProgress, cancelUpload };
}
