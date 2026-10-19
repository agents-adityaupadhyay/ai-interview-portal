import type { UIMessage } from 'ai';
import { useState, type ReactNode } from 'react';

import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  FileIcon,
  QuestionIcon,
  ShieldIcon,
  SparklesIcon,
  ToolIcon,
} from './icons';
import { Markdown } from './Markdown';
import {
  approvalQuestion,
  describeTool,
  getToolStatus,
  humanizeToolName,
  isToolPartType,
  resolveToolInput,
  resolveToolName,
  toDisplayFields,
  type ToolPartView,
  type ToolStatus,
} from './utils';

export type MessageActions = {
  onApprove: (approvalId: string, approved: boolean, reason?: string) => void;
  onAnswer: (toolCallId: string, answer: string) => void;
  renderMarkdown?: (text: string) => ReactNode;
};

type Part = UIMessage['parts'][number];

// Consecutive background tool calls collapse into one "activity" block;
// anything that needs the user (approval, question) is pulled out as a card.
type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'activity'; parts: ToolPartView[] }
  | { kind: 'approval'; part: ToolPartView }
  | { kind: 'question'; part: ToolPartView };

const HIDDEN_TOOLS = new Set(['learn_tools']);

const toSegments = (parts: Part[]): Segment[] => {
  const segments: Segment[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text.trim() !== '') segments.push({ kind: 'text', text: part.text });
      continue;
    }

    if (part.type === 'reasoning') {
      if (part.text.trim() !== '') segments.push({ kind: 'reasoning', text: part.text });
      continue;
    }

    if (!isToolPartType(part.type)) continue;

    const toolPart = part as unknown as ToolPartView;
    const toolName = resolveToolName(toolPart);

    if (HIDDEN_TOOLS.has(toolName)) continue;

    if (toolName === 'ask_user') {
      segments.push({ kind: 'question', part: toolPart });
      continue;
    }

    if (toolPart.state === 'approval-requested' || toolPart.state === 'approval-responded') {
      segments.push({ kind: 'approval', part: toolPart });
      continue;
    }

    const last = segments.at(-1);

    if (last?.kind === 'activity') {
      last.parts.push(toolPart);
    } else {
      segments.push({ kind: 'activity', parts: [toolPart] });
    }
  }

  return segments;
};

export const UserMessage = ({ message }: { message: UIMessage }) => {
  const files = message.parts.filter((part) => part.type === 'file');

  return (
    <>
      {files.length > 0 && (
        <div className="agent-message-files">
          {files.map((file, index) => (
            <span key={index} className="agent-file-chip">
              <FileIcon size={13} />
              <span className="agent-file-chip-name">{file.filename ?? 'attachment'}</span>
            </span>
          ))}
        </div>
      )}
      <div className="agent-message-user">
        {message.parts.map((part, index) => (part.type === 'text' ? <span key={index}>{part.text}</span> : null))}
      </div>
    </>
  );
};

export const AssistantMessage = ({
  message,
  isStreaming,
  actions,
}: {
  message: UIMessage;
  isStreaming: boolean;
  actions: MessageActions;
}) => {
  const segments = toSegments(message.parts);

  return (
    <div className="agent-message-assistant">
      <span className="agent-avatar">
        <SparklesIcon size={15} />
      </span>
      <div className="agent-message-body">
        {segments.map((segment, index) => {
          switch (segment.kind) {
            case 'text':
              return (
                <div key={index}>
                  {actions.renderMarkdown ? actions.renderMarkdown(segment.text) : <Markdown text={segment.text} />}
                </div>
              );
            case 'reasoning':
              return <Reasoning key={index} text={segment.text} />;
            case 'activity':
              return <ToolActivity key={index} parts={segment.parts} isStreaming={isStreaming} />;
            case 'approval':
              return <ApprovalCard key={index} part={segment.part} onApprove={actions.onApprove} />;
            case 'question':
              return <QuestionCard key={index} part={segment.part} onAnswer={actions.onAnswer} />;
          }
        })}
        {isStreaming && segments.length === 0 && <TypingIndicator />}
      </div>
    </div>
  );
};

export const TypingIndicator = () => (
  <span className="agent-typing" aria-label="Assistant is thinking">
    <span />
    <span />
    <span />
  </span>
);

const Reasoning = ({ text }: { text: string }) => (
  <details className="agent-reasoning">
    <summary>Show reasoning</summary>
    <div className="agent-reasoning-text">{text}</div>
  </details>
);

const StatusIcon = ({ status }: { status: ToolStatus }) => {
  if (status === 'running' || status === 'awaiting') return <span className="agent-spinner" aria-label="Running" />;
  if (status === 'done') return <CheckIcon className="agent-status-icon--done" aria-label="Done" />;
  if (status === 'denied') return <CloseIcon className="agent-status-icon--denied" aria-label="Denied" />;

  return <AlertIcon className="agent-status-icon--failed" aria-label="Failed" />;
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'Running',
  awaiting: 'Waiting for approval',
  done: '',
  failed: 'Failed',
  denied: 'Denied',
};

const ToolActivity = ({ parts, isStreaming }: { parts: ToolPartView[]; isStreaming: boolean }) => {
  const statuses = parts.map(getToolStatus);
  const isRunning = isStreaming && statuses.some((status) => status === 'running');
  const failedCount = statuses.filter((status) => status === 'failed').length;
  const current = parts[statuses.findIndex((status) => status === 'running')];

  const first = describeTool(resolveToolName(parts[0]), false);
  const summary = isRunning && current
    ? `${describeTool(resolveToolName(current), true)}…`
    : `${parts.length === 1 ? first : `${first} and ${parts.length - 1} more`}${failedCount > 0 ? ` · ${failedCount} failed` : ''}`;

  return (
    <details className="agent-activity">
      <summary>
        {isRunning ? <span className="agent-spinner" /> : <ToolIcon />}
        <span>{summary}</span>
        <ChevronDownIcon className="agent-activity-chevron" />
      </summary>
      <ul className="agent-activity-list">
        {parts.map((part, index) => {
          const status = statuses[index];

          return (
            <li className="agent-activity-row" key={part.toolCallId}>
              <StatusIcon status={status === 'running' && !isStreaming ? 'failed' : status} />
              <span className="agent-activity-name">{describeTool(resolveToolName(part), status === 'running')}</span>
              <span className="agent-activity-status" title={part.errorText}>
                {status === 'failed' ? (part.errorText ? 'Failed' : STATUS_LABEL.failed) : STATUS_LABEL[status]}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
};

const ApprovalCard = ({ part, onApprove }: { part: ToolPartView; onApprove: MessageActions['onApprove'] }) => {
  const [reason, setReason] = useState('');
  const toolName = resolveToolName(part);
  const fields = toDisplayFields(resolveToolInput(part));
  const approvalId = part.approval?.id;

  if (part.state === 'approval-responded') {
    const approved = part.approval?.approved === true;

    return (
      <div className="agent-card-resolved">
        {approved ? <span className="agent-spinner" /> : <CloseIcon className="agent-status-icon--denied" />}
        {approved ? `Approved · ${describeTool(toolName, true)}…` : `Denied · ${humanizeToolName(toolName)}`}
      </div>
    );
  }

  return (
    <div className="agent-card agent-card--approval" role="group" aria-label="Approval needed">
      <div className="agent-card-eyebrow">
        <ShieldIcon size={14} /> Approval needed
      </div>
      <p className="agent-card-title">{approvalQuestion(toolName, resolveToolInput(part))}</p>
      {fields.length > 0 && (
        <dl className="agent-card-fields">
          {fields.map((field) => (
            <FieldRow key={field.label} label={field.label} value={field.value} />
          ))}
        </dl>
      )}
      <input
        className="agent-card-input"
        placeholder="Add a note for the assistant (optional)"
        aria-label="Note for the assistant"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="agent-card-actions">
        <button
          type="button"
          className="agent-button agent-button--primary"
          disabled={approvalId === undefined}
          onClick={() => approvalId && onApprove(approvalId, true, reason || undefined)}
        >
          <CheckIcon /> Approve
        </button>
        <button
          type="button"
          className="agent-button"
          disabled={approvalId === undefined}
          onClick={() => approvalId && onApprove(approvalId, false, reason || undefined)}
        >
          Deny
        </button>
      </div>
    </div>
  );
};

const FieldRow = ({ label, value }: { label: string; value: string }) => (
  <>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </>
);

const QuestionCard = ({ part, onAnswer }: { part: ToolPartView; onAnswer: MessageActions['onAnswer'] }) => {
  const [answer, setAnswer] = useState('');
  const input = (part.input ?? {}) as { question?: string; options?: string[]; allowFreeText?: boolean };

  if (part.state === 'output-available') {
    return (
      <div className="agent-card-resolved">
        <QuestionIcon size={14} /> {input.question} <strong>{(part.output as { answer?: string })?.answer}</strong>
      </div>
    );
  }

  if (part.state !== 'input-available') {
    return null;
  }

  const submit = (value: string) => {
    if (value.trim() !== '') onAnswer(part.toolCallId, value.trim());
  };

  return (
    <div className="agent-card agent-card--question" role="group" aria-label="Question from the assistant">
      <div className="agent-card-eyebrow">
        <QuestionIcon size={14} /> Needs your input
      </div>
      <p className="agent-card-title">{input.question}</p>
      {input.options && input.options.length > 0 && (
        <div className="agent-card-actions">
          {input.options.map((option) => (
            <button key={option} type="button" className="agent-button" onClick={() => submit(option)}>
              {option}
            </button>
          ))}
        </div>
      )}
      {input.allowFreeText !== false && (
        <form
          className="agent-card-actions"
          onSubmit={(event) => {
            event.preventDefault();
            submit(answer);
          }}
        >
          <input
            className="agent-card-input"
            style={{ flex: 1 }}
            placeholder="Type your answer"
            aria-label="Your answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <button type="submit" className="agent-button agent-button--primary" disabled={answer.trim() === ''}>
            Reply
          </button>
        </form>
      )}
    </div>
  );
};
