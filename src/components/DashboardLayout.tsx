"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

// Inset-canvas frame: navigation sits quietly on a tinted frame and the page
// content lives on a raised panel, so content always leads (Linear, Vercel).
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-50">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar />
      <div className="pt-14 lg:pl-60 lg:pr-2 lg:pt-2 lg:pb-2">
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-white lg:min-h-[calc(100vh-1rem)] lg:rounded-xl lg:shadow-hairline">
          <TopBar />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
