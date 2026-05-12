import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { createMCPClient } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Research Intelligence Agent for the Cancer Advocacy Intelligence Database (CAID).

Your role is to find, synthesize, and organize scientific and policy evidence to support cancer advocacy campaigns.

You have access to MCP tools to:
- Search PubMed for relevant publications (evidence_search_pubmed)
- Search ClinicalTrials.gov for relevant trials (trial_search_ctgov)
- Look up biomarkers in NCBI Gene (biomarker_lookup_ncbi)
- Save evidence to the database (evidence_create, evidence_bulk_create)
- Save and track clinical trials (trial_save, trial_link_campaign)
- Create and update biomarker records (biomarker_create)

When given a research request, you:
1. Identify the key cancer type(s), biomarker(s), and advocacy angle
2. Search PubMed for the strongest evidence (systematic reviews, meta-analyses, RCTs first)
3. Search ClinicalTrials.gov for relevant ongoing/completed trials
4. Look up biomarker details from NCBI if relevant
5. Synthesize findings into an advocacy-ready evidence brief
6. Save all relevant evidence to the database with proper categorization
7. Assign evidence strength (STRONG/MODERATE/WEAK) based on study design

Evidence strength criteria:
- STRONG: Systematic review, meta-analysis, Phase 3 RCT, FDA approval
- MODERATE: Phase 2 trial, cohort study, expert consensus
- WEAK: Case series, case report, preclinical data
- ANECDOTAL: Patient testimony, expert opinion without data

Always provide:
- A concise advocacy summary (2-3 sentences suitable for a policy brief)
- The strongest 3-5 pieces of evidence
- Gaps in the evidence base that advocacy could address
- Relevant ongoing trials patients could access`;

export async function createResearchIntelligenceAgent() {
  const llm = createLLM("RESEARCH_INTELLIGENCE");
  const mcpClient = createMCPClient();
  const tools = await mcpClient.toLangChainTools([
    "evidence_search_pubmed",
    "evidence_create",
    "evidence_bulk_create",
    "trial_search_ctgov",
    "trial_save",
    "trial_link_campaign",
    "biomarker_lookup_ncbi",
    "biomarker_create",
    "initiative_get",
    "campaign_get",
  ]);
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  async function researchNode(state: CAIDAgentStateType) {
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      phase: "RESEARCHING",
      iterationCount: state.iterationCount + 1,
    };
  }

  async function toolNode(rawState: unknown) {
    const state = rawState as CAIDAgentStateType;
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !(lastMessage as any)?.tool_calls?.length) {
      return { phase: "DONE" };
    }

    const toolResults = [];
    const mcpResults = [];
    const evidenceFound: string[] = [];

    for (const toolCall of ((lastMessage as any).tool_calls as any[])) {
      try {
        const result = await mcpClient.callTool(toolCall.name, toolCall.args as Record<string, unknown>);
        toolResults.push(new HumanMessage({ content: result }));
        mcpResults.push({
          tool: toolCall.name,
          result: result.substring(0, 500),
          timestamp: new Date().toISOString(),
        });

        // Track evidence created
        if (toolCall.name === "evidence_create" || toolCall.name === "evidence_bulk_create") {
          try {
            const parsed = JSON.parse(result) as { id?: string; evidence?: Array<{ id: string }> };
            if (parsed.id) evidenceFound.push(parsed.id);
            if (parsed.evidence) evidenceFound.push(...parsed.evidence.map((e) => e.id));
          } catch { /* ignore */ }
        }
      } catch (error) {
        toolResults.push(new HumanMessage({
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    }

    return {
      messages: toolResults,
      mcpResults,
      evidenceFound,
      phase: "PROCESSING",
    };
  }

  async function synthesizeNode(state: CAIDAgentStateType) {
    const synthesisPrompt = `${SYSTEM_PROMPT}

Based on your research, provide:
1. **Advocacy Summary** (2-3 sentences for a policy brief)
2. **Key Evidence** (top 3-5 findings with strength ratings)
3. **Evidence Gaps** (what's missing that advocacy could address)
4. **Relevant Trials** (ongoing trials patients could access)
5. **Recommended Actions** (specific advocacy steps based on the evidence)

Be concise and actionable. This will be used directly in advocacy materials.`;

    const messages = [
      new SystemMessage(synthesisPrompt),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    return {
      messages: [response],
      finalOutput: content,
      phase: "DONE",
    };
  }

  function shouldContinue(rawState: unknown): string {
    const state = rawState as CAIDAgentStateType;
    if (state.iterationCount >= 8) return "synthesize";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "tools";
    }
    return "synthesize";
  }

  const graph = new StateGraph(CAIDAgentState)
    .addNode("research", researchNode)
    .addNode("tools", toolNode)
    .addNode("synthesize", synthesizeNode)
    .addEdge(START, "research")
    .addConditionalEdges("research", shouldContinue, {
      tools: "tools",
      synthesize: "synthesize",
    })
    .addEdge("tools", "research")
    .addEdge("synthesize", END);

  return graph.compile({ checkpointer });
}
