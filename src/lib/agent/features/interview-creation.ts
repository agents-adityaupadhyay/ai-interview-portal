import { z } from 'zod';

import { callAppApi } from '../tools/call-app-api';
import { defineTool } from '../types';
import { findAttachment } from './attachments';
import { CODING_LANGUAGES, defineFeature, FOCUS_AREAS, LEVELS, ROUND_TYPES } from './types';

type EmailTemplateRow = { id: string; name: string; description: string | null; is_default: boolean };
type CreatedInterview = { id: string; url: string; candidateEmail: string };

export const interviewCreationFeature = defineFeature({
  id: 'interview-creation',
  title: 'Interview creation',
  milestone: 'M2',
  summary: 'Create an interview (optionally from an attached resume) and send the candidate their invite.',
  guidance: `- create_interview does what the New Interview form does: it creates the interview and, when a candidate email is given, emails the candidate their interview link. The user confirms it before it runs.
- Typical flow: read and screen the attached resume, propose the setup (role, level, round type, duration, focus areas, question bank), then call create_interview with resumeFileName so the interviewer AI gets the resume.
- Take the candidate's name and email from the resume when present; never invent an email. If there is none, ask with ask_user or create without one (no invite is sent and the user shares the link).
- Use list_email_templates and find_question_banks to offer the organization's templates and banks; use their ids, never names.
- language is only for Coding rounds. Duration is in minutes (5-180, usually 30).
- Afterwards, give the candidate link and a link to the interview page.`,
  tools: ({ store }) => [
    defineTool({
      name: 'list_email_templates',
      description: "List the organization's invitation email templates (id, name, description, whether it is the default).",
      risk: 'read',
      category: 'interview-creation',
      inputSchema: z.object({}),
      execute: async (_input, context) => ({
        emailTemplates: (await callAppApi<EmailTemplateRow[]>(context, 'GET', '/api/email-templates')).map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          isDefault: template.is_default,
        })),
      }),
    }),
    defineTool({
      name: 'create_interview',
      description:
        'Create an interview for a candidate and, if candidateEmail is set, email them the interview link. ' +
        'Pass resumeFileName to use a file attached in this conversation as the resume. Returns the interview id, the candidate link and the interview page link.',
      // Sends an email to someone outside the organization.
      risk: 'external',
      category: 'interview-creation',
      inputSchema: z.object({
        role: z.string().min(1).max(255).describe('Job title, e.g. "Backend Engineer"'),
        level: z.enum(LEVELS),
        roundType: z.enum(ROUND_TYPES).default('General'),
        durationMinutes: z.number().int().min(5).max(180).default(30),
        focusAreas: z.array(z.enum(FOCUS_AREAS)).max(6).default([]),
        candidateName: z.string().max(255).optional().describe("Candidate's full name. Always pass it when known, e.g. from the resume"),
        candidateEmail: z.string().email().optional().describe('Only a real address from the user or the resume; the invite goes here'),
        candidatePhone: z.string().max(50).optional(),
        language: z.enum(CODING_LANGUAGES).optional().describe('Coding rounds only'),
        questionBankId: z.string().uuid().optional(),
        emailTemplateId: z.string().uuid().optional(),
        additionalContext: z
          .string()
          .max(4000)
          .optional()
          .describe('Notes for the AI interviewer, e.g. screening findings and areas to probe'),
        resumeFileName: z.string().max(255).optional().describe('Name of a file attached in this conversation'),
      }),
      execute: async (input, context) => {
        const form = new FormData();

        form.set('role', input.role);
        form.set('level', input.level);
        form.set('roundType', input.roundType);
        form.set('duration', String(input.durationMinutes));
        form.set('focusAreas', input.focusAreas.join(','));
        form.set('candidateEmail', input.candidateEmail ?? '');
        form.set('candidateName', input.candidateName ?? '');
        form.set('candidatePhone', input.candidatePhone ?? '');
        form.set('language', input.roundType === 'Coding' ? (input.language ?? '') : '');
        form.set('questionBankId', input.questionBankId ?? '');
        form.set('emailTemplateId', input.emailTemplateId ?? '');
        form.set('additionalContext', input.additionalContext ?? '');

        if (input.resumeFileName !== undefined) {
          const resume = await findAttachment(store, context.user, context.threadId, input.resumeFileName);

          form.set('resume', new Blob([new Uint8Array(resume.buffer)], { type: resume.mediaType }), resume.fileName);
        }

        const created = await callAppApi<CreatedInterview>(context, 'POST', '/api/create-interview', { formData: form });
        const origin = context.user.credentials?.origin ?? '';

        return {
          interviewId: created.id,
          interviewPage: `/dashboard/${created.id}`,
          candidateLink: `${origin}${created.url}`,
          invitationEmailSentTo: created.candidateEmail || null,
          resumeAttached: input.resumeFileName ?? null,
        };
      },
    }),
  ],
});
