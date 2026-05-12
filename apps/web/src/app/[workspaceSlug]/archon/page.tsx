"use client";

import { useState } from "react";

const WORKFLOWS = [
  {
    id: "add-feature",
    name: "Add Feature",
    description: "Add any new feature to CAID. Archon plans, implements, validates, and creates a PR.",
    icon: "✨",
    examples: ["Add a timeline/Gantt view for campaigns", "Add email notifications for task deadlines"],
  },
  {
    id: "add-mcp-tool",
    name: "Add MCP Tool",
    description: "Add a new MCP tool to the CAID server. Auto-registered, available to all agents immediately.",
    icon: "🔧",
    examples: ["Add a tool to search FDA drug approvals", "Add a tool to fetch Congressional bill status"],
  },
  {
    id: "add-agent-role",
    name: "Add Agent Role",
    description: "Add a new AI agent role to the CAID agent API.",
    icon: "🤖",
    examples: ["Add a Grant Writer agent", "Add a Media Relations agent"],
  },
  {
    id: "add-view",
    name: "Add View",
    description: "Add a new UI view to CAID (timeline, calendar, table, map, etc.)",
    icon: "📊",
    examples: ["Add a calendar view for policy deadlines", "Add a map view for coalition geography"],
  },
  {
    id: "add-integration",
    name: "Add Integration",
    description: "Integrate CAID with an external service (Slack, Linear, GitHub, etc.)",
    icon: "🔗",
    examples: ["Add Slack notifications for agent runs", "Add GitHub Issues sync for tasks"],
  },
  {
    id: "extend-schema",
    name: "Extend Schema",
    description: "Add new database models or fields to the CAID schema.",
    icon: "🗄️",
    examples: ["Add a Grant model for tracking funding", "Add a MediaContact model for press outreach"],
  },
  {
    id: "fix-issue",
    name: "Fix Issue",
    description: "Fix a bug or issue in CAID. Archon diagnoses, fixes, tests, and PRs.",
    icon: "🐛",
    examples: ["Fix the kanban drag-and-drop on mobile", "Fix the evidence search pagination"],
  },
];

interface WorkflowRun {
  id: string;
  workflow: string;
  message: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  prUrl?: string;
  log: string[];
  startedAt: string;
}

export default function ArchonPage() {
  const [selectedWorkflow, setSelectedWorkflow] = useState("add-feature");
  const [message, setMessage] = useState("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSubmitting(true);

    // In production, this would call the Archon API
    // For now, we simulate the workflow submission
    const run: WorkflowRun = {
      id: `archon-${Date.now()}`,
      workflow: selectedWorkflow,
      message,
      status: "PENDING",
      log: [
        `[${new Date().toISOString()}] Workflow submitted: ${selectedWorkflow}`,
        `[${new Date().toISOString()}] Message: ${message}`,
        `[${new Date().toISOString()}] Archon will explore the codebase, plan the implementation, and create a PR.`,
        `[${new Date().toISOString()}] Run: archon run ${selectedWorkflow} --message "${message}"`,
      ],
      startedAt: new Date().toISOString(),
    };

    setRuns((prev) => [run, ...prev]);
    setMessage("");
    setIsSubmitting(false);

    // Simulate workflow progression
    setTimeout(() => {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === run.id
            ? {
                ...r,
                status: "RUNNING",
                log: [
                  ...r.log,
                  `[${new Date().toISOString()}] Archon: Exploring CAID codebase...`,
                  `[${new Date().toISOString()}] Archon: Loading zeta-codebase skill...`,
                  `[${new Date().toISOString()}] Archon: Planning implementation...`,
                ],
              }
            : r
        )
      );
    }, 2000);
  };

  const selectedWf = WORKFLOWS.find((w) => w.id === selectedWorkflow);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Archon Launcher</h1>
              <p className="text-sm text-gray-500">Extend CAID from inside CAID. Describe a feature → Archon builds it.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workflow selector */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Workflow</h2>
          {WORKFLOWS.map((wf) => (
            <button
              key={wf.id}
              onClick={() => setSelectedWorkflow(wf.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedWorkflow === wf.id
                  ? "border-purple-300 bg-purple-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{wf.icon}</span>
                <span className="font-medium text-sm text-gray-900">{wf.name}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-6">{wf.description}</p>
            </button>
          ))}
        </div>

        {/* Launcher */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{selectedWf?.icon}</span>
              <div>
                <h2 className="font-semibold text-gray-900">{selectedWf?.name}</h2>
                <p className="text-sm text-gray-500">{selectedWf?.description}</p>
              </div>
            </div>

            {/* Examples */}
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedWf?.examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setMessage(ex)}
                  className="text-xs px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Describe what you want to ${selectedWf?.name.toLowerCase()}...`}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              rows={4}
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">
                Archon will explore the codebase, plan, implement, validate, and create a PR.
              </p>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !message.trim()}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Launch Workflow"}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
            <h3 className="font-medium text-purple-900 mb-2 text-sm">How Archon works</h3>
            <div className="space-y-1 text-xs text-purple-700">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">1</span>
                <span>Archon reads the CAID codebase and loads the zeta-codebase skill</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">2</span>
                <span>Creates an implementation plan — you review and approve</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">3</span>
                <span>Implements the feature following CAID conventions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">4</span>
                <span>Runs validation (typecheck + lint + build)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">5</span>
                <span>Creates a PR → you merge → Render auto-deploys</span>
              </div>
            </div>
          </div>

          {/* Run history */}
          {runs.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-700 text-sm">Recent Runs</h3>
              {runs.map((run) => (
                <div key={run.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{run.workflow}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        run.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        run.status === "RUNNING" ? "bg-blue-100 text-blue-700" :
                        run.status === "FAILED" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {run.status}
                      </span>
                    </div>
                    {run.prUrl && (
                      <a href={run.prUrl} className="text-xs text-blue-600 hover:underline">View PR →</a>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{run.message}</p>
                  <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-32 overflow-y-auto">
                    {run.log.map((line, i) => (
                      <div key={i} className="opacity-80">{line}</div>
                    ))}
                    {run.status === "RUNNING" && (
                      <div className="text-gray-500 animate-pulse">Running...</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
