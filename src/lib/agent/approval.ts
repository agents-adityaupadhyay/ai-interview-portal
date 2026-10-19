import type { ToolApprovalStatus } from 'ai';

import { EXECUTE_TOOL_TOOL_NAME, type ToolCatalog } from './registry';
import type { ToolRisk } from './types';

export const DEFAULT_APPROVAL_RISKS: ReadonlySet<ToolRisk> = new Set<ToolRisk>([
  'destructive',
  'external',
]);

// Per-tool overrides of the risk rule. Prefer fixing a tool's risk level over
// growing these lists.
export type ApprovalPolicyOptions = {
  risksRequiringApproval?: ReadonlySet<ToolRisk>;
  alwaysRequireApproval?: ReadonlySet<string>;
  neverRequireApproval?: ReadonlySet<string>;
};

// Calls routed through execute_tool are judged by the inner tool, otherwise
// lazy loading would bypass approvals.
export const createApprovalPolicy = (
  catalog: ToolCatalog,
  {
    risksRequiringApproval = DEFAULT_APPROVAL_RISKS,
    alwaysRequireApproval = new Set(),
    neverRequireApproval = new Set(),
  }: ApprovalPolicyOptions = {},
) => {
  return ({
    toolCall,
  }: {
    toolCall: { toolName: string; input: unknown };
  }): ToolApprovalStatus => {
    const toolName =
      toolCall.toolName === EXECUTE_TOOL_TOOL_NAME
        ? readInnerToolName(toolCall.input)
        : toolCall.toolName;

    if (toolName === undefined) {
      return 'not-applicable';
    }

    if (alwaysRequireApproval.has(toolName)) {
      return 'user-approval';
    }

    if (neverRequireApproval.has(toolName)) {
      return 'not-applicable';
    }

    const definition = catalog.get(toolName);

    if (definition === undefined) {
      return 'not-applicable';
    }

    return risksRequiringApproval.has(definition.risk)
      ? { type: 'user-approval', reason: `${definition.risk} action` }
      : 'not-applicable';
  };
};

const readInnerToolName = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }

  const name = (input as { name?: unknown }).name;

  return typeof name === 'string' ? name : undefined;
};
