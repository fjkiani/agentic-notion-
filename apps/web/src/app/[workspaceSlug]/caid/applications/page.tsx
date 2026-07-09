"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

interface Application {
  id: string;
  title: string;
  status: string;
  askAmount: number | null;
  awardedAmount: number | null;
  submittedAt: string | null;
  decisionAt: string | null;
  notes: string | null;
  nextStep: string | null;
  internalScore: number | null;
  funderScore: number | null;
  createdAt: string;
  updatedAt: string;
  org: { id: string; name: string; slug: string; country: string | null; externalId: string | null };
  grant: { id: string; title: string; fundingAmountMax: number | null; currency: string; deadline: string | null; contactName: string | null } | null;
  dossier: { id: string; title: string; type: string; createdAt: string } | null;
}

interface Stats {
  total: number;
  drafting: number;
  internalReview: number;
  submitted: number;
  underReview: number;
  awarded: number;
  rejected: number;
  totalAwarded: number;
  totalAsk: number;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFTING: "bg-gray-100 text-gray-700",
  INTERNAL_REVIEW: "bg-purple-100 text-purple-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  AWARDED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFTING: "Drafting",
  INTERNAL_REVIEW: "Internal Review",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  AWARDED: "Awarded",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const ALL_STATUSES = ["DRAFTING", "INTERNAL_REVIEW", "SUBMITTED", "UNDER_REVIEW", "AWARDED", "REJECTED", "WITHDRAWN"];

function formatCurrency(amount: number | null, currency = "USD"): string {
  if (!amount) return "—";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return amount >= 1000000
    ? `${sym}${(amount / 1000000).toFixed(1)}M`
    : `${sym}${(amount / 1000).toFixed(0)}K`;
}

function ApplicationsPageInner() {
  const params = useParams<{ workspaceSlug: string }>();
  const searchParams = useSearchParams();
  const slug = params.workspaceSlug ?? "default";

  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchApplications() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set("status", filterStatus);
      const res = await fetch(`/api/caid/applications?${qs}`);
      const data = await res.json();
      setApplications(data.applications ?? []);
      setStats(data.stats ?? null);
    } catch {
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchApplications(); }, [filterStatus]);

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "SUBMITTED") body.submittedAt = new Date().toISOString();
      await fetch(`/api/caid/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchApplications();
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = applications.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.org.name.toLowerCase().includes(q) || (a.grant?.title ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grant Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats?.total ?? 0} applications · {stats?.awarded ?? 0} awarded
            {stats && stats.totalAwarded > 0 && ` · ${formatCurrency(stats.totalAwarded, "USD")} total awarded`}
          </p>
        </div>
        <Link
          href={`/${slug}/caid/generate?type=APPLICATION`}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          + New Application
        </Link>
      </div>

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-gray-900" },
            { label: "In Draft", value: stats.drafting + stats.internalReview, color: "text-purple-700" },
            { label: "Submitted", value: stats.submitted + stats.underReview, color: "text-blue-700" },
            { label: "Awarded", value: stats.awarded, color: "text-green-700" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Search applications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 w-64"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {(filterStatus || search) && (
          <button onClick={() => { setFilterStatus(""); setSearch(""); }} className="text-sm text-gray-500 hover:text-gray-700">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium text-gray-700 mb-1">No applications yet</div>
          <div className="text-sm mb-4">Generate your first application to get started</div>
          <Link
            href={`/${slug}/caid/generate?type=APPLICATION`}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            Generate Application
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Org / Grant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ask</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Scores</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Step</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 text-sm leading-snug">{app.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <Link href={`/${slug}/caid/orgs/${app.org.id}`} className="hover:text-red-600">
                        {app.org.name}
                      </Link>
                      {app.grant && <span> · {app.grant.title.length > 40 ? app.grant.title.slice(0, 40) + "…" : app.grant.title}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={app.status}
                      onChange={(e) => updateStatus(app.id, e.target.value)}
                      disabled={updatingId === app.id}
                      className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {app.askAmount ? formatCurrency(app.askAmount, app.grant?.currency ?? "USD") : "—"}
                    {app.awardedAmount && (
                      <div className="text-xs text-green-600 font-medium">
                        Awarded: {formatCurrency(app.awardedAmount, app.grant?.currency ?? "USD")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {app.internalScore && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">Int: {app.internalScore}/10</span>
                      )}
                      {app.funderScore && (
                        <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">Fit: {app.funderScore}/10</span>
                      )}
                      {!app.internalScore && !app.funderScore && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {app.nextStep ? (
                      <span className="line-clamp-2">{app.nextStep}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {app.dossier && (
                        <Link
                          href={`/${slug}/caid/generate?dossierId=${app.dossier.id}`}
                          className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        >
                          View
                        </Link>
                      )}
                      {app.grant?.applicationUrl && (
                        <a
                          href={app.grant.applicationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                        >
                          Apply →
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ApplicationsPageInner />
    </Suspense>
  );
}
