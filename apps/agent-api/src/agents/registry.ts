import type { CompiledStateGraph } from "@langchain/langgraph";
import { createAdvocacyPMAgent } from "./advocacy-pm.js";
import { createResearchIntelligenceAgent } from "./research-intelligence.js";
import { createCoalitionBuilderAgent } from "./coalition-builder.js";
import { createStandupReporterAgent } from "./standup-reporter.js";

type AgentRole = "ADVOCACY_PM" | "RESEARCH_INTELLIGENCE" | "COALITION_BUILDER" | "STANDUP_REPORTER";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompiledGraph = CompiledStateGraph<any, any, any>;

class AgentRegistry {
  private agents = new Map<AgentRole, CompiledGraph>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[Agent Registry] Initializing agents...");

    try {
      const [pm, research, coalition, standup] = await Promise.all([
        createAdvocacyPMAgent(),
        createResearchIntelligenceAgent(),
        createCoalitionBuilderAgent(),
        createStandupReporterAgent(),
      ]);

      this.agents.set("ADVOCACY_PM", pm);
      this.agents.set("RESEARCH_INTELLIGENCE", research);
      this.agents.set("COALITION_BUILDER", coalition);
      this.agents.set("STANDUP_REPORTER", standup);

      this.initialized = true;
      console.log(`[Agent Registry] ${this.agents.size} agents ready`);
    } catch (error) {
      console.error("[Agent Registry] Failed to initialize:", error);
      throw error;
    }
  }

  get(role: AgentRole): CompiledGraph {
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`Agent not found: ${role}`);
    return agent;
  }

  getRoles(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  isReady(): boolean {
    return this.initialized;
  }
}

export const agentRegistry = new AgentRegistry();
export type { AgentRole };
