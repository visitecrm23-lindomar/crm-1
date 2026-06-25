import { useEffect, useRef } from "react";

const WARN_MSG = "Você tem um envio em andamento. Tem certeza que deseja sair?";

// Module-level state — safe for multiple hook instances on the same page.
// The history patch is installed only at the first active upload and removed
// when the last active upload ends.
let activeUploads = 0;
let savedPushState: typeof history.pushState | null = null;
let savedReplaceState: typeof history.replaceState | null = null;
let popstateHandler: (() => void) | null = null;

// URL at the time the guard is active (updated by each guarded navigation).
let guardedHref: string | null = null;

// Prevents our own synthetic popstate dispatch from re-entering the handler.
let isRestoringNavigation = false;

function installHistoryGuard(): void {
  if (savedPushState !== null) return;
  savedPushState = history.pushState.bind(history);
  savedReplaceState = history.replaceState.bind(history);
  guardedHref = location.href;

  // Intercept in-app pushState navigation (wouter's navigate / Link clicks).
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    if (activeUploads > 0 && !window.confirm(WARN_MSG)) return;
    savedPushState!(...args);
    guardedHref = location.href;
  };

  // Intercept in-app replaceState navigation.
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    if (activeUploads > 0 && !window.confirm(WARN_MSG)) return;
    savedReplaceState!(...args);
    guardedHref = location.href;
  };

  // Intercept browser back/forward navigation (popstate is fired AFTER the URL
  // already changed, so if the user cancels we push the old URL back and dispatch
  // a synthetic popstate so wouter re-renders the correct page).
  popstateHandler = () => {
    if (isRestoringNavigation) {
      // This is our own synthetic event — skip and reset the flag.
      isRestoringNavigation = false;
      return;
    }
    if (activeUploads === 0) {
      guardedHref = location.href;
      return;
    }
    if (window.confirm(WARN_MSG)) {
      // User confirmed — allow the navigation, update our tracked href.
      guardedHref = location.href;
    } else {
      // User cancelled — restore the previous URL, then re-sync wouter by
      // dispatching a synthetic popstate (pushState alone does not fire it).
      isRestoringNavigation = true;
      savedPushState!(null, "", guardedHref ?? location.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }
  };

  window.addEventListener("popstate", popstateHandler);
}

function removeHistoryGuard(): void {
  if (savedPushState === null) return;
  history.pushState = savedPushState;
  history.replaceState = savedReplaceState!;
  savedPushState = null;
  savedReplaceState = null;

  if (popstateHandler) {
    window.removeEventListener("popstate", popstateHandler);
    popstateHandler = null;
  }

  guardedHref = null;
  isRestoringNavigation = false;
}

/**
 * Warns the user before leaving the page while an upload is in progress.
 *
 * - Tab close / page refresh / external URL: handled via `beforeunload`.
 * - In-app navigation (wouter Link / navigate()): blocked via patched
 *   `history.pushState` / `replaceState`.
 * - Browser back/forward within SPA history: blocked via `popstate` listener;
 *   URL is restored with `savedPushState` and a synthetic popstate dispatches
 *   so wouter re-renders the correct page if the user cancels.
 *
 * Multiple simultaneous instances are safe: the history patch is reference-
 * counted and only installed/removed at the first/last active upload boundary.
 */
export function useUploadGuard(isUploading: boolean): void {
  const wasUploadingRef = useRef(false);

  // Browser tab close, page refresh, external URL navigation.
  useEffect(() => {
    if (!isUploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = WARN_MSG;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isUploading]);

  // In-app navigation (pushState/replaceState) + browser back/forward (popstate).
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

  // Safety net: clean up if the component unmounts while still uploading.
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
