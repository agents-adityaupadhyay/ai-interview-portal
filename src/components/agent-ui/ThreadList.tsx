import { useMemo, useState } from 'react';

import { useAgentChatContext } from './AgentChatProvider';
import { TrashIcon } from './icons';
import { groupThreadsByRecency } from './utils';

export const ThreadList = ({ onSelect }: { onSelect?: () => void }) => {
  const { threads, areThreadsLoading, activeThreadId, selectThread, deleteThread } = useAgentChatContext();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized === ''
      ? threads
      : threads.filter((thread) => (thread.title ?? '').toLowerCase().includes(normalized));

    return groupThreadsByRecency(filtered);
  }, [query, threads]);

  return (
    <>
      <input
        className="agent-search"
        type="search"
        placeholder="Search conversations"
        aria-label="Search conversations"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <nav className="agent-thread-list" aria-label="Conversations">
        {!areThreadsLoading && groups.length === 0 && (
          <p className="agent-thread-empty">{query ? 'No matching conversations.' : 'No conversations yet.'}</p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="agent-thread-group-label">{group.label}</div>
            {group.threads.map((thread) => (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                className="agent-thread-item"
                aria-current={thread.id === activeThreadId}
                onClick={() => {
                  selectThread(thread.id);
                  onSelect?.();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectThread(thread.id);
                    onSelect?.();
                  }
                }}
              >
                <span className="agent-thread-title">{thread.title ?? 'Untitled conversation'}</span>
                <button
                  type="button"
                  className="agent-icon-button agent-thread-delete"
                  aria-label={`Delete ${thread.title ?? 'conversation'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteThread(thread.id);
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
};
