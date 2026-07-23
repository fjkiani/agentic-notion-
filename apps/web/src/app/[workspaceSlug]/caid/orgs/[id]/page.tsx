"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface OrgDetail {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  country: string | null;
  website: string | null;
  orgType: string;
  cancerTypes: string[];
  annualBudget: number | null;
  researchSpend: number | null;
  externalId: string | null;
  charityRegNumber: string | null;
  strategicPriorities: string[];
  partnershipPrograms: string[];
  notes: string | null;
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    role: string;
    email: string | null;
    linkedinUrl: string | null;
  }>;
  openGrants: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    fundingAmountMin: number | null;
    fundingAmountMax: number | null;
    deadline: string | null;
    description: string | null;
    eligibilityCriteria: string | null;
    applicationUrl: string | null;
  }>;
  pipeline: {
    id: string;
    status: string;
    notes: string | null;
    nextAction: string | null;
    nextActionAt: string | null;
    priority: string | null;
    tags: string[];
  } | null;
  dossiers: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: string;
    model: string;
  }>;
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

const PIPELINE_STATUSES = ["IDENTIFIED", "RESEARCHING", "OUTREACH", "APPLIED", "AWARDED", "REJECTED", "PAUSED"];

function fmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

type Tab = "overview" | "grants" | "contacts" | "dossiers" | "pipeline";

export default function OrgDetailPage() {
  const params = useParams<{ workspaceSlug: string; id: string }>();
  const router = useRouter();
  const slug = params.workspaceSlug ?? "default";
  const orgId = params.id;

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [pipelineStatus, setPipelineStatus] = useState("");
  const [pipelineNotes, setPipelineNotes] = useState("");
  const [pipelineNextAction, setPipelineNextAction] = useState("");
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [pipelineSaved, setPipelineSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/caid/orgs/${orgId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setOrg(d);
        if (d.pipeline) {
          setPipelineStatus(d.pipeline.status);
          setPipelineNotes(d.pipeline.notes ?? "");
          setPipelineNextAction(d.pipeline.nextAction ?? "");
        }
        setLoading(false);
        // Canonicalize URL to the human-readable slug (if we arrived via id/externalId).
        if (d.slug && orgId !== d.slug) {
          router.replace(`/${slug}/caid/orgs/${d.slug}`);
        }
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [orgId, slug, router]);

  async function savePipeline() {
    if (!org) return;
    setSavingPipeline(true);
    const method = org.pipeline ? "PATCH" : "POST";
    await fetch("/api/caid/pipeline", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: org.id,
        status: pipelineStatus || "IDENTIFIED",
        notes: pipelineNotes,
        nextAction: pipelineNextAction,
      }),
    });
    // Refresh
    const res = await fetch(`/api/caid/orgs/${orgId}`);
    const d = await res.json();
    setOrg(d);
    setSavingPipeline(false);
    setPipelineSaved(true);
    setTimeout(() => setPipelineSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error || "Organisation not found."}
        </div>
        <Link href={`/${slug}/caid/orgs`} className="text-sm text-red-600 hover:underline mt-4 block">
          ← Back to all orgs
        </Link>
      </div>
    );
  }

  const ceo = org.contacts.find((c) => c.role === "EXECUTIVE");
  const grantContact = org.contacts.find((c) => c.role === "GRANTS");

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "grants", label: "Grants", count: org.openGrants.length },
    { id: "contacts", label: "Contacts", count: org.contacts.length },
    { id: "dossiers", label: "Dossiers", count: org.dossiers.length },
    { id: "pipeline", label: "Pipeline" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href={`/${slug}/caid`} className="hover:text-gray-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/${slug}/caid/orgs`} className="hover:text-gray-600">Orgs</Link>
        <span>/</span>
        <span className="text-gray-700">{org.shortName ?? org.name}</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
              {org.pipeline && (
                <span className={`text-sm px-2.5 py-1 rounded-full font-medium ${PIPELINE_COLORS[org.pipeline.status]}`}>
                  {org.pipeline.status.charAt(0) + org.pipeline.status.slice(1).toLowerCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
              {org.country && <span>📍 {org.country}</span>}
              <span>🏢 {org.orgType.replace(/_/g, " ")}</span>
              {org.charityRegNumber && <span>📋 {org.charityRegNumber}</span>}
              {org.website && (
                <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">
                  🌐 Website
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {org.cancerTypes.map((ct) => (
                <span key={ct} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{ct}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 ml-4 shrink-0">
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">{fmt(org.researchSpend)}</div>
              <div className="text-xs text-gray-400">Research spend</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700">{fmt(org.annualBudget)}</div>
              <div className="text-xs text-gray-400">Annual budget</div>
            </div>
          </div>
        </div>

        {/* Quick contacts */}
        {(ceo || grantContact) && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 flex-wrap">
            {ceo && (
              <div className="text-sm">
                <span className="text-gray-400 text-xs">CEO/ED</span>
                <div className="font-medium text-gray-900">{ceo.name}</div>
                {ceo.email && <a href={`mailto:${ceo.email}`} className="text-xs text-red-600 hover:underline">{ceo.email}</a>}
              </div>
            )}
            {grantContact && (
              <div className="text-sm">
                <span className="text-gray-400 text-xs">Grants Contact</span>
                <div className="font-medium text-gray-900">{grantContact.name}</div>
                {grantContact.email && <a href={`mailto:${grantContact.email}`} className="text-xs text-red-600 hover:underline">{grantContact.email}</a>}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link
            href={`/${slug}/caid/generate?orgId=${org.externalId ?? org.id}`}
            className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            ✨ Generate Dossier
          </Link>
          {!org.pipeline && (
            <button
              onClick={() => { setPipelineStatus("IDENTIFIED"); setTab("pipeline"); }}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              🎯 Add to Pipeline
            </button>
          )}
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              🌐 Visit Website
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-6">
            {org.strategicPriorities.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Strategic Priorities</h3>
                <ul className="space-y-1">
                  {org.strategicPriorities.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-red-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {org.partnershipPrograms.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Partnership Programs</h3>
                <ul className="space-y-1">
                  {org.partnershipPrograms.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {org.notes && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{org.notes}</p>
              </div>
            )}
            {!org.strategicPriorities.length && !org.partnershipPrograms.length && !org.notes && (
              <p className="text-gray-400 text-sm">No additional details available.</p>
            )}
          </div>
        )}

        {/* Grants */}
        {tab === "grants" && (
          <div>
            {org.openGrants.length === 0 ? (
              <p className="text-gray-400 text-sm">No open grants recorded for this organisation.</p>
            ) : (
              <div className="space-y-4">
                {org.openGrants.map((grant) => (
                  <div key={grant.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/${slug}/caid/grants/${org.slug ?? org.externalId ?? org.id}/${grant.slug}`}
                            className="font-semibold text-gray-900 hover:text-red-600 hover:underline"
                          >
                            {grant.title}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            grant.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {grant.status}
                          </span>
                        </div>
                        {grant.description && (
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{grant.description}</p>
                        )}
                        {grant.eligibilityCriteria && (
                          <div className="mt-2">
                            <span className="text-xs font-medium text-gray-500">Eligibility: </span>
                            <span className="text-xs text-gray-600">{grant.eligibilityCriteria}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {(grant.fundingAmountMin || grant.fundingAmountMax) && (
                          <div className="font-bold text-gray-900">
                            {grant.fundingAmountMin && grant.fundingAmountMax
                              ? `${fmt(grant.fundingAmountMin)} – ${fmt(grant.fundingAmountMax)}`
                              : fmt(grant.fundingAmountMax ?? grant.fundingAmountMin)}
                          </div>
                        )}
                        {grant.deadline && (
                          <div className="text-xs text-gray-400 mt-1">
                            Deadline: {new Date(grant.deadline).toLocaleDateString("en-GB")}
                          </div>
                        )}
                        {grant.applicationUrl && (
                          <a
                            href={grant.applicationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-red-600 hover:underline mt-1 block"
                          >
                            Apply →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contacts */}
        {tab === "contacts" && (
          <div>
            {org.contacts.length === 0 ? (
              <p className="text-gray-400 text-sm">No contacts recorded.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {org.contacts.map((contact) => (
                  <div key={contact.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{contact.name}</div>
                        {contact.title && <div className="text-sm text-gray-600 mt-0.5">{contact.title}</div>}
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mt-1 inline-block">
                          {contact.role.charAt(0) + contact.role.slice(1).toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-red-600 hover:underline">
                          ✉️ {contact.email}
                        </a>
                      )}
                      {contact.linkedinUrl && (
                        <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                          🔗 LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dossiers */}
        {tab === "dossiers" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Generated Dossiers</h3>
              <Link
                href={`/${slug}/caid/generate?orgId=${org.externalId ?? org.id}`}
                className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                ✨ Generate New
              </Link>
            </div>
            {org.dossiers.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📄</div>
                <p className="text-gray-400 text-sm">No dossiers generated yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {org.dossiers.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-4">
                    <div>
                      <div className="font-medium text-gray-900">{d.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {d.type} · {new Date(d.createdAt).toLocaleDateString("en-GB")} · {d.model}
                      </div>
                    </div>
                    <a
                      href={`/api/caid/dossier/${d.id}/export`}
                      className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    >
                      ⬇️ Export
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pipeline */}
        {tab === "pipeline" && (
          <div className="max-w-lg">
            <h3 className="font-semibold text-gray-900 mb-4">
              {org.pipeline ? "Update Pipeline Status" : "Add to Pipeline"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={pipelineStatus}
                  onChange={(e) => setPipelineStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="">Select status...</option>
                  {PIPELINE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next Action</label>
                <input
                  type="text"
                  value={pipelineNextAction}
                  onChange={(e) => setPipelineNextAction(e.target.value)}
                  placeholder="e.g. Send LOI to Dan Knowles by Friday"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={pipelineNotes}
                  onChange={(e) => setPipelineNotes(e.target.value)}
                  rows={4}
                  placeholder="Internal notes, strategy, context..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>
              <button
                onClick={savePipeline}
                disabled={savingPipeline || !pipelineStatus}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {savingPipeline ? "Saving..." : pipelineSaved ? "✓ Saved!" : org.pipeline ? "Update Pipeline" : "Add to Pipeline"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
