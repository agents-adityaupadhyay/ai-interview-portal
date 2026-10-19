import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateQuestionsFromJD } from "@/lib/ai";
import { extractResumeText, UNPARSEABLE_RESUME } from "@/lib/resume-text";
import { rateLimit } from "@/lib/rate-limit";

// Drafts question-bank questions from a job description (uploaded PDF/DOCX/TXT
// or pasted text). Nothing is saved here: the recruiter reviews the drafts in
// the editor and saves the bank through /api/questions as usual.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_JD_CHARS = 15000;
const ALLOWED = /\.(pdf|docx|txt|md)$/i;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;

    const form = await req.formData();
    const file = form.get("file");
    let jd = String(form.get("jdText") || "").trim();

    if (file && typeof file !== "string" && file.size > 0) {
      if (!ALLOWED.test(file.name)) {
        return NextResponse.json({ error: "Upload a PDF, DOCX or TXT file." }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File is larger than 5 MB." }, { status: 400 });
      }
      const text = (await extractResumeText(Buffer.from(await file.arrayBuffer()), file.name)).trim();
      if (!text || text === UNPARSEABLE_RESUME) {
        return NextResponse.json({ error: "Couldn't read text from that file. Try another file or paste the JD." }, { status: 422 });
      }
      jd = jd ? `${text}\n\n${jd}` : text;
    }

    if (jd.length < 80) {
      return NextResponse.json({ error: "Add a job description (upload a file or paste at least a few sentences)." }, { status: 400 });
    }

    const count = Math.min(20, Math.max(3, parseInt(String(form.get("count") || "8"), 10) || 8));
    let existing: string[] = [];
    try {
      const parsed = JSON.parse(String(form.get("existing") || "[]"));
      if (Array.isArray(parsed)) existing = parsed.filter((q) => typeof q === "string");
    } catch {}

    if (!rateLimit(`qgen:${user.id || user.email}`, 10, 60000)) {
      return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
    }

    const truncated = jd.length > MAX_JD_CHARS;
    const result = await generateQuestionsFromJD({
      jobDescription: jd.slice(0, MAX_JD_CHARS),
      role: String(form.get("role") || "").trim() || undefined,
      level: String(form.get("level") || "").trim() || undefined,
      roundType: String(form.get("roundType") || "").trim() || undefined,
      focus: String(form.get("focus") || "").trim().slice(0, 300) || undefined,
      count,
      existing,
    });

    return NextResponse.json({ ...result, jdChars: jd.length, truncated });
  } catch (error) {
    console.error("Failed to generate questions from JD:", error);
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "The AI took too long. Try fewer questions or a shorter JD." : "Couldn't generate questions. Please try again." },
      { status: aborted ? 504 : 500 }
    );
  }
}
