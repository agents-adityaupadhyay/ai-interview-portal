"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Markdown } from "@/components/agent-ui/Markdown";
import { JdGenerator, type JdMeta } from "@/components/questions/JdGenerator";

interface QuestionBank {
  id: string;
  org_id: string | null;
  name: string;
  role: string;
  level: string;
  round_type: string;
  questions: string[];
}

const ROUND_TYPES = ["Technical", "Behavioral", "System Design", "Coding", "Puzzle", "HR", "Case Study"];
const LEVELS = ["Junior", "Mid", "Senior", "Staff", "Principal"];

const questionsOf = (bank: QuestionBank) => (Array.isArray(bank.questions) ? bank.questions : []);

const ICON_EYE = "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z";
const ICON_EDIT = "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125";
const ICON_TRASH = "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0";
const ICON_CLOSE = "M6 18L18 6M6 6l12 12";
const ICON_SPARKLE = "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z";

// AI answers already fetched this page session, keyed by bank + question text,
// so closing and reopening a bank doesn't re-ask the model.
const answerCache = new Map<string, string>();
const answerKey = (bankId: string, question: string) => `${bankId}\u0000${question}`;

type AnswerState = { status: "loading" | "done" | "error"; answer?: string; error?: string };

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// Esc to close, focus moved in on open and handed back on close, Tab kept inside.
function useDialog(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []);
    requestAnimationFrame(() => (node?.querySelector<HTMLElement>("[data-autofocus]") || focusables()[0])?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog stacked on top handles its own keys.
      if (document.querySelector('[role="alertdialog"]')) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [open, onClose, ref]);
}

export default function QuestionsPage() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [viewing, setViewing] = useState<QuestionBank | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionBank | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Senior");
  const [roundType, setRoundType] = useState("Technical");
  const [questions, setQuestions] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const [search, setSearch] = useState("");
  const [pendingDrafts, setPendingDrafts] = useState<string[]>([]);

  const fetchBanks = useCallback(async () => {
    try {
      const res = await fetch("/api/questions");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setBanks(Array.isArray(data) ? data : []);
      setLoadError("");
    } catch {
      setLoadError("Couldn't load question banks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const resetForm = () => {
    setName("");
    setRole("");
    setLevel("Senior");
    setRoundType("Technical");
    setQuestions([]);
    setNewQuestion("");
    setEditingIdx(null);
    setEditingText("");
    setEditingBank(null);
    setSaveError("");
    setPendingDrafts([]);
  };

  const openCreate = () => {
    resetForm();
    setShowEditor(true);
  };

  const openEdit = (bank: QuestionBank) => {
    resetForm();
    setEditingBank(bank);
    setName(bank.name);
    setRole(bank.role || "");
    setLevel(bank.level || "Senior");
    setRoundType(bank.round_type || "Technical");
    setQuestions(questionsOf(bank));
    setViewing(null);
    setShowEditor(true);
  };

  const closeEditor = useCallback(() => {
    setShowEditor(false);
  }, []);
  const closeViewer = useCallback(() => setViewing(null), []);

  const addQuestion = () => {
    const text = newQuestion.trim();
    if (!text) return;
    // Split pasted content on 2+ consecutive newlines — each block becomes a separate question.
    // This preserves formatting within a question (single newlines) but splits between questions.
    const blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
    setQuestions((prev) => [...prev, ...blocks]);
    setNewQuestion("");
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const startEditQuestion = (idx: number) => {
    setEditingIdx(idx);
    setEditingText(questions[idx]);
  };

  const commitEditQuestion = () => {
    if (editingIdx === null) return;
    const text = editingText.trim();
    setQuestions((prev) => (text ? prev.map((q, i) => (i === editingIdx ? text : q)) : prev.filter((_, i) => i !== editingIdx)));
    setEditingIdx(null);
  };

  // Prefill from the JD only where the recruiter hasn't typed anything.
  const applyJdMeta = (meta: JdMeta) => {
    if (meta.name) setName((v) => v.trim() ? v : meta.name);
    if (meta.role) setRole((v) => v.trim() ? v : meta.role);
    if (!editingBank && LEVELS.includes(meta.level)) setLevel(meta.level);
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim() || !role.trim() || !level || !roundType) return;
    // Keep an in-progress inline edit or an unsaved draft rather than losing it.
    let finalQuestions = questions;
    if (editingIdx !== null) {
      const text = editingText.trim();
      finalQuestions = text ? questions.map((q, i) => (i === editingIdx ? text : q)) : questions.filter((_, i) => i !== editingIdx);
    }
    if (newQuestion.trim()) {
      finalQuestions = [...finalQuestions, ...newQuestion.trim().split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean)];
    }
    // Ticked JD suggestions the recruiter didn't explicitly add yet.
    finalQuestions = [...finalQuestions, ...pendingDrafts];
    const payload = { name: name.trim(), role: role.trim(), level, roundType, questions: finalQuestions };

    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(editingBank ? `/api/questions/${editingBank.id}` : "/api/questions", {
        method: editingBank ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      const saved: QuestionBank = await res.json();
      setShowEditor(false);
      setNotice({ tone: "success", text: editingBank ? `Saved “${saved.name}”.` : `Created “${saved.name}”.` });
      resetForm();
      await fetchBanks();
      setViewing(saved);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bank: QuestionBank) => {
    try {
      const res = await fetch(`/api/questions/${bank.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setViewing((v) => (v?.id === bank.id ? null : v));
      setNotice({ tone: "success", text: `Deleted “${bank.name}”.` });
      fetchBanks();
    } catch {
      setNotice({ tone: "error", text: `Couldn't delete “${bank.name}”. Please try again.` });
    }
  };

  const q = search.trim().toLowerCase();
  const visibleBanks = q
    ? banks.filter((b) => `${b.name} ${b.role} ${b.level} ${b.round_type} ${questionsOf(b).join(" ")}`.toLowerCase().includes(q))
    : banks;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 animate-fade-in-down">
          <div>
            <p className="eyebrow">Library</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight text-gray-900">Question banks</h1>
            <p className="text-sm text-gray-500 mt-1">Reusable question sets, organised by role, level and round</p>
          </div>
          <button onClick={openCreate} className="btn-primary self-start sm:self-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New question bank
          </button>
        </div>

        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mb-4 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm shadow-hairline animate-fade-in-down ${
              notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        {banks.length > 0 && (
          <div className="relative mb-4 max-w-md">
            <label htmlFor="bank-search" className="sr-only">Search question banks</label>
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="bank-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search banks and questions…"
              className="input-field !pl-9"
            />
          </div>
        )}

        {/* Banks List */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5">
                <div className="skeleton h-5 w-40 mb-3" />
                <div className="skeleton h-6 w-20 rounded-full mb-3" />
                <div className="skeleton h-3 w-full mb-2" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="card p-10 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
            <button onClick={() => { setLoading(true); fetchBanks(); }} className="btn-secondary mt-4">Retry</button>
          </div>
        ) : banks.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            <svg className="w-28 h-28 mx-auto mb-6 text-gray-200" viewBox="0 0 120 120" fill="none" aria-hidden="true">
              <rect x="25" y="20" width="70" height="80" rx="6" stroke="currentColor" strokeWidth="2" />
              <rect x="35" y="32" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
              <rect x="35" y="42" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="35" y="52" width="35" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="35" y="65" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
              <rect x="35" y="75" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <circle cx="85" cy="80" r="18" fill="currentColor" opacity="0.15" stroke="currentColor" className="text-indigo-400" strokeWidth="2" />
              <path d="M82 80h6M85 77v6" stroke="currentColor" className="text-indigo-400" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            </svg>
            <p className="text-xl font-semibold text-gray-900 mb-2">No question banks yet</p>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">Create reusable sets of interview questions organized by role and round type.</p>
            <button onClick={openCreate} className="btn-primary">New question bank</button>
          </div>
        ) : visibleBanks.length === 0 ? (
          <div className="card p-10 text-center text-sm text-gray-500">
            No banks match &ldquo;{search}&rdquo;.
            <button onClick={() => setSearch("")} className="ml-1 font-medium text-indigo-600 hover:text-indigo-700">Clear search</button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBanks.map((bank, idx) => {
              const qs = questionsOf(bank);
              return (
                <li
                  key={bank.id}
                  className="card-hover flex flex-col animate-fade-in-up"
                  style={{ animationDelay: `${idx * 40}ms`, opacity: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => setViewing(bank)}
                    className="flex flex-1 flex-col rounded-t-xl p-5 text-left"
                    aria-label={`View ${bank.name}, ${qs.length} question${qs.length === 1 ? "" : "s"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 truncate font-sans text-[15px] font-semibold tracking-normal text-gray-900">{bank.name}</h2>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{qs.length} Q</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
                      <span className="badge-info">{bank.round_type}</span>
                      <span>{bank.role}</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span>{bank.level}</span>
                    </div>
                    {qs.length > 0 ? (
                      <ol className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                        {qs.slice(0, 2).map((question, qi) => (
                          <li key={qi} className="flex gap-2 text-xs text-gray-600">
                            <span className="font-mono text-gray-400">{qi + 1}.</span>
                            <span className="line-clamp-1">{question}</span>
                          </li>
                        ))}
                        {qs.length > 2 && <li className="pl-5 text-xs text-gray-400">+{qs.length - 2} more</li>}
                      </ol>
                    ) : (
                      <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">No questions yet</p>
                    )}
                  </button>
                  {/* Actions: always visible (not hover-only), so touch and keyboard users can reach them. */}
                  <div className="flex items-center gap-1 border-t border-gray-100 px-3 py-2">
                    <button type="button" onClick={() => setViewing(bank)} className="btn-ghost !px-2.5 !py-1.5 text-[13px]">
                      <Icon d={ICON_EYE} />
                      View
                    </button>
                    <button type="button" onClick={() => openEdit(bank)} className="btn-ghost !px-2.5 !py-1.5 text-[13px]">
                      <Icon d={ICON_EDIT} />
                      Edit<span className="sr-only"> {bank.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(bank)}
                      className="btn-ghost ml-auto !px-2.5 !py-1.5 text-[13px] hover:!bg-red-50 hover:!text-red-700"
                    >
                      <Icon d={ICON_TRASH} />
                      Delete<span className="sr-only"> {bank.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {viewing && (
        <BankViewer
          bank={viewing}
          onClose={closeViewer}
          onEdit={() => openEdit(viewing)}
          onDelete={() => setDeleteTarget(viewing)}
        />
      )}

      {showEditor && (
        <EditorDialog
          title={editingBank ? "Edit question bank" : "New question bank"}
          subtitle={editingBank ? "Update details, edit, reorder or remove questions" : "Build a reusable set of interview questions"}
          onClose={closeEditor}
          footer={
            <>
              {saveError ? (
                <p role="alert" className="mr-auto text-sm text-red-600">{saveError}</p>
              ) : pendingDrafts.length > 0 ? (
                <p className="mr-auto text-xs text-gray-500">{pendingDrafts.length} selected suggestion{pendingDrafts.length === 1 ? "" : "s"} will be added on save</p>
              ) : null}
              <button onClick={closeEditor} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={!name.trim() || !role.trim() || saving} aria-busy={saving} className="btn-primary">
                {saving ? "Saving…" : editingBank ? "Save changes" : "Create bank"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="qb-name" className="label">Name</label>
              <input id="qb-name" data-autofocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend Technical Questions" className="input-field" />
            </div>
            <div>
              <label htmlFor="qb-role" className="label">Role</label>
              <input id="qb-role" type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Engineer" className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="qb-level" className="label">Level</label>
                <select id="qb-level" value={level} onChange={(e) => setLevel(e.target.value)} className="input-field">
                  {(LEVELS.includes(level) ? LEVELS : [level, ...LEVELS]).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="qb-round" className="label">Round type</label>
                <select id="qb-round" value={roundType} onChange={(e) => setRoundType(e.target.value)} className="input-field">
                  {(ROUND_TYPES.includes(roundType) ? ROUND_TYPES : [roundType, ...ROUND_TYPES]).map((rt) => <option key={rt} value={rt}>{rt}</option>)}
                </select>
              </div>
            </div>

            <JdGenerator
              role={role}
              level={level}
              roundType={roundType}
              existing={questions}
              defaultOpen={!editingBank}
              onAdd={(picked) => setQuestions((prev) => [...prev, ...picked])}
              onMeta={applyJdMeta}
              onPendingChange={setPendingDrafts}
            />

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="qb-new" className="label !mb-0">Questions</label>
                <span className="font-mono text-xs text-gray-500">{questions.length}</span>
              </div>
              <div className="mb-3 flex gap-2">
                <textarea
                  id="qb-new"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  onPaste={(e) => {
                    // Some browsers paste rich-text HTML which collapses newlines.
                    // Force plain text extraction to preserve \n.
                    const plain = e.clipboardData.getData("text/plain");
                    if (plain) {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart || 0;
                      const end = target.selectionEnd || 0;
                      setNewQuestion(newQuestion.substring(0, start) + plain + newQuestion.substring(end));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addQuestion(); }
                  }}
                  aria-describedby="qb-new-hint"
                  placeholder="Type a question and press Enter to add"
                  rows={3}
                  className="input-field flex-1 resize-y"
                />
                <button type="button" onClick={addQuestion} disabled={!newQuestion.trim()} className="btn-secondary self-end">Add</button>
              </div>
              <p id="qb-new-hint" className="-mt-1.5 mb-3 text-xs text-gray-500">
                Shift+Enter for a new line. Paste several questions separated by a blank line to add them all at once.
              </p>

              {questions.length > 0 && (
                <ol className="space-y-2">
                  {questions.map((question, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 shadow-hairline">
                      <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-gray-400">{i + 1}.</span>
                      {editingIdx === i ? (
                        <div className="flex-1">
                          <label htmlFor={`qb-edit-${i}`} className="sr-only">Edit question {i + 1}</label>
                          <textarea
                            id={`qb-edit-${i}`}
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEditQuestion(); }
                              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditingIdx(null); }
                            }}
                            rows={Math.min(8, Math.max(2, editingText.split("\n").length))}
                            className="input-field resize-y"
                          />
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={commitEditQuestion} className="btn-primary !px-2.5 !py-1 text-xs">Done</button>
                            <button type="button" onClick={() => setEditingIdx(null)} className="btn-ghost !px-2.5 !py-1 text-xs">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="flex-1 whitespace-pre-line text-sm text-gray-700">{question}</p>
                      )}
                      {editingIdx !== i && (
                        <div className="flex shrink-0 items-center">
                          <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="rounded-md p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 disabled:opacity-30" aria-label={`Move question ${i + 1} up`}>
                            <Icon d="M4.5 15.75l7.5-7.5 7.5 7.5" className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="rounded-md p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 disabled:opacity-30" aria-label={`Move question ${i + 1} down`}>
                            <Icon d="M19.5 8.25l-7.5 7.5-7.5-7.5" className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => startEditQuestion(i)} className="rounded-md p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700" aria-label={`Edit question ${i + 1}`}>
                            <Icon d={ICON_EDIT} className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => removeQuestion(i)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove question ${i + 1}`}>
                            <Icon d={ICON_CLOSE} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </EditorDialog>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete question bank?"
        message={`“${deleteTarget?.name ?? ""}” and all ${deleteTarget ? questionsOf(deleteTarget).length : 0} of its questions will be permanently removed.`}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}

// Slide-over panel with the whole bank, read-only, plus Edit / Delete.
function BankViewer({ bank, onClose, onEdit, onDelete }: { bank: QuestionBank; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  useDialog(true, onClose, ref);

  const qs = questionsOf(bank);
  const f = filter.trim().toLowerCase();
  const shown = qs.map((text, i) => ({ text, i })).filter((x) => !f || x.text.toLowerCase().includes(f));

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {}
  };

  const fetchAnswer = async (i: number, text: string, regenerate = false) => {
    const key = answerKey(bank.id, text);
    const hit = answerCache.get(key);
    setOpen((o) => ({ ...o, [i]: true }));
    if (hit && !regenerate) {
      setAnswers((a) => ({ ...a, [i]: { status: "done", answer: hit } }));
      return;
    }
    setAnswers((a) => ({ ...a, [i]: { status: "loading", answer: a[i]?.answer } }));
    try {
      const res = await fetch(`/api/questions/${bank.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: i, question: text, regenerate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.answer) throw new Error(data.error || "Couldn't generate an answer.");
      answerCache.set(key, data.answer);
      setAnswers((a) => ({ ...a, [i]: { status: "done", answer: data.answer } }));
    } catch (err) {
      setAnswers((a) => ({ ...a, [i]: { status: "error", error: err instanceof Error ? err.message : "Couldn't generate an answer." } }));
    }
  };

  const toggleAnswer = (i: number, text: string) => {
    if (open[i]) {
      setOpen((o) => ({ ...o, [i]: false }));
    } else if (answers[i]?.status === "done") {
      setOpen((o) => ({ ...o, [i]: true }));
    } else {
      fetchAnswer(i, text);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-gray-950/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-fade-in-right sm:m-2 sm:h-[calc(100%-1rem)] sm:rounded-xl sm:shadow-hairline"
      >
        <header className="flex items-start gap-3 border-b border-gray-200 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Question bank</p>
            <h2 id={titleId} className="mt-1.5 text-xl font-semibold text-gray-900">{bank.name}</h2>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <div className="flex gap-1.5"><dt className="text-gray-500">Role</dt><dd className="text-gray-900">{bank.role || "–"}</dd></div>
              <div className="flex gap-1.5"><dt className="text-gray-500">Level</dt><dd className="text-gray-900">{bank.level || "–"}</dd></div>
              <div className="flex gap-1.5"><dt className="text-gray-500">Round</dt><dd className="text-gray-900">{bank.round_type || "–"}</dd></div>
              <div className="flex gap-1.5"><dt className="text-gray-500">Questions</dt><dd className="font-mono text-gray-900">{qs.length}</dd></div>
            </dl>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <Icon d={ICON_CLOSE} className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {qs.length > 5 && (
            <div className="mb-4">
              <label htmlFor="viewer-filter" className="sr-only">Filter questions</label>
              <input id="viewer-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter questions…" className="input-field" />
            </div>
          )}
          {qs.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 shadow-hairline">
              This bank has no questions yet.
              <button onClick={onEdit} className="ml-1 font-medium text-indigo-600 hover:text-indigo-700">Add some</button>
            </div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-500">No questions match &ldquo;{filter}&rdquo;.</p>
          ) : (
            <ol className="space-y-2.5">
              {shown.map(({ text, i }) => {
                const state = answers[i];
                const isOpen = !!open[i];
                const panelId = `answer-${i}`;
                return (
                  <li key={i} className="rounded-lg shadow-hairline">
                    <div className="flex gap-3 p-3">
                      <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-gray-400">{String(i + 1).padStart(2, "0")}</span>
                      <p className="flex-1 whitespace-pre-line text-sm leading-relaxed text-gray-800">{text}</p>
                      <button
                        type="button"
                        onClick={() => copy(text, `q${i}`)}
                        className="h-7 shrink-0 rounded-md px-2 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label={`Copy question ${i + 1}`}
                      >
                        {copied === `q${i}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 pb-3 pl-12">
                      <button
                        type="button"
                        onClick={() => toggleAnswer(i, text)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isOpen ? "bg-indigo-50 text-indigo-700" : "text-indigo-700 shadow-hairline hover:bg-indigo-50"
                        }`}
                      >
                        <Icon d={ICON_SPARKLE} className="h-3.5 w-3.5" />
                        {state?.status === "loading" ? "Generating…" : isOpen ? "Hide answer" : state?.status === "done" ? "Show answer" : "AI answer"}
                      </button>
                    </div>
                    {isOpen && (
                      <div id={panelId} className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 sm:pl-12 rounded-b-lg" aria-live="polite" aria-busy={state?.status === "loading"}>
                        {state?.status === "loading" && !state.answer && (
                          <div className="space-y-2" role="status">
                            <span className="sr-only">Generating answer</span>
                            <div className="skeleton h-4 w-32" />
                            <div className="skeleton h-3 w-full" />
                            <div className="skeleton h-3 w-11/12" />
                            <div className="skeleton h-3 w-4/5" />
                          </div>
                        )}
                        {state?.status === "error" && (
                          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
                            {state.error}
                            <button type="button" onClick={() => fetchAnswer(i, text)} className="btn-secondary !px-2.5 !py-1 text-xs">Try again</button>
                          </div>
                        )}
                        {state?.answer && state.status !== "error" && (
                          <>
                            <div className={`answer-md ${state.status === "loading" ? "opacity-50" : ""}`}>
                              <Markdown text={state.answer} />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                              <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                <Icon d={ICON_SPARKLE} className="h-3 w-3 text-indigo-500" />
                                AI-generated. Check it before relying on it.
                              </span>
                              <button type="button" onClick={() => copy(state.answer!, `a${i}`)} className="btn-ghost !px-2 !py-1 text-xs">
                                {copied === `a${i}` ? "Copied" : "Copy answer"}
                              </button>
                              <button
                                type="button"
                                onClick={() => fetchAnswer(i, text, true)}
                                disabled={state.status === "loading"}
                                className="btn-ghost !px-2 !py-1 text-xs disabled:opacity-50"
                              >
                                {state.status === "loading" ? "Regenerating…" : "Regenerate"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onDelete} className="btn-ghost !px-3 text-red-600 hover:!bg-red-50 hover:!text-red-700">
            <Icon d={ICON_TRASH} />
            Delete
          </button>
          <button type="button" onClick={onClose} className="btn-secondary ml-auto">Close</button>
          <button type="button" data-autofocus onClick={onEdit} className="btn-primary">
            <Icon d={ICON_EDIT} />
            Edit
          </button>
        </footer>
      </div>
    </div>
  );
}

function EditorDialog({ title, subtitle, onClose, footer, children }: { title: string; subtitle: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(true, onClose, ref);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-gray-950/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-scale-in">
        <div className="flex items-start gap-3 border-b border-gray-200 px-6 py-5">
          <div className="flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <Icon d={ICON_CLOSE} className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}
