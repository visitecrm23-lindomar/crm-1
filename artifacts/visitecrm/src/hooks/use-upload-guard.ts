import { useState, useCallback, useRef, useEffect, createElement } from "react";
import type { ReactNode } from "react";
import { UploadGuardDialog } from "./UploadGuardDialog";

const BEFOREUNLOAD_MSG = "Você tem um envio em andamento. Tem certeza que deseja sair?";

interface PendingNav {
  onConfirm: () => void;
}

// ─── Module-level state ───────────────────────────────────────────────────────
// The history patch is reference-counted and shared across all hook instances.
// Only installed when the first upload starts; removed when the last ends.
let activeUploads = 0;
let savedPushState: typeof history.pushState | null = null;
let savedReplaceState: typeof history.replaceState | null = null;
let popstateHandler: (() => void) | null = null;
let guardedHref: string | null = null;

// Counts synthetic PopStateEvents we dispatch ourselves so the handler can skip them.
let syntheticPops = 0;

// Callback registered by the active hook instance to show the React dialog.
let showDialogFn: ((pending: PendingNav) => void) | null = null;

function dispatchSyntheticPopstate(href: string): void {
  syntheticPops++;
  // Update the URL silently (no popstate), then fire a synthetic popstate so wouter re-renders.
  savedPushState!(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
}

function installHistoryGuard(showDialog: (pending: PendingNav) => void): void {
  showDialogFn = showDialog;
  if (savedPushState !== null) return; // already patched

  savedPushState = history.pushState.bind(history);
  savedReplaceState = history.replaceState.bind(history);
  guardedHref = location.href;

  // Intercept wouter Link / navigate() calls.
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    if (activeUploads > 0) {
      showDialogFn?.({
        onConfirm: () => {
          savedPushState!(...args);
          guardedHref = location.href;
        },
      });
      return; // block until user decides
    }
    savedPushState!(...args);
    guardedHref = location.href;
  };

  // Intercept replace-based navigation (e.g. wouter { replace: true }).
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    if (activeUploads > 0) {
      showDialogFn?.({
        onConfirm: () => {
          savedReplaceState!(...args);
          guardedHref = location.href;
        },
      });
      return;
    }
    savedReplaceState!(...args);
    guardedHref = location.href;
  };

  // Intercept browser back/forward (popstate fires AFTER the URL already changed).
  // Strategy: immediately restore the previous URL + re-sync wouter via a synthetic
  // popstate, then show the React dialog. If user confirms, dispatch to newHref.
  popstateHandler = () => {
    if (syntheticPops > 0) {
      syntheticPops--;
      return; // our own synthetic event — ignore
    }
    if (activeUploads === 0) {
      guardedHref = location.href;
      return;
    }

    const newHref = location.href;
    // Restore previous URL and tell wouter to re-render it.
    dispatchSyntheticPopstate(guardedHref ?? location.href);

    showDialogFn?.({
      onConfirm: () => {
        // User confirmed leaving — navigate to where they tried to go.
        dispatchSyntheticPopstate(newHref);
        guardedHref = newHref;
      },
    });
  };

  window.addEventListener("popstate", popstateHandler);
}

function removeHistoryGuard(): void {
  showDialogFn = null;
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
  syntheticPops = 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Warns the user before leaving the page while an upload is in progress.
 *
 * Returns `{ guardDialog }` — a ReactNode that must be rendered by the consumer
 * to make the in-app confirmation dialog appear.
 *
 * Coverage:
 * - Tab close / page refresh / external URL → `beforeunload` (native browser prompt,
 *   the only mechanism browsers allow for those events).
 * - In-app navigation via wouter Link / navigate() → patched `history.pushState` /
 *   `replaceState` blocks the call and triggers the React dialog instead.
 * - Browser back/forward within SPA history → `popstate` listener immediately
 *   restores the previous URL (via synthetic popstate so wouter re-renders), then
 *   shows the React dialog; confirming re-dispatches to the target URL.
 *
 * Multiple simultaneous instances are safe: the history patch is reference-counted.
 */
export function useUploadGuard(isUploading: boolean): { guardDialog: ReactNode } {
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const wasUploadingRef = useRef(false);

  const showDialog = useCallback((pending: PendingNav) => {
    setPendingNav(pending);
  }, []);

  // Browser tab close, page refresh, external URL navigation — native prompt only.
  useEffect(() => {
    if (!isUploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = BEFOREUNLOAD_MSG;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isUploading]);

  // In-app navigation + browser back/forward.
  useEffect(() => {
    if (isUploading === wasUploadingRef.current) return;
    wasUploadingRef.current = isUploading;

    if (isUploading) {
      if (activeUploads++ === 0) installHistoryGuard(showDialog);
    } else {
      activeUploads = Math.max(0, activeUploads - 1);
      if (activeUploads === 0) removeHistoryGuard();
    }
  }, [isUploading, showDialog]);

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

  const handleConfirm = () => {
    const nav = pendingNav;
    setPendingNav(null);
    nav?.onConfirm();
  };

  const handleCancel = () => setPendingNav(null);

  // Use createElement to avoid JSX in a .ts file.
  const guardDialog: ReactNode = createElement(UploadGuardDialog, {
    open: pendingNav !== null,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  });

  return { guardDialog };
}
