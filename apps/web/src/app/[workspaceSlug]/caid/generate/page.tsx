"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

interface OrgOption {
  id: string;
  name: string;
  externalId: string | null;
  country: string | null;
  cancerTypes: string[];
  researchSpend: number | null;
}

type DossierType = "PITCH" | "LOI" | "EMAIL" | "APPLICATION";
type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const DOSSIER_TYPES: { value: DossierType; label: string; desc: string; icon: string }[] = [
  { value: "PITCH", label: "Pitch Dossier", desc: "Full intelligence brief + strategic pitch document (3 steps)", icon: "📊" },
  { value: "LOI", label: "Letter of Intent", desc: "Formal LOI ready to send to grants contact (3 steps)", icon: "📝" },
  { value: "EMAIL", label: "Outreach Email", desc: "Personalised cold outreach to CEO/grants contact (3 steps)", icon: "✉️" },
  { value: "APPLICATION", label: "Full Application", desc: "Complete grant application: specific aims, narrative, budget, cover letter (5 steps)", icon: "📋" },
];

const STEP_LABELS_STANDARD: Record<string, string> = {
  eligibility: "Eligibility & Strategic Fit Analysis",
  intelligence: "Intelligence Brief",
  document: "Document Drafting",
};

const STEP_LABELS_APPLICATION: Record<string, string> = {
  eligibility: "Eligibility & Strategic Fit Analysis",
  intelligence: "Funder Intelligence Brief",
  specific_aims: "Specific Aims / Executive Summary",
  narrative: "Research Narrative (Background, Innovation, Approach)",
  budget_cover: "Budget Outline & Cover Letter",
};

function getStepsForType(type: DossierType): Step[] {
  if (type === "APPLICATION") {
    return Object.entries(STEP_LABELS_APPLICATION).map(([id, label]) => ({
      id, label, status: "pending" as StepStatus,
    }));
  }
  return Object.entries(STEP_LABELS_STANDARD).map(([id, label]) => ({
    id, label, status: "pending" as StepStatus,
  }));
}

function fmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function StepIndicator({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                step.status === "done"
                  ? "bg-green-500 text-white"
                  : step.status === "running"
                  ? "bg-red-600 text-white animate-pulse"
                  : step.status === "error"
                  ? "bg-red-200 text-red-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step.status === "done" ? "✓" : step.status === "error" ? "✗" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-0.5 h-4 mt-1 ${step.status === "done" ? "bg-green-300" : "bg-gray-100"}`} />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className={`text-sm font-medium ${
              step.status === "running" ? "text-red-700" :
              step.status === "done" ? "text-green-700" :
              step.status === "error" ? "text-red-600" :
              "text-gray-400"
            }`}>
              {step.label}
            </div>
            {step.detail && (
              <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{step.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GeneratePageInner() {
  const params = useParams<{ workspaceSlug: string }>();
  const searchParams = useSearchParams();
  const slug = params.workspaceSlug ?? "default";

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(searchParams.get("orgId") ?? "");
  const [dossierType, setDossierType] = useState<DossierType>(
    (searchParams.get("type") as DossierType) ?? "PITCH"
  );
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<Step[]>(getStepsForType("PITCH"));
  const [output, setOutput] = useState("");
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savingApplication, setSavingApplication] = useState(false);
  const [applicationSaved, setApplicationSaved] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/caid/orgs?limit=88&sortBy=researchSpend")
      .then((r) => r.json())
      .then((d) => setOrgs(d.orgs ?? []));
  }, []);

  // Update steps when type changes
  useEffect(() => {
    setSteps(getStepsForType(dossierType));
  }, [dossierType]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const selectedOrg = orgs.find((o) => (o.externalId ?? o.id) === selectedOrgId || o.id === selectedOrgId);

  function resetSteps() {
    setSteps(getStepsForType(dossierType));
  }

  function updateStep(id: string, status: StepStatus, detail?: string) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s))
    );
  }

  async function generate() {
    if (!selectedOrgId || generating) return;
    setGenerating(true);
    setOutput("");
    setDossierId(null);
    setError("");
    setApplicationSaved(false);
    resetSteps();

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/caid/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // FIX: always send stream: true so the API uses SSE streaming
        body: JSON.stringify({
          orgId: selectedOrgId,
          type: dossierType,
          context: context || undefined,
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "step") {
              // event.step is the step id, event.detail is the message
              const parsed = typeof event.step === "string" ? event : JSON.parse(event.text ?? "{}");
              const stepId = parsed.step ?? event.step;
              const detail = parsed.detail ?? event.detail ?? "";
              updateStep(stepId, "running", detail);
            } else if (event.type === "step_done") {
              const parsed = typeof event.step === "string" ? event : JSON.parse(event.text ?? "{}");
              const stepId = parsed.step ?? event.step;
              const summary = parsed.summary ?? event.summary ?? "";
              updateStep(stepId, "done", summary);
            } else if (event.type === "chunk") {
              setOutput((prev) => prev + (event.content ?? ""));
            } else if (event.type === "done") {
              // event.text contains JSON with id, title, content
              let doneData: { id?: string; title?: string; content?: string } = {};
              try {
                doneData = typeof event.text === "string" ? JSON.parse(event.text) : event;
              } catch {}
              if (doneData.id) setDossierId(doneData.id);
              if (doneData.content && !output) setOutput(doneData.content);
              setSteps((prev) => prev.map((s) => ({ ...s, status: s.status === "pending" ? "done" : s.status })));
            } else if (event.type === "error") {
              const msg = typeof event.text === "string" ? JSON.parse(event.text)?.message ?? event.text : event.message ?? "Generation failed";
              throw new Error(msg);
            } else if (event.text) {
              // Fallback: try to parse event.text as JSON (SSE sends data as JSON string)
              try {
                const inner = JSON.parse(event.text);
                if (inner.type === "step") updateStep(inner.step, "running", inner.detail);
                else if (inner.type === "step_done") updateStep(inner.step, "done", inner.summary);
                else if (inner.type === "chunk") setOutput((prev) => prev + (inner.content ?? ""));
                else if (inner.type === "done") {
                  if (inner.id) setDossierId(inner.id);
                  if (inner.content && !output) setOutput(inner.content);
                  setSteps((prev) => prev.map((s) => ({ ...s, status: s.status === "pending" ? "done" : s.status })));
                }
              } catch {}
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Generation failed") {
              // Skip malformed SSE lines
            } else if (parseErr instanceof Error) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setSteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "error" } : s));
    } finally {
      setGenerating(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setGenerating(false);
  }

  async function saveAsApplication() {
    if (!dossierId || !selectedOrgId || savingApplication) return;
    setSavingApplication(true);
    try {
      const res = await fetch("/api/caid/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: selectedOrg?.id ?? selectedOrgId,
          dossierId,
          title: `${DOSSIER_TYPES.find((d) => d.value === dossierType)?.label ?? dossierType} — ${selectedOrg?.name ?? ""}`,
          notes: `Generated via CAID Generate page on ${new Date().toLocaleDateString("en-GB")}`,
          nextStep: "Internal review and revision before submission",
        }),
      });
      if (res.ok) {
        setApplicationSaved(true);
      }
    } finally {
      setSavingApplication(false);
    }
  }

  const stepCount = dossierType === "APPLICATION" ? 5 : 3;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Generate Dossier</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered {stepCount}-step chain: eligibility analysis → intelligence brief → document draft
          {dossierType === "APPLICATION" && " → specific aims → narrative → budget & cover letter"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Config panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Org selector */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Select Organisation
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={generating}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white disabled:opacity-50"
            >
              <option value="">Choose an organisation...</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.externalId ?? org.id}>
                  {org.name} {org.country ? `(${org.country})` : ""}
                </option>
              ))}
            </select>

            {selectedOrg && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-900">{selectedOrg.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedOrg.country} · {fmt(selectedOrg.researchSpend)} research spend
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {selectedOrg.cancerTypes.slice(0, 3).map((ct) => (
                    <span key={ct} className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                      {ct.length > 20 ? ct.slice(0, 18) + "…" : ct}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/${slug}/caid/orgs/${selectedOrg.externalId ?? selectedOrg.id}`}
                  className="text-xs text-red-600 hover:underline mt-1.5 block"
                >
                  View org profile →
                </Link>
              </div>
            )}
          </div>

          {/* Dossier type */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Document Type
            </label>
            <div className="space-y-2">
              {DOSSIER_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => setDossierType(dt.value)}
                  disabled={generating}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    dossierType === dt.value
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{dt.icon}</span>
                    <div>
                      <div className={`text-sm font-medium ${dossierType === dt.value ? "text-red-700" : "text-gray-900"}`}>
                        {dt.label}
                      </div>
                      <div className="text-xs text-gray-500">{dt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Context */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Additional Context <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={generating}
              rows={3}
              placeholder={dossierType === "APPLICATION"
                ? "e.g. Target the Centres of Excellence programme, ask for £480K/year over 5 years, PI is Prof. Ruman Rahman at Nottingham..."
                : "e.g. Focus on GBM research, mention our Nottingham collaboration, target the Centres of Excellence programme..."}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none disabled:opacity-50"
            />
          </div>

          {/* Generate button */}
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={!selectedOrgId || generating}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                `✨ Generate ${dossierType === "APPLICATION" ? "Application" : "Dossier"}`
              )}
            </button>
            {generating && (
              <button
                onClick={cancel}
                className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Steps */}
          {(generating || output) && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                Generation Progress ({stepCount} steps)
              </div>
              <StepIndicator steps={steps} />
            </div>
          )}
        </div>

        {/* Right: Output panel */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-xl h-full flex flex-col" style={{ minHeight: "600px" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">
                {output ? `${DOSSIER_TYPES.find((d) => d.value === dossierType)?.label ?? dossierType} — ${selectedOrg?.name ?? ""}` : "Output"}
              </div>
              {dossierId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-600 font-medium">✓ Saved</span>
                  {dossierType === "APPLICATION" && !applicationSaved && (
                    <button
                      onClick={saveAsApplication}
                      disabled={savingApplication}
                      className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60"
                    >
                      {savingApplication ? "Saving..." : "📋 Track Application"}
                    </button>
                  )}
                  {applicationSaved && (
                    <Link
                      href={`/${slug}/caid/applications`}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      ✓ View in Tracker →
                    </Link>
                  )}
                  <a
                    href={`/api/caid/dossier/${dossierId}/export`}
                    className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    ⬇️ Export HTML
                  </a>
                </div>
              )}
            </div>

            <div
              ref={outputRef}
              className="flex-1 overflow-y-auto p-4"
            >
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
                  {error}
                </div>
              )}

              {!output && !generating && !error && (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="text-5xl mb-4">
                    {dossierType === "APPLICATION" ? "📋" : "✨"}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to generate</h3>
                  <p className="text-sm text-gray-500 max-w-sm">
                    {dossierType === "APPLICATION"
                      ? "Select an organisation and click Generate. The AI will run a 5-step chain producing a complete grant application with specific aims, research narrative, budget outline, and cover letter."
                      : "Select an organisation and document type, then click Generate. The AI will run a 3-step analysis and stream the result here."}
                  </p>
                </div>
              )}

              {generating && !output && (
                <div className="flex flex-col items-center justify-center h-full py-16">
                  <div className="w-10 h-10 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm text-gray-500">
                    {dossierType === "APPLICATION" ? "Running 5-step application chain..." : "Analysing organisation data..."}
                  </p>
                </div>
              )}

              {output && (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
                    {output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <GeneratePageInner />
    </Suspense>
  );
}
