export type ThreadSummary = { id: string; title: string | null; updatedAt: string };

export type ToolPartView = {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

export const isToolPartType = (type: string): boolean =>
  type.startsWith('tool-') || type === 'dynamic-tool';

// execute_tool wraps catalog tools; people should see the real action.
export const resolveToolName = (part: ToolPartView): string => {
  const name = part.type === 'dynamic-tool' ? (part.toolName ?? 'tool') : part.type.slice('tool-'.length);

  if (name === 'execute_tool') {
    const inner = (part.input as { name?: unknown } | undefined)?.name;

    return typeof inner === 'string' ? inner : name;
  }

  return name;
};

export const resolveToolInput = (part: ToolPartView): unknown => {
  const name = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);

  return name === 'execute_tool' ? (part.input as { input?: unknown } | undefined)?.input : part.input;
};

const VERB_LABELS: Record<string, string> = {
  find: 'Searched',
  list: 'Listed',
  get: 'Looked up',
  read: 'Read',
  search: 'Searched',
  create: 'Created',
  update: 'Updated',
  upsert: 'Saved',
  delete: 'Deleted',
  send: 'Sent',
  draft: 'Drafted',
  run: 'Ran',
  set: 'Set',
  add: 'Added',
  stop: 'Stopped',
  plan: 'Planned',
};

const PENDING_VERB_LABELS: Record<string, string> = {
  find: 'Searching',
  list: 'Listing',
  get: 'Looking up',
  read: 'Reading',
  search: 'Searching',
  create: 'Creating',
  update: 'Updating',
  upsert: 'Saving',
  delete: 'Deleting',
  send: 'Sending',
  draft: 'Drafting',
  run: 'Running',
  set: 'Setting',
  add: 'Adding',
  stop: 'Stopping',
  plan: 'Planning',
};

// "archive_project" -> "Archive project": what an approval card asks about.
export const humanizeToolName = (toolName: string): string => {
  const words = toolName.replace(/[_-]+/g, ' ').trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The approval card's question. App-specific where the generic wording would
// hide a side effect (create_interview emails the candidate).
export const approvalQuestion = (toolName: string, input: unknown): string => {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  switch (toolName) {
    case 'create_interview':
      return typeof fields.candidateEmail === 'string' && fields.candidateEmail !== ''
        ? `Create this interview and email ${fields.candidateEmail} their link?`
        : 'Create this interview? No invite email will be sent.';
    case 'delete_question_bank':
      return 'Permanently delete this question bank?';
    default:
      return `${humanizeToolName(toolName)}?`;
  }
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// Regular English inflection covers most tool verbs (archive, assign, merge,
// convert, schedule); irregular common ones are in the label maps above.
const inflect = (verb: string, isPending: boolean): string => {
  if (isPending) {
    return verb.endsWith('e') && !verb.endsWith('ee') ? `${verb.slice(0, -1)}ing` : `${verb}ing`;
  }

  if (verb.endsWith('e')) return `${verb}d`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ied`;

  return `${verb}ed`;
};

// "find_open_invoices" -> "Searched open invoices" / "Searching open invoices"
// "archive_project" -> "Archived project" / "Archiving project"
export const describeTool = (toolName: string, isPending: boolean): string => {
  const [rawVerb, ...rest] = toolName.split(/[_-]+/);
  const verb = rawVerb.toLowerCase();
  const subject = rest.join(' ');

  if (subject === '') return humanizeToolName(toolName);

  const label = (isPending ? PENDING_VERB_LABELS : VERB_LABELS)[verb] ?? capitalize(inflect(verb, isPending));

  return `${label} ${subject}`;
};

export type ToolStatus = 'running' | 'done' | 'failed' | 'denied' | 'awaiting';

export const getToolStatus = (part: ToolPartView): ToolStatus => {
  switch (part.state) {
    case 'output-available':
      return (part.output as { ok?: boolean } | undefined)?.ok === false ? 'failed' : 'done';
    case 'output-error':
      return 'failed';
    case 'output-denied':
      return 'denied';
    case 'approval-requested':
      return 'awaiting';
    default:
      return 'running';
  }
};

export const groupThreadsByRecency = (
  threads: ThreadSummary[],
  now: Date = new Date(),
): { label: string; threads: ThreadSummary[] }[] => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const buckets: { label: string; from: number; threads: ThreadSummary[] }[] = [
    { label: 'Today', from: startOfToday, threads: [] },
    { label: 'Yesterday', from: startOfToday - day, threads: [] },
    { label: 'Previous 7 days', from: startOfToday - 7 * day, threads: [] },
    { label: 'Previous 30 days', from: startOfToday - 30 * day, threads: [] },
    { label: 'Older', from: Number.NEGATIVE_INFINITY, threads: [] },
  ];

  for (const thread of threads) {
    const time = new Date(thread.updatedAt).getTime();
    const bucket = buckets.find((candidate) => time >= candidate.from) ?? buckets[buckets.length - 1];

    bucket.threads.push(thread);
  }

  return buckets.filter((bucket) => bucket.threads.length > 0);
};

// Turns transport errors (the server's JSON body inside an Error) into a sentence.
export const toFriendlyError = (error: Error): string => {
  const match = error.message.match(/\{[\s\S]*\}$/);

  if (match) {
    try {
      const body = JSON.parse(match[0]) as { error?: string; message?: string };

      if (body.message) return body.message;
      if (body.error === 'unauthenticated') return 'Your session expired. Sign in again to continue.';
      if (body.error === 'thread_busy') return 'A reply is already in progress in this conversation.';
    } catch {
      // not JSON: fall through
    }
  }

  return 'Something went wrong while generating a reply.';
};

// Flattens tool input for the approval card: top-level fields as label/value rows.
export const toDisplayFields = (input: unknown): { label: string; value: string }[] => {
  if (typeof input !== 'object' || input === null) {
    return input === undefined ? [] : [{ label: 'Value', value: String(input) }];
  }

  const entries = Object.entries(input as Record<string, unknown>);
  const keys = new Set(entries.map(([key]) => key));
  // "projectId" is noise next to "projectName": people approve by name.
  const hasReadableCounterpart = (key: string) =>
    /Id$/.test(key) && ['Name', 'Title', 'Label'].some((suffix) => keys.has(key.replace(/Id$/, suffix)));

  return entries
    .filter(([key, value]) => value !== undefined && value !== null && value !== '' && !hasReadableCounterpart(key))
    .map(([key, value]) => ({
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()),
      value: typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value),
    }));
};
