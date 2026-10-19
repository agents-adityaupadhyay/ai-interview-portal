"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BrandMark } from "./nav";

// Split layout for /login and /register: an always-dark showcase panel (its
// colours are literal, not theme tokens, so it looks the same in both themes)
// and the form column, which follows the app theme.

const DIMENSIONS = [
  { label: "Technical depth", value: 88 },
  { label: "Problem solving", value: 82 },
  { label: "Communication", value: 91 },
  { label: "Domain knowledge", value: 76 },
];

function ShowcasePanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative hidden overflow-hidden bg-[#0a0920] lg:flex lg:w-[52%]" aria-hidden="true">
      {/* Aurora */}
      <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#5f45ee] opacity-50 blur-[110px] animate-aurora" />
      <div className="absolute -bottom-32 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-[#c026d3] opacity-30 blur-[120px] animate-aurora [animation-delay:-6s]" />
      <div className="absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-[#06b6d4] opacity-20 blur-[100px] animate-aurora [animation-delay:-12s]" />
      {/* Grid, faded at the edges */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <span className="font-display text-xl font-bold tracking-tight text-white">InterviewAI</span>
        </div>

        <div className="max-w-lg">
          <h2 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">{title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-[#c9c5ff]">{subtitle}</p>

          {/* Live scorecard preview */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-[rgba(255,255,255,0.06)] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl motion-safe:animate-float">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#9285fd] to-[#c026d3] text-sm font-bold text-white">PS</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Priya Sharma</p>
                <p className="text-xs text-[#a9a4e8]">Senior Backend Engineer · 32 min</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(52,211,153,0.15)] px-2.5 py-1 text-xs font-semibold text-[#6ee7b7] ring-1 ring-inset ring-[rgba(52,211,153,0.3)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                Strong hire
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {DIMENSIONS.map((d, i) => (
                <div key={d.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-[#c9c5ff]">{d.label}</span>
                    <span className="font-semibold tabular-nums text-white">{(d.value / 20).toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7361f8] to-[#e879f9] animate-grow-width"
                      style={{ width: `${d.value}%`, animationDelay: `${300 + i * 120}ms` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-[#a9a4e8]">
              <span className="flex h-4 items-end gap-[3px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-[3px] rounded-full bg-[#9285fd] motion-safe:animate-pulse" style={{ height: `${[40, 90, 60, 100, 50][i]}%`, animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
              Scored from transcript evidence, with proctoring notes
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#a9a4e8]">
          {["Voice AI interviewer", "Evidence-backed scorecards", "Built-in proctoring"].map((f) => (
            <span key={f} className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 text-[#9285fd]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthShell({
  showcaseTitle,
  showcaseSubtitle,
  title,
  subtitle,
  children,
  footer,
}: {
  showcaseTitle: string;
  showcaseSubtitle: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ShowcasePanel title={showcaseTitle} subtitle={showcaseSubtitle} />
      <main className="app-backdrop flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          <Link href="/login" className="mb-10 inline-flex items-center gap-2.5 lg:hidden" aria-label="InterviewAI">
            <BrandMark className="h-10 w-10" />
            <span className="font-display text-xl font-bold tracking-tight text-gray-900">InterviewAI</span>
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-2 text-gray-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 border-t border-gray-200 pt-6 text-center text-sm text-gray-500">{footer}</div>
        </div>
      </main>
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm animate-fade-in-down ${
        error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        {error ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  minLength?: number;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="input-field !py-2.5 pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            {visible ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </>
            )}
          </svg>
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}
