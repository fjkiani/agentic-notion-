"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface InsightsData {
  totalOrgs: number;
  openGrantsCount: number;
  totalResearchSpend: number;
  pipelineByStatus: Record<string, number>;
  topFundersBySpend: Array<{
    id: string;
    name: string;
    shortName: string | null;
    country: string | null;
    researchSpend: number | null;
    annualBudget: number | null;
    cancerTypes: string[];
    externalId: string | null;
    pipeline: { status: string } | null;
    _count: { openGrants: number };
  }>;
  gbmOrgs: Array<{
    id: string;
    name: string;
    country: string | null;
    researchSpend: number | null;
    cancerTypes: string[];
    externalId: string | null;
    pipeline: { status: string } | null;
    openGrants: Array<{ id: string; fundingAmountMax: number | null }>;
  }>;
  countryBreakdown: Array<{ country: string | null; _count: { country: number } }>;
  topCancerTypes: Array<{ type: string; count: number }>;
  recentDossiers: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: string;
    org: { name: string; id: string };
  }>;
}

interface Opportunity {
  id: string;
  title: string;
  funder: string;
  deadline: string | null;
  fundingAmountMax: number | null;
  scores: {
    composite: number;
    urgency: number;
  };
}

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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function UrgencyBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">No deadline</span>;
  if (days < 0) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Closed</span>;
  if (days <= 14) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{days}d left</span>;
  if (days <= 30) return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{days}d left</span>;
  if (days <= 60) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{days}d left</span>;
  return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{days}d left</span>;
}

function SpendBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className="bg-red-500 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-12 text-right">{fmt(value)}</span>
    </div>
  );
}

function UpcomingDeadlines({ slug }: { slug: string }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/caid/opportunities?maxDays=180")
      .then((r) => r.json())
      .then((data: Opportunity[] | { error?: string }) => {
        if (Array.isArray(data)) {
          setOpportunities(data.slice(0, 5));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">⏰ Upcoming Deadlines</h2>
        <Link href={`/${slug}/caid/opportunities`} className="text-xs text-red-600 hover:underline">
          All opportunities →
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2">🔍</div>
          <p className="text-sm text-gray-500">No upcoming deadlines found.</p>
          <Link
            href={`/${slug}/caid/opportunities`}
            className="text-xs text-red-600 hover:underline mt-1 block"
          >
            Run Grant Hunter to find opportunities →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map((opp) => {
            const days = daysUntil(opp.deadline);
            return (
              <div key={opp.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{opp.title}</div>
                  <div className="text-xs text-gray-400">{opp.funder} · {fmt(opp.fundingAmountMax)}</div>
                </div>
                <div className="ml-3 shrink-0">
                  <UrgencyBadge days={days} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CAIDDashboard() {
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug ?? "default";
  const [data, setData] = useState<InsightsData | null>(null);
  const [applicationsCount, setApplicationsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/caid/insights").then((r) => r.json()),
      fetch("/api/caid/applications").then((r) => r.json()).catch(() => ({ applications: [] })),
    ])
      .then(([insights, apps]) => {
        setData(insights);
        if (apps?.applications) setApplicationsCount(apps.applications.length);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading intelligence data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error || "Failed to load data. Check that the database is seeded."}
        </div>
      </div>
    );
  }

  const totalPipeline = Object.values(data.pipelineByStatus).reduce((a, b) => a + b, 0);
  const maxSpend = Math.max(...data.topFundersBySpend.map((o) => o.researchSpend ?? 0));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grant Intelligence Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data.totalOrgs} organisations · {data.openGrantsCount} open grants · real-time from database
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${slug}/caid/generate`}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            ✨ Generate Dossier
          </Link>
          <Link
            href={`/${slug}/caid/orgs`}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            🏢 All Orgs
          </Link>
        </div>
      </div>

      {/* KPI Cards — 5 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Organisations", value: data.totalOrgs.toString(), icon: "🏢", color: "blue", href: `/${slug}/caid/orgs` },
          { label: "Open Grants", value: data.openGrantsCount.toString(), icon: "📋", color: "green", href: `/${slug}/caid/opportunities` },
          { label: "Total Research Spend", value: fmt(data.totalResearchSpend), icon: "💰", color: "red", href: null },
          { label: "In Pipeline", value: totalPipeline.toString(), icon: "🎯", color: "purple", href: `/${slug}/caid/pipeline` },
          { label: "Applications", value: applicationsCount.toString(), icon: "✍️", color: "indigo", href: `/${slug}/caid/applications` },
        ].map((kpi) => {
          const card = (
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{kpi.icon}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full bg-${kpi.color}-50 text-${kpi.color}-600 font-medium`}>
                  Live
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
            </div>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>{card}</Link>
          ) : (
            <div key={kpi.label}>{card}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Top Funders by Research Spend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Top Funders by Research Spend</h2>
            <Link href={`/${slug}/caid/orgs?sortBy=researchSpend`} className="text-xs text-red-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {data.topFundersBySpend.map((org, i) => (
              <div key={org.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/${slug}/caid/orgs/${org.externalId ?? org.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-red-600 truncate"
                    >
                      {org.shortName ?? org.name}
                    </Link>
                    <span className="text-xs text-gray-400 shrink-0">{org.country}</span>
                    {org.pipeline && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${PIPELINE_COLORS[org.pipeline.status]}`}>
                        {org.pipeline.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <SpendBar value={org.researchSpend ?? 0} max={maxSpend} />
                </div>
                <div className="text-xs text-gray-500 shrink-0 w-8 text-center">
                  {org._count.openGrants > 0 && (
                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                      {org._count.openGrants}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Pipeline Status</h2>
            <Link href={`/${slug}/caid/pipeline`} className="text-xs text-red-600 hover:underline">
              View →
            </Link>
          </div>
          {totalPipeline === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-sm text-gray-500">No orgs in pipeline yet.</p>
              <Link
                href={`/${slug}/caid/orgs`}
                className="text-xs text-red-600 hover:underline mt-1 block"
              >
                Add orgs from the table →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.pipelineByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PIPELINE_COLORS[status]}`}>
                      {status.charAt(0) + status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-red-500 h-1.5 rounded-full"
                        style={{ width: `${(count / totalPipeline) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-4 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* GBM Funders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">🧠 GBM / Brain Tumour Funders</h2>
            <Link
              href={`/${slug}/caid/orgs?cancerType=GBM`}
              className="text-xs text-red-600 hover:underline"
            >
              Filter →
            </Link>
          </div>
          <div className="space-y-2">
            {data.gbmOrgs.slice(0, 8).map((org, i) => (
              <div key={org.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <Link
                    href={`/${slug}/caid/orgs/${org.externalId ?? org.id}`}
                    className="text-sm text-gray-900 hover:text-red-600 truncate font-medium"
                  >
                    {org.name}
                  </Link>
                  <span className="text-xs text-gray-400 shrink-0">{org.country}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {org.openGrants.length > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                      {org.openGrants.length} open
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{fmt(org.researchSpend)}</span>
                  {org.pipeline ? (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${PIPELINE_COLORS[org.pipeline.status]}`}>
                      {org.pipeline.status.toLowerCase()}
                    </span>
                  ) : (
                    <Link
                      href={`/${slug}/caid/orgs/${org.externalId ?? org.id}`}
                      className="text-xs text-red-600 hover:underline"
                    >
                      + Add
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <UpcomingDeadlines slug={slug} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Dossiers */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Recent Dossiers</h2>
            <Link href={`/${slug}/caid/generate`} className="text-xs text-red-600 hover:underline">
              Generate →
            </Link>
          </div>
          {data.recentDossiers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No dossiers generated yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentDossiers.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{d.org.name}</div>
                    <div className="text-xs text-gray-400">{d.type} · {new Date(d.createdAt).toLocaleDateString("en-GB")}</div>
                  </div>
                  <a
                    href={`/api/caid/dossier/${d.id}/export`}
                    className="text-xs text-red-600 hover:underline shrink-0 ml-2"
                  >
                    Export
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Country Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Orgs by Country</h2>
          <div className="space-y-1.5">
            {data.countryBreakdown.slice(0, 8).map((c) => (
              <div key={c.country} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{c.country ?? "Unknown"}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-red-400 h-1.5 rounded-full"
                      style={{ width: `${(c._count.country / data.totalOrgs) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-4 text-right">{c._count.country}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
