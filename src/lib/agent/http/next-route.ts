import { validateUIMessages } from 'ai';
import { z } from 'zod';

import { AgentTurnError, startAgentTurn, type AgentDependencies } from '../run-turn';
import type { AgentUIMessage, AgentUser } from '../types';

// Fetch-API handlers for the Next.js App Router routes under src/app/api/agent.
// Standard tier: a turn stops when the client disconnects (resumable streams
// are a later milestone).
export type FetchAgentOptions = {
  dependencies: AgentDependencies;
  getAgentUser: (request: Request) => Promise<AgentUser | null>;
};

const chatRequestSchema = z.object({
  threadId: z.string().min(1).max(64),
  trigger: z.enum(['submit-message', 'regenerate-message']).default('submit-message'),
  message: z.unknown(),
  pageContext: z
    .object({
      route: z.string().max(500).optional(),
      entityType: z.string().max(100).optional(),
      entityId: z.string().max(100).optional(),
      entityLabel: z.string().max(200).optional(),
      viewName: z.string().max(200).optional(),
      filters: z.array(z.string().max(300)).max(20).optional(),
      extra: z.record(z.string(), z.string().max(500)).optional(),
    })
    .nullish(),
});

const unauthenticated = () => Response.json({ error: 'unauthenticated' }, { status: 401 });

export const handleChatPost = async (
  request: Request,
  { dependencies, getAgentUser }: FetchAgentOptions,
): Promise<Response> => {
  const user = await getAgentUser(request);

  if (user === null) {
    return unauthenticated();
  }

  try {
    const body = chatRequestSchema.parse(await request.json());
    const [message] = await validateUIMessages<AgentUIMessage>({ messages: [body.message] });
    const controller = new AbortController();

    request.signal.addEventListener('abort', () => controller.abort());

    const { result, streamOptions } = await startAgentTurn(dependencies, {
      user,
      threadId: body.threadId,
      trigger: body.trigger,
      message,
      pageContext: body.pageContext ?? null,
      abortSignal: controller.signal,
    });

    return result.toUIMessageStreamResponse(streamOptions);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleListThreads = async (
  request: Request,
  { dependencies, getAgentUser }: FetchAgentOptions,
): Promise<Response> => {
  const user = await getAgentUser(request);

  if (user === null) {
    return unauthenticated();
  }

  const threads = await dependencies.store.listThreads(user, { limit: 50 });

  return Response.json({
    threads: threads.map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updatedAt.toISOString() })),
  });
};

export const handleGetMessages = async (
  request: Request,
  threadId: string,
  { dependencies, getAgentUser }: FetchAgentOptions,
): Promise<Response> => {
  const user = await getAgentUser(request);

  if (user === null) {
    return unauthenticated();
  }

  if ((await dependencies.store.getThread(user, threadId)) === null) {
    return Response.json({ error: 'thread_not_found' }, { status: 404 });
  }

  const messages = await dependencies.store.loadMessages(user, threadId);

  return Response.json({ messages: messages.map(withoutFileData) });
};

export const handleDeleteThread = async (
  request: Request,
  threadId: string,
  { dependencies, getAgentUser }: FetchAgentOptions,
): Promise<Response> => {
  const user = await getAgentUser(request);

  if (user === null) {
    return unauthenticated();
  }

  await dependencies.store.deleteThread(user, threadId);

  return Response.json({ ok: true });
};

// Attachments can be megabytes; the client only needs their names to render
// history, and never sends old user messages back.
const withoutFileData = (message: AgentUIMessage): AgentUIMessage =>
  message.parts.some((part) => part.type === 'file')
    ? { ...message, parts: message.parts.map((part) => (part.type === 'file' ? { ...part, url: '' } : part)) }
    : message;

const errorResponse = (error: unknown): Response => {
  if (error instanceof AgentTurnError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof z.ZodError || (error instanceof Error && error.name === 'AI_TypeValidationError')) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  console.error('[agent] request failed', error);

  return Response.json({ error: 'internal_error' }, { status: 500 });
};
