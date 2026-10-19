import { asSchema, dynamicTool, tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { AGENT_CONFIG } from './config';
import { createAskUserTool, ASK_USER_TOOL_NAME } from './tools/ask-user';
import type {
  AgentToolDefinition,
  AgentUser,
  ToolExecutionContext,
  ToolProvider,
} from './types';

export const LEARN_TOOLS_TOOL_NAME = 'learn_tools';
export const EXECUTE_TOOL_TOOL_NAME = 'execute_tool';

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export type ToolCatalog = Map<string, AgentToolDefinition>;

export type BuiltToolSet = {
  tools: ToolSet;
  catalog: ToolCatalog;
  isLazy: boolean;
  directToolNames: string[];
  // Prompt guidance of the features available to this user.
  guidance: string[];
};

export class ToolRegistry {
  constructor(private readonly providers: ToolProvider[]) {}

  async getCatalog(user: AgentUser): Promise<ToolCatalog> {
    return (await this.collect(user)).catalog;
  }

  private async collect(user: AgentUser): Promise<{ catalog: ToolCatalog; guidance: string[] }> {
    const catalog: ToolCatalog = new Map();
    const guidance: string[] = [];

    const toolLists = await Promise.all(
      this.providers.map(async (provider) => {
        if (provider.isAvailable && !(await provider.isAvailable(user))) {
          return [];
        }

        return provider.getTools(user);
      }),
    );

    this.providers.forEach((provider, index) => {
      if (provider.guidance && toolLists[index].length > 0) {
        guidance.push(provider.title ? `### ${provider.title}\n${provider.guidance}` : provider.guidance);
      }
    });

    for (const definition of toolLists.flat()) {
      if (!TOOL_NAME_PATTERN.test(definition.name)) {
        throw new Error(`Invalid tool name "${definition.name}"`);
      }

      if (catalog.has(definition.name)) {
        throw new Error(`Duplicate tool name "${definition.name}"`);
      }

      if (definition.isAvailable && !(await definition.isAvailable(user))) {
        continue;
      }

      catalog.set(definition.name, definition);
    }

    return { catalog, guidance };
  }

  async buildToolSet(context: ToolExecutionContext): Promise<BuiltToolSet> {
    const { catalog, guidance } = await this.collect(context.user);
    const isLazy = catalog.size > AGENT_CONFIG.lazyToolThreshold;

    const directDefinitions = isLazy
      ? AGENT_CONFIG.preloadedToolNames
          .map((name) => catalog.get(name))
          .filter((definition) => definition !== undefined)
      : Array.from(catalog.values());

    const tools: ToolSet = {
      [ASK_USER_TOOL_NAME]: createAskUserTool(),
    };

    for (const definition of directDefinitions) {
      tools[definition.name] = tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: (input, { abortSignal }) =>
          runTool(definition, input, context, abortSignal),
      });
    }

    if (isLazy) {
      tools[LEARN_TOOLS_TOOL_NAME] = createLearnToolsTool(catalog);
      tools[EXECUTE_TOOL_TOOL_NAME] = createExecuteToolTool(catalog, context);
    }

    return {
      tools,
      catalog,
      isLazy,
      directToolNames: directDefinitions.map((definition) => definition.name),
      guidance,
    };
  }
}

const createLearnToolsTool = (catalog: ToolCatalog) =>
  tool({
    description:
      'Get the input schema of one or more tools from the catalog before calling them with execute_tool. ' +
      'Ask for every tool you plan to use in a single call.',
    inputSchema: z.object({
      names: z.array(z.string()).min(1).max(20),
    }),
    execute: async ({ names }) =>
      Promise.all(
        names.map(async (name) => {
          const definition = catalog.get(name);

          if (definition === undefined) {
            return { name, error: `Unknown tool. ${suggestToolNames(catalog, name)}` };
          }

          return {
            name,
            description: definition.description,
            risk: definition.risk,
            inputSchema: await asSchema(definition.inputSchema).jsonSchema,
          };
        }),
      ),
  });

const createExecuteToolTool = (
  catalog: ToolCatalog,
  context: ToolExecutionContext,
) =>
  dynamicTool({
    description:
      'Run a catalog tool by name. Call learn_tools first to get its input schema, then pass the input that matches it.',
    inputSchema: z.object({
      name: z.string(),
      input: z.record(z.string(), z.unknown()).default({}),
    }),
    execute: async (rawInput, { abortSignal }) => {
      const { name, input } = rawInput as {
        name: string;
        input: Record<string, unknown>;
      };
      const definition = catalog.get(name);

      if (definition === undefined) {
        return failure(`Unknown tool "${name}". ${suggestToolNames(catalog, name)}`);
      }

      const schema = asSchema(definition.inputSchema);
      const validation = schema.validate ? await schema.validate(input) : undefined;

      if (validation !== undefined && !validation.success) {
        return failure(
          `Invalid input for ${name}: ${validation.error.message}. Call learn_tools to check the schema.`,
        );
      }

      return runTool(
        definition,
        validation?.success ? validation.value : input,
        context,
        abortSignal,
      );
    },
  });

export type ToolFailure = { ok: false; error: string };

const failure = (error: string): ToolFailure => ({ ok: false, error });

// Errors become results the model can read and recover from, instead of
// aborting the whole turn.
const runTool = async (
  definition: AgentToolDefinition,
  input: unknown,
  context: ToolExecutionContext,
  callAbortSignal: AbortSignal | undefined,
): Promise<unknown> => {
  const abortSignal = AbortSignal.any(
    [
      context.abortSignal,
      callAbortSignal,
      AbortSignal.timeout(AGENT_CONFIG.toolTimeoutMs),
    ].filter((signal): signal is AbortSignal => signal !== undefined),
  );

  try {
    const output = await definition.execute(input, { ...context, abortSignal });

    return limitOutputSize(output);
  } catch (error) {
    if (abortSignal.aborted && !context.abortSignal.aborted) {
      return failure(
        `${definition.name} timed out after ${AGENT_CONFIG.toolTimeoutMs}ms. Try a narrower request.`,
      );
    }

    return failure(error instanceof Error ? error.message : String(error));
  }
};

const limitOutputSize = (output: unknown): unknown => {
  if (output === undefined) {
    return { ok: true };
  }

  const serialized = JSON.stringify(output);

  if (serialized === undefined || serialized.length <= AGENT_CONFIG.maxToolOutputChars) {
    return output;
  }

  return {
    ok: true,
    truncated: true,
    note: `Output was ${serialized.length} characters and was cut to ${AGENT_CONFIG.maxToolOutputChars}. Narrow the query (filters, fewer fields, smaller limit) to see the rest.`,
    partialOutput: serialized.slice(0, AGENT_CONFIG.maxToolOutputChars),
  };
};

const suggestToolNames = (catalog: ToolCatalog, name: string): string => {
  const words = name.toLowerCase().split(/[_-]/).filter((word) => word.length > 2);
  const matches = Array.from(catalog.keys())
    .filter((candidate) => words.some((word) => candidate.includes(word)))
    .slice(0, 5);

  return matches.length > 0 ? `Did you mean: ${matches.join(', ')}?` : '';
};
