"use client";

import { useEffect, useRef } from "react";

interface VideoRecorderProps {
  interviewId: string;
  token: string;
  mediaStream: MediaStream | null;
  enabled: boolean;
}

const TIMESLICE_MS = 5000;
const VIDEO_BPS = 500_000;
const AUDIO_BPS = 32_000;
const MAX_RETRIES = 5;

function pickMimeType(): string | null {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || null;
}

function newSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Records the candidate's camera + mic and streams it to the server in sequential chunks.
// Strictly best-effort: any failure is logged and swallowed — it must never affect the interview.
export function VideoRecorder({ interviewId, token, mediaStream, enabled }: VideoRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const queueRef = useRef<Blob[]>([]);
  const offsetRef = useRef(0);
  const sessionRef = useRef("");
  const drainingRef = useRef<Promise<void> | null>(null);
  const brokenRef = useRef(false);

  async function sendChunk(blob: Blob): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const qs = new URLSearchParams({
          interviewId, session: sessionRef.current, offset: String(offsetRef.current), token,
        });
        const res = await fetch(`/api/video-chunk?${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
          keepalive: blob.size < 60_000,
        });
        if (res.ok) { offsetRef.current += blob.size; return true; }
        if (res.status === 404 || res.status === 403 || res.status === 409 || res.status === 413 || res.status === 429) return false; // permanent
      } catch { /* network error — retry */ }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    return false;
  }

  function drain(): Promise<void> {
    if (drainingRef.current) return drainingRef.current;
    drainingRef.current = (async () => {
      while (queueRef.current.length > 0 && !brokenRef.current) {
        const blob = queueRef.current[0];
        if (await sendChunk(blob)) queueRef.current.shift();
        else { brokenRef.current = true; queueRef.current = []; } // gap would corrupt the file — stop uploading
      }
      drainingRef.current = null;
    })();
    return drainingRef.current;
  }

  useEffect(() => {
    if (!enabled || !mediaStream || recorderRef.current) return;
    if (mediaStream.getVideoTracks().length === 0) return;
    const mimeType = pickMimeType();
    if (!mimeType) { console.warn("VideoRecorder: no supported WebM type, skipping"); return; }

    let cancelled = false;
    // Confirm the feature is enabled server-side before recording anything
    fetch("/api/config").then((r) => r.json()).then((cfg) => {
      if (cancelled || !cfg?.videoRecording || recorderRef.current) return;
      try {
        sessionRef.current = newSessionId();
        offsetRef.current = 0;
        brokenRef.current = false;
        const recorder = new MediaRecorder(mediaStream, {
          mimeType, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS,
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) { queueRef.current.push(e.data); drain(); }
        };
        recorder.onerror = (e) => console.error("VideoRecorder error", e);
        recorder.start(TIMESLICE_MS);
        recorderRef.current = recorder;
      } catch (err) {
        console.error("VideoRecorder: failed to start", err);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [enabled, mediaStream]);

  // Stop, flush the last chunk, wait (bounded) for uploads. Called by InterviewRoom on end.
  useEffect(() => {
    (window as any).__stopVideoRecording = async () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          try { recorder.stop(); } catch { resolve(); }
        });
      }
      await Promise.race([drain(), new Promise<void>((r) => setTimeout(r, 8000))]);
    };
    return () => { delete (window as any).__stopVideoRecording; };
  });

  // Unmount safety: stop recorder (late chunks still get queued and drained)
  useEffect(() => () => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") { try { r.stop(); } catch {} }
  }, []);

  return null;
}
