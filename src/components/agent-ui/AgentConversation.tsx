import { useChat, type Chat } from '@ai-sdk/react';
import type { FileUIPart, UIMessage } from 'ai';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useAgentChatContext, type PageContext } from './AgentChatProvider';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, readAttachment } from './attachments';
import { AlertIcon, ArrowDownIcon, CloseIcon, FileIcon, PaperclipIcon, SendIcon, SparklesIcon, StopIcon } from './icons';
import { AssistantMessage, TypingIndicator, UserMessage, type MessageActions } from './MessageView';
import { toFriendlyError } from './utils';

export type AgentConversationProps = {
  variant: 'full' | 'panel';
  // Focus the composer when the surface opens.
  autoFocus?: boolean;
};

export const AgentConversation = ({ variant, autoFocus = false }: AgentConversationProps) => {
  const { activeThreadId, getChat, loadChat } = useAgentChatContext();
  const [chat, setChat] = useState<Chat<UIMessage> | undefined>(() => getChat(activeThreadId));

  useEffect(() => {
    const existing = getChat(activeThreadId);

    if (existing) {
      setChat(existing);

      return;
    }

    let isCancelled = false;

    setChat(undefined);
    void loadChat(activeThreadId).then((loaded) => {
      if (!isCancelled) setChat(loaded);
    });

    return () => {
      isCancelled = true;
    };
  }, [activeThreadId, getChat, loadChat]);

  if (chat === undefined || chat.id !== activeThreadId) {
    return (
      <div className="agent-conversation">
        <div className="agent-empty">
          <TypingIndicator />
        </div>
      </div>
    );
  }

  return <ChatView key={chat.id} chat={chat} variant={variant} autoFocus={autoFocus} />;
};

const NEAR_BOTTOM_PX = 120;

const ChatView = ({ chat, variant, autoFocus }: { chat: Chat<UIMessage> } & AgentConversationProps) => {
  const { config } = useAgentChatContext();
  const { messages, sendMessage, status, stop, error, regenerate, clearError, addToolApprovalResponse, addToolOutput } =
    useChat({ chat });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isBusy = status === 'submitted' || status === 'streaming';

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;

    if (element) element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom('auto');
  }, [scrollToBottom]);

  useEffect(() => {
    if (isNearBottom) scrollToBottom('auto');
  }, [messages, status, isNearBottom, scrollToBottom]);

  const handleScroll = () => {
    const element = scrollRef.current;

    if (element) {
      setIsNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX);
    }
  };

  const send = (text: string, files: FileUIPart[] = []) => {
    clearError();
    setIsNearBottom(true);
    void sendMessage(files.length > 0 ? { text, files } : { text });
  };

  const handleStop = () => {
    void stop();

    if (config.resumable) {
      void fetch(`${config.apiBase}/chat/${chat.id}/stop`, { method: 'POST', credentials: 'include' });
    }
  };

  const actions: MessageActions = {
    onApprove: (approvalId, approved, reason) => void addToolApprovalResponse({ id: approvalId, approved, reason }),
    onAnswer: (toolCallId, answer) => void addToolOutput({ tool: 'ask_user', toolCallId, output: { answer } }),
    renderMarkdown: config.renderMarkdown,
  };

  const lastMessage = messages.at(-1);
  const isWaitingOnUser =
    !isBusy &&
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((part) => 'state' in part && (part.state === 'approval-requested' || (part.type === 'tool-ask_user' && part.state === 'input-available')));

  return (
    <div className="agent-conversation">
      <div className="agent-scroll" ref={scrollRef} onScroll={handleScroll} role="log" aria-live="polite" aria-busy={isBusy}>
        <div className="agent-column" style={{ minHeight: '100%' }}>
          {messages.length === 0 ? (
            <EmptyState variant={variant} onPick={(prompt) => send(prompt)} />
          ) : (
            <div className="agent-messages">
              {messages.map((message, index) =>
                message.role === 'user' ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    isStreaming={isBusy && index === messages.length - 1}
                    actions={actions}
                  />
                ),
              )}
              {status === 'submitted' && lastMessage?.role === 'user' && (
                <div className="agent-message-assistant">
                  <span className="agent-avatar">
                    <SparklesIcon size={15} />
                  </span>
                  <div className="agent-message-body">
                    <TypingIndicator />
                  </div>
                </div>
              )}
              {error && (
                <div className="agent-alert" role="alert">
                  <AlertIcon />
                  <div className="agent-alert-body">{toFriendlyError(error)}</div>
                  <button type="button" className="agent-button" onClick={() => void regenerate()}>
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {!isNearBottom && messages.length > 0 && (
        <button type="button" className="agent-button agent-jump-latest" onClick={() => scrollToBottom()}>
          <ArrowDownIcon /> Latest
        </button>
      )}
      <div className="agent-composer-wrap">
        <div className="agent-column">
          <Composer
            isBusy={isBusy}
            autoFocus={autoFocus}
            placeholder={isWaitingOnUser ? 'Answer above, or ask something else…' : `Message ${config.assistantName}…`}
            pageContext={config.getPageContext?.() ?? null}
            onSend={send}
            onStop={handleStop}
          />
          {variant === 'full' && <p className="agent-disclaimer">AI can make mistakes. Check important information.</p>}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ variant, onPick }: { variant: 'full' | 'panel'; onPick: (prompt: string) => void }) => {
  const { config } = useAgentChatContext();
  const suggestions = variant === 'panel' ? config.suggestions.slice(0, 3) : config.suggestions;

  return (
    <div className="agent-empty">
      <span className="agent-empty-mark">
        <SparklesIcon size={24} />
      </span>
      <h2 className="agent-empty-title">{config.greeting}</h2>
      <p className="agent-empty-subtitle">Ask questions about your data or tell {config.assistantName} what to do.</p>
      {suggestions.length > 0 && (
        <div className="agent-suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion.title} type="button" className="agent-chip" onClick={() => onPick(suggestion.prompt)}>
              <span className="agent-chip-title">{suggestion.title}</span>
              {suggestion.hint && <span className="agent-chip-hint">{suggestion.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const describePageContext = (context: PageContext | null): string | null => {
  if (context === null) return null;
  if (context.entityType) return `Using this ${context.entityType}${context.entityLabel ? `: ${context.entityLabel}` : ''}`;
  if (context.viewName) return `Using view: ${context.viewName}`;

  return null;
};

const MAX_COMPOSER_HEIGHT = 200;

const Composer = ({
  isBusy,
  autoFocus,
  placeholder,
  pageContext,
  onSend,
  onStop,
}: {
  isBusy: boolean;
  autoFocus?: boolean;
  placeholder: string;
  pageContext: PageContext | null;
  onSend: (text: string, files: FileUIPart[]) => void;
  onStop: () => void;
}) => {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<FileUIPart[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextLabel = describePageContext(pageContext);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFileError(null);

    try {
      const picked = await Promise.all(Array.from(list).map(readAttachment));

      setFiles((current) => [...current, ...picked].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not attach the file');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    textareaRef.current?.focus();
  };

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    }
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = value.trim();

    if ((text === '' && files.length === 0) || isBusy) return;

    onSend(text || `Attached: ${files.map((file) => file.filename).join(', ')}`, files);
    setValue('');
    setFiles([]);
    setFileError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="agent-composer" onSubmit={submit}>
      {(files.length > 0 || fileError) && (
        <div className="agent-attachments">
          {files.map((file, index) => (
            <span key={`${file.filename}-${index}`} className="agent-file-chip">
              <FileIcon size={13} />
              <span className="agent-file-chip-name">{file.filename}</span>
              <button
                type="button"
                className="agent-file-chip-remove"
                aria-label={`Remove ${file.filename}`}
                onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          {fileError && (
            <span className="agent-file-error" role="alert">
              {fileError}
            </span>
          )}
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label="Message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="agent-composer-footer">
        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          type="button"
          className="agent-icon-button"
          aria-label="Attach resume (PDF, DOCX, TXT)"
          title="Attach resume (PDF, DOCX, TXT)"
          disabled={isBusy || files.length >= MAX_ATTACHMENTS}
          onClick={() => fileInputRef.current?.click()}
        >
          <PaperclipIcon />
        </button>
        <span className="agent-composer-context">{contextLabel}</span>
        {isBusy ? (
          <button type="button" className="agent-send agent-send--stop" onClick={onStop} aria-label="Stop generating">
            <StopIcon />
          </button>
        ) : (
          <button type="submit" className="agent-send" disabled={value.trim() === '' && files.length === 0} aria-label="Send message">
            <SendIcon />
          </button>
        )}
      </div>
    </form>
  );
};
