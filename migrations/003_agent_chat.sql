-- AI assistant (recruiter chat agent): conversations and their messages.
-- Every query in src/lib/agent/pg-store.ts filters on user_id AND org_id.

CREATE TABLE IF NOT EXISTS agent_chat_threads (
    id VARCHAR(64) PRIMARY KEY,                -- client-generated UUID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(200),
    active_stream_id VARCHAR(64),              -- reserved for resumable streams (later milestone)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_threads_owner ON agent_chat_threads(user_id, org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
    id VARCHAR(64) PRIMARY KEY,                -- AI SDK message id
    thread_id VARCHAR(64) NOT NULL REFERENCES agent_chat_threads(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,                 -- user | assistant
    parts JSONB NOT NULL,                      -- AI SDK UIMessage parts, stored verbatim (attachments inline as data URLs)
    metadata JSONB,
    seq BIGSERIAL,                             -- conversation order; NOW() is equal within a transaction
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_thread ON agent_chat_messages(thread_id, seq);
