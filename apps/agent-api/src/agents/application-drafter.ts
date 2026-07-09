import { StateGraph, END, START, interrupt } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import type { MCPClient, MCPToolSchema } from "../mcp-client.js";
import { CAIDAgentState } from "../state.js";
import type { CAIDAgentStateType } from "../state.js";

const SYSTEM_PROMPT = `You are the Application Drafter Agent for the Cancer Advocacy Intelligence Database (CAID).

Your mission: Draft complete, submission-ready grant applications for cancer research funding. You produce professional, compelling, funder-specific applications that win grants.

You have access to MCP tools to:
- Get org details (org_get, org_list)
- Get grant details (grant_get, grant_list, grant_find_opportunities)
- Create application tracking records (application_create)
- Update application status (application_update)
- Fetch web pages for funder guidelines (claude_code_web_fetch)
- Search for funder information (claude_code_web_search)

## Your Process

### Phase 1: Research & Eligibility (before drafting)
1. Get the org details (org_get) — understand their cancer focus, budget, team, strategic priorities
2. Get the grant details (grant_get or grant_find_opportunities) — understand eligibility, criteria, amounts, deadlines
3. Fetch the funder's application guidelines from their website (claude_code_web_fetch)
4. Assess eligibility: confidence %, fit score /10, key risks
5. Present your assessment and ask for approval before drafting

### Phase 2: Draft the Application (after approval)
Draft a complete application with these 5 sections:

**Section 1 — Executive Summary / Specific Aims (1 page)**
- 3 specific, measurable aims with clear outcomes
- Why this research matters now (urgency, unmet need)
- Expected impact on patients and the field
- Funder-specific framing (reference their stated priorities)

**Section 2 — Background & Significance**
- Current state of the field (cite key statistics)
- The specific gap this research addresses
- Why this team is uniquely positioned to address it
- Preliminary data or track record

**Section 3 — Innovation & Approach**
- What is genuinely new about this approach
- Methodology (high level — 3-5 key methods)
- Timeline with milestones (Year 1, Year 2, Year 3)
- Risk mitigation for key technical risks

**Section 4 — Budget Outline**
- Personnel (PI, co-investigators, postdocs, students) with % effort and justification
- Equipment and consumables
- Travel and dissemination
- Indirect costs / overheads (if applicable)
- Total ask with justification for the amount

**Section 5 — Cover Letter**
- Addressed to the named grants contact by name
- Opening hook referencing the funder's specific mission or recent news
- 3-sentence summary of the application
- Why this funder is the right partner
- Clear ask and next step
- Professional close

## Output Format

Always produce the full application as a single markdown document with clear section headers. Include:
- Word counts for each section
- A submission checklist at the end
- Recommended submission date (2 weeks before deadline)

Be specific. Use the org's actual research programme, team names, and cancer focus. Reference the funder's exact programme name and stated priorities. This is a real application, not a template.`;

export async function createApplicationDrafterAgent(mcpClient: MCPClient, allTools: MCPToolSchema[]) {
  const llm = createLLM("APPLICATION_DRAFTER");
  const tools = await mcpClient.toLangChainTools([
    "org_get",
    "org_list",
    "grant_get",
    "grant_list",
    "grant_find_opportunities",
    "application_create",
    "application_update",
    "claude_code_web_fetch",
    "claude_code_web_search",
  ], allTools);
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

  async function eligibilityNode(state: CAIDAgentStateType) {
    const eligibilityPrompt = `${SYSTEM_PROMPT}

You have completed your research. Now produce a concise eligibility assessment before drafting begins.

Format:
## Eligibility Assessment

**Confidence**: [X]% likely eligible
**Strategic Fit Score**: [X]/10
**Recommended Programme**: [exact programme name]
**Recommended Ask**: [amount with justification]
**Key Risks**: [2-3 specific risks]
**Recommended Submission Date**: [date — 2 weeks before deadline]

Then ask: "Shall I proceed with drafting the full application? Please confirm or provide any additional context (team details, preliminary data, specific aims you want to emphasise)."`;

    const messages = [
      new SystemMessage(eligibilityPrompt),
      ...state.messages,
    ];
    const response = await llmWithTools.invoke(messages);
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    return {
      messages: [response],
      finalOutput: content,
      phase: "AWAITING_APPROVAL",
      pendingApproval: true,
    };
  }

  async function draftNode(state: CAIDAgentStateType) {
    const draftPrompt = `${SYSTEM_PROMPT}

The user has approved proceeding with the full application draft. Now write the complete, submission-ready grant application.

Use all the research you have gathered. Produce all 5 sections in full. Do not use placeholder text — write the actual application content based on the org's real details.

After drafting, call application_create to create a tracking record with:
- orgId: [the org's ID]
- grantId: [the grant's ID if known]
- title: "[Grant Name] Application — [Org Name]"
- notes: "Draft generated by Application Drafter agent on [date]"
- nextStep: "Internal review and revision before submission by [recommended date]"
- internalScore: [your confidence score 1-10]
- funderScore: [strategic fit score 1-10]`;

    const messages = [
      new SystemMessage(draftPrompt),
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

  function shouldContinueResearch(rawState: unknown): string {
    const state = rawState as CAIDAgentStateType;
    if (state.iterationCount >= 6) return "eligibility";
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage as any)?.tool_calls?.length) {
      return "tools";
    }
    return "eligibility";
  }

  function afterApproval(rawState: unknown): string {
    const state = rawState as CAIDAgentStateType;
    // If approval was given (pendingApproval cleared), proceed to draft
    if (!state.pendingApproval) return "draft";
    return END;
  }

  const graph = new StateGraph(CAIDAgentState)
    .addNode("research", researchNode)
    .addNode("tools", toolNode)
    .addNode("eligibility", eligibilityNode)
    .addNode("draft", draftNode)
    .addEdge(START, "research")
    .addConditionalEdges("research", shouldContinueResearch, {
      tools: "tools",
      eligibility: "eligibility",
    })
    .addEdge("tools", "research")
    .addEdge("eligibility", END)  // Pauses for human approval
    .addEdge("draft", END);

  return graph.compile({ checkpointer });
}
