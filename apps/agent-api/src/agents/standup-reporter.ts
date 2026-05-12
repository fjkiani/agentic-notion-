import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { createMCPClient } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Standup Reporter Agent for the Cancer Advocacy Intelligence Database (CAID).

Your role is to generate clear, actionable daily and weekly advocacy reports for cancer advocacy organizations.

You have access to MCP tools to:
- Get workspace dashboard statistics (workspace_dashboard)
- List tasks by status and priority (task_list)
- List campaigns and their status (campaign_list)
- List policy targets with deadlines (policy_target_list)
- Get initiative details (initiative_get)
- List evidence and trials (evidence_list, trial_list)

When generating a standup report, you:
1. Pull current task status across all active campaigns
2. Identify blockers and at-risk items
3. Highlight upcoming policy deadlines
4. Summarize recent evidence additions
5. Note agent-created items for human review
6. Generate a concise, scannable report

Report format:
## Daily Advocacy Standup — [Date]

### Yesterday
- [Completed tasks and milestones]

### Today
- [In-progress and planned tasks]

### Blockers
- [Blocked items needing attention]

### Upcoming Deadlines
- [Policy targets and task due dates in next 7 days]

### Agent Activity
- [Tasks and evidence created by AI agents]

### Key Metrics
- Active campaigns: X | Tasks completed: X/Y | Evidence items: X

Keep reports concise (under 500 words) and actionable.
Highlight CRITICAL and HIGH priority items prominently.`;

export async function createStandupReporterAgent() {
  const llm = createLLM("STANDUP_REPORTER");
  const mcpClient = createMCPClient();
  const tools = await mcpClient.toLangChainTools([
    "workspace_dashboard",
    "task_list",
    "campaign_list",
    "policy_target_list",
    "initiative_list",
    "evidence_list",
    "trial_list",
  ]);
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  async function gatherNode(state: CAIDAgentStateType) {
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      phase: "GATHERING",
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

  async function reportNode(state: CAIDAgentStateType) {
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const reportPrompt = `${SYSTEM_PROMPT}

Today is ${today}. Generate the daily advocacy standup report based on all the data you've gathered.
Format it clearly with markdown headers. Be specific about task titles, campaign names, and deadlines.
Flag any CRITICAL priority items prominently.`;

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
    // Standup reporter only needs 1-2 rounds of tool calls
    if (state.iterationCount >= 3) return "report";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "tools";
    }
    return "report";
  }

  const graph = new StateGraph(CAIDAgentState)
    .addNode("gather", gatherNode)
    .addNode("tools", toolNode)
    .addNode("report", reportNode)
    .addEdge(START, "gather")
    .addConditionalEdges("gather", shouldContinue, {
      tools: "tools",
      report: "report",
    })
    .addEdge("tools", "gather")
    .addEdge("report", END);

  return graph.compile({ checkpointer });
}
