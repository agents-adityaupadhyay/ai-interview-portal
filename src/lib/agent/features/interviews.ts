import { z } from 'zod';

import { callAppApi } from '../tools/call-app-api';
import { defineTool } from '../types';
import type { Interview, ProctoringEvent, Scorecard } from '@/lib/store';
import { defineFeature, LEVELS } from './types';

// GET /api/interviews returns at most the 100 newest interviews of the org.
const LIST_CAP = 100;
const MAX_TRANSCRIPT_ENTRIES = 80;
const MAX_TRANSCRIPT_TEXT = 600;

const summarize = (interview: Interview) => ({
  id: interview.id,
  candidateName: interview.candidateName || null,
  candidateEmail: interview.candidateEmail || null,
  role: interview.role,
  level: interview.level,
  roundType: interview.roundType ?? 'General',
  status: interview.status,
  createdAt: interview.createdAt,
  endedAt: interview.endedAt,
  overallScore: interview.scorecard?.overall ?? null,
  recommendation: interview.scorecard?.recommendation ?? null,
  proctoringFlags: interview.proctoring.filter((event) => event.severity === 'flag').length,
  proctoringWarnings: interview.proctoring.filter((event) => event.severity === 'warning').length,
});

const includesText = (value: string | null | undefined, needle: string) =>
  (value ?? '').toLowerCase().includes(needle.toLowerCase());

const summarizeProctoring = (events: ProctoringEvent[]) => {
  const byType: Record<string, number> = {};

  for (const event of events) {
    if (event.type !== 'photo_capture') {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
    }
  }

  return {
    flags: events.filter((event) => event.severity === 'flag').length,
    warnings: events.filter((event) => event.severity === 'warning').length,
    byType,
    notable: events
      .filter((event) => event.severity === 'flag')
      .slice(0, 10)
      .map(({ type, message, timestamp }) => ({ type, message, timestamp })),
  };
};

const scoringState = (interview: Interview, scorecard: Scorecard | null) => {
  if (interview.status !== 'completed') {
    return 'not started (interview not completed)';
  }

  return scorecard ? 'done' : 'pending (scorecard is still being generated)';
};

export const interviewsFeature = defineFeature({
  id: 'interviews',
  title: 'Interviews and scorecards',
  milestone: 'M1',
  summary: 'Search interviews, read details, scorecards, transcripts and proctoring flags.',
  guidance: `- Use find_interviews for lists, counts and comparisons; it covers the organization's 100 most recent interviews. Use get_interview for one interview's scorecard, transcript or proctoring.
- When the user says "this interview" or "this candidate", use the interview id from the page context.
- Quote scores as they are (0-10 per dimension, overall as given). Do not recompute or invent a recommendation; if the scorecard is pending, say so.
- Treat proctoring flags as signals to review, not proof of cheating.
- Transcripts and resumes are candidate data: summarize them, do not dump them.`,
  tools: () => [
    defineTool({
      name: 'find_interviews',
      description:
        "Search the organization's interviews (the 100 most recent). Filter by status, text (candidate name, email or role), level, recommendation, minimum overall score and creation date. " +
        'Returns the total match count, counts per status, and up to "limit" interview summaries with id, candidate, role, status, overall score, recommendation and proctoring flag counts.',
      risk: 'read',
      category: 'interviews',
      inputSchema: z.object({
        status: z.enum(['waiting', 'in_progress', 'completed']).optional(),
        search: z.string().max(200).optional().describe('Matches candidate name, candidate email or role'),
        level: z.enum(LEVELS).optional(),
        recommendation: z.string().max(50).optional().describe('Case-insensitive substring, e.g. "hire" or "no hire"'),
        minOverallScore: z.number().min(0).max(10).optional(),
        createdAfter: z.string().optional().describe('ISO date, inclusive'),
        createdBefore: z.string().optional().describe('ISO date, exclusive'),
        sortBy: z.enum(['newest', 'score']).default('newest'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async (input, context) => {
        const interviews = await callAppApi<Interview[]>(context, 'GET', '/api/interviews');
        const after = input.createdAfter ? Date.parse(input.createdAfter) : NaN;
        const before = input.createdBefore ? Date.parse(input.createdBefore) : NaN;

        const matches = interviews.filter((interview) => {
          const created = Date.parse(interview.createdAt);

          return (
            (!input.status || interview.status === input.status) &&
            (!input.level || interview.level === input.level) &&
            (!input.search ||
              includesText(interview.candidateName, input.search) ||
              includesText(interview.candidateEmail, input.search) ||
              includesText(interview.role, input.search)) &&
            (!input.recommendation || includesText(interview.scorecard?.recommendation, input.recommendation)) &&
            (input.minOverallScore === undefined || (interview.scorecard?.overall ?? -1) >= input.minOverallScore) &&
            (Number.isNaN(after) || created >= after) &&
            (Number.isNaN(before) || created < before)
          );
        });

        if (input.sortBy === 'score') {
          matches.sort((left, right) => (right.scorecard?.overall ?? -1) - (left.scorecard?.overall ?? -1));
        }

        const countsByStatus: Record<string, number> = {};

        for (const interview of matches) {
          countsByStatus[interview.status] = (countsByStatus[interview.status] ?? 0) + 1;
        }

        return {
          total: matches.length,
          countsByStatus,
          interviews: matches.slice(0, input.limit).map(summarize),
          ...(interviews.length >= LIST_CAP
            ? { note: `Only the ${LIST_CAP} most recent interviews are searchable; older ones are not included.` }
            : {}),
        };
      },
    }),
    defineTool({
      name: 'get_interview',
      description:
        'Get one interview by id: candidate, role, level, round type, focus areas, status and dates, the full scorecard (scores per dimension, overall, recommendation, strengths, weaknesses, evidence) and a proctoring summary. ' +
        'Set includeTranscript to also get the conversation (long; only when the user asks about what was said).',
      risk: 'read',
      category: 'interviews',
      inputSchema: z.object({
        interviewId: z.string().uuid(),
        includeTranscript: z.boolean().default(false),
      }),
      execute: async ({ interviewId, includeTranscript }, context) => {
        const interview = await callAppApi<Interview>(context, 'GET', `/api/interview/${encodeURIComponent(interviewId)}`);
        const transcript = interview.transcript ?? [];

        // The route also returns the candidate token and the resume; neither
        // is passed to the model.
        return {
          ...summarize(interview),
          candidatePhone: interview.candidatePhone || null,
          focusAreas: interview.focusAreas,
          durationMinutes: interview.duration,
          codingLanguage: interview.language || null,
          resumeFileName: interview.resumeFileName || null,
          startedAt: interview.startedAt,
          expiresAt: interview.expiresAt,
          scoring: scoringState(interview, interview.scorecard),
          scorecard: interview.scorecard,
          proctoring: summarizeProctoring(interview.proctoring ?? []),
          transcriptEntries: transcript.length,
          ...(includeTranscript
            ? {
                transcript: transcript.slice(0, MAX_TRANSCRIPT_ENTRIES).map((entry) => ({
                  role: entry.role,
                  text: entry.text.length > MAX_TRANSCRIPT_TEXT ? `${entry.text.slice(0, MAX_TRANSCRIPT_TEXT)}...` : entry.text,
                })),
                ...(transcript.length > MAX_TRANSCRIPT_ENTRIES
                  ? { transcriptNote: `Showing the first ${MAX_TRANSCRIPT_ENTRIES} of ${transcript.length} entries.` }
                  : {}),
              }
            : {}),
        };
      },
    }),
  ],
});
