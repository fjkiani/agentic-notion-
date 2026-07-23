"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface GrantDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  grantType: string;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  currency: string;
  deadline: string | null;
  deadlineRaw: string | null;
  loiDeadlineRaw: string | null;
  requiresLOI: boolean;
  awardDuration: string | null;
  numberOfAwards: number | null;
  eligibilityCriteria: string | null;
  eligibilityStages: string[];
  eligibilityOrgTypes: string[];
  cancerTypes: string[];
  geographicScope: string[];
  applicationUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  sourceNotes: string | null;
  org: {
    id: string;
    name: string;
    shortName: string | null;
    slug: string;
    externalId: string | null;
    website: string | null;
    country: string | null;
    cancerTypes: string[];
  };
  applications: Array<{ id: string; title: string; status: string; createdAt: string }>;
}

function fmt(n: number | null | undefined, currency = "USD"): string {
  if (!n) return "—";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(0)}K`;
  return `${sym}${n}`;
}

export default function GrantDetailPage() {
  const params = useParams<{ workspaceSlug: string; orgSlug: string; grantSlug: string }>();
  const ws = params.workspaceSlug ?? "default";
  const { orgSlug, grantSlug } = params;

  const [grant, setGrant] = useState<GrantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/caid/grants/${orgSlug}/${grantSlug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Grant not found");
        return r.json();
      })
      .then((d) => { setGrant(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [orgSlug, grantSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !grant) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error || "Grant not found."}
        </div>
        <Link href={`/${ws}/caid/opportunities`} className="text-sm text-red-600 hover:underline mt-4 block">
          ← Back to opportunities
        </Link>
      </div>
    );
  }

  const orgHref = `/${ws}/caid/orgs/${grant.org.slug ?? grant.org.externalId ?? grant.org.id}`;
  const fundingLabel =
    grant.fundingAmountMin && grant.fundingAmountMax
      ? `${fmt(grant.fundingAmountMin, grant.currency)} – ${fmt(grant.fundingAmountMax, grant.currency)}`
      : fmt(grant.fundingAmountMax ?? grant.fundingAmountMin, grant.currency);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 flex-wrap">
        <Link href={`/${ws}/caid`} className="hover:text-gray-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/${ws}/caid/opportunities`} className="hover:text-gray-600">Opportunities</Link>
        <span>/</span>
        <Link href={orgHref} className="hover:text-gray-600">{grant.org.shortName ?? grant.org.name}</Link>
        <span>/</span>
        <span className="text-gray-700 truncate">{grant.title}</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{grant.title}</h1>
              <span className={`text-sm px-2.5 py-1 rounded-full font-medium ${
                grant.status === "OPEN" ? "bg-green-100 text-green-700"
                : grant.status === "ROLLING" ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
              }`}>
                {grant.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                {grant.grantType.replace(/_/g, " ")}
              </span>
            </div>
            <Link href={orgHref} className="inline-block mt-2 text-sm text-red-600 hover:underline">
              {grant.org.name}
            </Link>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {grant.cancerTypes.map((ct) => (
                <span key={ct} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{ct}</span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-gray-900">{fundingLabel}</div>
            <div className="text-xs text-gray-400">Funding</div>
            {(grant.deadline || grant.deadlineRaw) && (
              <div className="mt-2 text-xs text-gray-500">
                Deadline: {grant.deadline ? new Date(grant.deadline).toLocaleDateString("en-GB") : grant.deadlineRaw}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          {grant.applicationUrl && (
            <a href={grant.applicationUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
              Apply →
            </a>
          )}
          <Link href={`/${ws}/caid/generate?orgId=${grant.org.externalId ?? grant.org.id}`}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Generate Dossier
          </Link>
          <Link href={orgHref}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            View Org
          </Link>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {grant.description && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
            <p className="text-sm text-gray-700 leading-relaxed">{grant.description}</p>
          </section>
        )}
        {grant.eligibilityCriteria && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Eligibility</h3>
            <p className="text-sm text-gray-700 leading-relaxed">{grant.eligibilityCriteria}</p>
          </section>
        )}

        <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Detail label="LOI required" value={grant.requiresLOI ? "Yes" : "No"} />
          {grant.loiDeadlineRaw && <Detail label="LOI deadline" value={grant.loiDeadlineRaw} />}
          {grant.awardDuration && <Detail label="Duration" value={grant.awardDuration} />}
          {grant.numberOfAwards != null && <Detail label="# Awards" value={String(grant.numberOfAwards)} />}
          {grant.geographicScope.length > 0 && <Detail label="Geography" value={grant.geographicScope.join(", ")} />}
          {grant.contactEmail && <Detail label="Contact" value={grant.contactEmail} />}
        </section>

        {grant.sourceNotes && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{grant.sourceNotes}</p>
          </section>
        )}

        {grant.applications.length > 0 && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Applications ({grant.applications.length})</h3>
            <div className="space-y-2">
              {grant.applications.map((a) => (
                <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-800">{a.title}</span>
                  <span className="text-xs text-gray-500">{a.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm font-medium text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}
