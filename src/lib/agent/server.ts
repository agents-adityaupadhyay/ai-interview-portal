import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { isAgentChatEnabled } from './config';
import { createToolRegistry } from './features';
import type { FetchAgentOptions } from './http/next-route';
import { PgChatStore } from './pg-store';
import type { AgentDependencies } from './run-turn';
import type { AgentUser } from './types';
import { NoopUsageMeter } from './usage';

// Composition root used by the src/app/api/agent routes.

let dependencies: AgentDependencies | undefined;

const getDependencies = (): AgentDependencies => {
  if (dependencies === undefined) {
    const store = new PgChatStore();

    dependencies = { store, usage: new NoopUsageMeter(), registry: createToolRegistry({ store }) };
  }

  return dependencies;
};

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

// Recruiters only: candidates have no session (they use interview tokens) and
// never reach the assistant.
export const getAgentUser = async (request: Request): Promise<AgentUser | null> => {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string; orgId?: string; role?: string; name?: string | null; email?: string | null }
    | undefined;

  if (!sessionUser?.id || !sessionUser.orgId) {
    return null;
  }

  const timeZone = request.headers.get('x-user-timezone') ?? '';

  return {
    id: sessionUser.id,
    tenantId: sessionUser.orgId,
    roles: sessionUser.role ? [sessionUser.role] : [],
    displayName: sessionUser.name || sessionUser.email || 'Recruiter',
    email: sessionUser.email ?? undefined,
    timezone: isValidTimeZone(timeZone) && timeZone !== '' ? timeZone : undefined,
    credentials: {
      cookie: request.headers.get('cookie') ?? undefined,
      forwardedFor: request.headers.get('x-forwarded-for') ?? undefined,
      // create-interview builds the invite link from the Origin header, as it
      // does for the browser form.
      origin:
        request.headers.get('origin') ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        new URL(request.url).origin,
    },
  };
};

export const agentOptions = (): FetchAgentOptions => ({
  dependencies: getDependencies(),
  getAgentUser,
});

// Shared guard for every /api/agent route: feature switch, then a per-user
// limit on chat turns (in-memory per process, like the rest of the app).
export const agentGuard = async (request: Request, { limitTurns = false } = {}): Promise<Response | null> => {
  if (!isAgentChatEnabled()) {
    return Response.json({ error: 'agent_disabled' }, { status: 404 });
  }

  if (limitTurns) {
    const user = await getAgentUser(request);

    if (user !== null && !rateLimit(`agent:${user.id}`, 20, 60_000)) {
      return Response.json({ error: 'rate_limited', message: 'Too many messages. Wait a minute and try again.' }, { status: 429 });
    }
  }

  return null;
};
