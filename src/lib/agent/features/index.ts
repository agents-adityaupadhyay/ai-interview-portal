import { ToolRegistry } from '../registry';
import type { ToolProvider } from '../types';
import { interviewCreationFeature } from './interview-creation';
import { interviewsFeature } from './interviews';
import { questionBanksFeature } from './question-banks';
import { resumeScreeningFeature } from './resume-screening';
import type { AgentFeature, FeatureDependencies } from './types';

// Every feature the assistant knows about, in prompt order. New capabilities
// are added here (see docs/ai-assistant.md for the milestone plan).
export const ALL_FEATURES: AgentFeature[] = [
  interviewsFeature,
  questionBanksFeature,
  resumeScreeningFeature,
  interviewCreationFeature,
];

// AGENT_FEATURES: comma-separated feature ids, or empty / "all" for all of them.
export const getEnabledFeatures = (): AgentFeature[] => {
  const raw = (process.env.AGENT_FEATURES || '').trim();

  if (raw === '' || raw.toLowerCase() === 'all') {
    return ALL_FEATURES;
  }

  const wanted = new Set(raw.split(',').map((id) => id.trim()).filter((id) => id !== ''));
  const unknown = Array.from(wanted).filter((id) => !ALL_FEATURES.some((feature) => feature.id === id));

  if (unknown.length > 0) {
    console.warn(`[agent] unknown AGENT_FEATURES ignored: ${unknown.join(', ')}`);
  }

  return ALL_FEATURES.filter((feature) => wanted.has(feature.id));
};

const toToolProvider = (feature: AgentFeature, dependencies: FeatureDependencies): ToolProvider => ({
  name: feature.id,
  title: feature.title,
  guidance: feature.guidance,
  isAvailable: feature.isAvailable,
  getTools: () => feature.tools(dependencies),
});

export const createFeatureProviders = (
  dependencies: FeatureDependencies,
  features: AgentFeature[] = getEnabledFeatures(),
): ToolProvider[] => features.map((feature) => toToolProvider(feature, dependencies));

export const createToolRegistry = (
  dependencies: FeatureDependencies,
  features?: AgentFeature[],
): ToolRegistry => new ToolRegistry(createFeatureProviders(dependencies, features));
