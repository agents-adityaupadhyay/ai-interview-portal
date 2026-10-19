import { handleListThreads } from "@/lib/agent/http/next-route";
import { agentGuard, agentOptions } from "@/lib/agent/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = await agentGuard(req);
  if (blocked) return blocked;
  return handleListThreads(req, agentOptions());
}
