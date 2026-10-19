"use client";

import { useEffect, useState } from "react";

interface Part { part: string; size: number; startedAt: number }

// Recruiter-side playback of the interview video. A resumed interview produces several
// recording sessions ("parts"); they play back-to-back and can be switched manually.
export function RecordingPlayer({ interviewId }: { interviewId: string }) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch(`/api/recording/${interviewId}/video`)
      .then((r) => (r.ok ? r.json() : { parts: [] }))
      .then((d) => setParts(d.parts || []))
      .catch(() => setParts([]));
  }, [interviewId]);

  if (!parts || parts.length === 0) return null;

  const current = parts[Math.min(index, parts.length - 1)];

  return (
    <div className="card p-6 animate-fade-in-right delay-3">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Interview Recording</h2>
      <p className="text-xs text-gray-500 mb-3">Shared screen with the candidate's camera, and both sides of the conversation</p>
      <video
        key={current.part}
        controls
        autoPlay={index > 0}
        preload="metadata"
        playsInline
        className="w-full h-auto max-h-[70vh] rounded-lg bg-black"
        src={`/api/recording/${interviewId}/video?part=${current.part}`}
        onEnded={() => setIndex((i) => (i + 1 < parts.length ? i + 1 : i))}
      />
      {parts.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {parts.map((p, i) => (
            <button
              key={p.part}
              onClick={() => setIndex(i)}
              className={`px-2.5 py-1 rounded-md text-xs border ${i === index ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
            >
              Part {i + 1} · {(p.size / 1024 / 1024).toFixed(1)} MB
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
