import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';

const readNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;
};

// The assistant is switched off unless AGENT_CHAT is on, so deployments that
// have not applied migrations/003_agent_chat.sql keep working.
export const isAgentChatEnabled = (): boolean =>
  /^(1|true|on|yes)$/i.test(process.env.AGENT_CHAT || '');

export const AGENT_CONFIG = {
  // Each falls back to the interviewer's AI_* value, like SUMMARY_AI_*.
  // AI_BASE_URL has no /v1 suffix in this app; the provider needs it.
  baseUrl: process.env.AGENT_AI_BASE_URL || process.env.AI_BASE_URL || '',
  apiKey: process.env.AGENT_AI_API_KEY || process.env.AI_API_KEY || '',
  model: process.env.AGENT_AI_MODEL || process.env.AI_MODEL || 'kimi-latest',
  maxSteps: readNumber('AGENT_MAX_STEPS', 12),
  historyTokenBudget: readNumber('AGENT_HISTORY_TOKEN_BUDGET', 60_000),
  toolTimeoutMs: readNumber('AGENT_TOOL_TIMEOUT_MS', 30_000),
  // Credit limits are a later milestone (docs/ai-assistant.md); 0 = unlimited.
  monthlyCreditLimit: 0,
  inputDollarsPerMillionTokens: 0,
  outputDollarsPerMillionTokens: 0,
  lazyToolThreshold: 25,
  maxToolOutputChars: 12_000,
  // Tools always sent with full schemas even when lazy loading is on.
  preloadedToolNames: [] as string[],
} as const;

let cachedModel: LanguageModel | undefined;

export const getLanguageModel = (): LanguageModel => {
  if (cachedModel !== undefined) {
    return cachedModel;
  }

  if (AGENT_CONFIG.baseUrl === '') {
    throw new Error('Missing AI_BASE_URL (or AGENT_AI_BASE_URL) for the assistant');
  }

  const provider = createOpenAICompatible({
    name: 'agent',
    baseURL: `${AGENT_CONFIG.baseUrl.replace(/\/+$/, '')}/v1`,
    apiKey: AGENT_CONFIG.apiKey || undefined,
  });

  // "Thinking" models served over OpenAI-compatible APIs often inline their
  // reasoning in <think> tags; move it into reasoning parts so it is not shown
  // as the answer (the interviewer does the same with stripThinking).
  cachedModel = wrapLanguageModel({
    model: provider(AGENT_CONFIG.model),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });

  return cachedModel;
};

export const computeCredits = (usage: {
  inputTokens?: number;
  outputTokens?: number;
}): number => {
  const dollars =
    ((usage.inputTokens ?? 0) / 1_000_000) *
      AGENT_CONFIG.inputDollarsPerMillionTokens +
    ((usage.outputTokens ?? 0) / 1_000_000) *
      AGENT_CONFIG.outputDollarsPerMillionTokens;

  return dollars * 1000;
};
