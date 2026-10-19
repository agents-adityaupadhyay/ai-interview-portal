"use client";

import { useEffect, useId, useRef, useState } from "react";

// "Generate from job description" panel in the question-bank editor. The JD
// (file and/or pasted text) stays loaded while the editor is open, so the
// recruiter can regenerate or ask for more without re-uploading. Drafts are
// only added to the bank when the recruiter picks them.

interface Draft {
  text: string;
  selected: boolean;
}

export interface JdMeta {
  name: string;
  role: string;
  level: string;
}

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 5 * 1024 * 1024;

const ICON_SPARKLE = "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z";
const ICON_DOC = "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z";
const ICON_UPLOAD = "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5";

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function JdGenerator({
  role,
  level,
  roundType,
  existing,
  defaultOpen,
  onAdd,
  onMeta,
  onPendingChange,
}: {
  role: string;
  level: string;
  roundType: string;
  existing: string[];
  defaultOpen: boolean;
  onAdd: (questions: string[]) => void;
  onMeta: (meta: JdMeta) => void;
  /** Ticked suggestions not yet added, so saving the bank can include them. */
  onPendingChange?: (pending: string[]) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [count, setCount] = useState(8);
  const [focus, setFocus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    onPendingChange?.(drafts.filter((d) => d.selected).map((d) => d.text));
  }, [drafts, onPendingChange]);

  const hasJd = !!file || pasted.trim().length > 0;
  const selectedCount = drafts.filter((d) => d.selected).length;

  const pickFile = (f: File | undefined | null) => {
    setError("");
    if (!f) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) {
      setError("Upload a PDF, DOCX or TXT file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is larger than 5 MB.");
      return;
    }
    setFile(f);
  };

  const generate = async () => {
    if (!hasJd) {
      setError("Upload a job description or paste its text first.");
      return;
    }
    setStatus("loading");
    setError("");
    setNote("");
    const form = new FormData();
    if (file) form.append("file", file);
    if (pasted.trim()) form.append("jdText", pasted.trim());
    form.append("role", role);
    form.append("level", level);
    form.append("roundType", roundType);
    form.append("count", String(count));
    form.append("focus", focus);
    // Avoid repeating what the bank already has, or what's already drafted.
    form.append("existing", JSON.stringify([...existing, ...drafts.map((d) => d.text)]));
    try {
      const res = await fetch("/api/questions/generate", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.questions)) throw new Error(data.error || "Couldn't generate questions.");
      setDrafts(data.questions.map((text: string) => ({ text, selected: true })));
      onMeta({ name: data.name || "", role: data.role || "", level: data.level || "" });
      setNote(data.truncated ? `The JD was long (${data.jdChars.toLocaleString()} characters); only the first part was used.` : "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Couldn't generate questions.");
    }
  };

  const addSelected = () => {
    const picked = drafts.filter((d) => d.selected).map((d) => d.text);
    if (picked.length === 0) return;
    onAdd(picked);
    setDrafts((prev) => prev.filter((d) => !d.selected));
  };

  return (
    <section className="overflow-hidden rounded-xl bg-gradient-to-b from-indigo-50/70 to-white shadow-hairline" aria-labelledby={`${id}-title`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-hairline">
          <Icon d={ICON_SPARKLE} />
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className="block text-sm font-semibold text-gray-900">Generate from job description</span>
          <span className="block truncate text-xs text-gray-500">
            {file ? `Using ${file.name}` : hasJd ? "Using pasted JD" : "Upload or paste a JD and AI drafts questions tailored to it"}
          </span>
        </span>
        <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div id={`${id}-body`} className="space-y-3 border-t border-indigo-100 px-4 pb-4 pt-3">
          {/* JD source */}
          {file ? (
            <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-hairline">
              <Icon d={ICON_DOC} className="h-5 w-5 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                <p className="font-mono text-[11px] text-gray-500">{formatSize(file.size)}</p>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost !px-2 !py-1 text-xs">Replace</button>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="btn-ghost !px-2 !py-1 text-xs hover:!text-red-700"
              >
                Remove<span className="sr-only"> {file.name}</span>
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
                dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-300 bg-white"
              }`}
            >
              <Icon d={ICON_UPLOAD} className="h-6 w-6 text-gray-400" />
              <p className="text-sm text-gray-700">
                Drag a JD here, or{" "}
                <button type="button" onClick={() => fileRef.current?.click()} className="font-medium text-indigo-600 underline-offset-2 hover:underline">
                  choose a file
                </button>
              </p>
              <p className="text-xs text-gray-500">PDF, DOCX or TXT, up to 5 MB</p>
            </div>
          )}
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload job description"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {showPaste || pasted ? (
            <div>
              <label htmlFor={`${id}-paste`} className="label">{file ? "Extra notes (optional)" : "Paste the job description"}</label>
              <textarea
                id={`${id}-paste`}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={4}
                placeholder={file ? "Anything to add to the uploaded JD, e.g. team context" : "Paste the full job description here"}
                className="input-field resize-y"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowPaste(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              {file ? "+ Add notes to the JD" : "Or paste the JD as text"}
            </button>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
            <div>
              <label htmlFor={`${id}-count`} className="label">Questions</label>
              <select id={`${id}-count`} value={count} onChange={(e) => setCount(Number(e.target.value))} className="input-field">
                {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-focus`} className="label">Focus (optional)</label>
              <input
                id={`${id}-focus`}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. Kafka, incident handling, stakeholder management"
                className="input-field"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Uses the round type{roundType ? ` (${roundType})` : ""}, role and level above as context.
          </p>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={generate} disabled={status === "loading" || !hasJd} aria-busy={status === "loading"} className="btn-accent">
              {status === "loading" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Reading JD and drafting…
                </>
              ) : (
                <>
                  <Icon d={ICON_SPARKLE} />
                  {drafts.length ? "Generate more" : "Generate questions"}
                </>
              )}
            </button>
            {status === "loading" && <span className="text-xs text-gray-500" role="status">This can take up to a minute.</span>}
          </div>

          {/* Drafts */}
          {drafts.length > 0 && (
            <div className="rounded-lg bg-white shadow-hairline">
              <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2">
                <p className="flex-1 text-[13px] font-medium text-gray-900">
                  Suggestions <span className="font-mono text-gray-500">{selectedCount}/{drafts.length} selected</span>
                </p>
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.map((d) => ({ ...d, selected: selectedCount !== prev.length })))}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  {selectedCount === drafts.length ? "Select none" : "Select all"}
                </button>
              </div>
              {note && <p className="border-b border-gray-100 px-3 py-2 text-xs text-amber-700">{note}</p>}
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                {drafts.map((d, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={d.selected}
                        onChange={() => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, selected: !x.selected } : x)))}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-indigo-600"
                      />
                      <span className="whitespace-pre-line text-sm text-gray-800">{d.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-3 py-2">
                <button type="button" onClick={() => setDrafts([])} className="btn-ghost !px-2.5 !py-1.5 text-xs">Discard</button>
                <button type="button" onClick={addSelected} disabled={selectedCount === 0} className="btn-primary !px-3 !py-1.5 text-xs">
                  Add {selectedCount} to bank
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
