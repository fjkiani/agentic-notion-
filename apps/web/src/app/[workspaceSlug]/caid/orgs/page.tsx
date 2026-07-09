"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

interface Org {
  id: string;
  name: string;
  shortName: string | null;
  country: string | null;
  cancerTypes: string[];
  orgType: string;
  annualBudget: number | null;
  researchSpend: number | null;
  externalId: string | null;
  website: string | null;
  pipeline: { status: string } | null;
  contacts: Array<{ name: string; title: string | null; role: string; email: string | null }>;
  openGrants: Array<{ id: string; title: string; fundingAmountMax: number | null; status: string }>;
  _count: { dossiers: number; openGrants: number };
}

const PIPELINE_STATUS_OPTIONS = ["IDENTIFIED", "RESEARCHING", "OUTREACH", "APPLIED", "AWARDED", "REJECTED", "PAUSED"];
const PIPELINE_COLORS: Record<string, string> = {
  IDENTIFIED: "bg-blue-100 text-blue-700",
  RESEARCHING: "bg-purple-100 text-purple-700",
  OUTREACH: "bg-yellow-100 text-yellow-700",
  APPLIED: "bg-orange-100 text-orange-700",
  AWARDED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-gray-100 text-gray-600",
};

function fmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function OrgsPageInner() {
  const params = useParams<{ workspaceSlug: string }>();
  const searchParams = useSearchParams();
  const slug = params.workspaceSlug ?? "default";

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [cancerType, setCancerType] = useState(searchParams.get("cancerType") ?? "");
  const [country, setCountry] = useState(searchParams.get("country") ?? "");
  const [pipelineStatus, setPipelineStatus] = useState(searchParams.get("pipelineStatus") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "researchSpend");
  const [addingPipeline, setAddingPipeline] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (cancerType) qs.set("cancerType", cancerType);
    if (country) qs.set("country", country);
    if (pipelineStatus) qs.set("pipelineStatus", pipelineStatus);
    if (sortBy) qs.set("sortBy", sortBy);
    qs.set("limit", "88");

    const res = await fetch(`/api/caid/orgs?${qs}`);
    const data = await res.json();
    setOrgs(data.orgs ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, cancerType, country, pipelineStatus, sortBy]);

  useEffect(() => {
    const t = setTimeout(fetchOrgs, 300);
    return () => clearTimeout(t);
  }, [fetchOrgs]);

  async function addToPipeline(orgId: string) {
    setAddingPipeline(orgId);
    await fetch("/api/caid/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, status: "IDENTIFIED" }),
    });
    await fetchOrgs();
    setAddingPipeline(null);
  }

  const allCancerTypes = Array.from(new Set(orgs.flatMap((o) => o.cancerTypes))).sort();
  const allCountries = Array.from(new Set(orgs.map((o) => o.country).filter(Boolean))).sort() as string[];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">All Organisations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} orgs · sorted by {sortBy.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
        </div>
        <Link
          href={`/${slug}/caid/generate`}
          className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          ✨ Generate Dossier
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search orgs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <select
          value={cancerType}
          onChange={(e) => setCancerType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        >
          <option value="">All cancer types</option>
          {allCancerTypes.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
        </select>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        >
          <option value="">All countries</option>
          {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={pipelineStatus}
          onChange={(e) => setPipelineStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        >
          <option value="">All pipeline statuses</option>
          {PIPELINE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        >
          <option value="researchSpend">Sort: Research Spend</option>
          <option value="annualBudget">Sort: Annual Budget</option>
          <option value="name">Sort: Name</option>
        </select>
        {(search || cancerType || country || pipelineStatus) && (
          <button
            onClick={() => { setSearch(""); setCancerType(""); setCountry(""); setPipelineStatus(""); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No organisations match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Organisation</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cancer Focus</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Research Spend</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Budget</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Grants</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pipeline</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org, i) => {
                  const ceo = org.contacts.find((c) => c.role === "EXECUTIVE");
                  return (
                    <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/${slug}/caid/orgs/${org.externalId ?? org.id}`}
                          className="font-medium text-gray-900 hover:text-red-600 block"
                        >
                          {org.name}
                        </Link>
                        {ceo && (
                          <div className="text-xs text-gray-400 mt-0.5">{ceo.name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{org.country ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {org.cancerTypes.slice(0, 2).map((ct) => (
                            <span key={ct} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {ct.length > 20 ? ct.slice(0, 18) + "…" : ct}
                            </span>
                          ))}
                          {org.cancerTypes.length > 2 && (
                            <span className="text-xs text-gray-400">+{org.cancerTypes.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(org.researchSpend)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{fmt(org.annualBudget)}</td>
                      <td className="px-4 py-3 text-center">
                        {org._count.openGrants > 0 ? (
                          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {org._count.openGrants} open
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {org.pipeline ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${PIPELINE_COLORS[org.pipeline.status]}`}>
                            {org.pipeline.status.charAt(0) + org.pipeline.status.slice(1).toLowerCase()}
                          </span>
                        ) : (
                          <button
                            onClick={() => addToPipeline(org.id)}
                            disabled={addingPipeline === org.id}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          >
                            {addingPipeline === org.id ? "Adding..." : "+ Pipeline"}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/${slug}/caid/orgs/${org.externalId ?? org.id}`}
                            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50"
                          >
                            View
                          </Link>
                          <Link
                            href={`/${slug}/caid/generate?orgId=${org.externalId ?? org.id}`}
                            className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Dossier
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrgsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <OrgsPageInner />
    </Suspense>
  );
}
