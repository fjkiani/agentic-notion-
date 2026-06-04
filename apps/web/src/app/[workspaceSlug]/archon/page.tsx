"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:3002";

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

interface LogLine {
  type: "stdout" | "stderr" | "info" | "error" | "done" | "approval";
  text: string;
  nodeId: string;
  ts: string;
}

interface WorkflowRun {
  id: string;
  runId?: string;
  workflow: string;
  message: string;
  status: "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED";
  log: LogLine[];
  startedAt: string;
  pendingApproval?: { message: string; nodeId: string };
}

function LogTerminal({ run, onApprove }: { run: WorkflowRun; onApprove: (runId: string, approved: boolean, feedback?: string) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.log.length]);

  const lineColor = (type: LogLine["type"]) => {
    switch (type) {
      case "stdout": return "text-green-400";
      case "stderr": return "text-yellow-400";
      case "error": return "text-red-400";
      case "info": return "text-blue-300";
      case "done": return "text-purple-300 font-bold";
      case "approval": return "text-orange-300 font-bold";
      default: return "text-gray-300";
    }
  };

  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-gray-400 font-mono">archon — {run.workflow}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-mono ${
          run.status === "COMPLETED" ? "bg-green-900 text-green-300" :
          run.status === "RUNNING" ? "bg-blue-900 text-blue-300" :
          run.status === "AWAITING_APPROVAL" ? "bg-orange-900 text-orange-300" :
          run.status === "FAILED" ? "bg-red-900 text-red-300" :
          "bg-gray-800 text-gray-400"
        }`}>
          {run.status}
        </span>
      </div>

      {/* Log output */}
      <div className="p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-0.5">
        {run.log.map((line, i) => (
          <div key={i} className={`${lineColor(line.type)} leading-relaxed`}>
            <span className="text-gray-600 mr-2 select-none">
              {new Date(line.ts).toLocaleTimeString()}
            </span>
            {line.nodeId !== "runner" && (
              <span className="text-gray-500 mr-2">[{line.nodeId}]</span>
            )}
            {line.text}
          </div>
        ))}
        {run.status === "RUNNING" && (
          <div className="text-gray-500 animate-pulse">▋</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Approval gate UI */}
      {run.status === "AWAITING_APPROVAL" && run.pendingApproval && run.runId && (
        <div className="border-t border-orange-900 bg-orange-950 p-4">
          <p className="text-orange-300 text-sm font-medium mb-2">
            Approval Required — {run.pendingApproval.nodeId}
          </p>
          <p className="text-orange-200 text-xs mb-3">{run.pendingApproval.message}</p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback or instructions..."
            className="w-full bg-gray-900 border border-orange-800 rounded p-2 text-xs text-gray-200 resize-none mb-3 focus:outline-none focus:ring-1 focus:ring-orange-500"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onApprove(run.runId!, true, feedback || undefined); setFeedback(""); }}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-2 rounded font-medium transition-colors"
            >
              Approve & Continue
            </button>
            <button
              onClick={() => { onApprove(run.runId!, false, feedback || "Rejected by user"); setFeedback(""); }}
              className="flex-1 bg-red-800 hover:bg-red-700 text-white text-xs py-2 rounded font-medium transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArchonPage() {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;

  const [selectedWorkflow, setSelectedWorkflow] = useState("add-feature");
  const [message, setMessage] = useState("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const selectedWf = WORKFLOWS.find((w) => w.id === selectedWorkflow);

  const appendLog = useCallback((runId: string, line: LogLine) => {
    setRuns((prev) =>
      prev.map((r) => r.id === runId ? { ...r, log: [...r.log, line] } : r)
    );
  }, []);

  const updateRunStatus = useCallback((runId: string, status: WorkflowRun["status"], extra?: Partial<WorkflowRun>) => {
    setRuns((prev) =>
      prev.map((r) => r.id === runId ? { ...r, status, ...extra } : r)
    );
  }, []);

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setApiError(null);

    const localId = `archon-${Date.now()}`;
    const run: WorkflowRun = {
      id: localId,
      workflow: selectedWorkflow,
      message,
      status: "PENDING",
      log: [{
        type: "info",
        text: `Launching workflow: ${selectedWorkflow}`,
        nodeId: "runner",
        ts: new Date().toISOString(),
      }],
      startedAt: new Date().toISOString(),
    };

    setRuns((prev) => [run, ...prev]);
    setMessage("");
    setIsSubmitting(false);

    // Open SSE connection to real Archon runner
    try {
      const resp = await fetch(`${AGENT_API}/api/archon/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: selectedWorkflow, message }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => resp.statusText);
        setApiError(`Archon API error: ${resp.status} — ${errText}`);
        updateRunStatus(localId, "FAILED");
        return;
      }

      updateRunStatus(localId, "RUNNING");

      // Read SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "log";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6)) as LogLine & { runId?: string; message?: string };

              if (eventType === "done") {
                updateRunStatus(localId, payload.text?.startsWith("SUCCESS") ? "COMPLETED" : "FAILED");
                appendLog(localId, { ...payload, type: "done" });
              } else if (eventType === "approval") {
                updateRunStatus(localId, "AWAITING_APPROVAL", {
                  runId: payload.runId,
                  pendingApproval: { message: payload.message ?? "", nodeId: payload.nodeId },
                });
                appendLog(localId, { ...payload, type: "approval", text: `APPROVAL REQUIRED: ${payload.message ?? ""}` });
              } else {
                appendLog(localId, payload);
              }
            } catch {
              // Non-JSON line, skip
            }
            eventType = "log"; // reset
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiError(`Connection error: ${msg}`);
      updateRunStatus(localId, "FAILED");
      appendLog(localId, { type: "error", text: msg, nodeId: "runner", ts: new Date().toISOString() });
    }
  };

  const handleApprove = async (runId: string, approved: boolean, feedback?: string) => {
    try {
      await fetch(`${AGENT_API}/api/archon/run/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, feedback }),
      });
      setRuns((prev) =>
        prev.map((r) =>
          r.runId === runId
            ? { ...r, status: "RUNNING", pendingApproval: undefined }
            : r
        )
      );
    } catch (err) {
      setApiError(`Approval error: ${err}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Archon Launcher</h1>
              <p className="text-sm text-gray-500">
                Extend CAID from inside CAID. Describe a feature → Archon builds it.
                <span className="ml-2 text-xs text-green-600 font-medium">● Live execution</span>
              </p>
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
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {apiError}
            </div>
          )}

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
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              placeholder={`Describe what you want to ${selectedWf?.name.toLowerCase()}...`}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              rows={4}
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">
                Archon will explore the codebase, plan, implement, validate, and create a PR.
                <span className="ml-1 text-gray-300">Cmd+Enter to launch.</span>
              </p>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !message.trim()}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Launching..." : "Launch Workflow"}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
            <h3 className="font-medium text-purple-900 mb-2 text-sm">How Archon works</h3>
            <div className="space-y-1 text-xs text-purple-700">
              {[
                "Reads the CAID codebase and loads the zeta-codebase skill",
                "Creates an implementation plan — you review and approve",
                "Implements the feature following CAID conventions",
                "Runs validation (typecheck + lint + build) — self-heals on failure",
                "Creates a PR → you merge → Render auto-deploys",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Run history */}
          {runs.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 text-sm">
                Run History ({runs.length})
              </h3>
              {runs.map((run) => (
                <div key={run.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {WORKFLOWS.find((w) => w.id === run.workflow)?.icon} {run.workflow}
                    </span>
                    <span className="text-xs text-gray-400">—</span>
                    <span className="text-xs text-gray-500 truncate max-w-xs">{run.message}</span>
                    {run.runId && (
                      <span className="ml-auto text-xs text-gray-400 font-mono">{run.runId.slice(0, 16)}</span>
                    )}
                  </div>
                  <LogTerminal run={run} onApprove={handleApprove} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
