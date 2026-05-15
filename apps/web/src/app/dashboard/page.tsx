import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface WorkspaceListResponse {
  workspaces: Workspace[];
  total: number;
}

interface CountResponse {
  total: number;
}

async function getMCPData<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const MCP_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? "https://agentic-notion-mcp.onrender.com";
  const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

  try {
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MCP_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);
    const data = await res.json() as {
      result?: { content: Array<{ text: string }>; isError?: boolean };
      error?: { message: string };
    };
    if (data.error) throw new Error(data.error.message);
    const text = data.result?.content[0]?.text ?? "{}";
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`[MCP] ${toolName} failed:`, err);
    throw err;
  }
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let workspace: Workspace | null = null;
  let stats = { orgs: 0, campaigns: 0, tasks: 0, evidence: 0, trials: 0, biomarkers: 0 };

  try {
    const result = await getMCPData<WorkspaceListResponse>("workspace_list", {});
    if (result.workspaces.length > 0) {
      workspace = result.workspaces[0];
    } else {
      // Create default workspace
      workspace = await getMCPData<Workspace>("workspace_create", {
        name: "My Workspace",
        slug: "my-workspace",
        description: "Cancer Advocacy Intelligence Database",
      });
    }

    if (workspace) {
      const [orgsRes, campaignsRes, tasksRes, evidenceRes, trialsRes, biomarkersRes] = await Promise.allSettled([
        getMCPData<CountResponse>("advocacy_org_list", { workspaceId: workspace.id }),
        getMCPData<CountResponse>("campaign_list", { workspaceId: workspace.id }),
        getMCPData<CountResponse>("task_list", { workspaceId: workspace.id }),
        getMCPData<CountResponse>("evidence_list", {}),
        getMCPData<CountResponse>("clinical_trial_list", {}),
        getMCPData<CountResponse>("biomarker_list", {}),
      ]);

      stats = {
        orgs: orgsRes.status === "fulfilled" ? (orgsRes.value.total ?? 0) : 0,
        campaigns: campaignsRes.status === "fulfilled" ? (campaignsRes.value.total ?? 0) : 0,
        tasks: tasksRes.status === "fulfilled" ? (tasksRes.value.total ?? 0) : 0,
        evidence: evidenceRes.status === "fulfilled" ? (evidenceRes.value.total ?? 0) : 0,
        trials: trialsRes.status === "fulfilled" ? (trialsRes.value.total ?? 0) : 0,
        biomarkers: biomarkersRes.status === "fulfilled" ? (biomarkersRes.value.total ?? 0) : 0,
      };
    }
  } catch (err) {
    console.error("[Dashboard] Failed to load workspace data:", err);
    // Render with empty state rather than crashing
  }

  const slug = workspace?.slug ?? "demo";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">CAID</span>
            {workspace && (
              <span className="text-gray-400 text-sm hidden sm:block">/ {workspace.name}</span>
            )}
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-600">
            <Link href="/dashboard" className="text-red-600 font-medium">Dashboard</Link>
            <Link href={`/${slug}/agents`} className="hover:text-gray-900">Agents</Link>
            <Link href={`/${slug}/archon`} className="hover:text-gray-900">Archon</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {workspace ? workspace.name : "Cancer Advocacy Intelligence Database"}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: "Organizations", value: stats.orgs, icon: "🏢", href: `/${slug}/orgs` },
            { label: "Campaigns", value: stats.campaigns, icon: "📣", href: `/${slug}/campaigns` },
            { label: "Tasks", value: stats.tasks, icon: "✅", href: `/${slug}/tasks` },
            { label: "Evidence", value: stats.evidence, icon: "📄", href: `/${slug}/evidence` },
            { label: "Trials", value: stats.trials, icon: "🔬", href: `/${slug}/trials` },
            { label: "Biomarkers", value: stats.biomarkers, icon: "🧬", href: `/${slug}/biomarkers` },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-white rounded-xl p-4 border border-gray-200 hover:border-red-200 hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { label: "Run Advocacy PM Agent", href: `/${slug}/agents?role=ADVOCACY_PM`, icon: "🤖" },
                { label: "Research Intelligence", href: `/${slug}/agents?role=RESEARCH_INTELLIGENCE`, icon: "🔬" },
                { label: "Coalition Builder", href: `/${slug}/agents?role=COALITION_BUILDER`, icon: "🤝" },
                { label: "Daily Standup Report", href: `/${slug}/agents?role=STANDUP_REPORTER`, icon: "📊" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <span>{action.icon}</span>
                  <span className="text-gray-700">{action.label}</span>
                  <span className="ml-auto text-gray-400">→</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Extend with Archon</h2>
            <p className="text-sm text-gray-600 mb-4">
              Use Archon to add new features to CAID. Describe what you want and Archon will plan, implement, and PR it.
            </p>
            <Link
              href={`/${slug}/archon`}
              className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              <span>⚡</span>
              Open Archon Launcher
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
