import type { ToolExecutionContext } from '../types';

// Feature tools call the app's own route handlers AS the signed-in user by
// forwarding their session cookie, so every org scope, admin check, rate limit
// and side effect (emails) is exactly what the UI gets. Never import pool or
// store functions into a tool instead: that would skip those checks.
//
// server-custom.js and `next dev` both listen on PORT (default 3000) in the
// same process, so loopback is the default. Override when the app is only
// reachable elsewhere.
const appBaseUrl = (): string =>
  process.env.AGENT_APP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

export type AppApiRequest = {
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  formData?: FormData;
};

export const callAppApi = async <TResponse = unknown>(
  context: ToolExecutionContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  { query, json, formData }: AppApiRequest = {},
): Promise<TResponse> => {
  const url = new URL(path, appBaseUrl());

  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const credentials = context.user.credentials ?? {};
  const headers: Record<string, string> = { accept: 'application/json' };

  if (credentials.cookie) {
    headers.cookie = credentials.cookie;
  }

  if (credentials.authorization) {
    headers.authorization = credentials.authorization;
  }

  if (credentials.forwardedFor) {
    headers['x-forwarded-for'] = credentials.forwardedFor;
  }

  if (credentials.origin) {
    headers.origin = credentials.origin;
  }

  if (json !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: formData ?? (json !== undefined ? JSON.stringify(json) : undefined),
    signal: context.abortSignal,
  });

  const body = parseJson(await response.text());

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Permission denied (${response.status}): the user is not allowed to do this. ${extractMessage(body)}`.trim(),
    );
  }

  if (response.status === 404) {
    throw new Error(`Not found. ${extractMessage(body)}`.trim());
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}. ${extractMessage(body)}`.trim());
  }

  return (body ?? { ok: true }) as TResponse;
};

const parseJson = (text: string): unknown => {
  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 2_000);
  }
};

const extractMessage = (body: unknown): string => {
  if (typeof body === 'string') {
    return body.slice(0, 500);
  }

  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;

    return typeof message === 'string' ? message.slice(0, 500) : JSON.stringify(body).slice(0, 500);
  }

  return '';
};
