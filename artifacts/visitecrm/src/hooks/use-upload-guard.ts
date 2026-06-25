import { useEffect, useRef } from "react";

const WARN_MSG = "Você tem um envio em andamento. Tem certeza que deseja sair?";

// Module-level counter so multiple hook instances on the same page coordinate.
// The history patch is installed only when the first upload starts and removed
// when the last active upload ends.
let activeUploads = 0;
let savedPushState: typeof history.pushState | null = null;
let savedReplaceState: typeof history.replaceState | null = null;

function installHistoryGuard(): void {
  if (savedPushState !== null) return;
  savedPushState = history.pushState.bind(history);
  savedReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    if (activeUploads > 0 && !window.confirm(WARN_MSG)) return;
    savedPushState!(...args);
  };

  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    if (activeUploads > 0 && !window.confirm(WARN_MSG)) return;
    savedReplaceState!(...args);
  };
}

function removeHistoryGuard(): void {
  if (savedPushState === null) return;
  history.pushState = savedPushState;
  history.replaceState = savedReplaceState!;
  savedPushState = null;
  savedReplaceState = null;
}

/**
 * Warns the user before leaving the page while an upload is in progress.
 *
 * - Browser-level: hooks into `beforeunload` to intercept tab close, refresh,
 *   and native back/forward navigation.
 * - In-app level: patches `history.pushState` / `replaceState` (used by wouter)
 *   to show a native confirmation dialog before any client-side route change.
 *
 * Multiple simultaneous hook instances are safe: the history patch is reference-
 * counted and only installed/removed at the first/last active upload boundary.
 */
export function useUploadGuard(isUploading: boolean): void {
  const wasUploadingRef = useRef(false);

  // Browser tab close, page refresh, and native back/forward button
  useEffect(() => {
    if (!isUploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = WARN_MSG;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isUploading]);

  // In-app (wouter) navigation via pushState / replaceState
  useEffect(() => {
    if (isUploading === wasUploadingRef.current) return;
    wasUploadingRef.current = isUploading;

    if (isUploading) {
      if (activeUploads++ === 0) installHistoryGuard();
    } else {
      activeUploads = Math.max(0, activeUploads - 1);
      if (activeUploads === 0) removeHistoryGuard();
    }
  }, [isUploading]);

  // Safety net: clean up if the component unmounts while still uploading
  useEffect(() => {
    return () => {
      if (wasUploadingRef.current) {
        wasUploadingRef.current = false;
        activeUploads = Math.max(0, activeUploads - 1);
        if (activeUploads === 0) removeHistoryGuard();
      }
    };
  }, []);
}
