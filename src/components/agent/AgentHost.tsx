"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import {
  AgentChatProvider,
  AgentSurfaces,
  useAgentChatContext,
  type AgentSuggestion,
  type PageContext,
} from "@/components/agent-ui";
import { agentBridge } from "./agent-bridge";

const SUGGESTIONS: AgentSuggestion[] = [
  {
    title: "Pipeline overview",
    hint: "Waiting, in progress, completed",
    prompt: "Give me an overview of our interviews: how many are waiting, in progress and completed, and anything that needs my attention.",
  },
  {
    title: "Top candidates this month",
    hint: "Best scores and recommendations",
    prompt: "Show the top-scoring completed interviews from this month with their overall score and recommendation.",
  },
  {
    title: "Screen a resume",
    hint: "Attach a PDF or DOCX with the paperclip",
    prompt: "I want to screen a resume and set up an interview for the candidate. Tell me what you need.",
  },
  {
    title: "Draft a question bank",
    hint: "For a role, level and round",
    prompt: "Draft a question bank of 8 questions for a Senior Backend Engineer, Technical round. Show me the questions before saving.",
  },
];

// What the recruiter is looking at, so "this candidate" resolves to an id.
const pageContextFor = (pathname: string): PageContext => {
  const interview = /^\/(dashboard|review)\/([0-9a-f-]{36})/i.exec(pathname);
  if (interview) {
    return {
      route: pathname,
      entityType: "interview",
      entityId: interview[2],
      viewName: interview[1] === "review" ? "Interview review" : "Interview details",
    };
  }

  const views: Record<string, string> = {
    "/": "Interviews dashboard",
    "/new": "New interview form",
    "/questions": "Question banks",
    "/compare": "Compare candidates",
    "/team": "Team",
    "/templates": "Email templates",
    "/settings/ai": "AI interviewer settings",
  };
  return { route: pathname, viewName: views[pathname] };
};

// The assistant: provider + agent mode + side panel. Lazy-loaded by AgentRoot.
export default function AgentHost() {
  const { data: session } = useSession();
  const pathname = usePathname() ?? "/";
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const firstName = session?.user?.name?.split(" ")[0];
  // Stable identity: called on every send with the current route.
  const getPageContext = useCallback(() => pageContextFor(pathnameRef.current), []);

  return (
    <AgentChatProvider
      apiBase="/api/agent"
      assistantName="Hiring Assistant"
      greeting={firstName ? `What are we hiring for today, ${firstName}?` : "What are we hiring for today?"}
      suggestions={SUGGESTIONS}
      getPageContext={getPageContext}
      theme="light"
    >
      <BridgeConnector />
      <InAppLinks />
      <AgentSurfaces />
    </AgentChatProvider>
  );
}

// Lets the Sidebar's "Ask AI" open the assistant.
function BridgeConnector() {
  const { setSurface } = useAgentChatContext();
  useEffect(() => agentBridge.connect(setSurface), [setSurface]);
  return null;
}

// Links in answers (e.g. /dashboard/<id>) navigate client-side instead of
// reloading the page; from agent mode they drop to the side panel so the
// recruiter sees the page with the conversation still open.
function InAppLinks() {
  const router = useRouter();
  const { surface, setSurface } = useAgentChatContext();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.(".agent-root a[href]") as HTMLAnchorElement | null;
      const href = anchor?.getAttribute("href") ?? "";
      if (!anchor || !href.startsWith("/") || href.startsWith("//") || anchor.target === "_blank") return;

      event.preventDefault();
      router.push(href);
      if (surface === "full") setSurface("panel");
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [router, surface, setSurface]);

  return null;
}
