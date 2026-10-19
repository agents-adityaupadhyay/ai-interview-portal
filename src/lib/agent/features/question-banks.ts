import { z } from 'zod';

import { callAppApi } from '../tools/call-app-api';
import { defineTool } from '../types';
import { defineFeature, LEVELS, ROUND_TYPES } from './types';

type QuestionBankRow = {
  id: string;
  name: string;
  role: string;
  level: string;
  round_type: string;
  questions: string[] | null;
};

const summarize = (bank: QuestionBankRow) => ({
  id: bank.id,
  name: bank.name,
  role: bank.role,
  level: bank.level,
  roundType: bank.round_type,
  questionCount: bank.questions?.length ?? 0,
});

const detail = (bank: QuestionBankRow) => ({ ...summarize(bank), questions: bank.questions ?? [] });

const questionsSchema = z.array(z.string().min(1).max(4000)).max(100);

export const questionBanksFeature = defineFeature({
  id: 'question-banks',
  title: 'Question banks',
  milestone: 'M1',
  summary: 'List, read, create, update and delete question banks.',
  guidance: `- A question bank is attached to an interview at creation time; the AI interviewer then asks its questions.
- When asked to write questions, draft them for the bank's role, level and round type: specific, one question per entry, no numbering.
- update_question_bank changes only the fields you pass. To add questions without losing existing ones, use addQuestions.
- Before creating a bank, check find_question_banks for one with the same name to avoid duplicates.`,
  tools: () => [
    defineTool({
      name: 'find_question_banks',
      description:
        "List the organization's question banks, optionally filtered by text (name or role), level or round type. Returns id, name, role, level, round type and question count.",
      risk: 'read',
      category: 'question-banks',
      inputSchema: z.object({
        search: z.string().max(200).optional(),
        level: z.enum(LEVELS).optional(),
        roundType: z.enum(ROUND_TYPES).optional(),
      }),
      execute: async ({ search, level, roundType }, context) => {
        const banks = await callAppApi<QuestionBankRow[]>(context, 'GET', '/api/questions');
        const needle = search?.toLowerCase();

        return {
          questionBanks: banks
            .filter(
              (bank) =>
                (!needle || bank.name.toLowerCase().includes(needle) || bank.role.toLowerCase().includes(needle)) &&
                (!level || bank.level === level) &&
                (!roundType || bank.round_type === roundType),
            )
            .map(summarize),
        };
      },
    }),
    defineTool({
      name: 'get_question_bank',
      description: 'Get one question bank by id, including all of its questions.',
      risk: 'read',
      category: 'question-banks',
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async ({ id }, context) =>
        detail(await callAppApi<QuestionBankRow>(context, 'GET', `/api/questions/${encodeURIComponent(id)}`)),
    }),
    defineTool({
      name: 'create_question_bank',
      description: 'Create a question bank for a role, level and round type. Returns the created bank with its id.',
      risk: 'write',
      category: 'question-banks',
      inputSchema: z.object({
        name: z.string().min(1).max(255),
        role: z.string().min(1).max(255),
        level: z.enum(LEVELS),
        roundType: z.enum(ROUND_TYPES),
        questions: questionsSchema.min(1),
      }),
      execute: async (input, context) =>
        detail(await callAppApi<QuestionBankRow>(context, 'POST', '/api/questions', { json: input })),
    }),
    defineTool({
      name: 'update_question_bank',
      description:
        'Change a question bank. Pass only the fields to change. "questions" replaces the whole list; "addQuestions" appends to it. Returns the updated bank.',
      risk: 'write',
      category: 'question-banks',
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        role: z.string().min(1).max(255).optional(),
        level: z.enum(LEVELS).optional(),
        roundType: z.enum(ROUND_TYPES).optional(),
        questions: questionsSchema.optional(),
        addQuestions: questionsSchema.optional(),
      }),
      execute: async ({ id, addQuestions, ...changes }, context) => {
        const path = `/api/questions/${encodeURIComponent(id)}`;
        // The route's PUT replaces every field, so merge onto the current bank.
        const current = await callAppApi<QuestionBankRow>(context, 'GET', path);
        const questions = [...(changes.questions ?? current.questions ?? []), ...(addQuestions ?? [])];

        return detail(
          await callAppApi<QuestionBankRow>(context, 'PUT', path, {
            json: {
              name: changes.name ?? current.name,
              role: changes.role ?? current.role,
              level: changes.level ?? current.level,
              roundType: changes.roundType ?? current.round_type,
              questions,
            },
          }),
        );
      },
    }),
    defineTool({
      name: 'delete_question_bank',
      description:
        'Permanently delete a question bank. Pass its id and its exact name (from find_question_banks); the name is shown to the user to confirm. Interviews already created with it keep their questions.',
      risk: 'destructive',
      category: 'question-banks',
      inputSchema: z.object({
        questionBankId: z.string().uuid(),
        questionBankName: z.string().min(1).max(255),
      }),
      execute: async ({ questionBankId, questionBankName }, context) => {
        const path = `/api/questions/${encodeURIComponent(questionBankId)}`;
        // The approval card shows the name, so it must belong to this id:
        // otherwise the user approved deleting something else.
        const current = await callAppApi<QuestionBankRow>(context, 'GET', path);

        if (current.name.trim().toLowerCase() !== questionBankName.trim().toLowerCase()) {
          throw new Error(
            `Not deleted: question bank ${questionBankId} is named "${current.name}", not "${questionBankName}". Check with the user before trying again.`,
          );
        }

        await callAppApi(context, 'DELETE', path);

        return { ok: true, deleted: { id: questionBankId, name: current.name } };
      },
    }),
  ],
});
