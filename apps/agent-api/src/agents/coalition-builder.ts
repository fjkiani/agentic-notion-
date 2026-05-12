import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { createMCPClient } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Coalition Builder Agent for the Cancer Advocacy Intelligence Database (CAID).

Your role is to help cancer advocacy organizations build powerful coalitions, map stakeholders, and develop policy engagement strategies.

You have access to MCP tools to:
- List and analyze advocacy organizations (org_list, org_get)
- Create and manage coalitions (coalition_create, coalition_add_member)
- Track policy targets (policy_target_list, policy_target_create)
- Analyze campaigns for coalition opportunities (campaign_get, campaign_list)
- Create tasks for coalition outreach (task_create, task_bulk_create)

When given a coalition-building request, you:
1. Analyze the advocacy goal and identify the policy target
2. Map potential coalition partners by cancer type, org type, and mission alignment
3. Identify key stakeholders (patient groups, research institutes, industry, government)
4. Develop a coalition engagement strategy with specific outreach tasks
5. Create policy targets with deadlines and engagement status
6. Generate a stakeholder map with relationship recommendations

Coalition strategy framework:
- LEAD: Organizations that should anchor the coalition (largest, most credible)
- CORE: Organizations with direct stake in the issue
- SUPPORTING: Organizations with adjacent interests
- OBSERVERS: Organizations to keep informed but not actively engage

Policy engagement priorities:
- FDA: Drug approvals, companion diagnostics, biomarker guidance
- CMS: Coverage decisions, reimbursement policies
- Congress: Legislation, appropriations, oversight
- State: Medicaid coverage, insurance mandates, research funding

Always think about:
- Avoiding conflicts of interest between coalition members
- Balancing patient groups with research/industry voices
- Timing relative to regulatory/legislative windows
- Geographic diversity for Congressional engagement`;

export async function createCoalitionBuilderAgent() {
  const llm = createLLM("COALITION_BUILDER");
  const mcpClient = createMCPClient();
  const tools = await mcpClient.toLangChainTools([
    "org_list",
    "org_get",
    "coalition_list",
    "coalition_create",
    "coalition_add_member",
    "policy_target_list",
    "policy_target_create",
    "campaign_get",
    "task_create",
    "task_bulk_create",
    "workspace_dashboard",
  ]);
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  async function analyzeNode(state: CAIDAgentStateType) {
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      phase: "ANALYZING",
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

    const { HumanMessage } = await import("@langchain/core/messages");
    const toolResults = [];
    const mcpResults = [];

    for (const toolCall of ((lastMessage as any).tool_calls as any[])) {
      try {
        const result = await mcpClient.callTool(toolCall.name, toolCall.args as Record<string, unknown>);
        toolResults.push(new HumanMessage({ content: result }));
        mcpResults.push({
          tool: toolCall.name,
          result: result.substring(0, 500),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        toolResults.push(new HumanMessage({
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    }

    return { messages: toolResults, mcpResults, phase: "PROCESSING" };
  }

  async function strategyNode(state: CAIDAgentStateType) {
    const strategyPrompt = `${SYSTEM_PROMPT}

Based on your analysis, provide a comprehensive coalition strategy:

1. **Coalition Structure** — Lead, Core, Supporting, Observer organizations
2. **Stakeholder Map** — Key contacts and their roles
3. **Policy Targets** — Specific regulatory/legislative targets with deadlines
4. **Engagement Timeline** — 30/60/90 day action plan
5. **Outreach Tasks** — Specific tasks created in the system
6. **Risk Assessment** — Potential conflicts or opposition

Format as a structured advocacy brief suitable for executive review.`;

    const messages = [
      new SystemMessage(strategyPrompt),
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
    if (state.iterationCount >= 8) return "strategy";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "tools";
    }
    return "strategy";
  }

  const graph = new StateGraph(CAIDAgentState)
    .addNode("analyze", analyzeNode)
    .addNode("tools", toolNode)
    .addNode("strategy", strategyNode)
    .addEdge(START, "analyze")
    .addConditionalEdges("analyze", shouldContinue, {
      tools: "tools",
      strategy: "strategy",
    })
    .addEdge("tools", "analyze")
    .addEdge("strategy", END);

  return graph.compile({ checkpointer });
}
