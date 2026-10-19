"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navGroups, NEW_INTERVIEW } from "./nav";
import { openCommandPalette } from "./CommandPalette";
import { agentBridge, useAgentChatEnabled } from "./agent/agent-bridge";

const SUB_PAGES: Record<string, { parent: string; parentHref: string; label: string }> = {
  dashboard: { parent: "Dashboard", parentHref: "/", label: "Interview" },
  review: { parent: "Dashboard", parentHref: "/", label: "Review" },
};

function useCrumbs(pathname: string) {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return [{ label: "Dashboard" }];
  const sub = SUB_PAGES[seg[0]];
  if (sub && seg.length > 1) return [{ label: sub.parent, href: sub.parentHref }, { label: sub.label }];
  if (pathname === NEW_INTERVIEW.href) return [{ label: NEW_INTERVIEW.label }];
  for (const g of navGroups) {
    for (const item of g.items) {
      if (item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/"))) {
        return [{ label: g.label }, { label: item.label }];
      }
    }
  }
  return [{ label: "Dashboard", href: "/" }];
}

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const crumbs = useCrumbs(pathname);
  const agentEnabled = useAgentChatEnabled();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/mac/i.test(navigator.platform)), []);

  return (
    <header className="sticky top-14 z-20 hidden h-12 items-center gap-3 border-b border-gray-200 bg-white/85 px-4 backdrop-blur-md lg:top-0 lg:flex lg:rounded-t-xl lg:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && (
                  <svg className="h-3.5 w-3.5 shrink-0 text-gray-300" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 3.5l4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {"href" in c && c.href && !last ? (
                  <Link href={c.href} className="truncate text-gray-500 hover:text-gray-900">{c.label}</Link>
                ) : (
                  <span className={`truncate ${last ? "font-medium text-gray-900" : "text-gray-500"}`} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        onClick={openCommandPalette}
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="flex h-8 w-56 items-center gap-2 rounded-lg bg-gray-50 px-2.5 text-[13px] text-gray-500 shadow-hairline transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span className="flex-1 truncate whitespace-nowrap text-left">Search…</span>
        <kbd className="kbd bg-white">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {agentEnabled && (
        <button
          type="button"
          onClick={() => agentBridge.open("panel")}
          aria-keyshortcuts={isMac ? "Meta+J" : "Control+J"}
          className="group flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-700 shadow-hairline transition-colors hover:bg-gray-50"
        >
          <svg className="h-4 w-4 text-indigo-600 transition-transform motion-safe:group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Ask AI
        </button>
      )}
    </header>
  );
}
