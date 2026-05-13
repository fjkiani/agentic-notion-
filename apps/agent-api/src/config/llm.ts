import { ChatOpenAI } from "@langchain/openai";

// ─── Model assignments ────────────────────────────────────────────────────────
//
// Using OpenAI OSS models via OpenRouter (currently the most reliable free tier)
//
// ADVOCACY_PM        → GPT-OSS 120B (best for structured planning, tool calls)
// RESEARCH_INTEL     → GPT-OSS 120B (best for long-context reasoning, evidence synthesis)
// COALITION_BUILDER  → GPT-OSS 120B (best for stakeholder analysis)
// STANDUP_REPORTER   → GPT-OSS 20B  (lighter model, good for summarization)
// FALLBACK           → GPT-OSS 20B
// EMERGENCY          → GPT-OSS 20B

export const llmConfig = {
  ADVOCACY_PM: {
    model: "openai/gpt-oss-120b:free",
    temperature: 0.3,
    maxTokens: 4096,
  },
  RESEARCH_INTELLIGENCE: {
    model: "openai/gpt-oss-120b:free",
    temperature: 0.1,
    maxTokens: 8192,
  },
  COALITION_BUILDER: {
    model: "openai/gpt-oss-120b:free",
    temperature: 0.2,
    maxTokens: 8192,
  },
  STANDUP_REPORTER: {
    model: "openai/gpt-oss-20b:free",
    temperature: 0.2,
    maxTokens: 2048,
  },
  FALLBACK: {
    model: "openai/gpt-oss-20b:free",
    temperature: 0.3,
    maxTokens: 4096,
  },
  EMERGENCY: {
    model: "openai/gpt-oss-20b:free",
    temperature: 0.3,
    maxTokens: 4096,
  },
} as const;

export type AgentRoleKey = keyof typeof llmConfig;

export function createLLM(role: AgentRoleKey, overrides?: { temperature?: number; maxTokens?: number }) {
  const config = llmConfig[role];
  return new ChatOpenAI({
    modelName: config.model,
    temperature: overrides?.temperature ?? config.temperature,
    maxTokens: overrides?.maxTokens ?? config.maxTokens,
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL ?? "https://agentic-notion-web.onrender.com",
        "X-Title": "Zeta CAID — Cancer Advocacy Intelligence Database",
      },
    },
  });
}

export function createFallbackLLM() {
  return createLLM("FALLBACK");
}
