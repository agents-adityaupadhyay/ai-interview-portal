"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { agentBridge, useAgentChatEnabled } from "./agent/agent-bridge";
import { navGroups, NEW_INTERVIEW, isNavActive, NavIcon, BrandMark } from "./nav";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const userName = session?.user?.name || "User";
  const userInitials = userName
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
  const isAdmin = (session?.user as any)?.role === "admin";
  const orgName = (session?.user as any)?.orgName as string | undefined;
  // AI assistant launcher: only when AGENT_CHAT is on (see components/agent).
  const isAgentChatEnabled = useAgentChatEnabled();

  useEffect(() => setIsMac(/mac/i.test(navigator.platform)), []);

  // "N" starts a new interview from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      router.push(NEW_INTERVIEW.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Close the drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Mobile drawer behaves as a modal dialog: Esc closes, focus moves in and
  // returns to the menu button, Tab stays inside, page behind doesn't scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const focusables = () =>
      Array.from(drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    focusables()[0]?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const menuButton = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Workspace */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="InterviewAI home">
          <BrandMark className="h-7 w-7 rounded-lg" />
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[14px] font-semibold tracking-tight text-gray-900">InterviewAI</span>
            <span className="block truncate text-[11px] text-gray-500">{orgName || "Hiring workspace"}</span>
          </span>
        </Link>
      </div>

      <div className="px-3 pb-2">
        <Link
          href={NEW_INTERVIEW.href}
          aria-current={pathname === NEW_INTERVIEW.href ? "page" : undefined}
          aria-keyshortcuts="N"
          className="btn-primary w-full !justify-start !px-2.5 !py-1.5 text-[13px]"
        >
          <NavIcon d={NEW_INTERVIEW.icon} className="h-4 w-4" />
          New interview
          <kbd className="ml-auto rounded bg-white/15 px-1.5 font-mono text-[10px] text-gray-50/80" aria-hidden="true">N</kbd>
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-5 first:mt-3">
              <h2 className="px-2.5 pb-1 font-sans text-[11px] font-medium tracking-normal text-gray-400">{group.label}</h2>
              <ul className="space-y-px">
                {items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={active ? "sidebar-link-active" : "sidebar-link"}
                      >
                        <NavIcon d={item.icon} className={`h-4 w-4 ${active ? "text-gray-900" : "text-gray-400"}`} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {isAgentChatEnabled && (
          <div className="mt-5">
            <h2 className="px-2.5 pb-1 font-sans text-[11px] font-medium tracking-normal text-gray-400">Assistant</h2>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                agentBridge.open("full");
              }}
              aria-keyshortcuts={isMac ? "Meta+J" : "Control+J"}
              className="sidebar-link w-full"
            >
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Ask AI
              <kbd className="kbd ml-auto">{isMac ? "⌘J" : "Ctrl J"}</kbd>
            </button>
          </div>
        )}
      </nav>

      {/* Theme + user */}
      <div className="space-y-2 px-3 pb-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 font-mono text-[10px] font-medium text-gray-50"
            aria-hidden="true"
          >
            {userInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-gray-900">{userName}</p>
            <p className="truncate text-[11px] text-gray-500">{session?.user?.email || ""}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-700"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="glass fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-x-0 border-t-0 px-4 lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          className="-ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-2" aria-label="InterviewAI home">
          <BrandMark className="h-7 w-7" />
          <span className="font-display text-base font-bold tracking-tight text-gray-900">InterviewAI</span>
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          className="ml-auto rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Search"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-gray-950/40 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          ref={drawerRef}
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute bottom-0 left-0 top-0 w-72 border-r border-gray-200 bg-gray-100 dark:bg-gray-50 shadow-2xl transition-[transform,visibility] duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "invisible -translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close navigation"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {sidebarContent}
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-60 lg:block" aria-label="Sidebar">
        {sidebarContent}
      </aside>

      <CommandPalette isAdmin={isAdmin} agentEnabled={isAgentChatEnabled} />
    </>
  );
}
