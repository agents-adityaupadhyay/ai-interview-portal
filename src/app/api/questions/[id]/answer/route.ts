import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import { generateModelAnswer } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

// AI model answer for one question in a bank. The question text is read from
// the bank (org-scoped), never taken from the client. Answers are cached per
// process by bank + question text, so editing a question naturally misses the
// cache; like rate-limit.ts this is not shared across replicas.

const CACHE_MAX = 500;
const cache = new Map<string, string>();

function remember(key: string, answer: string) {
  cache.delete(key);
  cache.set(key, answer);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    const orgId = user.orgId;

    const body = await req.json().catch(() => ({}));
    const index = Number(body.index);
    const regenerate = body.regenerate === true;
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
    }

    const { rows } = await pool.query(
      "SELECT id, role, level, round_type, questions FROM question_banks WHERE id = $1 AND org_id = $2",
      [params.id, orgId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const bank = rows[0];
    const questions: unknown[] = Array.isArray(bank.questions) ? bank.questions : [];
    const question = typeof questions[index] === "string" ? (questions[index] as string) : "";
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    // The client sends the text it is showing; if the bank changed underneath
    // it (another recruiter edited it), don't answer a different question.
    if (typeof body.question === "string" && body.question.trim() !== question.trim()) {
      return NextResponse.json({ error: "This bank was changed. Refresh and try again." }, { status: 409 });
    }

    const key = `${bank.id}:${createHash("sha256").update(question).digest("hex")}`;
    const cached = cache.get(key);
    if (cached && !regenerate) {
      return NextResponse.json({ answer: cached, cached: true });
    }

    if (!rateLimit(`qa:${user.id || user.email}`, 20, 60000)) {
      return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
    }

    const answer = (await generateModelAnswer({
      question,
      role: bank.role,
      level: bank.level,
      roundType: bank.round_type,
    })).trim();
    if (!answer) {
      return NextResponse.json({ error: "The AI returned an empty answer. Try again." }, { status: 502 });
    }
    remember(key, answer);
    return NextResponse.json({ answer, cached: false });
  } catch (error) {
    console.error("Failed to generate model answer:", error);
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "The AI took too long to answer. Try again." : "Couldn't generate an answer." },
      { status: aborted ? 504 : 500 }
    );
  }
}
