import { handleDeleteThread } from "@/lib/agent/http/next-route";
import { agentGuard, agentOptions } from "@/lib/agent/server";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: { threadId: string } }) {
  const blocked = await agentGuard(req);
  if (blocked) return blocked;
  return handleDeleteThread(req, params.threadId, agentOptions());
}
