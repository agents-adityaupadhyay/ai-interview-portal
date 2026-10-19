import { tool } from 'ai';
import { z } from 'zod';

export const ASK_USER_TOOL_NAME = 'ask_user';

// No execute function: the AI SDK ends the turn on this call and the client
// renders a question card. The answer comes back with addToolOutput, and the
// client resubmits, which resumes the turn with the answer as the tool result.
export const createAskUserTool = () =>
  tool({
    description:
      'Ask the user a question when you cannot proceed without their input: missing required details, ' +
      'an ambiguous request with several plausible meanings, or a choice only they can make. ' +
      'Do not use it to confirm actions; risky actions are confirmed automatically.',
    inputSchema: z.object({
      question: z.string().min(1),
      options: z.array(z.string()).max(6).optional(),
      allowFreeText: z.boolean().default(true),
    }),
    outputSchema: z.object({
      answer: z.string(),
    }),
  });
