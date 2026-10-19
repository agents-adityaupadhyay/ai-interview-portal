"use client";

import { SessionProvider } from "next-auth/react";
import { AgentRoot } from "./agent/AgentRoot";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      {/* Recruiter AI assistant: renders nothing unless AGENT_CHAT is on. In the
          root layout so a conversation survives page navigation. */}
      <AgentRoot />
    </SessionProvider>
  );
}
