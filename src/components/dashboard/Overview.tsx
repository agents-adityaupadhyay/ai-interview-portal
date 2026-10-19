"use client";

import Link from "next/link";
import { useMemo } from "react";

// Bento overview for the dashboard: the biggest tile carries the most important
// question ("what's in the pipeline?"), smaller tiles answer quality and
// outcome, and a strip surfaces what needs a recruiter's attention.

interface OverviewInterview {
  id: string;
  candidateName?: string;
  candidateEmail: string;
  role: string;
  status: "waiting" | "in_progress" | "completed";
  transcript: unknown[];
  proctoring: { severity: "warning" | "flag" }[];
  scorecard: { overall: number; recommendation: string } | null;
  createdAt: string;
}

const DAY = 86_400_000;

const isHire = (rec?: string) => !!rec && rec.includes("hire") && !rec.includes("no");

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function Tile({ className = "", children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className={`card flex flex-col p-5 ${className}`}>
      {children}
    </section>
  );
}

function TileHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-sans text-[13px] font-medium tracking-normal text-gray-500">{title}</h2>
      {hint && <span className="font-mono text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

function BigNumber({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <p className="mt-2 font-display text-[40px] font-semibold leading-none tracking-[-0.04em] text-gray-900 tabular-nums">
      {loading ? <span className="skeleton inline-block h-10 w-16 align-middle"><span className="sr-only">Loading</span></span> : children}
    </p>
  );
}

export function Overview({ interviews, loading }: { interviews: OverviewInterview[]; loading: boolean }) {
  const data = useMemo(() => {
    const waiting = interviews.filter((i) => i.status === "waiting").length;
    const inProgress = interviews.filter((i) => i.status === "in_progress").length;
    const completed = interviews.filter((i) => i.status === "completed").length;
    const scored = interviews.filter((i) => i.scorecard);
    const avg = scored.length ? scored.reduce((s, i) => s + (i.scorecard?.overall ?? 0), 0) / scored.length : null;
    const hires = scored.filter((i) => isHire(i.scorecard?.recommendation)).length;

    // Interviews created per day, last 14 days (oldest first).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, idx) => {
      const d = new Date(today.getTime() - (13 - idx) * DAY);
      return { date: d, key: dayKey(d), count: 0 };
    });
    const byKey = new Map(days.map((d) => [d.key, d]));
    interviews.forEach((i) => {
      const hit = byKey.get(dayKey(new Date(i.createdAt)));
      if (hit) hit.count += 1;
    });
    const thisWeek = days.slice(7).reduce((s, d) => s + d.count, 0);
    const lastWeek = days.slice(0, 7).reduce((s, d) => s + d.count, 0);

    // Score distribution in five bands: <1.5, 1.5–2.5, ... >=4.5
    const bands = [0, 0, 0, 0, 0];
    scored.forEach((i) => {
      const v = i.scorecard!.overall;
      bands[Math.max(0, Math.min(4, Math.round(v) - 1))] += 1;
    });

    const attention = interviews
      .map((i) => {
        const flags = i.proctoring.filter((p) => p.severity === "flag").length;
        if (flags > 0) return { i, reason: `${flags} proctoring flag${flags > 1 ? "s" : ""}`, tone: "red" as const };
        if (i.status === "completed" && !i.scorecard && i.transcript.length > 0) return { i, reason: "Awaiting scorecard", tone: "amber" as const };
        if (i.status === "in_progress") return { i, reason: "Live now", tone: "blue" as const };
        return null;
      })
      .filter(Boolean)
      .slice(0, 4) as { i: OverviewInterview; reason: string; tone: "red" | "amber" | "blue" }[];

    return { total: interviews.length, waiting, inProgress, completed, scored: scored.length, avg, hires, days, thisWeek, lastWeek, bands, attention };
  }, [interviews]);

  const maxDay = Math.max(1, ...data.days.map((d) => d.count));
  const maxBand = Math.max(1, ...data.bands);
  const hireRate = data.scored ? Math.round((data.hires / data.scored) * 100) : null;
  const delta = data.thisWeek - data.lastWeek;
  const segments = [
    { label: "Completed", value: data.completed, color: "bg-green-500" },
    { label: "In progress", value: data.inProgress, color: "bg-blue-500" },
    { label: "Waiting", value: data.waiting, color: "bg-amber-400" },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
      {/* Pipeline */}
      <Tile label="Pipeline" className="md:col-span-2 lg:col-span-6">
        <TileHeader title="Pipeline" hint="last 14 days" />
        <div className="flex items-end justify-between gap-6">
          <div>
            <BigNumber loading={loading}>{data.total}</BigNumber>
            <p className="mt-2 text-[13px] text-gray-500">
              <span className={`font-mono font-medium ${delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-gray-500"}`}>
                {delta > 0 ? "+" : ""}{delta}
              </span>{" "}
              vs last week · {data.thisWeek} this week
            </p>
          </div>
          {/* 14-day columns */}
          <div
            className="flex h-16 flex-1 items-end gap-1"
            role="img"
            aria-label={`Interviews created per day over the last 14 days: ${data.days.map((d) => d.count).join(", ")}`}
          >
            {data.days.map((d, idx) => (
              <span
                key={d.key}
                title={`${d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${d.count}`}
                className={`flex-1 rounded-sm transition-colors ${idx === data.days.length - 1 ? "bg-indigo-500" : d.count ? "bg-gray-300 hover:bg-gray-400" : "bg-gray-100"}`}
                style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-5">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}>
            {data.total > 0 && segments.map((s) => s.value > 0 && <span key={s.label} className={s.color} style={{ width: `${(s.value / data.total) * 100}%` }} />)}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-gray-600">
                <span className={`h-2 w-2 rounded-full ${s.color}`} aria-hidden="true" />
                {s.label}
                <span className="font-mono text-gray-900">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </Tile>

      {/* Quality */}
      <Tile label="Average score" className="lg:col-span-3">
        <TileHeader title="Average score" hint={`${data.scored} scored`} />
        <BigNumber loading={loading}>
          {data.avg === null ? "–" : data.avg.toFixed(1)}
          <span className="ml-1 text-lg font-medium tracking-normal text-gray-400">/5</span>
        </BigNumber>
        <div className="mt-auto pt-4">
          <div className="flex h-12 items-end gap-1.5" role="img" aria-label={`Score distribution, 1 to 5: ${data.bands.join(", ")}`}>
            {data.bands.map((n, idx) => (
              <span
                key={idx}
                title={`Score ${idx + 1}: ${n}`}
                className={`flex-1 rounded-sm ${n === 0 ? "bg-gray-100" : idx >= 3 ? "bg-green-500" : idx === 2 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ height: `${Math.max(8, (n / maxBand) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-gray-400" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className="flex-1 text-center">{n}</span>)}
          </div>
        </div>
      </Tile>

      {/* Outcome */}
      <Tile label="Hire rate" className="lg:col-span-3">
        <TileHeader title="Hire rate" hint="of scored" />
        <div className="flex flex-1 items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90" role="img" aria-label={hireRate === null ? "No scored interviews yet" : `${hireRate}% recommended for hire`}>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-gray-100" strokeWidth="3" />
              {hireRate !== null && (
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-indigo-500"
                  strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(hireRate / 100) * 97.4} 97.4`}
                />
              )}
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-semibold tracking-tight text-gray-900" aria-hidden="true">
              {loading ? "" : hireRate === null ? "–" : `${hireRate}%`}
            </span>
          </div>
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex items-center gap-2">
              <dt className="text-gray-500">Hire</dt>
              <dd className="font-mono text-gray-900">{data.hires}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-gray-500">No hire</dt>
              <dd className="font-mono text-gray-900">{data.scored - data.hires}</dd>
            </div>
          </dl>
        </div>
      </Tile>

      {/* Needs attention */}
      {!loading && (
        <Tile label="Needs attention" className="md:col-span-2 lg:col-span-12 !p-0">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <TileHeader title="Needs attention" />
            <span className="font-mono text-[11px] text-gray-400">{data.attention.length}</span>
          </div>
          {data.attention.length === 0 ? (
            <p className="flex items-center gap-2 px-5 pb-4 text-[13px] text-gray-500">
              <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              All clear: no flagged, live or unscored interviews.
            </p>
          ) : (
            <ul className="grid divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
              {data.attention.map(({ i, reason, tone }) => (
                <li key={i.id} className="sm:border-r sm:border-gray-100 last:border-r-0">
                  <Link href={`/dashboard/${i.id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50">
                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                      {tone === "blue" && <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 motion-safe:animate-ping" />}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-blue-500"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-900">{i.candidateName || i.candidateEmail}</span>
                      <span className="block truncate text-xs text-gray-500">{reason} · {i.role}</span>
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      )}
    </div>
  );
}
