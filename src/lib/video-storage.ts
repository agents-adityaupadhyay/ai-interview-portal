import { join } from "path";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SESSION_REGEX = /^[a-z0-9]{8,32}$/;

// Hard caps so a leaked token can't fill the disk
export const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_PART_BYTES = 1024 * 1024 * 1024; // 1 GB per recording session
export const MAX_PARTS = 20;

export function isVideoRecordingEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.VIDEO_RECORDING || "");
}

// data/recordings/video/<interviewId>/<session>.webm — one file per recording session
// (a resumed interview starts a new session, since a new MediaRecorder writes a new WebM header)
export function videoDir(interviewId: string): string {
  return join(process.cwd(), "data", "recordings", "video", interviewId);
}

export function videoPartPath(interviewId: string, session: string): string {
  return join(videoDir(interviewId), `${session}.webm`);
}
