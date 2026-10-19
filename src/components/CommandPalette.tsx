"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { navGroups, NEW_INTERVIEW, NavIcon } from "./nav";
import { useTheme } from "@/lib/theme";
import { agentBridge } from "./agent/agent-bridge";

// ⌘K / Ctrl+K palette: jump to a page, run an action or open a candidate.
// Follows the ARIA 1.2 combobox + listbox pattern (focus stays in the input,
// the active option is announced through aria-activedescendant).

const OPEN_EVENT = "open-command-palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

interface InterviewSummary {
  id: string;
  candidateName?: string;
  candidateEmail: string;
  role: string;
  level: string;
  status: string;
  scorecard: { overall: number } | null;
}

const ICON_USER = "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z";
const ICON_SPARKLE = "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z";
const ICON_SUN = "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z";
const ICON_MOON = "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z";
const ICON_LOGOUT = "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9";

const STATUS_LABEL: Record<string, string> = { waiting: "Waiting", in_progress: "In progress", completed: "Completed" };

export function CommandPalette({ isAdmin, agentEnabled }: { isAdmin: boolean; agentEnabled: boolean }) {
  const router = useRouter();
  const { setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [interviews, setInterviews] = useState<InterviewSummary[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    returnFocus.current?.focus?.();
  }, []);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) returnFocus.current = document.activeElement as HTMLElement | null;
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [show]);

  // Load candidates the first time the palette opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (interviews === null) {
      fetch("/api/interviews")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setInterviews(Array.isArray(data) ? data : []))
        .catch(() => setInterviews([]));
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, interviews]);

  const go = useCallback((href: string) => () => router.push(href), [router]);

  const baseCommands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];
    cmds.push({ id: "new", group: "Actions", label: "Create a new interview", icon: NEW_INTERVIEW.icon, keywords: NEW_INTERVIEW.keywords, run: go(NEW_INTERVIEW.href) });
    if (agentEnabled) {
      cmds.push({ id: "ai", group: "Actions", label: "Ask the hiring assistant", icon: ICON_SPARKLE, keywords: "ai agent chat help", run: () => agentBridge.open("full") });
    }
    navGroups.forEach((g) =>
      g.items
        .filter((i) => !i.adminOnly || isAdmin)
        .forEach((i) => cmds.push({ id: `nav-${i.href}`, group: "Go to", label: i.label, hint: g.label, icon: i.icon, keywords: i.keywords, run: go(i.href) })),
    );
    cmds.push(
      { id: "theme-light", group: "Preferences", label: "Switch to light theme", icon: ICON_SUN, keywords: "appearance mode", run: () => setPreference("light") },
      { id: "theme-dark", group: "Preferences", label: "Switch to dark theme", icon: ICON_MOON, keywords: "appearance mode night", run: () => setPreference("dark") },
      { id: "theme-system", group: "Preferences", label: "Use system theme", icon: ICON_SUN, keywords: "appearance mode auto", run: () => setPreference("system") },
      { id: "signout", group: "Preferences", label: "Sign out", icon: ICON_LOGOUT, keywords: "logout exit", run: () => signOut({ callbackUrl: "/login" }) },
    );
    return cmds;
  }, [agentEnabled, isAdmin, go, setPreference]);

  const results = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (c: Command) => !q || `${c.label} ${c.hint || ""} ${c.keywords || ""}`.toLowerCase().includes(q);
    const cmds = baseCommands.filter(match);
    const people: Command[] = (interviews || [])
      .filter((i) => {
        if (!q) return false;
        return `${i.candidateName || ""} ${i.candidateEmail} ${i.role}`.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((i) => ({
        id: `iv-${i.id}`,
        group: "Candidates",
        label: i.candidateName || i.candidateEmail,
        hint: `${i.role} · ${STATUS_LABEL[i.status] || i.status}${i.scorecard ? ` · ${i.scorecard.overall}/5` : ""}`,
        icon: ICON_USER,
        run: go(`/dashboard/${i.id}`),
      }));
    return [...people, ...cmds];
  }, [query, baseCommands, interviews, go]);

  useEffect(() => setActive(0), [query]);

  // Keep the active option in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = (idx: number) => {
    const cmd = results[idx];
    if (!cmd) return;
    close();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Single-field dialog: keep focus inside.
      e.preventDefault();
    }
  };

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";
  const activeId = results[active] ? `cmd-${results[active].id}` : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm animate-fade-in" onClick={close} aria-hidden="true" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-scale-in" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-4">
          <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates, pages and actions…"
            className="h-14 w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd hidden sm:inline-flex">Esc</kbd>
        </div>

        <ul ref={listRef} id="command-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-gray-500" role="presentation">
              {interviews === null && query ? "Searching…" : <>No results for &ldquo;{query}&rdquo;</>}
            </li>
          )}
          {results.map((cmd, idx) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            const isActive = idx === active;
            return (
              <li key={cmd.id} role="presentation">
                {header && (
                  <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400" aria-hidden="true">
                    {header}
                  </div>
                )}
                <div
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={idx}
                  onMouseMove={() => !isActive && setActive(idx)}
                  onClick={() => runAt(idx)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-700"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-white text-gray-900 shadow-hairline" : "bg-gray-100 text-gray-500"}`}>
                    <NavIcon d={cmd.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{cmd.label}</span>
                    {cmd.hint && <span className="block truncate text-xs text-gray-500">{cmd.hint}</span>}
                  </span>
                  {isActive && (
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" transform="scale(-1,1) translate(-24,0)" />
                    </svg>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            to move
            <kbd className="kbd ml-2">↵</kbd>
            to open
          </span>
          <span aria-live="polite">{results.length} result{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
