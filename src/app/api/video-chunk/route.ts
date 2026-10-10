import { NextResponse } from "next/server";
import { appendFile, mkdir, readdir, stat } from "fs/promises";
import { validateAccessPost } from "@/lib/auth-check";
import { pool } from "@/lib/db";
import {
  UUID_REGEX, SESSION_REGEX, MAX_CHUNK_BYTES, MAX_PART_BYTES, MAX_PARTS,
  isVideoRecordingEnabled, videoDir, videoPartPath,
} from "@/lib/video-storage";

export const dynamic = "force-dynamic";

// Appends one recorded chunk to the session file. Idempotent via `offset`:
// the client sends the number of bytes already uploaded for this session.
//   offset == current size  -> append
//   offset <  current size  -> duplicate retry, acknowledge without writing
//   offset >  current size  -> 409 (client is ahead; gap would corrupt the file)
export async function POST(req: Request) {
  if (!isVideoRecordingEnabled()) {
    return NextResponse.json({ error: "Video recording disabled" }, { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const interviewId = url.searchParams.get("interviewId") || "";
    const session = url.searchParams.get("session") || "";
    const token = url.searchParams.get("token") || undefined;
    const offset = parseInt(url.searchParams.get("offset") || "", 10);

    if (!UUID_REGEX.test(interviewId) || !SESSION_REGEX.test(session) || !Number.isFinite(offset) || offset < 0) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }
    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    // Only accept while the interview is live, plus a short grace window for the final flush
    const { rows } = await pool.query("SELECT status, ended_at FROM interviews WHERE id = $1", [interviewId]);
    if (!rows.length) return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    const { status, ended_at } = rows[0];
    if (status === "completed" && (!ended_at || Date.now() - new Date(ended_at).getTime() > 5 * 60 * 1000)) {
      return NextResponse.json({ error: "Interview closed" }, { status: 403 });
    }

    const buffer = Buffer.from(await req.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Invalid chunk size" }, { status: 413 });
    }

    const dir = videoDir(interviewId);
    await mkdir(dir, { recursive: true });
    const filePath = videoPartPath(interviewId, session);

    let size = 0;
    try { size = (await stat(filePath)).size; } catch {
      const parts = (await readdir(dir)).filter((f) => f.endsWith(".webm"));
      if (parts.length >= MAX_PARTS) {
        return NextResponse.json({ error: "Too many recording sessions" }, { status: 429 });
      }
    }

    if (offset < size) return NextResponse.json({ success: true, size, duplicate: true });
    if (offset > size) return NextResponse.json({ error: "Offset mismatch", size }, { status: 409 });
    if (size + buffer.length > MAX_PART_BYTES) {
      return NextResponse.json({ error: "Recording size limit reached" }, { status: 413 });
    }

    await appendFile(filePath, buffer);
    return NextResponse.json({ success: true, size: size + buffer.length });
  } catch (error) {
    console.error("Video chunk upload failed:", error);
    return NextResponse.json({ error: "Failed to save chunk" }, { status: 500 });
  }
}
