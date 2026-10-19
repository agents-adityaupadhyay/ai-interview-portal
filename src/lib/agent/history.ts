import { pruneMessages, type ModelMessage } from 'ai';

import { ASK_USER_TOOL_NAME } from './tools/ask-user';
import type { AgentUIMessage } from './types';

export class InvalidChatMessageError extends Error {}

type LooseToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
  approval?: { id: string; approved?: boolean; reason?: string };
  [key: string]: unknown;
};

const MAX_USER_TEXT_LENGTH = 20_000;
const MAX_ANSWER_LENGTH = 4_000;
const SKIPPED_BY_NEW_MESSAGE = 'Skipped: the user sent a new message instead.';

const isToolPart = (part: { type: string }): boolean =>
  part.type.startsWith('tool-') || part.type === 'dynamic-tool';

// The client sends only its newest message. History always comes from the
// database, so a client cannot rewrite earlier turns or forge tool results.
// Two shapes are accepted:
//  - a new user message (text and files only)
//  - the latest assistant message carrying approval responses or ask_user answers
export const mergeIncomingMessage = (
  stored: AgentUIMessage[],
  incoming: AgentUIMessage,
): AgentUIMessage[] => {
  if (incoming.role === 'user') {
    if (stored.some((message) => message.id === incoming.id)) {
      throw new InvalidChatMessageError('Message already exists');
    }

    const parts = incoming.parts.filter(
      (part) => part.type === 'text' || part.type === 'file',
    );
    const textLength = parts.reduce(
      (total, part) => total + (part.type === 'text' ? part.text.length : 0),
      0,
    );

    if (parts.length === 0 || textLength > MAX_USER_TEXT_LENGTH) {
      throw new InvalidChatMessageError('Message is empty or too long');
    }

    validateAttachments(parts);

    return [
      ...closePendingToolCalls(stored),
      { id: incoming.id, role: 'user', parts, metadata: { createdAt: new Date().toISOString() } },
    ];
  }

  const last = stored.at(-1);

  if (incoming.role !== 'assistant' || last === undefined || last.id !== incoming.id) {
    throw new InvalidChatMessageError('Only the latest assistant message can be continued');
  }

  const incomingParts = new Map(
    (incoming.parts as LooseToolPart[])
      .filter((part) => isToolPart(part) && part.toolCallId !== undefined)
      .map((part) => [part.toolCallId, part]),
  );

  let changed = false;

  const parts = (last.parts as LooseToolPart[]).map((part) => {
    const update = part.toolCallId ? incomingParts.get(part.toolCallId) : undefined;

    if (update === undefined) {
      return part;
    }

    if (
      part.state === 'approval-requested' &&
      update.state === 'approval-responded' &&
      typeof update.approval?.approved === 'boolean' &&
      update.approval.id === part.approval?.id
    ) {
      changed = true;

      return {
        ...part,
        state: 'approval-responded',
        approval: {
          ...part.approval,
          approved: update.approval.approved,
          reason: update.approval.reason?.slice(0, MAX_ANSWER_LENGTH),
        },
      };
    }

    if (
      part.type === `tool-${ASK_USER_TOOL_NAME}` &&
      part.state === 'input-available' &&
      update.state === 'output-available'
    ) {
      changed = true;
      const answer = (update.output as { answer?: unknown } | undefined)?.answer;

      return {
        ...part,
        state: 'output-available',
        output: { answer: String(answer ?? '').slice(0, MAX_ANSWER_LENGTH) },
      };
    }

    return part;
  });

  if (!changed) {
    throw new InvalidChatMessageError('Nothing to continue');
  }

  return [...stored.slice(0, -1), { ...last, parts: parts as AgentUIMessage['parts'] }];
};

// Same types and size the create-interview form accepts for a resume. Files
// arrive inline as data URLs and are stored with the message; remote URLs are
// refused so tools never fetch arbitrary addresses.
export const ATTACHMENT_MEDIA_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

const validateAttachments = (parts: AgentUIMessage['parts']) => {
  const files = parts.filter((part) => part.type === 'file');

  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new InvalidChatMessageError(`Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`);
  }

  for (const file of files) {
    if (!ATTACHMENT_MEDIA_TYPES.has(file.mediaType) || !file.url.startsWith(`data:${file.mediaType}`)) {
      throw new InvalidChatMessageError('Only PDF, DOCX and TXT files can be attached');
    }

    // base64 encodes 3 bytes in 4 characters
    if (file.url.length * 0.75 > MAX_ATTACHMENT_BYTES * 1.01) {
      throw new InvalidChatMessageError('Attachments can be at most 10MB');
    }
  }
};

// Retry: drop everything after the latest user message and run that turn again.
export const prepareRegeneration = (
  stored: AgentUIMessage[],
): { messages: AgentUIMessage[]; removedMessageIds: string[] } => {
  const lastUserIndex = stored.findLastIndex((message) => message.role === 'user');

  if (lastUserIndex === -1) {
    throw new InvalidChatMessageError('Nothing to retry');
  }

  return {
    messages: stored.slice(0, lastUserIndex + 1),
    removedMessageIds: stored.slice(lastUserIndex + 1).map((message) => message.id),
  };
};

// A new user message while the agent waits on an approval or a question
// closes those calls, so the model sees why they never ran.
const closePendingToolCalls = (stored: AgentUIMessage[]): AgentUIMessage[] => {
  const last = stored.at(-1);

  if (last === undefined || last.role !== 'assistant') {
    return stored;
  }

  const parts = (last.parts as LooseToolPart[]).map((part) => {
    if (part.state === 'approval-requested' && part.approval !== undefined) {
      return {
        ...part,
        state: 'output-denied',
        approval: { ...part.approval, approved: false, reason: SKIPPED_BY_NEW_MESSAGE },
      };
    }

    if (part.type === `tool-${ASK_USER_TOOL_NAME}` && part.state === 'input-available') {
      return { ...part, state: 'output-available', output: { answer: SKIPPED_BY_NEW_MESSAGE } };
    }

    return part;
  });

  return [...stored.slice(0, -1), { ...last, parts: parts as AgentUIMessage['parts'] }];
};

const estimateTokens = (message: ModelMessage): number =>
  Math.ceil(JSON.stringify(message).length / 4);

// Drops the oldest turns until the history fits the budget. Cuts only at a user
// message so a tool result is never separated from its call.
export const pruneHistory = (
  messages: ModelMessage[],
  tokenBudget: number,
): { messages: ModelMessage[]; wasPruned: boolean; isOverBudget: boolean } => {
  const compacted = pruneMessages({
    messages,
    reasoning: 'before-last-message',
    emptyMessages: 'remove',
  });

  let total = compacted.reduce((sum, message) => sum + estimateTokens(message), 0);
  let start = 0;

  while (total > tokenBudget && start < compacted.length - 1) {
    total -= estimateTokens(compacted[start]);
    start += 1;

    while (start < compacted.length - 1 && compacted[start].role !== 'user') {
      total -= estimateTokens(compacted[start]);
      start += 1;
    }
  }

  return {
    messages: compacted.slice(start),
    wasPruned: start > 0,
    isOverBudget: total > tokenBudget,
  };
};
