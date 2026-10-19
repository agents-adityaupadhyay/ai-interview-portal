import { pool } from '@/lib/db';

import type { ChatStore, ChatThread } from './store';
import type { AgentUIMessage, AgentUser } from './types';

// Postgres ChatStore on migrations/003_agent_chat.sql. Every statement scopes
// by user_id AND org_id: a thread id alone is never authorization.

type ThreadRow = {
  id: string;
  user_id: string;
  org_id: string;
  title: string | null;
  active_stream_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const toThread = (row: ThreadRow): ChatThread => ({
  id: row.id,
  userId: row.user_id,
  tenantId: row.org_id,
  title: row.title,
  activeStreamId: row.active_stream_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const THREAD_COLUMNS = 'id, user_id, org_id, title, active_stream_id, created_at, updated_at';

export class PgChatStore implements ChatStore {
  async createThread(user: AgentUser, threadId?: string): Promise<ChatThread> {
    // A plain INSERT: an id that already exists (someone else's thread) fails
    // on the primary key instead of being taken over.
    const { rows } = await pool.query<ThreadRow>(
      `INSERT INTO agent_chat_threads (id, user_id, org_id) VALUES ($1, $2, $3) RETURNING ${THREAD_COLUMNS}`,
      [threadId ?? crypto.randomUUID(), user.id, user.tenantId],
    );

    return toThread(rows[0]);
  }

  async getThread(user: AgentUser, threadId: string): Promise<ChatThread | null> {
    const { rows } = await pool.query<ThreadRow>(
      `SELECT ${THREAD_COLUMNS} FROM agent_chat_threads WHERE id = $1 AND user_id = $2 AND org_id = $3`,
      [threadId, user.id, user.tenantId],
    );

    return rows.length > 0 ? toThread(rows[0]) : null;
  }

  async listThreads(
    user: AgentUser,
    { limit, before }: { limit: number; before?: Date },
  ): Promise<ChatThread[]> {
    const { rows } = await pool.query<ThreadRow>(
      `SELECT ${THREAD_COLUMNS} FROM agent_chat_threads
       WHERE user_id = $1 AND org_id = $2 AND ($3::timestamptz IS NULL OR updated_at < $3)
       ORDER BY updated_at DESC LIMIT $4`,
      [user.id, user.tenantId, before ?? null, limit],
    );

    return rows.map(toThread);
  }

  async deleteThread(user: AgentUser, threadId: string): Promise<void> {
    await pool.query('DELETE FROM agent_chat_threads WHERE id = $1 AND user_id = $2 AND org_id = $3', [
      threadId,
      user.id,
      user.tenantId,
    ]);
  }

  async setTitle(user: AgentUser, threadId: string, title: string): Promise<void> {
    await pool.query('UPDATE agent_chat_threads SET title = $1 WHERE id = $2 AND user_id = $3 AND org_id = $4', [
      title.slice(0, 200),
      threadId,
      user.id,
      user.tenantId,
    ]);
  }

  async loadMessages(user: AgentUser, threadId: string): Promise<AgentUIMessage[]> {
    const { rows } = await pool.query<{ id: string; role: AgentUIMessage['role']; parts: AgentUIMessage['parts']; metadata: AgentUIMessage['metadata'] | null }>(
      `SELECT m.id, m.role, m.parts, m.metadata
       FROM agent_chat_messages m JOIN agent_chat_threads t ON t.id = m.thread_id
       WHERE m.thread_id = $1 AND t.user_id = $2 AND t.org_id = $3
       ORDER BY m.seq`,
      [threadId, user.id, user.tenantId],
    );

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
      ...(row.metadata ? { metadata: row.metadata } : {}),
    }));
  }

  async saveMessages(user: AgentUser, threadId: string, messages: AgentUIMessage[]): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        'UPDATE agent_chat_threads SET updated_at = NOW() WHERE id = $1 AND user_id = $2 AND org_id = $3',
        [threadId, user.id, user.tenantId],
      );

      if (rowCount === 0) {
        throw new Error('Thread not found');
      }

      for (const message of messages) {
        // The thread_id condition stops an upsert from moving a message that
        // belongs to another thread.
        await client.query(
          `INSERT INTO agent_chat_messages (id, thread_id, role, parts, metadata)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET parts = EXCLUDED.parts, metadata = EXCLUDED.metadata
           WHERE agent_chat_messages.thread_id = EXCLUDED.thread_id`,
          [message.id, threadId, message.role, JSON.stringify(message.parts), message.metadata ? JSON.stringify(message.metadata) : null],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteMessages(user: AgentUser, threadId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    await pool.query(
      `DELETE FROM agent_chat_messages m USING agent_chat_threads t
       WHERE m.thread_id = t.id AND t.id = $1 AND t.user_id = $2 AND t.org_id = $3 AND m.id = ANY($4)`,
      [threadId, user.id, user.tenantId, messageIds],
    );
  }

  // Resumable streams are a later milestone; the standard tier never claims.
  // Implemented atomically so turning them on needs no store change.
  async claimStream(user: AgentUser, threadId: string, streamId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE agent_chat_threads SET active_stream_id = $1
       WHERE id = $2 AND user_id = $3 AND org_id = $4
         AND (active_stream_id IS NULL OR updated_at < NOW() - INTERVAL '10 minutes')`,
      [streamId, threadId, user.id, user.tenantId],
    );

    return rowCount === 1;
  }

  async releaseStream(user: AgentUser, threadId: string, streamId: string): Promise<void> {
    await pool.query(
      `UPDATE agent_chat_threads SET active_stream_id = NULL
       WHERE id = $1 AND user_id = $2 AND org_id = $3 AND active_stream_id = $4`,
      [threadId, user.id, user.tenantId, streamId],
    );
  }
}
