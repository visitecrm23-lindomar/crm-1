// Tell React that act() is supported in this test environment (same pattern as
// eventSourceHarness.ts used by the SSE hook tests).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

// Mock the dialog so we don't pull in shadcn/radix dependencies.
// The hook uses createElement(UploadGuardDialog, { open, onConfirm, onCancel })
// and we only need to inspect the props — rendering is irrelevant.
vi.mock("../hooks/UploadGuardDialog.js", () => ({
  UploadGuardDialog: () => null,
}));

import { useUploadGuard } from "../hooks/use-upload-guard.js";

// ─── Test types / helpers ─────────────────────────────────────────────────────

type GuardDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

interface Handle {
  getDialogProps: () => GuardDialogProps;
  rerender: (isUploading: boolean) => Promise<void>;
  unmount: () => Promise<void>;
}

const activeRoots: Root[] = [];

// Capture the RAW prototype-method references (no .bind()) before any test runs.
// The hook's removeHistoryGuard() uses `delete history.pushState` which removes the
// own-property patch and exposes the prototype method again — so these identity
// checks work reliably without .bind() accumulation across tests.
const rawPushState = history.pushState;
const rawReplaceState = history.replaceState;

// Convenience helpers: call with proper `this` so jsdom doesn't throw
// "Illegal invocation" (prototype methods require a History receiver).
function rawNavigate(path: string): void {
  rawPushState.call(history, null, "", path);
}
function rawReplace(path: string): void {
  rawReplaceState.call(history, null, "", path);
}

async function renderUploadGuard(initial: boolean): Promise<Handle> {
  const result = { current: { guardDialog: null as unknown } };
  let isUploading = initial;

  function TestComponent() {
    result.current = useUploadGuard(isUploading);
    return null;
  }

  const container = document.createElement("div");
  const root = createRoot(container);
  activeRoots.push(root);

  await act(async () => { root.render(createElement(TestComponent)); });

  return {
    // Access the React element returned by the hook to inspect its current props.
    getDialogProps: () =>
      (result.current.guardDialog as ReactElement<GuardDialogProps>).props,

    rerender: async (next: boolean) => {
      isUploading = next;
      await act(async () => { root.render(createElement(TestComponent)); });
    },

    unmount: async () => {
      await act(async () => { root.unmount(); });
    },
  };
}

// ─── Global setup / teardown ─────────────────────────────────────────────────

beforeEach(() => {
  // Each test starts from "/" so pathname assertions are stable.
  rawNavigate("/");
});

afterEach(async () => {
  // Unmount all roots — triggers cleanup effects, which decrement activeUploads
  // and call removeHistoryGuard() when the count hits 0.
  for (const root of activeRoots) {
    await act(async () => { root.unmount(); });
  }
  activeRoots.length = 0;

  // Reset URL to a known state.
  rawNavigate("/");

  // Key invariant: after cleanup the guard MUST be fully removed.
  // removeHistoryGuard() uses `delete history.pushState` so the prototype method
  // is exposed again — making this identity check reliable across multiple test runs.
  expect(history.pushState).toBe(rawPushState);
  expect(history.replaceState).toBe(rawReplaceState);
});

// ─── Guard lifecycle ──────────────────────────────────────────────────────────

describe("useUploadGuard — guard lifecycle", () => {
  it("does not patch history when isUploading is false", async () => {
    await renderUploadGuard(false);
    expect(history.pushState).toBe(rawPushState);
    expect(history.replaceState).toBe(rawReplaceState);
  });

  it("patches history.pushState and history.replaceState when isUploading is true", async () => {
    await renderUploadGuard(true);
    expect(history.pushState).not.toBe(rawPushState);
    expect(history.replaceState).not.toBe(rawReplaceState);
  });

  it("restores history after isUploading transitions from true to false", async () => {
    const { rerender } = await renderUploadGuard(true);
    expect(history.pushState).not.toBe(rawPushState);

    await rerender(false);

    expect(history.pushState).toBe(rawPushState);
    expect(history.replaceState).toBe(rawReplaceState);
  });

  it("restores history when the component unmounts while uploading (safety net)", async () => {
    const { unmount } = await renderUploadGuard(true);
    expect(history.pushState).not.toBe(rawPushState);

    await unmount();

    expect(history.pushState).toBe(rawPushState);
    expect(history.replaceState).toBe(rawReplaceState);
  });
});

// ─── pushState interception ───────────────────────────────────────────────────

describe("useUploadGuard — pushState interception", () => {
  it("dialog starts closed", async () => {
    const { getDialogProps } = await renderUploadGuard(true);
    expect(getDialogProps().open).toBe(false);
  });

  it("blocks pushState while uploading and shows dialog", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    await act(async () => { history.pushState(null, "", "/blocked"); });

    expect(location.pathname).toBe("/"); // navigation was blocked
    expect(getDialogProps().open).toBe(true);
  });

  it("executes the pending navigation when the user confirms", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    await act(async () => { history.pushState(null, "", "/destination"); });
    expect(getDialogProps().open).toBe(true);

    await act(async () => { getDialogProps().onConfirm(); });

    expect(getDialogProps().open).toBe(false);
    expect(location.pathname).toBe("/destination");
  });

  it("drops the pending navigation when the user cancels", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    await act(async () => { history.pushState(null, "", "/unwanted"); });
    await act(async () => { getDialogProps().onCancel(); });

    expect(getDialogProps().open).toBe(false);
    expect(location.pathname).toBe("/");
  });

  it("passes pushState through without interception when not uploading", async () => {
    const { getDialogProps } = await renderUploadGuard(false);

    await act(async () => { history.pushState(null, "", "/free-nav"); });

    expect(location.pathname).toBe("/free-nav");
    expect(getDialogProps().open).toBe(false);
  });
});

// ─── replaceState interception ────────────────────────────────────────────────

describe("useUploadGuard — replaceState interception", () => {
  it("blocks replaceState while uploading and shows dialog", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    await act(async () => { history.replaceState(null, "", "/blocked-replace"); });

    expect(location.pathname).toBe("/");
    expect(getDialogProps().open).toBe(true);
  });

  it("executes replaceState navigation when the user confirms", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    await act(async () => { history.replaceState(null, "", "/replaced"); });
    await act(async () => { getDialogProps().onConfirm(); });

    expect(location.pathname).toBe("/replaced");
    expect(getDialogProps().open).toBe(false);
  });

  it("passes replaceState through when not uploading", async () => {
    const { getDialogProps } = await renderUploadGuard(false);

    await act(async () => { history.replaceState(null, "", "/free-replace"); });

    expect(location.pathname).toBe("/free-replace");
    expect(getDialogProps().open).toBe(false);
  });
});

// ─── popstate interception (capture phase) ────────────────────────────────────

describe("useUploadGuard — popstate interception (capture phase)", () => {
  it("calls stopImmediatePropagation on a guarded popstate event", async () => {
    await renderUploadGuard(true);

    const event = new PopStateEvent("popstate", { state: null });
    const stopSpy = vi.spyOn(event, "stopImmediatePropagation");

    await act(async () => { window.dispatchEvent(event); });

    expect(stopSpy).toHaveBeenCalledOnce();
  });

  it("does NOT call stopImmediatePropagation when no upload is active", async () => {
    await renderUploadGuard(false);

    const event = new PopStateEvent("popstate", { state: null });
    const stopSpy = vi.spyOn(event, "stopImmediatePropagation");

    window.dispatchEvent(event);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("restores the guarded URL when popstate fires while uploading", async () => {
    await renderUploadGuard(true);
    // guardedHref was captured as "/" when the guard installed

    // Simulate browser changing the URL before popstate fires (as with back/forward).
    // rawNavigate bypasses our guard patch (uses the saved prototype method reference).
    rawNavigate("/navigated-away");
    expect(location.pathname).toBe("/navigated-away");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    // Guard restores the saved URL
    expect(location.pathname).toBe("/");
  });

  it("opens the dialog when popstate fires while uploading", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    rawNavigate("/new-route");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(getDialogProps().open).toBe(true);
  });

  it("navigates to the target URL when the user confirms", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    rawNavigate("/destination");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    await act(async () => { getDialogProps().onConfirm(); });

    expect(getDialogProps().open).toBe(false);
    expect(location.pathname).toBe("/destination");
  });

  it("stays at the guarded URL when the user cancels", async () => {
    const { getDialogProps } = await renderUploadGuard(true);

    rawNavigate("/new-route");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    await act(async () => { getDialogProps().onCancel(); });

    expect(getDialogProps().open).toBe(false);
    expect(location.pathname).toBe("/");
  });

  it("prevents bubble-phase listeners from receiving the original guarded event", async () => {
    await renderUploadGuard(true);

    let bubbleCount = 0;
    const bubbleListener = () => { bubbleCount++; };
    window.addEventListener("popstate", bubbleListener); // bubble phase

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    window.removeEventListener("popstate", bubbleListener);

    // The bubble listener fires exactly once — for the synthetic restore-URL event
    // that our guard deliberately re-dispatches so wouter re-renders the correct page.
    // It does NOT fire for the original guarded event (stopped via
    // stopImmediatePropagation in the capture phase).
    expect(bubbleCount).toBe(1);
  });
});

// ─── Multi-instance reference counting ───────────────────────────────────────

describe("useUploadGuard — multi-instance reference counting", () => {
  it("installs the guard only once even when two hooks start uploading", async () => {
    await renderUploadGuard(true);
    const firstPatch = history.pushState;

    await renderUploadGuard(true); // second instance

    // Still the same patched function — no double-wrapping
    expect(history.pushState).toBe(firstPatch);
  });

  it("keeps the guard active when only one of two uploading hooks stops", async () => {
    const handle1 = await renderUploadGuard(true);
    await renderUploadGuard(true);
    const patch = history.pushState;

    await handle1.rerender(false); // first hook stops uploading

    // Guard still active — second hook is still uploading
    expect(history.pushState).toBe(patch);
    expect(history.pushState).not.toBe(rawPushState);
  });

  it("removes the guard when the last uploading hook stops", async () => {
    const handle1 = await renderUploadGuard(true);
    const handle2 = await renderUploadGuard(true);

    await handle1.rerender(false);
    await handle2.rerender(false); // last hook stops

    expect(history.pushState).toBe(rawPushState);
    expect(history.replaceState).toBe(rawReplaceState);
  });
});
