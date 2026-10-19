import type { AgentUIMessage, AgentUser } from './types';

export type ChatThread = {
  id: string;
  userId: string;
  tenantId?: string;
  title: string | null;
  activeStreamId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Implement with the app's data layer (Prisma, Drizzle, TypeORM, Knex, ...).
// Every method takes the user and must scope by user id (and tenant id):
// a thread id alone is never authorization.
export type ChatStore = {
  createThread(user: AgentUser, threadId?: string): Promise<ChatThread>;
  getThread(user: AgentUser, threadId: string): Promise<ChatThread | null>;
  listThreads(
    user: AgentUser,
    options: { limit: number; before?: Date },
  ): Promise<ChatThread[]>;
  deleteThread(user: AgentUser, threadId: string): Promise<void>;
  setTitle(user: AgentUser, threadId: string, title: string): Promise<void>;
  loadMessages(user: AgentUser, threadId: string): Promise<AgentUIMessage[]>;
  // Upsert by message id; parts are stored as JSON exactly as given.
  saveMessages(
    user: AgentUser,
    threadId: string,
    messages: AgentUIMessage[],
  ): Promise<void>;
  // Used by retry: removes the failed assistant reply before regenerating.
  deleteMessages(user: AgentUser, threadId: string, messageIds: string[]): Promise<void>;
  // Returns false when another stream already holds the thread.
  claimStream(
    user: AgentUser,
    threadId: string,
    streamId: string,
  ): Promise<boolean>;
  releaseStream(user: AgentUser, threadId: string, streamId: string): Promise<void>;
};

// For tests and local prototyping only: data is lost on restart.
export class MemoryChatStore implements ChatStore {
  private readonly threads = new Map<string, ChatThread>();
  private readonly messages = new Map<string, AgentUIMessage[]>();

  async createThread(user: AgentUser, threadId?: string): Promise<ChatThread> {
    // Mirrors the primary key constraint a real table enforces: an id owned by
    // someone else must fail, never be taken over.
    if (threadId !== undefined && this.threads.has(threadId)) {
      throw new Error('Thread id already exists');
    }

    const now = new Date();
    const thread: ChatThread = {
      id: threadId ?? crypto.randomUUID(),
      userId: user.id,
      tenantId: user.tenantId,
      title: null,
      activeStreamId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);

    return thread;
  }

  async getThread(user: AgentUser, threadId: string): Promise<ChatThread | null> {
    const thread = this.threads.get(threadId);

    return thread !== undefined && this.isOwner(user, thread) ? thread : null;
  }

  async listThreads(
    user: AgentUser,
    { limit, before }: { limit: number; before?: Date },
  ): Promise<ChatThread[]> {
    return Array.from(this.threads.values())
      .filter((thread) => this.isOwner(user, thread))
      .filter((thread) => before === undefined || thread.updatedAt < before)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, limit);
  }

  async deleteThread(user: AgentUser, threadId: string): Promise<void> {
    if ((await this.getThread(user, threadId)) !== null) {
      this.threads.delete(threadId);
      this.messages.delete(threadId);
    }
  }

  async setTitle(user: AgentUser, threadId: string, title: string): Promise<void> {
    const thread = await this.getThread(user, threadId);

    if (thread !== null) {
      thread.title = title;
    }
  }

  async loadMessages(user: AgentUser, threadId: string): Promise<AgentUIMessage[]> {
    return (await this.getThread(user, threadId)) === null
      ? []
      : structuredClone(this.messages.get(threadId) ?? []);
  }

  async saveMessages(
    user: AgentUser,
    threadId: string,
    messages: AgentUIMessage[],
  ): Promise<void> {
    const thread = await this.getThread(user, threadId);

    if (thread === null) {
      throw new Error('Thread not found');
    }

    const existing = this.messages.get(threadId) ?? [];

    for (const message of messages) {
      const index = existing.findIndex((stored) => stored.id === message.id);

      if (index === -1) {
        existing.push(structuredClone(message));
      } else {
        existing[index] = structuredClone(message);
      }
    }

    this.messages.set(threadId, existing);
    thread.updatedAt = new Date();
  }

  async deleteMessages(user: AgentUser, threadId: string, messageIds: string[]): Promise<void> {
    if ((await this.getThread(user, threadId)) === null) {
      return;
    }

    const ids = new Set(messageIds);

    this.messages.set(
      threadId,
      (this.messages.get(threadId) ?? []).filter((message) => !ids.has(message.id)),
    );
  }

  async claimStream(user: AgentUser, threadId: string, streamId: string): Promise<boolean> {
    const thread = await this.getThread(user, threadId);

    if (thread === null || thread.activeStreamId !== null) {
      return false;
    }

    thread.activeStreamId = streamId;

    return true;
  }

  async releaseStream(user: AgentUser, threadId: string, streamId: string): Promise<void> {
    const thread = await this.getThread(user, threadId);

    if (thread !== null && thread.activeStreamId === streamId) {
      thread.activeStreamId = null;
    }
  }

  private isOwner(user: AgentUser, thread: ChatThread): boolean {
    return thread.userId === user.id && thread.tenantId === user.tenantId;
  }
}
