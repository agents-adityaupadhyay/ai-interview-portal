import { handleChatPost } from "@/lib/agent/http/next-route";
import { agentGuard, agentOptions } from "@/lib/agent/server";

export const dynamic = "force-dynamic";
// Tool loops can take a while; only relevant on serverless hosts.
export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = await agentGuard(req, { limitTurns: true });
  if (blocked) return blocked;
  return handleChatPost(req, agentOptions());
}
