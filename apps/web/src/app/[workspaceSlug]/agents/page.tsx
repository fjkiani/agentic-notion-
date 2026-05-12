"use client";

import { useState, useEffect, useRef } from "react";
import { startAgentRun, streamAgentRun, approveAgentRun } from "@/lib/api";

const AGENT_ROLES = [
  {
    id: "ADVOCACY_PM",
    name: "Advocacy PM",
    description: "Plans campaigns, creates tasks, manages sprints",
    icon: "🤖",
    model: "Gemma 4 26B A4B",
    color: "blue",
    examples: [
      "Set up a new BRCA1 biomarker testing advocacy campaign",
      "Create a sprint for our FDA engagement initiative",
      "Plan outreach tasks for our lung cancer coalition",
    ],
  },
  {
    id: "RESEARCH_INTELLIGENCE",
    name: "Research Intelligence",
    description: "Searches PubMed, synthesizes evidence, tracks trials",
    icon: "🔬",
    model: "Qwen3 Coder 480B A35B",
    color: "green",
    examples: [
      "Find evidence supporting EGFR testing in lung cancer",
      "Search for recent BRCA1/2 clinical trials recruiting patients",
      "Synthesize evidence on liquid biopsy for early detection",
    ],
  },
  {
    id: "COALITION_BUILDER",
    name: "Coalition Builder",
    description: "Maps stakeholders, builds coalitions, tracks policy",
    icon: "🤝",
    model: "Arcee Trinity Large Thinking",
    color: "purple",
    examples: [
      "Map coalition partners for our FDA biomarker guidance campaign",
      "Identify stakeholders for a Medicare coverage advocacy effort",
      "Build a coalition strategy for the CANCER Act reauthorization",
    ],
  },
  {
    id: "STANDUP_REPORTER",
    name: "Standup Reporter",
    description: "Generates daily/weekly advocacy reports",
    icon: "📊",
    model: "Qwen3 Next 80B A3B",
    color: "orange",
    examples: [
      "Generate today's advocacy standup report",
      "Summarize this week's campaign progress",
      "What are our upcoming policy deadlines?",
    ],
  },
];

interface AgentMessage {
  id: string;
  role: string;
  content: string;
  thinking?: string;
  order: number;
}

interface AgentRun {
  id: string;
  status: string;
  role: string;
  output?: { finalOutput?: string };
  messages: AgentMessage[];
}

export default function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [selectedRole, setSelectedRole] = useState("ADVOCACY_PM");
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const streamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setWorkspaceSlug(p.workspaceSlug);
      if (sp.role) setSelectedRole(sp.role);
    });
  }, [params, searchParams]);

  // Get workspace ID from slug
  useEffect(() => {
    if (!workspaceSlug) return;
    fetch(`/api/workspace?slug=${workspaceSlug}`)
      .then((r) => r.json())
      .then((data: { id?: string }) => { if (data.id) setWorkspaceId(data.id); })
      .catch(console.error);
  }, [workspaceSlug]);

  const handleRun = async () => {
    if (!message.trim() || !workspaceId) return;
    setIsRunning(true);
    setStreamMessages([]);
    setCurrentRun(null);

    try {
      const { runId } = await startAgentRun({
        workspaceId,
        role: selectedRole,
        message,
      });

      // Stream updates
      streamRef.current = streamAgentRun(
        runId,
        (event) => {
          if (event.type === "message") {
            const msg = event.message as AgentMessage;
            if (msg.content) {
              setStreamMessages((prev) => [...prev, `[${msg.role}] ${msg.content.substring(0, 200)}`]);
            }
          }
          if (event.type === "status") {
            if (event.status === "AWAITING_APPROVAL") {
              setCurrentRun((prev) => prev ? { ...prev, status: "AWAITING_APPROVAL" } : null);
            }
          }
          if (event.type === "done") {
            const run = event.run as AgentRun;
            setCurrentRun(run);
            setIsRunning(false);
          }
        },
        () => setIsRunning(false)
      );

      setCurrentRun({ id: runId, status: "RUNNING", role: selectedRole, messages: [] });
    } catch (error) {
      console.error("Agent run error:", error);
      setIsRunning(false);
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!currentRun) return;
    await approveAgentRun(currentRun.id, approved);
    setCurrentRun((prev) => prev ? { ...prev, status: approved ? "RUNNING" : "CANCELLED" } : null);
  };

  const selectedAgent = AGENT_ROLES.find((r) => r.id === selectedRole);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">AI Agents</h1>
          <p className="text-sm text-gray-500">Cancer advocacy intelligence powered by state-of-the-art free LLMs</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Agent selector */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Select Agent</h2>
          {AGENT_ROLES.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedRole(agent.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedRole === agent.id
                  ? "border-red-300 bg-red-50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xl">{agent.icon}</span>
                <span className="font-medium text-gray-900 text-sm">{agent.name}</span>
              </div>
              <p className="text-xs text-gray-500 ml-8">{agent.description}</p>
              <p className="text-xs text-purple-600 ml-8 mt-1 font-mono">{agent.model}</p>
            </button>
          ))}
        </div>

        {/* Chat interface */}
        <div className="lg:col-span-2 space-y-4">
          {/* Input */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{selectedAgent?.icon}</span>
              <span className="font-medium text-gray-900">{selectedAgent?.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{selectedAgent?.model}</span>
            </div>

            {/* Example prompts */}
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedAgent?.examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setMessage(ex)}
                  className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  {ex.substring(0, 50)}...
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Ask the ${selectedAgent?.name} agent...`}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleRun}
                disabled={isRunning || !message.trim()}
                className="bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running...
                  </span>
                ) : "Run Agent"}
              </button>
            </div>
          </div>

          {/* Approval gate */}
          {currentRun?.status === "AWAITING_APPROVAL" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-medium text-yellow-800 mb-2">Agent Requesting Approval</h3>
              <p className="text-sm text-yellow-700 mb-4">
                The agent wants to create items in the database. Review and approve?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleApprove(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApprove(false)}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Stream output */}
          {(isRunning || streamMessages.length > 0) && (
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                {isRunning && <span className="w-2 h-2 bg-green-400 rounded-full streaming-dot" />}
                <span>Agent stream</span>
              </div>
              {streamMessages.map((msg, i) => (
                <div key={i} className="mb-1 opacity-80">{msg}</div>
              ))}
              {isRunning && <div className="text-gray-500 animate-pulse">Processing...</div>}
            </div>
          )}

          {/* Final output */}
          {currentRun?.output?.finalOutput && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-green-500">✓</span>
                <h3 className="font-medium text-gray-900">Agent Output</h3>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  currentRun.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {currentRun.status}
                </span>
              </div>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {currentRun.output.finalOutput}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
