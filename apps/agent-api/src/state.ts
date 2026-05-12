import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// ─── Shared CAID Agent State ──────────────────────────────────────────────────

export const CAIDAgentState = Annotation.Root({
  // Core conversation
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Context
  workspaceId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  orgId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  campaignId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  initiativeId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  role: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "ADVOCACY_PM",
  }),

  // Execution tracking
  phase: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "INIT",
  }),
  iterationCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),

  // MCP tool results accumulator
  mcpResults: Annotation<Array<{ tool: string; result: string; timestamp: string }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // Tasks created by this agent run
  tasksCreated: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // Evidence found by this agent run
  evidenceFound: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // Human-in-the-loop
  pendingApproval: Annotation<{
    message: string;
    proposedActions: Array<{ type: string; description: string }>;
  } | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),

  // Final output
  finalOutput: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),

  // Error tracking
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // Agent run ID for DB logging
  agentRunId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

// Explicit interface so TypeScript resolves all fields correctly
export interface CAIDAgentStateType {
  messages: BaseMessage[];
  workspaceId: string;
  orgId: string | undefined;
  campaignId: string | undefined;
  initiativeId: string | undefined;
  role: string;
  phase: string;
  iterationCount: number;
  mcpResults: Array<{ tool: string; result: string; timestamp: string }>;
  tasksCreated: string[];
  evidenceFound: string[];
  pendingApproval: { message: string; proposedActions: Array<{ type: string; description: string }> } | undefined;
  finalOutput: string | undefined;
  errors: string[];
  agentRunId: string | undefined;
}
