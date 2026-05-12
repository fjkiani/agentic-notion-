import { ChatOpenAI } from "@langchain/openai";

// ─── Model assignments (state-of-the-art free tier) ──────────────────────────
//
// ADVOCACY_PM        → Gemma 4 26B A4B (MoE, native function calling, thinking mode)
//                      Best for: structured planning, sprint decomposition, MCP tool calls
//
// RESEARCH_INTEL     → Qwen3 Coder 480B A35B (480B total / 35B active, 262K ctx)
//                      Best for: literature search, evidence synthesis, biomarker analysis
//                      Note: "Coder" is misleading — it's the best free model for tool use + long-context reasoning
//
// COALITION_BUILDER  → Arcee Trinity Large Thinking (reasoning model, agentic workloads)
//                      Best for: stakeholder mapping, coalition strategy, policy analysis
//
// STANDUP_REPORTER   → Qwen3 Next 80B A3B (RAG, multi-turn, deterministic summaries)
//                      Best for: aggregating task state, generating standup reports
//
// FALLBACK           → Nous Hermes 3 405B (frontier function calling, 131K ctx)
// EMERGENCY          → openrouter/free (auto-router, 200K ctx)

export const llmConfig = {
  ADVOCACY_PM: {
    model: "google/gemma-4-26b-a4b:free",
    temperature: 0.3,
    maxTokens: 4096,
  },
  RESEARCH_INTELLIGENCE: {
    model: "qwen/qwen3-coder-480b-a35b:free",
    temperature: 0.1,
    maxTokens: 8192,
  },
  COALITION_BUILDER: {
    model: "arcee-ai/trinity-large-thinking:free",
    temperature: 0.2,
    maxTokens: 8192,
  },
  STANDUP_REPORTER: {
    model: "qwen/qwen3-next-80b-a3b:free",
    temperature: 0.2,
    maxTokens: 2048,
  },
  FALLBACK: {
    model: "nousresearch/hermes-3-405b-instruct:free",
    temperature: 0.3,
    maxTokens: 4096,
  },
  EMERGENCY: {
    model: "openrouter/free",
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
        "HTTP-Referer": process.env.APP_URL ?? "https://zeta-caid.onrender.com",
        "X-Title": "Zeta CAID — Cancer Advocacy Intelligence Database",
      },
    },
  });
}

export function createFallbackLLM() {
  return createLLM("FALLBACK");
}
