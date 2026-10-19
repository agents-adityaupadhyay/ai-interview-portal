"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Overview } from "@/components/dashboard/Overview";

interface Scorecard {
  technicalDepth: number;
  communication: number;
  problemSolving: number;
  domainKnowledge: number;
  cultureFit: number;
  overall: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  evidence: { dimension: string; quote: string; assessment: string }[];
  proctoringNotes: string;
}

interface ProctoringEvent {
  type: string;
  severity: "warning" | "flag";
  message: string;
  timestamp: string;
}

interface Interview {
  id: string;
  resumeFileName: string;
  candidateEmail: string;
  candidateName: string;
  role: string;
  level: string;
  focusAreas: string[];
  duration: number;
  status: "waiting" | "in_progress" | "completed";
  transcript: { role: string; text: string; timestamp: string }[];
  proctoring: ProctoringEvent[];
  scorecard: Scorecard | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

type SortField = "date" | "score" | "status";
type SortDir = "asc" | "desc";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AVATAR_TINTS = [
  "bg-indigo-100 text-indigo-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
];

function initialsOf(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function tintOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function scoreColor(score: number) {
  if (score >= 3.5) return "text-green-600";
  if (score >= 2.5) return "text-amber-600";
  return "text-red-600";
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-4"><div className="skeleton h-4 w-40" /><div className="skeleton h-3 w-24 mt-2" /></td>
      <td className="px-4 py-4"><div className="skeleton h-4 w-28" /><div className="skeleton h-3 w-16 mt-2" /></td>
      <td className="px-4 py-4"><div className="skeleton h-6 w-20 rounded-full" /></td>
      <td className="px-4 py-4"><div className="skeleton h-4 w-8" /></td>
      <td className="px-4 py-4"><div className="skeleton h-4 w-16" /></td>
      <td className="px-4 py-4"><div className="skeleton h-4 w-24" /></td>
      <td className="px-4 py-4"><div className="skeleton h-4 w-12" /></td>
    </tr>
  );
}

function DateRangePicker({ from, to, onChange }: {
  from: string; to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [tempFrom, setTempFrom] = useState(from);
  const [tempTo, setTempTo] = useState(to);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setTempFrom(from); }, [from]);
  useEffect(() => { setTempTo(to); }, [to]);

  // Generate calendar days for current month view
  const getDays = () => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const formatDateLabel = (d: string) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const toDateStr = (day: number) => {
    const y = viewMonth.getFullYear();
    const m = String(viewMonth.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isInRange = (day: number) => {
    const dateStr = toDateStr(day);
    return tempFrom && tempTo && dateStr >= tempFrom && dateStr <= tempTo;
  };

  const isStart = (day: number) => toDateStr(day) === tempFrom;
  const isEnd = (day: number) => toDateStr(day) === tempTo;
  const isToday = (day: number) => toDateStr(day) === new Date().toISOString().split("T")[0];

  const handleDayClick = (day: number) => {
    const dateStr = toDateStr(day);
    if (selecting === "from") {
      setTempFrom(dateStr);
      setTempTo("");
      setSelecting("to");
    } else {
      if (dateStr < tempFrom) {
        setTempTo(tempFrom);
        setTempFrom(dateStr);
        onChange(dateStr, tempFrom);
      } else {
        setTempTo(dateStr);
        onChange(tempFrom, dateStr);
      }
      setSelecting("from");
      setOpen(false);
    }
  };

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1));

  const label = tempFrom && tempTo
    ? `${formatDateLabel(tempFrom)} \u2014 ${formatDateLabel(tempTo)}`
    : tempFrom
      ? `${formatDateLabel(tempFrom)} \u2014 ...`
      : "Date range";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  };

  const calendar = open ? ReactDOM.createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-label="Choose a date range"
        className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 animate-scale-in"
        style={{ position: "fixed", zIndex: 9999, top: pos.top, left: pos.left, width: 288 }}
      >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm font-semibold text-gray-800" aria-live="polite">
              {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Hint */}
          <p className="text-xs text-gray-400 mb-2 text-center" aria-live="polite">
            {selecting === "from" ? "Select start date" : "Select end date"}
          </p>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1" aria-hidden="true">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0">
            {getDays().map((day, i) => (
              <div key={i} className="flex items-center justify-center">
                {day ? (
                  <button
                    type="button"
                    onClick={() => handleDayClick(day)}
                    aria-label={new Date(toDateStr(day) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    aria-pressed={!!(isStart(day) || isEnd(day) || isInRange(day))}
                    aria-current={isToday(day) ? "date" : undefined}
                    className={`w-8 h-8 text-xs rounded-full transition-all duration-150 ${
                      isStart(day) || isEnd(day)
                        ? "bg-gray-900 text-gray-50 font-semibold"
                        : isInRange(day)
                          ? "bg-indigo-100 text-indigo-700"
                          : isToday(day)
                            ? "border border-indigo-300 text-indigo-600 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {day}
                  </button>
                ) : <div className="w-8 h-8" />}
              </div>
            ))}
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {[
              { label: "Today", fn: () => { const t = new Date().toISOString().split("T")[0]; setTempFrom(t); setTempTo(t); onChange(t, t); setOpen(false); }},
              { label: "7d", fn: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-7); const fs=f.toISOString().split("T")[0]; const ts=t.toISOString().split("T")[0]; setTempFrom(fs); setTempTo(ts); onChange(fs, ts); setOpen(false); }},
              { label: "30d", fn: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-30); const fs=f.toISOString().split("T")[0]; const ts=t.toISOString().split("T")[0]; setTempFrom(fs); setTempTo(ts); onChange(fs, ts); setOpen(false); }},
              { label: "All", fn: () => { setTempFrom(""); setTempTo(""); onChange("", ""); setOpen(false); }},
            ].map(p => (
              <button key={p.label} type="button" onClick={p.fn} className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">{p.label}</button>
            ))}
          </div>
        </div>
    </>,
    document.body
  ) : null;

  return (
    <div className={`flex items-stretch rounded-xl border shadow-soft transition-all duration-200 ${
      tempFrom ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-600"
    }`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex flex-1 items-center gap-2 px-3 py-2 text-sm rounded-xl whitespace-nowrap ${tempFrom ? "" : "hover:bg-gray-50"}`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span><span className="sr-only">Filter by date: </span>{label}</span>
      </button>
      {tempFrom && (
        <button
          type="button"
          onClick={() => { setTempFrom(""); setTempTo(""); onChange("", ""); }}
          aria-label="Clear date range"
          className="pr-2.5 pl-1 text-indigo-400 hover:text-indigo-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {calendar}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const pageSize = 10;
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, like most data-heavy apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fetchInterviews = useCallback(async () => {
    try {
      const res = await fetch("/api/interviews");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInterviews(data);
      setError("");
    } catch {
      setError("Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInterviews();
    const interval = setInterval(fetchInterviews, 30000);
    return () => clearInterval(interval);
  }, [fetchInterviews]);

  // Check scoring status for unscored interviews on load
  useEffect(() => {
    const unscored = interviews.filter((i) => !i.scorecard && i.transcript.length > 0);
    if (unscored.length === 0) return;

    const checkAll = async () => {
      const generating = new Set<string>();
      for (const interview of unscored) {
        try {
          const res = await fetch(`/api/scoring-status/${interview.id}`);
          const data = await res.json();
          if (data.status === "generating") generating.add(interview.id);
          if (data.status === "completed") {
            // Refresh to get the scorecard
            fetchInterviews();
          }
        } catch {}
      }
      if (generating.size > 0) setScoringIds(generating);
    };
    checkAll();

    // Poll every 10s if any are generating
    const interval = setInterval(checkAll, 10000);
    return () => clearInterval(interval);
  }, [interviews, fetchInterviews]);

  const filtered = useMemo(() => {
    let result = interviews;

    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (verdictFilter !== "all") {
      if (verdictFilter === "hire") {
        result = result.filter((i) => i.scorecard?.recommendation && i.scorecard.recommendation.includes("hire") && !i.scorecard.recommendation.includes("no"));
      } else if (verdictFilter === "no_hire") {
        result = result.filter((i) => i.scorecard?.recommendation?.includes("no_hire") || i.scorecard?.recommendation?.includes("strong_no"));
      } else if (verdictFilter === "unscored") {
        result = result.filter((i) => !i.scorecard);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          ((i as any).candidateName || "").toLowerCase().includes(q) ||
          i.candidateEmail.toLowerCase().includes(q) ||
          i.role.toLowerCase().includes(q) ||
          i.resumeFileName.toLowerCase().includes(q)
      );
    }

    if (dateFrom) {
      result = result.filter((i) => new Date(i.createdAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      result = result.filter((i) => new Date(i.createdAt) <= new Date(dateTo + "T23:59:59"));
    }

    const statusOrder: Record<string, number> = { in_progress: 0, waiting: 1, completed: 2 };

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "score") {
        cmp = (a.scorecard?.overall ?? -1) - (b.scorecard?.overall ?? -1);
      } else if (sortField === "status") {
        cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [interviews, statusFilter, verdictFilter, search, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedFiltered = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [statusFilter, verdictFilter, search, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const scored = interviews.filter((i) => i.scorecard);
    return {
      total: interviews.length,
      waiting: interviews.filter((i) => i.status === "waiting").length,
      inProgress: interviews.filter((i) => i.status === "in_progress").length,
      completed: interviews.filter((i) => i.status === "completed").length,
      avgScore:
        scored.length > 0
          ? (scored.reduce((s, i) => s + (i.scorecard?.overall ?? 0), 0) / scored.length).toFixed(1)
          : "-",
    };
  }, [interviews]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const exportCSV = () => {
    const headers = ["Candidate", "Email", "Role", "Level", "Status", "Score", "Recommendation", "Date"];
    const rows = filtered.map((i: any) => [
      i.candidateName || i.candidateEmail?.split("@")[0] || "Unknown",
      i.candidateEmail || "",
      i.role,
      i.level,
      i.status,
      i.scorecard?.overall ?? "",
      i.scorecard?.recommendation ?? "",
      i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interviews_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg
      className={`w-3.5 h-3.5 ml-1 inline-block transition-all duration-200 ${sortField === field ? "text-indigo-600" : "text-gray-400"} ${sortField === field && sortDir === "asc" ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  const ariaSort = (field: SortField): "ascending" | "descending" | "none" =>
    sortField === field ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th scope="col" aria-sort={ariaSort(field)} className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="inline-flex items-center rounded-md hover:text-gray-900 transition-colors"
      >
        {children} <SortIcon field={field} />
      </button>
    </th>
  );

  const firstName = session?.user?.name?.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const statusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return <span className="badge-warning">Waiting</span>;
      case "in_progress":
        return <span className="badge-info">In progress</span>;
      case "completed":
        return <span className="badge-success">Completed</span>;
      default:
        return <span className="badge-info">{status}</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in-down">
          <div>
            <p className="eyebrow" suppressHydrationWarning>
              {greeting}{firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight text-gray-900">Interviews</h1>
            <p className="mt-1 text-sm text-gray-500">
              {(session?.user as any)?.orgName && (
                <span>{(session?.user as any)?.orgName} &middot; </span>
              )}
              Every session, scorecard and flag in one place
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="btn-secondary whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <Link href="/new" className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New interview
            </Link>
          </div>
        </div>

        <Overview interviews={interviews} loading={loading} />

        {/* Search + Filters */}
        <div className="flex flex-col gap-3 mb-4 animate-fade-in-up delay-3">
          {/* Row 1: Search + Date Range + Export */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <label htmlFor="interview-search" className="sr-only">Search interviews</label>
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                id="interview-search"
                type="search"
                placeholder="Search by name, email, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-keyshortcuts="/"
                className="input-field !pl-10 !pr-10"
              />
              <kbd className="kbd absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex" aria-hidden="true">/</kbd>
            </div>

            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
          </div>

          {/* Row 2: Status Pills + Verdict Pills */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div role="group" aria-label="Filter by status" className="flex items-center gap-0.5 rounded-lg p-0.5 bg-gray-100 overflow-x-auto">
              {[
                { key: "all", label: "All" },
                { key: "waiting", label: "Pending" },
                { key: "in_progress", label: "Active" },
                { key: "completed", label: "Completed" },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  aria-pressed={statusFilter === f.key}
                  className={`px-2.5 py-1 rounded-md text-[13px] font-medium whitespace-nowrap transition-all duration-150 ${
                    statusFilter === f.key
                      ? "bg-white text-gray-900 shadow-hairline"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div role="group" aria-label="Filter by verdict" className="flex items-center gap-0.5 rounded-lg p-0.5 bg-gray-100 overflow-x-auto">
              {[
                { key: "all", label: "All Verdicts" },
                { key: "hire", label: "Hire" },
                { key: "no_hire", label: "No Hire" },
                { key: "unscored", label: "Unscored" },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setVerdictFilter(f.key)}
                  aria-pressed={verdictFilter === f.key}
                  className={`px-2.5 py-1 rounded-md text-[13px] font-medium whitespace-nowrap transition-all duration-150 ${
                    verdictFilter === f.key
                      ? "bg-white text-gray-900 shadow-hairline"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="animate-fade-in-up delay-4">
        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="md:hidden space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="skeleton h-4 w-40 mb-2" />
                      <div className="skeleton h-3 w-24" />
                    </div>
                    <div className="skeleton h-6 w-20 rounded-full" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="skeleton h-3 w-16" />
                    <div className="skeleton h-3 w-12" />
                    <div className="skeleton h-3 w-24 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop skeleton */}
            <div className="card overflow-hidden hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Candidate</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Role</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Score</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Proctoring</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </tbody>
              </table>
            </div>
          </>
        ) : error ? (
          <div className="card p-12 text-center animate-scale-in">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium">{error}</p>
            <button onClick={fetchInterviews} className="text-sm text-gray-500 hover:text-gray-700 mt-2 transition-colors">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 && interviews.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            {/* Empty state illustration */}
            <svg className="w-32 h-32 mx-auto mb-6 text-gray-200" viewBox="0 0 120 120" fill="none">
              <rect x="20" y="30" width="80" height="65" rx="8" stroke="currentColor" strokeWidth="2" />
              <rect x="30" y="42" width="30" height="4" rx="2" fill="currentColor" opacity="0.5" />
              <rect x="30" y="52" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="30" y="60" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="30" y="68" width="45" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <circle cx="82" cy="45" r="8" stroke="currentColor" strokeWidth="2" opacity="0.5" />
              <path d="M79 45l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
              <rect x="30" y="78" width="24" height="8" rx="4" fill="currentColor" className="text-indigo-400" opacity="0.3" />
              <circle cx="90" cy="25" r="12" fill="currentColor" className="text-indigo-400" opacity="0.1" />
              <path d="M87 25l2 2 4-4" stroke="currentColor" className="text-indigo-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </svg>
            <p className="text-xl font-semibold text-gray-900 mb-2">No interviews yet</p>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">Create your first AI-powered interview and share the link with your candidate to get started.</p>
            <Link href="/new" className="btn-primary inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Interview
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-1">No interviews found</p>
            <p className="text-sm text-gray-500 mb-4">Try adjusting your search or filter criteria.</p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setVerdictFilter("all"); setDateFrom(""); setDateTo(""); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {paginatedFiltered.map((interview, idx) => {
                const flagCount = interview.proctoring.filter((p) => p.severity === "flag").length;
                const warningCount = interview.proctoring.filter((p) => p.severity === "warning").length;
                return (
                  <Link
                    key={interview.id}
                    href={`/dashboard/${interview.id}`}
                    className="card-hover p-4 block animate-fade-in-up"
                    style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{interview.candidateName || interview.candidateEmail || interview.resumeFileName}</p>
                        <p className="text-xs text-gray-500">{interview.candidateName && interview.candidateEmail ? `${interview.candidateEmail} · ` : ""}{interview.role} &middot; {interview.level}</p>
                      </div>
                      {statusBadge(interview.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{interview.duration} min</span>
                      {interview.scorecard && (
                        <span className={`font-medium ${scoreColor(interview.scorecard.overall)}`}>
                          {interview.scorecard.overall}/5
                        </span>
                      )}
                      {(flagCount > 0 || warningCount > 0) && (
                        <span className="text-amber-600">{flagCount + warningCount} alert{flagCount + warningCount !== 1 ? "s" : ""}</span>
                      )}
                      <span className="ml-auto">{formatDate(interview.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
              <div className="text-center py-3">
                <p className="text-xs text-gray-500">
                  Showing {filtered.length} of {interviews.length} interview{interviews.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="card overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Interviews, sorted by {sortField} {sortDir === "asc" ? "ascending" : "descending"}</caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th scope="col" className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
                        Candidate
                      </th>
                      <th scope="col" className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
                        Role
                      </th>
                      <SortHeader field="status">Status</SortHeader>
                      <SortHeader field="score">Score</SortHeader>
                      <th scope="col" className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
                        Verdict
                      </th>
                      <th scope="col" className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
                        Proctoring
                      </th>
                      <SortHeader field="date">Date</SortHeader>
                      <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiltered.map((interview, idx) => {
                      const flagCount = interview.proctoring.filter((p) => p.severity === "flag").length;
                      const warningCount = interview.proctoring.filter((p) => p.severity === "warning").length;
                      const totalIssues = flagCount + warningCount;

                      return (
                        <tr
                          key={interview.id}
                          className="group border-b border-gray-100 last:border-0 transition-colors animate-table-row"
                          style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium ${tintOf(interview.candidateEmail || interview.id)}`} aria-hidden="true">
                                {initialsOf(interview.candidateName || interview.candidateEmail || interview.resumeFileName)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-gray-900">
                                  {interview.candidateName || interview.candidateEmail || interview.resumeFileName}
                                </p>
                                {interview.candidateName && (
                                  <p className="truncate text-xs text-gray-500">{interview.candidateEmail}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 min-w-[10rem]">
                            <p className="text-[13px] text-gray-900">{interview.role}</p>
                            <p className="text-xs text-gray-500">{interview.level}</p>
                          </td>
                          <td className="px-4 py-3">
                            {statusBadge(interview.status)}
                          </td>
                          <td className="px-4 py-3">
                            {interview.scorecard ? (
                              <div className="flex items-center gap-2.5" role="img" aria-label={`Score ${interview.scorecard.overall} out of 5`}>
                                <span className="w-7 font-mono text-[13px] font-medium text-gray-900 tabular-nums">{interview.scorecard.overall.toFixed(1)}</span>
                                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                                  <span
                                    className={`block h-full rounded-full ${interview.scorecard.overall >= 3.5 ? "bg-green-500" : interview.scorecard.overall >= 2.5 ? "bg-amber-400" : "bg-red-500"}`}
                                    style={{ width: `${(interview.scorecard.overall / 5) * 100}%` }}
                                  />
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {interview.scorecard?.recommendation ? (
                              <span className={
                                interview.scorecard.recommendation.includes("hire") && !interview.scorecard.recommendation.includes("no")
                                  ? "badge-success" : "badge-danger"
                              }>
                                {interview.scorecard.recommendation.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {totalIssues > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-xs text-gray-600">
                                  {flagCount > 0 && <span className="text-red-600">{flagCount} flag{flagCount !== 1 ? "s" : ""}</span>}
                                  {flagCount > 0 && warningCount > 0 && ", "}
                                  {warningCount > 0 && <span className="text-amber-600">{warningCount} warn</span>}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">Clean</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs text-gray-500">{formatDate(interview.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/dashboard/${interview.id}`}
                                className="px-2.5 py-1 text-xs font-medium text-gray-800 bg-white rounded-md shadow-hairline hover:bg-gray-50 transition-colors"
                              >
                                View<span className="sr-only"> interview for {interview.candidateName || interview.candidateEmail}</span>
                              </Link>
                              {interview.transcript.length > 0 && (
                                <button
                                  disabled={scoringIds.has(interview.id)}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const btn = e.currentTarget;
                                    btn.disabled = true;
                                    btn.textContent = "Scoring...";
                                    try {
                                      const res = await fetch("/api/scorecard", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ interviewId: interview.id }),
                                      });
                                      if (res.ok) {
                                        btn.textContent = "Done!";
                                        setTimeout(() => window.location.reload(), 1000);
                                      } else if (res.status === 409) {
                                        btn.textContent = "Scoring...";
                                        // Poll until done
                                        const poll = setInterval(async () => {
                                          const s = await fetch(`/api/scoring-status/${interview.id}`).then(r => r.json());
                                          if (s.status === "completed") {
                                            clearInterval(poll);
                                            window.location.reload();
                                          } else if (s.status === "failed") {
                                            clearInterval(poll);
                                            btn.textContent = "Retry";
                                            btn.disabled = false;
                                          }
                                        }, 5000);
                                      } else {
                                        btn.textContent = "Failed";
                                        btn.disabled = false;
                                      }
                                    } catch {
                                      btn.textContent = "Failed";
                                      btn.disabled = false;
                                    }
                                  }}
                                  aria-label={`${scoringIds.has(interview.id) ? "Scoring" : interview.scorecard ? "Rescore" : "Score"} interview for ${interview.candidateName || interview.candidateEmail}`}
                                  className="px-2.5 py-1 text-xs font-medium text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {scoringIds.has(interview.id) ? "Scoring..." : interview.scorecard ? "Rescore" : "Score"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer with pagination */}
              <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-between">
                <p className="text-xs text-gray-500" aria-live="polite">
                  Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} interview{filtered.length !== 1 ? "s" : ""}
                </p>
                {totalPages > 1 && (
                  <nav aria-label="Pagination" className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous page"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      Prev
                    </button>
                    {(() => {
                      const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];
                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (currentPage > 3) pages.push("ellipsis-start");
                        const start = Math.max(2, currentPage - 1);
                        const end = Math.min(totalPages - 1, currentPage + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                        if (currentPage < totalPages - 2) pages.push("ellipsis-end");
                        pages.push(totalPages);
                      }
                      return pages.map((page) =>
                        typeof page === "string" ? (
                          <span key={page} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400" aria-hidden="true">...</span>
                        ) : (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            aria-label={`Page ${page}`}
                            aria-current={currentPage === page ? "page" : undefined}
                            className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 ${
                              currentPage === page
                                ? "bg-gray-900 text-gray-50"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {page}
                          </button>
                        )
                      );
                    })()}
                    <button
                      type="button"
                      aria-label="Next page"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      Next
                    </button>
                  </nav>
                )}
                <p className="text-xs text-gray-400">Auto-refreshes every 30s</p>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
