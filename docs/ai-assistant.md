# AI assistant

The **Hiring Assistant**: a chat agent for recruiters. They ask questions about their interviews, manage question banks, screen an attached resume and have the assistant set up the interview.

It opens from **Ask AI** in the sidebar (or Ctrl/⌘ J) as **agent mode**, a full-screen workspace with a conversation list, a reading column and a large composer. One click turns it into a **side panel** docked to the right, so the recruiter can keep working on the page. Both show the same live conversation, so switching mid-reply keeps the stream, a pending approval or a question. Esc exits. It never appears on candidate pages.

Turn it on with `AGENT_CHAT=on` after applying `migrations/003_agent_chat.sql`. All settings are in [Configuration](configuration.md#ai-assistant).

## What it can do

Capabilities come as **features**. Each feature is one module in `src/lib/agent/features/` that holds its tools and the instructions the model gets for using them. `AGENT_FEATURES` chooses which features are on (all of them by default).

| Feature id | Milestone | The recruiter can ask… | Tools (risk) |
|------------|-----------|------------------------|--------------|
| `interviews` | M1 | "How many interviews are waiting?", "Top scorers this month", "Summarize this candidate's scorecard", "Any proctoring flags?" | `find_interviews`, `get_interview` (read) |
| `question-banks` | M1 | "Create a bank of 8 system design questions for Senior Backend", "Add 3 questions about caching to it", "Delete the old bank" | `find_question_banks`, `get_question_bank` (read); `create_question_bank`, `update_question_bank` (write); `delete_question_bank` (destructive; takes id and name, refuses if the name does not belong to the id, so the name on the approval card is the bank that gets deleted) |
| `resume-screening` | M2 | Attach a resume: "Screen this for a Senior Backend Engineer" | `list_attachments`, `read_attachment` (read) |
| `interview-creation` | M2 | "Create a 45-minute technical interview for her with this resume and the Backend bank" | `list_email_templates` (read); `create_interview` (external) |

The model can also use `ask_user`, which shows a question card when it needs a detail only the recruiter knows.

A screening reply covers a candidate summary, strengths and gaps tied to the resume, a fit verdict (Strong fit / Possible fit / Not a fit) and a suggested interview setup. The prompt tells the model to judge only job-relevant evidence and to ignore personal attributes such as age, gender or nationality.

## How it works

```
AgentPanel (root layout, recruiter pages only)
  └─ AgentChat ── POST /api/agent/chat { threadId, message, pageContext } ──▶ next-route.ts
                                                                               │ session → AgentUser (id, org, role, cookie)
                                                                               ▼
                                         run-turn.ts: history from DB, page context, streamText + tools
                                                                               │
                         feature tool ── callAppApi(cookie) ──▶ existing route, e.g. /api/interviews, /api/create-interview
```

- **Same permissions as the recruiter.** Tools never touch the database. They call the app's own route handlers over loopback and forward the recruiter's session cookie. Org scoping, admin checks, validation, rate limits and invite emails behave exactly as they do from the UI. A tool that gets a 401 or 403 reports "permission denied" to the model.
- **Approvals.** `destructive` and `external` tools (deleting a question bank, creating an interview, which emails the candidate) pause the reply and show an approval card with the exact inputs. Nothing runs until the recruiter clicks Approve. Deny tells the model not to retry.
- **History lives on the server.** The client sends only its newest message. Earlier turns and tool results come from `agent_chat_messages`, so a client cannot rewrite them or forge a tool result. Conversations belong to one user in one organization, and every query checks both.
- **Attachments.** PDF, DOCX and TXT, up to 10MB, 5 per message (the same limits as the New Interview form). They are stored inline with the user's message. The model only sees "Attached file X". `read_attachment` extracts the text with the same parser as `/api/create-interview` (`src/lib/resume-text.ts`), and `create_interview` uploads the original file.
- **Page awareness.** On `/dashboard/<id>` and `/review/<id>` the client sends the interview id, so "this candidate" works. The composer shows what is in use ("Using this interview", "Using view: Question banks").
- **Links in answers** (`/dashboard/<id>`, `/questions`) navigate inside the app without a reload; from agent mode they drop to the side panel so the page and the conversation are both visible.
- **Off means off.** With `AGENT_CHAT=off` there is no Ask AI item, no request to `/api/agent`, and the assistant's code is never downloaded.
- **Data kept from the model.** `get_interview` drops the candidate token, the raw resume and photos. Tool output is capped at 12,000 characters.
- **Model.** Any OpenAI-compatible model with solid tool calling (`AGENT_AI_*`, falling back to `AI_*`). `<think>` reasoning is split out and shown collapsed.

Core files:

| File | Role |
|------|------|
| `src/lib/agent/features/*` | Features: tools and guidance. **Start here to add a capability** |
| `src/lib/agent/tools/call-app-api.ts` | Calls an app route as the user |
| `src/lib/agent/run-turn.ts` | One reply: history, pruning, prompt, approvals, step limit |
| `src/lib/agent/prompt.ts` | System prompt: product description and glossary |
| `src/lib/agent/registry.ts`, `approval.ts` | Tool catalog, lazy loading above 25 tools, approval policy by risk |
| `src/lib/agent/pg-store.ts` | Conversations in Postgres |
| `src/lib/agent/server.ts` | Session → `AgentUser`, feature switch, per-user rate limit (20 messages/min) |
| `src/components/agent-ui/*` | The UI kit: agent mode, side panel, conversation, tool activity, approval and question cards, markdown, attachments. Styles in `agent-ui.css` driven by `--agent-*` tokens mapped to the app's Inter font, indigo accent and grays |
| `src/components/agent/*` | App wiring behind `AGENT_CHAT`: `AgentRoot` (checks flag, session and route, lazy-loads the rest), `AgentHost` (name, greeting, suggestions, page context, in-app links), `agent-bridge.ts` (lets the Sidebar's Ask AI open it without loading it) |

## Adding a feature

1. Create `src/lib/agent/features/<id>.ts` with `defineFeature({ id, title, milestone, summary, guidance, tools })`.
2. Write each tool with `defineTool`. Give it a description written for the model, a zod input schema, a `risk` (`read`, `write`, `destructive` or `external`) and an `execute` that calls an existing route through `callAppApi`. If the action has no route yet, add the route first with its own auth checks, then call it.
3. Return small outputs: ids, names and the fields the model needs.
4. Add the feature to `ALL_FEATURES` in `features/index.ts` and to the table above. The UI labels tools from their names (`find_x` → "Searched x", `create_x` → "Creating x…"); for a risky tool whose effect is not obvious from its name, add a sentence to `approvalQuestion` in `src/components/agent-ui/utils.ts`. Name the input fields `<thing>Id` and `<thing>Name` so the approval card shows the name and hides the id.
5. Extend `src/lib/agent/tests/agent-flow.test.ts` and run `npm run test:agent`. The tests use a scripted model and a stub of the app API, so they need no key or database.

Use `isAvailable: (user) => user.roles.includes('admin')` to hide admin-only features from other users.

## Milestones

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M1 Foundation and read** | Agent mode and side panel, conversations, approvals, ask-user, feature switch. `interviews` and `question-banks` features | Done |
| **M2 Screen and create** | Attachments, `resume-screening`, `interview-creation` (with approval, uses the attached resume) | Done |
| **M3 Insights** | Compare candidates (the `/compare` view), pipeline summaries beyond the 100 most recent interviews (needs a paged, filtered interviews API), scoring status and re-scoring | Planned |
| **M4 Bulk and follow-up** | Create interviews for several resumes in one go, resend or extend invite links, manage email templates | Planned |
| **M5 Admin** | Team management and AI interviewer settings, admin-only and approval-gated | Planned |
| **M6 Platform** | Usage metering and per-user or per-org credit limits (`agent_usage` table, the `UsageMeter` hook is in place), resumable replies after a refresh (Redis), per-organization on/off, an audit log of assistant actions, evaluation suite | Planned |

## Limits today

- A reply stops if the tab is closed or reloaded mid-answer. The question and anything already streamed are saved. Continuing the reply is M6.
- `find_interviews` sees the organization's 100 most recent interviews, because that is what `/api/interviews` returns.
- Rate limits are in memory per server instance, like the rest of the app.
- No usage or cost tracking yet (M6).
