import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-backdrop relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 p-6">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px]" aria-hidden="true" />
      <div className="relative max-w-md text-center animate-scale-in">
        <p className="font-display text-[9rem] font-bold leading-none tracking-tighter text-gradient select-none" aria-hidden="true">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">This page took a different interview</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/" className="btn-primary mt-8 !px-5 !py-2.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
