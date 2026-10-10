import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { Readable } from "stream";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateAccess } from "@/lib/auth-check";
import { UUID_REGEX, SESSION_REGEX, videoDir, videoPartPath } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

// Recruiter-only (session + same-org). No ?part -> JSON list of recording parts in order.
// ?part=<session> -> streams that part with HTTP Range support so the player can seek.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const authSession = await getServerSession(authOptions);
  if (!authSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { authorized } = await validateAccess(req, id);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const part = url.searchParams.get("part");

  if (!part) {
    let names: string[] = [];
    try { names = (await readdir(videoDir(id))).filter((f) => f.endsWith(".webm")); } catch {}
    const parts = (await Promise.all(names.map(async (n) => {
      const s = await stat(videoPartPath(id, n.replace(/\.webm$/, "")));
      return { part: n.replace(/\.webm$/, ""), size: s.size, startedAt: s.birthtimeMs || s.ctimeMs };
    }))).filter((p) => p.size > 0).sort((a, b) => a.startedAt - b.startedAt);
    return NextResponse.json({ parts });
  }

  if (!SESSION_REGEX.test(part)) return NextResponse.json({ error: "Invalid part" }, { status: 400 });
  const filePath = videoPartPath(id, part);
  let size: number;
  try { size = (await stat(filePath)).size; } catch {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "video/webm",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
