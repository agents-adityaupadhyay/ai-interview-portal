import { Chat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ThreadSummary } from './utils';

export type PageContext = {
  route?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  viewName?: string;
  filters?: string[];
  extra?: Record<string, string>;
};

export type AgentSurface = 'closed' | 'panel' | 'full';

export type AgentSuggestion = { title: string; hint?: string; prompt: string };

export type AgentChatConfig = {
  apiBase?: string;
  // Called on every send: describe what the user is looking at right now.
  getPageContext?: () => PageContext | null;
  // true when the server runs the resumable tier (Redis)
  resumable?: boolean;
  assistantName?: string;
  greeting?: string;
  suggestions?: AgentSuggestion[];
  // Use the app's markdown renderer if it has one.
  renderMarkdown?: (text: string) => ReactNode;
  theme?: 'light' | 'dark' | 'system';
  // Keyboard shortcut that toggles agent mode; set to null to disable.
  shortcut?: { key: string; metaOrCtrl: boolean } | null;
};

type AgentChatContextValue = {
  config: Required<Pick<AgentChatConfig, 'apiBase' | 'assistantName' | 'greeting' | 'suggestions' | 'theme' | 'resumable'>> &
    Pick<AgentChatConfig, 'getPageContext' | 'renderMarkdown'>;
  surface: AgentSurface;
  setSurface: (surface: AgentSurface) => void;
  activeThreadId: string;
  selectThread: (threadId: string) => void;
  startNewThread: () => void;
  threads: ThreadSummary[];
  areThreadsLoading: boolean;
  refreshThreads: () => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  getChat: (threadId: string) => Chat<UIMessage> | undefined;
  loadChat: (threadId: string) => Promise<Chat<UIMessage>>;
};

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export const useAgentChatContext = (): AgentChatContextValue => {
  const context = useContext(AgentChatContext);

  if (context === null) {
    throw new Error('Agent UI components must be rendered inside <AgentChatProvider>');
  }

  return context;
};

const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
};

const fetchJson = async <TResponse,>(url: string, init?: RequestInit): Promise<TResponse> => {
  const response = await fetch(url, { credentials: 'include', ...init });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as TResponse;
};

export type AgentChatProviderProps = AgentChatConfig & {
  children: ReactNode;
  initialSurface?: AgentSurface;
  // Controlled thread selection, e.g. synced with a /agent/:threadId route.
  activeThreadId?: string;
  onActiveThreadChange?: (threadId: string) => void;
  onSurfaceChange?: (surface: AgentSurface) => void;
};

// Holds one Chat instance per thread, so the side panel and agent mode show
// the same live conversation: switching surfaces mid-reply keeps streaming.
export const AgentChatProvider = ({
  children,
  apiBase = '/api/agent',
  getPageContext,
  resumable = false,
  assistantName = 'Assistant',
  greeting = 'How can I help?',
  suggestions = [],
  renderMarkdown,
  theme = 'system',
  shortcut = { key: 'j', metaOrCtrl: true },
  initialSurface = 'closed',
  activeThreadId: controlledThreadId,
  onActiveThreadChange,
  onSurfaceChange,
}: AgentChatProviderProps) => {
  const [surface, setSurfaceState] = useState<AgentSurface>(initialSurface);
  const newThreadIdsRef = useRef(new Set<string>());
  const [internalThreadId, setInternalThreadId] = useState<string>(() => {
    const threadId = crypto.randomUUID();

    newThreadIdsRef.current.add(threadId);

    return threadId;
  });
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [areThreadsLoading, setAreThreadsLoading] = useState(true);

  const activeThreadId = controlledThreadId ?? internalThreadId;
  const chatsRef = useRef(new Map<string, Chat<UIMessage>>());
  const pendingLoadsRef = useRef(new Map<string, Promise<Chat<UIMessage>>>());
  const getPageContextRef = useRef(getPageContext);
  const refreshThreadsRef = useRef<() => Promise<void>>(async () => {});

  getPageContextRef.current = getPageContext;

  const setSurface = useCallback(
    (next: AgentSurface) => {
      setSurfaceState(next);
      onSurfaceChange?.(next);
    },
    [onSurfaceChange],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${apiBase}/chat`,
        credentials: 'include',
        // Lets the server resolve "today" / "this month" in the user's timezone.
        headers: { 'x-user-timezone': browserTimeZone() },
        // Send only the newest message; the server owns the history.
        prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
          body: {
            threadId: id,
            trigger,
            message: messages.at(-1),
            pageContext: getPageContextRef.current?.() ?? null,
          },
        }),
        prepareReconnectToStreamRequest: ({ id }) => ({
          api: `${apiBase}/chat/${id}/stream`,
          credentials: 'include',
        }),
      }),
    [apiBase],
  );

  const createChat = useCallback(
    (threadId: string, messages: UIMessage[]) => {
      const chat = new Chat<UIMessage>({
        id: threadId,
        messages,
        transport,
        // Resubmit once every pending approval or question has an answer.
        sendAutomaticallyWhen: (options) =>
          lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
          lastAssistantMessageIsCompleteWithToolCalls(options),
        onFinish: () => void refreshThreadsRef.current(),
      });

      chatsRef.current.set(threadId, chat);

      return chat;
    },
    [transport],
  );

  const getChat = useCallback((threadId: string) => chatsRef.current.get(threadId), []);

  const loadChat = useCallback(
    (threadId: string): Promise<Chat<UIMessage>> => {
      const existing = chatsRef.current.get(threadId);

      if (existing) return Promise.resolve(existing);

      // Created on this page and not sent yet: nothing to fetch.
      if (newThreadIdsRef.current.has(threadId)) {
        return Promise.resolve(createChat(threadId, []));
      }

      const pending = pendingLoadsRef.current.get(threadId);

      if (pending) return pending;

      const load = fetchJson<{ messages: UIMessage[] }>(`${apiBase}/threads/${threadId}/messages`)
        .then(({ messages }) => {
          const chat = createChat(threadId, messages);

          if (resumable && messages.length > 0) {
            void chat.resumeStream();
          }

          return chat;
        })
        // A thread unknown to the server is a new conversation.
        .catch(() => createChat(threadId, []))
        .finally(() => pendingLoadsRef.current.delete(threadId));

      pendingLoadsRef.current.set(threadId, load);

      return load;
    },
    [apiBase, createChat, resumable],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      if (controlledThreadId === undefined) setInternalThreadId(threadId);
      onActiveThreadChange?.(threadId);
    },
    [controlledThreadId, onActiveThreadChange],
  );

  const startNewThread = useCallback(() => {
    const threadId = crypto.randomUUID();

    createChat(threadId, []);
    selectThread(threadId);
  }, [createChat, selectThread]);

  const refreshThreads = useCallback(async () => {
    try {
      const { threads: list } = await fetchJson<{ threads: ThreadSummary[] }>(`${apiBase}/threads`);

      setThreads(list);
    } catch {
      setThreads([]);
    } finally {
      setAreThreadsLoading(false);
    }
  }, [apiBase]);

  refreshThreadsRef.current = refreshThreads;

  const deleteThread = useCallback(
    async (threadId: string) => {
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      chatsRef.current.delete(threadId);
      await fetch(`${apiBase}/threads/${threadId}`, { method: 'DELETE', credentials: 'include' });

      if (threadId === activeThreadId) startNewThread();
    },
    [activeThreadId, apiBase, startNewThread],
  );

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (shortcut === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey;

      if (event.key.toLowerCase() === shortcut.key && hasModifier === shortcut.metaOrCtrl) {
        event.preventDefault();
        setSurface(surface === 'full' ? 'closed' : 'full');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSurface, shortcut, surface]);

  const value = useMemo<AgentChatContextValue>(
    () => ({
      config: { apiBase, assistantName, greeting, suggestions, theme, resumable, getPageContext, renderMarkdown },
      surface,
      setSurface,
      activeThreadId,
      selectThread,
      startNewThread,
      threads,
      areThreadsLoading,
      refreshThreads,
      deleteThread,
      getChat,
      loadChat,
    }),
    [
      apiBase, assistantName, greeting, suggestions, theme, resumable, getPageContext, renderMarkdown,
      surface, setSurface, activeThreadId, selectThread, startNewThread, threads, areThreadsLoading,
      refreshThreads, deleteThread, getChat, loadChat,
    ],
  );

  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
};
