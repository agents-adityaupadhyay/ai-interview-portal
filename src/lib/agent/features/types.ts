import type { ChatStore } from '../store';
import type { AgentToolDefinition, AgentUser } from '../types';

export type FeatureDependencies = {
  store: ChatStore;
};

// One capability of the assistant: its tools plus what the model should know
// to use them. Add a feature by writing a module like interviews.ts and listing
// it in features/index.ts; AGENT_FEATURES picks which ones are switched on.
export type AgentFeature = {
  // Stable id used in AGENT_FEATURES, e.g. "interviews".
  id: string;
  title: string;
  // Delivery milestone, see docs/ai-assistant.md.
  milestone: string;
  // One line for humans (docs, /api/agent/features).
  summary: string;
  // Prompt guidance: workflows and rules specific to this feature.
  guidance: string;
  isAvailable?: (user: AgentUser) => boolean;
  tools: (dependencies: FeatureDependencies) => AgentToolDefinition[];
};

export const defineFeature = (feature: AgentFeature): AgentFeature => feature;

// Mirrors the options of the New Interview form (src/app/new/page.tsx).
export const LEVELS = ['Intern', 'Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager', 'Director'] as const;
export const ROUND_TYPES = [
  'General', 'Technical', 'Behavioral', 'System Design', 'Coding', 'HR', 'Culture Fit', 'Managerial', 'Case Study', 'Puzzle',
] as const;
export const CODING_LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'Haskell', 'Kotlin', 'Swift', 'Ruby', 'C#', 'Scala', 'SQL', 'PHP',
] as const;
export const FOCUS_AREAS = [
  'Technical Skills', 'Behavioral', 'System Design', 'Problem Solving', 'Leadership', 'Communication', 'Domain Knowledge',
  'Customer Handling', 'Process & Operations', 'People Management', 'Analytical Thinking', 'Culture Fit',
  'Stakeholder Management', 'Project Management',
] as const;
