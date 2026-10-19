"use client";

import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { agentBridge } from "./agent-bridge";

// Loaded only when the assistant is on, so candidate pages and deployments
// with AGENT_CHAT=off never download the AI SDK or the chat UI.
const AgentHost = dynamic(() => import("./AgentHost"), { ssr: false });

// Recruiter pages only. Candidate pages (/interview, /completed) and the auth
// pages never get the assistant.
const RECRUITER_ROUTES = ["/new", "/dashboard", "/review", "/questions", "/compare", "/team", "/templates", "/settings"];

export const isRecruiterRoute = (pathname: string) =>
  pathname === "/" || RECRUITER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export function AgentRoot() {
  const pathname = usePathname() ?? "/";
  const { status } = useSession();
  const [isFlagOn, setIsFlagOn] = useState(false);

  // AGENT_CHAT is a runtime setting served by /api/config (no rebuild to toggle).
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/config")
      .then((response) => response.json())
      .then((config: { agentChat?: boolean }) => {
        if (!cancelled) setIsFlagOn(config.agentChat === true);
      })
      .catch(() => {
        if (!cancelled) setIsFlagOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const isActive = isFlagOn && status === "authenticated" && isRecruiterRoute(pathname);

  useEffect(() => {
    agentBridge.setEnabled(isActive);
  }, [isActive]);

  return isActive ? <AgentHost /> : null;
}
