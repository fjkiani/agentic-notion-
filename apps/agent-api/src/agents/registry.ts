import type { CompiledStateGraph } from "@langchain/langgraph";
import { createAdvocacyPMAgent } from "./advocacy-pm.js";
import { createResearchIntelligenceAgent } from "./research-intelligence.js";
import { createCoalitionBuilderAgent } from "./coalition-builder.js";
import { createStandupReporterAgent } from "./standup-reporter.js";
import { createGrantHunterAgent } from "./grant-hunter.js";
import { createApplicationDrafterAgent } from "./application-drafter.js";
import {
  getSharedMCPClient,
  waitForMCPReady,
  type MCPClient,
  type MCPToolSchema,
} from "../mcp-client.js";

type AgentRole =
  | "ADVOCACY_PM"
  | "RESEARCH_INTELLIGENCE"
  | "COALITION_BUILDER"
  | "STANDUP_REPORTER"
  | "GRANT_HUNTER"
  | "APPLICATION_DRAFTER";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompiledGraph = CompiledStateGraph<any, any, any>;

class AgentRegistry {
  private agents = new Map<AgentRole, CompiledGraph>();
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.doInitialize();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInitialize(): Promise<void> {
    console.log("[Agent Registry] Initializing agents...");

    try {
      const mcpClient = getSharedMCPClient();
      await waitForMCPReady(mcpClient);

      // Single tools/list call shared across all agents (avoids 429 thundering herd)
      const allTools = await mcpClient.listTools();
      console.log(`[Agent Registry] Loaded ${allTools.length} MCP tools`);

      const [pm, research, coalition, standup, grantHunter, appDrafter] = await Promise.all([
        createAdvocacyPMAgent(mcpClient, allTools),
        createResearchIntelligenceAgent(mcpClient, allTools),
        createCoalitionBuilderAgent(mcpClient, allTools),
        createStandupReporterAgent(mcpClient, allTools),
        createGrantHunterAgent(mcpClient, allTools),
        createApplicationDrafterAgent(mcpClient, allTools),
      ]);

      this.agents.set("ADVOCACY_PM", pm);
      this.agents.set("RESEARCH_INTELLIGENCE", research);
      this.agents.set("COALITION_BUILDER", coalition);
      this.agents.set("STANDUP_REPORTER", standup);
      this.agents.set("GRANT_HUNTER", grantHunter);
      this.agents.set("APPLICATION_DRAFTER", appDrafter);

      this.initialized = true;
      console.log(`[Agent Registry] ${this.agents.size} agents ready`);
    } catch (error) {
      console.error("[Agent Registry] Failed to initialize:", error);
      throw error;
    }
  }

  get(role: AgentRole): CompiledGraph {
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`Agent not found: ${role}. Registry not ready yet.`);
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
export type { AgentRole, MCPClient, MCPToolSchema };
