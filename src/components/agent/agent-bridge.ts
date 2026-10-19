import { useSyncExternalStore } from "react";

// Connects the app shell (Sidebar) to the assistant without importing it: the
// assistant code (AI SDK, chat UI) is lazy-loaded by AgentRoot only when
// AGENT_CHAT is on for a signed-in recruiter, so this file stays tiny.

type Surface = "panel" | "full";

let enabled = false;
let pendingSurface: Surface | null = null;
let openSurface: ((surface: Surface) => void) | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const agentBridge = {
  setEnabled(value: boolean) {
    if (enabled === value) return;
    enabled = value;
    if (!value) pendingSurface = null;
    listeners.forEach((listener) => listener());
  },

  // Opens the assistant; queued if its code is still loading.
  open(surface: Surface) {
    if (!enabled) return;
    if (openSurface) openSurface(surface);
    else pendingSurface = surface;
  },

  // Called by the loaded assistant to receive open requests.
  connect(handler: (surface: Surface) => void) {
    openSurface = handler;
    if (pendingSurface) {
      handler(pendingSurface);
      pendingSurface = null;
    }
    return () => {
      if (openSurface === handler) openSurface = null;
    };
  },
};

/** True when the assistant is available on this page (flag on, signed in, recruiter route). */
export const useAgentChatEnabled = (): boolean => useSyncExternalStore(subscribe, () => enabled, () => false);
