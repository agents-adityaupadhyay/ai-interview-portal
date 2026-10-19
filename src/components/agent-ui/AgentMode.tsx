import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAgentChatContext } from './AgentChatProvider';
import { AgentConversation } from './AgentConversation';
import { CloseIcon, CollapseIcon, ExpandIcon, PlusIcon, SidebarIcon, SparklesIcon } from './icons';
import { ThreadList } from './ThreadList';

const MOBILE_QUERY = '(max-width: 768px)';

const useThemeAttribute = (): 'light' | 'dark' | undefined => {
  const { config } = useAgentChatContext();

  return config.theme === 'system' ? undefined : config.theme;
};

// While a surface is open, the page behind it does not scroll, and focus
// returns to where it was when the surface closes.
const useModalBehavior = (isModal: boolean, onEscape: () => void) => {
  const onEscapeRef = useRef(onEscape);

  onEscapeRef.current = onEscape;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    if (isModal) document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onEscapeRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (isModal) document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isModal]);
};

const useActiveThreadTitle = (): string => {
  const { threads, activeThreadId } = useAgentChatContext();

  return threads.find((thread) => thread.id === activeThreadId)?.title ?? 'New conversation';
};

export type AgentModeProps = {
  // Defaults to closing the surface. Pass navigate(-1) when agent mode is a route.
  onExit?: () => void;
};

// Full-screen agent workspace: covers the whole app, like a focused mode.
export const AgentMode = ({ onExit }: AgentModeProps) => {
  const { config, setSurface, startNewThread } = useAgentChatContext();
  const title = useActiveThreadTitle();
  const theme = useThemeAttribute();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const exit = onExit ?? (() => setSurface('closed'));

  useModalBehavior(true, exit);

  const collapseOnMobile = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) setIsSidebarCollapsed(true);
  };

  return createPortal(
    <div className="agent-root agent-mode" data-theme={theme} role="dialog" aria-modal="true" aria-label={config.assistantName}>
      <aside className="agent-sidebar" data-collapsed={isSidebarCollapsed} aria-hidden={isSidebarCollapsed}>
        <div className="agent-sidebar-header">
          <span className="agent-brand">
            <span className="agent-brand-mark">
              <SparklesIcon />
            </span>
            {config.assistantName}
          </span>
          <button type="button" className="agent-icon-button" aria-label="Hide conversations" onClick={() => setIsSidebarCollapsed(true)}>
            <SidebarIcon />
          </button>
        </div>
        <button
          type="button"
          className="agent-button agent-new-chat"
          onClick={() => {
            startNewThread();
            collapseOnMobile();
          }}
        >
          <PlusIcon /> New conversation
        </button>
        <ThreadList onSelect={collapseOnMobile} />
      </aside>
      <main className="agent-main">
        <header className="agent-header">
          {isSidebarCollapsed && (
            <>
              <button type="button" className="agent-icon-button" aria-label="Show conversations" onClick={() => setIsSidebarCollapsed(false)}>
                <SidebarIcon />
              </button>
              <button type="button" className="agent-icon-button" aria-label="New conversation" onClick={startNewThread}>
                <PlusIcon />
              </button>
            </>
          )}
          <span className="agent-header-title">{title}</span>
          <div className="agent-header-actions">
            <button
              type="button"
              className="agent-icon-button agent-header-hide-mobile"
              aria-label="Continue in side panel"
              title="Continue in side panel"
              onClick={() => setSurface('panel')}
            >
              <CollapseIcon />
            </button>
            <button type="button" className="agent-button" onClick={exit} aria-label="Exit agent mode">
              <CloseIcon /> <span className="agent-header-hide-mobile">Exit</span>
              <span className="agent-kbd agent-header-hide-mobile">Esc</span>
            </button>
          </div>
        </header>
        <AgentConversation variant="full" autoFocus />
      </main>
    </div>,
    document.body,
  );
};

// Docked panel beside the app, for quick questions while working.
export const AgentSidePanel = () => {
  const { config, setSurface, startNewThread } = useAgentChatContext();
  const title = useActiveThreadTitle();
  const theme = useThemeAttribute();

  useModalBehavior(false, () => setSurface('closed'));

  return createPortal(
    <section className="agent-root agent-panel" data-theme={theme} aria-label={config.assistantName}>
      <header className="agent-header">
        <span className="agent-brand-mark">
          <SparklesIcon />
        </span>
        <span className="agent-header-title">{title}</span>
        <div className="agent-header-actions">
          <button type="button" className="agent-icon-button" aria-label="New conversation" title="New conversation" onClick={startNewThread}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className="agent-icon-button"
            aria-label="Open agent mode"
            title="Open agent mode"
            onClick={() => setSurface('full')}
          >
            <ExpandIcon />
          </button>
          <button type="button" className="agent-icon-button" aria-label="Close" onClick={() => setSurface('closed')}>
            <CloseIcon />
          </button>
        </div>
      </header>
      <AgentConversation variant="panel" autoFocus />
    </section>,
    document.body,
  );
};

// Renders whichever surface is open. Mount once, near the app root.
export const AgentSurfaces = () => {
  const { surface } = useAgentChatContext();

  if (surface === 'full') return <AgentMode />;
  if (surface === 'panel') return <AgentSidePanel />;

  return null;
};

export type AgentLauncherProps = {
  label?: string;
  opens?: 'full' | 'panel';
};

// Entry point for the app header or sidebar.
export const AgentLauncher = ({ label = 'Ask AI', opens = 'full' }: AgentLauncherProps) => {
  const { setSurface } = useAgentChatContext();
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  return (
    <span className="agent-root">
      <button type="button" className="agent-launcher" onClick={() => setSurface(opens)}>
        <SparklesIcon />
        {label}
        <span className="agent-kbd">{isMac ? '⌘J' : 'Ctrl J'}</span>
      </button>
    </span>
  );
};
