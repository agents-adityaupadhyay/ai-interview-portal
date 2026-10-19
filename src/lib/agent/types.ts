import type { FlexibleSchema, UIMessage } from 'ai';

// read: no side effects. write: changes app data the user owns.
// destructive: deletes, bulk changes, anything hard to undo.
// external: leaves the system (email, SMS, payments, webhooks, third-party APIs).
export type ToolRisk = 'read' | 'write' | 'destructive' | 'external';

export type AgentUser = {
  id: string;
  tenantId?: string;
  roles: string[];
  displayName: string;
  email?: string;
  timezone?: string;
  locale?: string;
  // Whatever the tools need to call the app AS this user: a forwarded
  // Authorization header, a session cookie, or nothing when tools call
  // in-process services that take the user object directly.
  credentials?: {
    authorization?: string;
    cookie?: string;
    // Forwarded so the app's per-IP rate limits and invite links behave as
    // they do when the user calls the route from the browser.
    forwardedFor?: string;
    origin?: string;
  };
};

// What the user is looking at when they send a message. Built on the client.
export type PageContext = {
  route?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  viewName?: string;
  filters?: string[];
  extra?: Record<string, string>;
};

export type ToolExecutionContext = {
  user: AgentUser;
  threadId: string;
  abortSignal: AbortSignal;
};

export type AgentToolDefinition<TInput = any> = {
  // ^[a-zA-Z0-9_-]{1,64}$ — the limit most providers enforce
  name: string;
  // Written for the model: what it does, when to use it, what it returns.
  description: string;
  risk: ToolRisk;
  inputSchema: FlexibleSchema<TInput>;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<unknown>;
  category?: string;
  // Hide the tool from users who could never use it, so the model does not try.
  isAvailable?: (user: AgentUser) => boolean | Promise<boolean>;
};

// A feature (src/lib/agent/features) is a tool provider plus what the model
// should know about using it.
export type ToolProvider = {
  name: string;
  title?: string;
  // Added to the system prompt when the feature is available to the user.
  guidance?: string;
  isAvailable?: (user: AgentUser) => boolean | Promise<boolean>;
  getTools: (
    user: AgentUser,
  ) => AgentToolDefinition[] | Promise<AgentToolDefinition[]>;
};

export type AgentUIMessage = UIMessage<{
  createdAt?: string;
  model?: string;
}>;

export const defineTool = <TInput>(
  definition: AgentToolDefinition<TInput>,
): AgentToolDefinition<TInput> => definition;
