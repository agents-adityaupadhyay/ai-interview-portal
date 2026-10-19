import type { AgentUser } from './types';

export type UsageRecord = {
  userId: string;
  tenantId?: string;
  threadId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  credits: number;
  createdAt: Date;
};

// Implement with the app's data layer against the agent_usage table.
export type UsageMeter = {
  getCreditsUsedSince(user: AgentUser, since: Date): Promise<number>;
  record(usage: UsageRecord): Promise<void>;
};

export const startOfCurrentMonth = (): Date => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

// Usage metering and per-user credit limits are a later milestone
// (docs/ai-assistant.md). Until then nothing is recorded.
export class NoopUsageMeter implements UsageMeter {
  async getCreditsUsedSince(): Promise<number> {
    return 0;
  }

  async record(): Promise<void> {}
}

export class MemoryUsageMeter implements UsageMeter {
  private readonly records: UsageRecord[] = [];

  async getCreditsUsedSince(user: AgentUser, since: Date): Promise<number> {
    return this.records
      .filter((record) => record.userId === user.id && record.createdAt >= since)
      .reduce((total, record) => total + record.credits, 0);
  }

  async record(usage: UsageRecord): Promise<void> {
    this.records.push(usage);
  }
}
