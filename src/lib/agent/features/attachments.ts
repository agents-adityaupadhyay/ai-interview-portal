import type { ChatStore } from '../store';
import type { AgentUser } from '../types';

// Files the user attached in this conversation. They are stored inline (data
// URLs) in the user's own messages, so reading them is scoped by the same
// owner check as the thread itself.
export type Attachment = {
  fileName: string;
  mediaType: string;
  buffer: Buffer;
};

type FilePart = { type: 'file'; mediaType: string; filename?: string; url: string };

const decodeDataUrl = (url: string): Buffer | null => {
  const comma = url.indexOf(',');

  if (!url.startsWith('data:') || comma === -1) {
    return null;
  }

  const header = url.slice(0, comma);
  const payload = url.slice(comma + 1);

  return header.endsWith(';base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');
};

export const listAttachments = async (
  store: ChatStore,
  user: AgentUser,
  threadId: string,
): Promise<Attachment[]> => {
  const messages = await store.loadMessages(user, threadId);
  const attachments: Attachment[] = [];

  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }

    for (const part of message.parts) {
      if (part.type !== 'file') {
        continue;
      }

      const file = part as FilePart;
      const buffer = decodeDataUrl(file.url);

      if (buffer !== null) {
        attachments.push({ fileName: file.filename ?? 'attachment', mediaType: file.mediaType, buffer });
      }
    }
  }

  return attachments;
};

// Newest match wins, so a re-uploaded file with the same name replaces the old one.
export const findAttachment = async (
  store: ChatStore,
  user: AgentUser,
  threadId: string,
  fileName?: string,
): Promise<Attachment> => {
  const attachments = await listAttachments(store, user, threadId);

  if (attachments.length === 0) {
    throw new Error('No file is attached in this conversation. Ask the user to attach it with the paperclip button.');
  }

  if (fileName === undefined) {
    return attachments[attachments.length - 1];
  }

  const wanted = fileName.toLowerCase();
  const match = attachments
    .slice()
    .reverse()
    .find((attachment) => attachment.fileName.toLowerCase() === wanted);

  if (match === undefined) {
    throw new Error(
      `No attachment named "${fileName}". Attached files: ${attachments.map((attachment) => attachment.fileName).join(', ')}.`,
    );
  }

  return match;
};
