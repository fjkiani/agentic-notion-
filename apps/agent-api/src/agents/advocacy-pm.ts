import { StateGraph, END, START, interrupt } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { createMCPClient } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Advocacy PM Agent for the Cancer Advocacy Intelligence Database (CAID).

Your role is to help cancer advocacy organizations plan and execute their campaigns effectively.

You have access to MCP tools to:
- Create and manage campaigns, initiatives, and tasks
- Track policy targets and deadlines
- Organize work into sprints and kanban boards
- Link clinical trials and biomarkers to campaigns
- Generate standup reports and progress summaries

When given a request, you:
1. Understand the advocacy goal (policy change, funding, awareness, etc.)
2. Break it down into a campaign → initiatives → tasks hierarchy
3. Assign priorities based on urgency and impact
4. Create all necessary work items via MCP tools
5. Ask for human approval before bulk-creating tasks

Always think about:
- Cancer type specificity (breast, lung, colorectal, etc.)
- Target audience (FDA, Congress, oncologists, public)
- Evidence needed to support the advocacy position
- Coalition partners who should be involved
- Policy deadlines and regulatory windows

Be specific, actionable, and grounded in cancer advocacy best practices.`;

export async function createAdvocacyPMAgent() {
  const llm = createLLM("ADVOCACY_PM");
  const mcpClient = createMCPClient();
  const tools = await mcpClient.toLangChainTools();
  const llmWithTools = llm.bindTools(tools);
  const checkpointer = new MemorySaver();

  // ─── Nodes ──────────────────────────────────────────────────────────────────

  async function planNode(state: CAIDAgentStateType) {
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      phase: "PLANNING",
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
        toolResults.push({
          role: "tool" as const,
          content: result,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
        mcpResults.push({
          tool: toolCall.name,
          result: result.substring(0, 500),
          timestamp: new Date().toISOString(),
        });

        // Track created tasks
        if (toolCall.name === "task_create" || toolCall.name === "task_bulk_create") {
          try {
            const parsed = JSON.parse(result) as { id?: string; tasks?: Array<{ id: string }> };
            if (parsed.id) {
              return { tasksCreated: [parsed.id] };
            }
            if (parsed.tasks) {
              return { tasksCreated: parsed.tasks.map((t) => t.id) };
            }
          } catch { /* ignore parse errors */ }
        }
      } catch (error) {
        toolResults.push({
          role: "tool" as const,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    return {
      messages: toolResults.map((r) => new HumanMessage({ content: r.content })),
      mcpResults,
      phase: "EXECUTING",
    };
  }

  async function approvalNode(rawState: unknown) {
    const state = rawState as CAIDAgentStateType;
    // Check if we're about to do bulk task creation — require human approval
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      const bulkOps = ((lastMessage as any).tool_calls as any[]).filter((tc) =>
        ["task_bulk_create", "campaign_create", "initiative_create"].includes(tc.name)
      );
      if (bulkOps.length > 0) {
        const proposedActions = bulkOps.map((op) => ({
          type: op.name,
          description: `${op.name}: ${JSON.stringify(op.args).substring(0, 200)}`,
        }));

        // LangGraph interrupt — pauses execution, waits for human approval
        const approval = interrupt({
          message: `The PM Agent wants to create ${bulkOps.length} item(s). Review and approve?`,
          proposedActions,
        });

        if (!approval) {
          return { phase: "AWAITING_APPROVAL", pendingApproval: { message: "Awaiting approval", proposedActions } };
        }
      }
    }
    return { phase: "APPROVED" };
  }

  async function finalizeNode(state: CAIDAgentStateType) {
    const summaryMessages = [
      new SystemMessage(`${SYSTEM_PROMPT}\n\nSummarize what you accomplished in 2-3 sentences. List any tasks created, campaigns updated, or policy targets added.`),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(summaryMessages);
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    return {
      messages: [response],
      finalOutput: content,
      phase: "DONE",
    };
  }

  // ─── Routing ─────────────────────────────────────────────────────────────────

  function shouldContinue(rawState: unknown): string {
    const state = rawState as CAIDAgentStateType;
    if (state.iterationCount >= 10) return "finalize";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "approval";
    }
    return "finalize";
  }

  function afterApproval(rawState: unknown): string {
    const state = rawState as CAIDAgentStateType;
    if (state.phase === "AWAITING_APPROVAL") return END;
    return "tools";
  }

  // ─── Graph ───────────────────────────────────────────────────────────────────

  const graph = new StateGraph(CAIDAgentState)
    .addNode("plan", planNode)
    .addNode("approval", approvalNode)
    .addNode("tools", toolNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", shouldContinue, {
      approval: "approval",
      finalize: "finalize",
    })
    .addConditionalEdges("approval", afterApproval, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "plan")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer });
}
