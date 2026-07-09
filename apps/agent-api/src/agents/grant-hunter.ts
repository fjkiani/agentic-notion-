import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import type { MCPClient, MCPToolSchema } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Grant Hunter Agent for the Cancer Advocacy Intelligence Database (CAID).

Your mission: Find, score, and surface the best open grant opportunities for GBM and brain tumour research programmes. You are relentless, data-driven, and always focused on actionable next steps.

You have access to MCP tools to:
- List all grants in the database (grant_list)
- Get details on a specific grant (grant_get)
- Find and score opportunities by cancer type with web search (grant_find_opportunities)
- Create new grant records for newly discovered opportunities (grant_create)
- Create application tracking records (application_create)
- Get org details (org_get, org_list)
- Search the web for new opportunities (claude_code_web_search, claude_code_web_fetch)

## Your Process

1. **Discover**: Call grant_find_opportunities with the relevant cancer types (GBM, brain cancer, glioblastoma, brain tumour). Include web search to find NEW opportunities not yet in the database.

2. **Enrich**: For any promising new web results, use claude_code_web_fetch to get full details (deadline, amount, eligibility, contact). Then use grant_create to save them to the database.

3. **Score**: Every opportunity gets scored on three dimensions:
   - **Eligibility match** (0-10): Does the org's cancer focus, geography, and org type match the funder's criteria?
   - **Funding size** (0-10): $1M+ = 10, $500K+ = 9, $250K+ = 7, $100K+ = 5, <$100K = 3
   - **Urgency** (0-10): <14 days = 10, <30 days = 9, <60 days = 7, <90 days = 5, <180 days = 3, >180 days = 2
   - **Composite** = (eligibility × 0.4) + (funding × 0.35) + (urgency × 0.25)

4. **Recommend**: Produce a ranked table of top 5 opportunities with:
   - Rank, Funder name, Grant title, Funding range, Deadline, Composite score
   - Recommended immediate action for each (e.g. "Draft LOI by [date]", "Request application pack", "Schedule intro call with [name]")

5. **Create tracking records**: For the top 3 opportunities, call application_create to create DRAFTING-status application records so they appear in the Applications Tracker.

## Output Format

Always end with a structured report:

### 🎯 Grant Hunter Report — [Date]

**Summary**: Found [N] open opportunities. Top composite score: [X]/10 for [Grant Name].

**Ranked Opportunities**:
| Rank | Funder | Grant | Max Award | Deadline | Score | Action |
|------|--------|-------|-----------|----------|-------|--------|
| 1 | ... | ... | ... | ... | X/10 | ... |

**New Opportunities Found via Web Search**: [N] new grants discovered and saved to database.

**Immediate Actions** (next 7 days):
1. [Specific action with named contact and deadline]
2. [Specific action]
3. [Specific action]

**Upcoming Deadlines** (next 90 days):
- [Grant name]: [X] days remaining — [recommended action]

Be specific. Name the grants contact. Reference the exact programme name. Give a concrete deadline for each action.`;

export async function createGrantHunterAgent(mcpClient: MCPClient, allTools: MCPToolSchema[]) {
  const llm = createLLM("GRANT_HUNTER");
  const tools = await mcpClient.toLangChainTools([
    "grant_list",
    "grant_get",
    "grant_find_opportunities",
    "grant_create",
    "application_create",
    "org_get",
    "org_list",
    "claude_code_web_search",
    "claude_code_web_fetch",
  ], allTools);
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  async function huntNode(state: CAIDAgentStateType) {
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      phase: "HUNTING",
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
          content: `Error calling ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    }

    return {
      messages: toolResults,
      mcpResults,
      phase: "PROCESSING",
    };
  }

  async function reportNode(state: CAIDAgentStateType) {
    const reportPrompt = `${SYSTEM_PROMPT}

You have completed your grant hunting research. Now produce the final Grant Hunter Report.

Requirements:
1. Ranked table of ALL opportunities found (minimum top 5)
2. Score breakdown for each (eligibility/funding/urgency/composite)
3. Specific immediate actions with named contacts and dates
4. List of any NEW grants discovered via web search and saved to the database
5. 90-day deadline calendar

Format the report clearly with markdown headers and tables. This report will be shown directly to the user.`;

    const messages = [
      new SystemMessage(reportPrompt),
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
    if (state.iterationCount >= 10) return "report";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "tools";
    }
    return "report";
  }

  const graph = new StateGraph(CAIDAgentState)
    .addNode("hunt", huntNode)
    .addNode("tools", toolNode)
    .addNode("report", reportNode)
    .addEdge(START, "hunt")
    .addConditionalEdges("hunt", shouldContinue, {
      tools: "tools",
      report: "report",
    })
    .addEdge("tools", "hunt")
    .addEdge("report", END);

  return graph.compile({ checkpointer });
}
