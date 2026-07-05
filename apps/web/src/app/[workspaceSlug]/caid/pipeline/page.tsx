"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface PipelineEntry {
  id: string;
  orgId: string;
  status: string;
  notes: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  priority: string | null;
  tags: string[];
  updatedAt: string;
  org: {
    id: string;
    name: string;
    shortName: string | null;
    country: string | null;
    researchSpend: number | null;
    cancerTypes: string[];
    externalId: string | null;
    openGrants: Array<{ id: string; fundingAmountMax: number | null }>;
  };
}

const COLUMNS = [
  { status: "IDENTIFIED", label: "Identified", color: "blue", bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
  { status: "RESEARCHING", label: "Researching", color: "purple", bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
  { status: "OUTREACH", label: "Outreach", color: "yellow", bg: "bg-yellow-50", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-700" },
  { status: "APPLIED", label: "Applied", color: "orange", bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
  { status: "AWARDED", label: "Awarded", color: "green", bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-700" },
  { status: "REJECTED", label: "Rejected", color: "red", bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700" },
];

function fmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function PipelineCard({
  entry,
  slug,
  onStatusChange,
}: {
  entry: PipelineEntry;
  slug: string;
  onStatusChange: (orgId: string, status: string) => void;
}) {
  const maxGrant = entry.org.openGrants.reduce(
    (max, g) => Math.max(max, g.fundingAmountMax ?? 0),
    0
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/${slug}/caid/orgs/${entry.org.externalId ?? entry.org.id}`}
          className="font-medium text-gray-900 hover:text-red-600 text-sm leading-tight"
        >
          {entry.org.shortName ?? entry.org.name}
        </Link>
        {entry.org.openGrants.length > 0 && (
          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">
            {entry.org.openGrants.length} open
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
        {entry.org.country && <span>📍 {entry.org.country}</span>}
        {entry.org.researchSpend && <span>💰 {fmt(entry.org.researchSpend)}</span>}
      </div>

      {maxGrant > 0 && (
        <div className="text-xs text-gray-600 mb-2">
          Max award: <span className="font-medium text-gray-900">{fmt(maxGrant)}</span>
        </div>
      )}

      {entry.nextAction && (
        <div className="text-xs bg-yellow-50 border border-yellow-100 rounded-lg px-2 py-1.5 mb-2 text-yellow-800">
          ⚡ {entry.nextAction}
        </div>
      )}

      {entry.notes && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{entry.notes}</p>
      )}

      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <Link
          href={`/${slug}/caid/generate?orgId=${entry.org.externalId ?? entry.org.id}`}
          className="text-xs text-red-600 hover:underline"
        >
          ✨ Dossier
        </Link>
        <span className="text-gray-200">·</span>
        <Link
          href={`/${slug}/caid/orgs/${entry.org.externalId ?? entry.org.id}?tab=pipeline`}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Edit
        </Link>
        <span className="text-gray-200">·</span>
        <select
          value={entry.status}
          onChange={(e) => onStatusChange(entry.orgId, e.target.value)}
          className="text-xs text-gray-500 border-0 bg-transparent focus:outline-none cursor-pointer hover:text-gray-700 ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>{c.label}</option>
          ))}
          <option value="PAUSED">Paused</option>
        </select>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug ?? "default";

  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/caid/pipeline")
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleStatusChange(orgId: string, newStatus: string) {
    setUpdating(orgId);
    setEntries((prev) =>
      prev.map((e) => (e.orgId === orgId ? { ...e, status: newStatus } : e))
    );
    await fetch("/api/caid/pipeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, status: newStatus }),
    });
    setUpdating(null);
  }

  const byStatus = (status: string) => entries.filter((e) => e.status === status);
  const totalValue = entries.reduce((sum, e) => {
    const max = e.org.openGrants.reduce((m, g) => Math.max(m, g.fundingAmountMax ?? 0), 0);
    return sum + max;
  }, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Grant Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {entries.length} orgs tracked · {fmt(totalValue)} total potential value
          </p>
        </div>
        <Link
          href={`/${slug}/caid/orgs`}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          + Add Orgs
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No orgs in pipeline yet</h2>
          <p className="text-gray-500 text-sm mb-4">
            Go to the Orgs table and click "+ Pipeline" on any organisation to start tracking.
          </p>
          <Link
            href={`/${slug}/caid/orgs`}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Browse Orgs →
          </Link>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colEntries = byStatus(col.status);
            return (
              <div key={col.status} className="flex-shrink-0 w-72">
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${col.border} ${col.bg} mb-2`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.badge}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{colEntries.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-24">
                  {colEntries.map((entry) => (
                    <div key={entry.id} className={updating === entry.orgId ? "opacity-60" : ""}>
                      <PipelineCard
                        entry={entry}
                        slug={slug}
                        onStatusChange={handleStatusChange}
                      />
                    </div>
                  ))}
                  {colEntries.length === 0 && (
                    <div className={`border-2 border-dashed ${col.border} rounded-xl p-4 text-center`}>
                      <p className="text-xs text-gray-400">No orgs here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
