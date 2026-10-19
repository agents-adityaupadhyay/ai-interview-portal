import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type UIMessageStreamOptions,
} from 'ai';

import { createApprovalPolicy, type ApprovalPolicyOptions } from './approval';
import { AGENT_CONFIG, computeCredits, getLanguageModel } from './config';
import {
  InvalidChatMessageError,
  mergeIncomingMessage,
  prepareRegeneration,
  pruneHistory,
} from './history';
import { buildSystemPrompt, buildTurnContext } from './prompt';
import type { ToolRegistry } from './registry';
import type { ChatStore } from './store';
import type { AgentUIMessage, AgentUser, PageContext } from './types';
import { startOfCurrentMonth, type UsageMeter } from './usage';

export type AgentDependencies = {
  store: ChatStore;
  registry: ToolRegistry;
  usage: UsageMeter;
  approval?: ApprovalPolicyOptions;
  // Defaults to the env-configured model. Override per tenant/plan, or in tests.
  model?: LanguageModel;
};

export class AgentTurnError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | 'thread_not_found'
      | 'invalid_message'
      | 'thread_busy'
      | 'credits_exhausted'
      | 'context_window_exceeded',
  ) {
    super(message);
  }
}

export type StartAgentTurnInput = {
  user: AgentUser;
  threadId: string;
  // 'regenerate-message' retries the latest turn; message is ignored then.
  trigger: 'submit-message' | 'regenerate-message';
  message: AgentUIMessage;
  pageContext: PageContext | null;
  abortSignal: AbortSignal;
};

export const startAgentTurn = async (
  dependencies: AgentDependencies,
  { user, threadId, trigger, message, pageContext, abortSignal }: StartAgentTurnInput,
) => {
  const { store, registry, usage } = dependencies;

  const thread =
    (await store.getThread(user, threadId)) ??
    (message.role === 'user' ? await store.createThread(user, threadId) : null);

  if (thread === null) {
    throw new AgentTurnError('Thread not found', 404, 'thread_not_found');
  }

  const creditsUsedBefore =
    AGENT_CONFIG.monthlyCreditLimit > 0
      ? await usage.getCreditsUsedSince(user, startOfCurrentMonth())
      : 0;

  if (
    AGENT_CONFIG.monthlyCreditLimit > 0 &&
    creditsUsedBefore >= AGENT_CONFIG.monthlyCreditLimit
  ) {
    throw new AgentTurnError(
      'You have used all your AI credits for this month.',
      402,
      'credits_exhausted',
    );
  }

  let messages: AgentUIMessage[];
  const storedMessages = await store.loadMessages(user, threadId);

  try {
    if (trigger === 'regenerate-message') {
      const regeneration = prepareRegeneration(storedMessages);

      messages = regeneration.messages;
      await store.deleteMessages(user, threadId, regeneration.removedMessageIds);
    } else {
      messages = mergeIncomingMessage(storedMessages, message);
      // Saved before the model runs so a crash or a closed tab never loses what the user typed.
      await store.saveMessages(user, threadId, messages.slice(-2));
    }
  } catch (error) {
    if (!(error instanceof InvalidChatMessageError)) {
      throw error;
    }

    throw new AgentTurnError(error.message, 400, 'invalid_message');
  }

  if (thread.title === null && trigger === 'submit-message' && message.role === 'user') {
    await store.setTitle(user, threadId, buildTitle(message));
  }

  const { tools, catalog, isLazy, directToolNames, guidance } = await registry.buildToolSet({
    user,
    threadId,
    abortSignal,
  });

  const modelMessages = await convertToModelMessages(
    appendTurnContext(describeAttachments(messages), buildTurnContext({ user, pageContext })),
    { tools, ignoreIncompleteToolCalls: true },
  );

  const pruned = pruneHistory(modelMessages, AGENT_CONFIG.historyTokenBudget);

  if (pruned.isOverBudget) {
    throw new AgentTurnError(
      'This conversation is too long. Start a new thread.',
      413,
      'context_window_exceeded',
    );
  }

  let creditsUsedThisTurn = 0;
  let hasExhaustedCredits = false;
  let hasRecordedUsage = false;

  const recordUsage = async (
    totals: Pick<LanguageModelUsage, 'inputTokens' | 'outputTokens'> & {
      inputTokenDetails?: { cacheReadTokens?: number };
    },
  ) => {
    if (hasRecordedUsage) {
      return;
    }

    hasRecordedUsage = true;

    await usage.record({
      userId: user.id,
      tenantId: user.tenantId,
      threadId,
      model: AGENT_CONFIG.model,
      inputTokens: totals.inputTokens ?? 0,
      outputTokens: totals.outputTokens ?? 0,
      cachedInputTokens: totals.inputTokenDetails?.cacheReadTokens ?? 0,
      credits: computeCredits(totals),
      createdAt: new Date(),
    });
  };

  const result = streamText({
    model: dependencies.model ?? getLanguageModel(),
    instructions: buildSystemPrompt({ user, catalog, isLazy, directToolNames, guidance }),
    messages: pruned.messages,
    tools,
    toolApproval: createApprovalPolicy(catalog, dependencies.approval),
    stopWhen: [
      isStepCount(AGENT_CONFIG.maxSteps),
      () => hasExhaustedCredits,
    ],
    abortSignal,
    onStepEnd: (step) => {
      creditsUsedThisTurn += computeCredits(step.usage);

      if (
        AGENT_CONFIG.monthlyCreditLimit > 0 &&
        creditsUsedBefore + creditsUsedThisTurn >= AGENT_CONFIG.monthlyCreditLimit
      ) {
        hasExhaustedCredits = true;
      }
    },
    onEnd: async (event) => {
      await recordUsage(event.totalUsage);
    },
    onAbort: async ({ steps }) => {
      await recordUsage(sumUsage(steps.map((step) => step.usage)));
    },
    onError: ({ error }) => {
      console.error(`[agent] turn failed thread=${threadId} user=${user.id}`, error);
    },
  });

  const streamOptions: UIMessageStreamOptions<AgentUIMessage> = {
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    sendReasoning: true,
    messageMetadata: ({ part }) =>
      part.type === 'start'
        ? { createdAt: new Date().toISOString(), model: AGENT_CONFIG.model }
        : undefined,
    onFinish: async ({ responseMessage }) => {
      await store.saveMessages(user, threadId, [responseMessage]);
    },
    onError: (error) => {
      // Never forward raw provider errors: they can include request details.
      console.error(`[agent] stream error thread=${threadId}`, error);

      return 'The assistant ran into a problem. Please try again.';
    },
  };

  return { result, streamOptions, thread, wasHistoryPruned: pruned.wasPruned };
};

// Per-turn context rides on the latest user message, not the system prompt,
// so the system prompt stays identical across turns and prompt caching hits.
const appendTurnContext = (
  messages: AgentUIMessage[],
  context: string,
): AgentUIMessage[] => {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');

  if (lastUserIndex === -1) {
    return messages;
  }

  return messages.map((message, index) =>
    index === lastUserIndex
      ? { ...message, parts: [...message.parts, { type: 'text', text: context }] }
      : message,
  );
};

// Attachments stay in the stored message for tools to read (see
// features/attachments.ts); the model only sees a note that they exist, since
// most OpenAI-compatible models reject PDF/DOCX parts.
const describeAttachments = (messages: AgentUIMessage[]): AgentUIMessage[] =>
  messages.map((message) =>
    message.parts.some((part) => part.type === 'file')
      ? {
          ...message,
          parts: message.parts.map((part) =>
            part.type === 'file'
              ? {
                  type: 'text' as const,
                  text: `[Attached file "${part.filename ?? 'file'}" (${part.mediaType}). Read it with read_attachment.]`,
                }
              : part,
          ),
        }
      : message,
  );

const buildTitle = (message: AgentUIMessage): string => {
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > 60 ? `${text.slice(0, 57)}...` : text || 'New chat';
};

const sumUsage = (usages: LanguageModelUsage[]) =>
  usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: total.outputTokens + (usage.outputTokens ?? 0),
      inputTokenDetails: {
        cacheReadTokens:
          total.inputTokenDetails.cacheReadTokens +
          (usage.inputTokenDetails?.cacheReadTokens ?? 0),
      },
    }),
    { inputTokens: 0, outputTokens: 0, inputTokenDetails: { cacheReadTokens: 0 } },
  );
