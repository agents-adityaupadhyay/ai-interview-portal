"use client";

import { useEffect, useRef } from "react";

interface VideoRecorderProps {
  interviewId: string;
  token: string;
  mediaStream: MediaStream | null;
  screenStream: MediaStream | null;
  enabled: boolean;
}

const TIMESLICE_MS = 5000;
const VIDEO_BPS = 1_200_000;
const AUDIO_BPS = 48_000;
const MAX_RETRIES = 5;

// Composite frame: shared screen fills it, camera floats in a square in the bottom-right corner
const FRAME_W = 1280;
const FRAME_H = 720;
const PIP_SIZE = 200;
const PIP_MARGIN = 16;
const FPS = 15;

function pickMimeType(): string | null {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || null;
}

function newSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Mix {
  stream: MediaStream;
  setScreen: (screen: MediaStream | null) => void;
  addAIAudio: (audio: HTMLAudioElement) => void;
  dispose: () => void;
}

function hiddenVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("aria-hidden", "true");
  v.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;";
  document.body.appendChild(v);
  return v;
}

// Timer that keeps ticking in a background tab (main-thread timers drop to 1/s there),
// so the screen half keeps moving when the candidate switches away.
function startTicker(fn: () => void, ms: number): () => void {
  try {
    const url = URL.createObjectURL(new Blob(["let t;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = fn;
    worker.postMessage(ms);
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}

// Builds the stream that gets recorded: a canvas with the screen and a camera corner box, and
// audio mixing the candidate's mic with the AI interviewer's voice.
// Returns null if the browser can't composite; the caller then records the camera stream as is.
async function createMix(camera: MediaStream, screen: MediaStream | null): Promise<Mix | null> {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const g = canvas.getContext("2d");
  if (!g || typeof canvas.captureStream !== "function") return null;

  const camVideo = hiddenVideo();
  camVideo.srcObject = camera;
  camVideo.play().catch(() => {});
  const screenVideo = hiddenVideo();
  let screenShared = false;

  const setScreen = (s: MediaStream | null) => {
    if (s && s.getVideoTracks().length > 0) {
      screenShared = true;
      if (screenVideo.srcObject !== s) { screenVideo.srcObject = s; screenVideo.play().catch(() => {}); }
    }
  };
  setScreen(screen);

  const drawFitted = (v: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return false;
    const s = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  };
  // Camera cropped to a square (centre of the frame) for the corner box
  const drawPip = (v: HTMLVideoElement) => {
    const x = FRAME_W - PIP_SIZE - PIP_MARGIN, y = FRAME_H - PIP_SIZE - PIP_MARGIN;
    g.fillStyle = "#fff";
    g.fillRect(x - 3, y - 3, PIP_SIZE + 6, PIP_SIZE + 6);
    g.fillStyle = "#18181b";
    g.fillRect(x, y, PIP_SIZE, PIP_SIZE);
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, x, y, PIP_SIZE, PIP_SIZE);
  };
  const placeholder = (text: string) => {
    g.fillStyle = "#18181b";
    g.fillRect(0, 0, FRAME_W, FRAME_H);
    g.fillStyle = "#a1a1aa";
    g.font = "500 22px Inter, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(text, FRAME_W / 2, FRAME_H / 2);
    g.textAlign = "start";
  };

  const draw = () => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, FRAME_W, FRAME_H);
    if (!screenShared) {
      // Mobile: no screen share, the camera gets the whole frame
      drawFitted(camVideo, 0, 0, FRAME_W, FRAME_H);
      return;
    }
    const screenLive = (screenVideo.srcObject as MediaStream | null)?.getVideoTracks().some((t) => t.readyState === "live");
    if (!screenLive || !drawFitted(screenVideo, 0, 0, FRAME_W, FRAME_H)) {
      placeholder(screenLive ? "Waiting for screen…" : "Screen sharing stopped");
    }
    drawPip(camVideo);
  };
  draw();
  const stopTicker = startTicker(draw, Math.round(1000 / FPS));
  const videoTrack = canvas.captureStream(FPS).getVideoTracks()[0];

  // Audio: mic + AI voice through one Web Audio graph. If the context can't run,
  // fall back to the raw mic track (the AI voice is then missing from the recording).
  let audioTracks: MediaStreamTrack[] = camera.getAudioTracks();
  let ctx: AudioContext | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;
  try {
    ctx = new AudioContext();
    await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1000))]);
    if (ctx.state === "running") {
      dest = ctx.createMediaStreamDestination();
      if (audioTracks.length > 0) ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
      audioTracks = dest.stream.getAudioTracks();
    } else {
      ctx.close().catch(() => {});
      ctx = null;
    }
  } catch {
    ctx = null;
  }

  const addAIAudio = (audio: HTMLAudioElement) => {
    if (!ctx || !dest) return;
    const audioCtx = ctx, out = dest;
    audio.addEventListener("playing", () => {
      try {
        const capture = (audio as any).captureStream as (() => MediaStream) | undefined;
        if (capture) {
          // Chrome/Edge: tap the element without changing how it plays
          const tapped = capture.call(audio);
          if (tapped.getAudioTracks().length === 0) return;
          const src = audioCtx.createMediaStreamSource(tapped);
          src.connect(out);
          audio.addEventListener("ended", () => src.disconnect(), { once: true });
        } else {
          // Firefox: route the element through the graph, and on to the speakers
          const src = audioCtx.createMediaElementSource(audio);
          src.connect(out);
          src.connect(audioCtx.destination);
        }
      } catch { /* recording without AI voice is better than none */ }
    }, { once: true });
  };

  return {
    stream: new MediaStream([videoTrack, ...audioTracks]),
    setScreen,
    addAIAudio,
    dispose: () => {
      stopTicker();
      videoTrack.stop();
      camVideo.srcObject = null; camVideo.remove();
      screenVideo.srcObject = null; screenVideo.remove();
      ctx?.close().catch(() => {});
    },
  };
}

// Records the interview as the recruiter should see it: the candidate's shared screen with
// their camera in a corner box, and both sides of the conversation, streamed to the server in chunks.
// Strictly best-effort: any failure is logged and swallowed — it must never affect the interview.
export function VideoRecorder({ interviewId, token, mediaStream, screenStream, enabled }: VideoRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mixRef = useRef<Mix | null>(null);
  const screenRef = useRef<MediaStream | null>(screenStream);
  const queueRef = useRef<Blob[]>([]);
  const offsetRef = useRef(0);
  const sessionRef = useRef("");
  const drainingRef = useRef<Promise<void> | null>(null);
  const brokenRef = useRef(false);

  screenRef.current = screenStream;

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
    fetch("/api/config").then((r) => r.json()).then(async (cfg) => {
      if (cancelled || !cfg?.videoRecording || recorderRef.current) return;
      try {
        let mix: Mix | null = null;
        try { mix = await createMix(mediaStream, screenRef.current); } catch (err) {
          console.warn("VideoRecorder: compositing unavailable, recording camera only", err);
        }
        if (cancelled || recorderRef.current) { mix?.dispose(); return; }
        mixRef.current = mix;
        sessionRef.current = newSessionId();
        offsetRef.current = 0;
        brokenRef.current = false;
        const recorder = new MediaRecorder(mix ? mix.stream : mediaStream, {
          mimeType, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS,
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) { queueRef.current.push(e.data); drain(); }
        };
        recorder.onerror = (e) => console.error("VideoRecorder error", e);
        recorder.onstop = () => { mixRef.current?.dispose(); mixRef.current = null; };
        recorder.start(TIMESLICE_MS);
        recorderRef.current = recorder;
      } catch (err) {
        console.error("VideoRecorder: failed to start", err);
        mixRef.current?.dispose();
        mixRef.current = null;
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [enabled, mediaStream]);

  useEffect(() => { mixRef.current?.setScreen(screenStream); }, [screenStream]);

  // InterviewRoom hands each AI voice clip here before playing it, so it lands in the recording.
  // Stop, flush the last chunk, wait (bounded) for uploads. Called by InterviewRoom on end.
  useEffect(() => {
    (window as any).__recordAIAudio = (audio: HTMLAudioElement) => {
      try { mixRef.current?.addAIAudio(audio); } catch {}
    };
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
    return () => {
      delete (window as any).__recordAIAudio;
      delete (window as any).__stopVideoRecording;
    };
  });

  // Unmount safety: stop recorder (late chunks still get queued and drained)
  useEffect(() => () => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") { try { r.stop(); } catch {} }
    else { mixRef.current?.dispose(); mixRef.current = null; }
  }, []);

  return null;
}
