"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";

interface Scores {
  eligibility: number;
  funding: number;
  urgency: number;
  composite: number;
}

interface Opportunity {
  id: string;
  title: string;
  status: string;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  currency: string;
  deadline: string | null;
  daysUntilDeadline: number | null;
  urgencyLabel: string;
  cancerTypes: string[];
  requiresLOI: boolean;
  loiDeadlineRaw: string | null;
  contactName: string | null;
  applicationUrl: string | null;
  scores: Scores;
  org: {
    id: string;
    name: string;
    slug: string;
    country: string | null;
    pipeline: { status: string } | null;
  };
  applications: Array<{ id: string; status: string; title: string }>;
}

const URGENCY_COLORS: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700 border border-red-200",
  Soon: "bg-orange-100 text-orange-700 border border-orange-200",
  Upcoming: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  Open: "bg-green-100 text-green-700 border border-green-200",
  Closed: "bg-gray-100 text-gray-500",
  "No deadline": "bg-blue-100 text-blue-600",
};

function ScoreBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-5 text-right">{value}</span>
    </div>
  );
}

function formatCurrency(amount: number | null, currency: string): string {
  if (!amount) return "TBD";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return amount >= 1000000
    ? `${sym}${(amount / 1000000).toFixed(1)}M`
    : `${sym}${(amount / 1000).toFixed(0)}K`;
}

function OpportunitiesPageInner() {
  const params = useParams<{ workspaceSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.workspaceSlug ?? "default";

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState({ total: 0, urgent: 0 });
  const [loading, setLoading] = useState(true);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [filterCancerType, setFilterCancerType] = useState(searchParams.get("cancerType") ?? "");
  const [filterCountry, setFilterCountry] = useState(searchParams.get("country") ?? "");

  async function fetchOpportunities() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterCancerType) qs.set("cancerType", filterCancerType);
      if (filterCountry) qs.set("country", filterCountry);
      const res = await fetch(`/api/caid/opportunities?${qs}`);
      const data = await res.json();
      setOpportunities(data.opportunities ?? []);
      setStats({ total: data.total ?? 0, urgent: data.urgent ?? 0 });
    } catch {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOpportunities(); }, [filterCancerType, filterCountry]);

  async function runGrantHunter() {
    setAgentRunning(true);
    setAgentMessage("Starting Grant Hunter agent...");
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          role: "GRANT_HUNTER",
          message: "Find all open GBM and brain tumour grant opportunities. Score them by eligibility, funding size, and urgency. Search the web for any new opportunities not yet in the database. Create application tracking records for the top 3.",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAgentMessage(`Grant Hunter running (run ID: ${data.runId}). Refreshing opportunities...`);
        setTimeout(() => {
          fetchOpportunities();
          setAgentRunning(false);
          setAgentMessage("");
        }, 5000);
      } else {
        setAgentMessage("Failed to start agent. Check agent service.");
        setTimeout(() => { setAgentRunning(false); setAgentMessage(""); }, 3000);
      }
    } catch {
      setAgentMessage("Agent service unavailable.");
      setTimeout(() => { setAgentRunning(false); setAgentMessage(""); }, 3000);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Opportunities</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats.total} grants · {stats.urgent} urgent (deadline &lt;30 days)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${slug}/caid/generate`}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ✨ Draft Application
          </Link>
          <button
            onClick={runGrantHunter}
            disabled={agentRunning}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {agentRunning ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              "🎯 Run Grant Hunter"
            )}
          </button>
        </div>
      </div>

      {/* Agent message */}
      {agentMessage && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          {agentMessage}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={filterCancerType}
          onChange={(e) => setFilterCancerType(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">All cancer types</option>
          <option value="GBM">GBM</option>
          <option value="Brain cancer">Brain cancer</option>
          <option value="Breast cancer">Breast cancer</option>
          <option value="Lung cancer">Lung cancer</option>
        </select>
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">All countries</option>
          <option value="UK">UK</option>
          <option value="USA">USA</option>
          <option value="Global">Global</option>
        </select>
        {(filterCancerType || filterCountry) && (
          <button
            onClick={() => { setFilterCancerType(""); setFilterCountry(""); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Opportunities grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-medium text-gray-700 mb-1">No open opportunities found</div>
          <div className="text-sm mb-4">Run the Grant Hunter agent to discover new opportunities</div>
          <button
            onClick={runGrantHunter}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            🎯 Run Grant Hunter
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {opportunities.map((opp, idx) => (
            <div key={opp.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between gap-4">
                {/* Left: rank + info */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLORS[opp.urgencyLabel] ?? "bg-gray-100 text-gray-600"}`}>
                        {opp.urgencyLabel === "URGENT" ? "🔴 URGENT" : opp.urgencyLabel}
                        {opp.daysUntilDeadline !== null && opp.daysUntilDeadline >= 0 && ` · ${opp.daysUntilDeadline}d`}
                      </span>
                      {opp.requiresLOI && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">LOI required</span>
                      )}
                      {opp.applications.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          {opp.applications.length} application{opp.applications.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-0.5">{opp.title}</h3>
                    <div className="text-sm text-gray-500">
                      <Link href={`/${slug}/caid/orgs/${opp.org.id}`} className="hover:text-red-600 font-medium">
                        {opp.org.name}
                      </Link>
                      {opp.org.country && <span> · {opp.org.country}</span>}
                      {opp.contactName && <span> · Contact: {opp.contactName}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="font-medium text-gray-700">
                        {opp.fundingAmountMax
                          ? `Up to ${formatCurrency(opp.fundingAmountMax, opp.currency)}`
                          : "Amount TBD"}
                      </span>
                      {opp.deadline && (
                        <span>Deadline: {new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      )}
                      {opp.cancerTypes.slice(0, 3).map((t) => (
                        <span key={t} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: scores + actions */}
                <div className="flex items-start gap-6 shrink-0">
                  {/* Score breakdown */}
                  <div className="w-36 space-y-1.5">
                    <div className="text-xs text-gray-400 font-medium mb-1">Score breakdown</div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Eligibility</div>
                      <ScoreBar value={opp.scores.eligibility} color="bg-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Funding size</div>
                      <ScoreBar value={opp.scores.funding} color="bg-green-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Urgency</div>
                      <ScoreBar value={opp.scores.urgency} color="bg-orange-500" />
                    </div>
                    <div className="pt-1 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Composite</span>
                        <span className="text-sm font-bold text-gray-900">{opp.scores.composite}/10</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/${slug}/caid/generate?orgId=${opp.org.id}&grantId=${opp.id}&type=APPLICATION`}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                    >
                      📋 Draft Application
                    </Link>
                    <Link
                      href={`/${slug}/caid/orgs/${opp.org.id}`}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      View Org
                    </Link>
                    {opp.applicationUrl && (
                      <a
                        href={opp.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                      >
                        Apply →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <OpportunitiesPageInner />
    </Suspense>
  );
}
